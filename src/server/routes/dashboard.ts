import { createRoute } from "@hono/zod-openapi";
import { and, asc, avg, count, countDistinct, desc, eq, gte, isNotNull, ne, notExists, sql } from "drizzle-orm";
import { Dashboard, SearchResult } from "@shared/schemas";
import { z } from "zod";
import type { MemberStatus } from "@shared/constants";
import {
  attendanceReports,
  families,
  groupMemberships,
  groups,
  members,
  teamMemberships,
  teams,
} from "../db/schema";
import { authErrors, jsonContent, security } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { likePattern, personRef } from "../lib/serializers";
import { memberSearchCondition } from "./members";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Next occurrence of a YYYY-MM-DD birthday on or after `today` (Feb 29 falls back to Mar 1). */
export function nextBirthday(birthdate: string, today: Date): Date {
  const [, m, d] = birthdate.split("-").map(Number) as [number, number, number];
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let year = today.getUTCFullYear();
  let next = new Date(Date.UTC(year, m - 1, d));
  if (next.getTime() < base) next = new Date(Date.UTC(++year, m - 1, d));
  return next;
}

export const dashboardRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/dashboard",
      tags: ["Dashboard"],
      summary: "Headline numbers and follow-up lists",
      security,
      responses: { 200: jsonContent(Dashboard), ...authErrors },
    }),
    async (c) => {
      const { db } = c.var.deps;
      const today = new Date();
      const quarterAgo = new Date(today);
      quarterAgo.setUTCMonth(quarterAgo.getUTCMonth() - 3);
      const halfYearAgo = new Date(today);
      halfYearAgo.setUTCMonth(halfYearAgo.getUTCMonth() - 6);

      const activeAdult = and(eq(members.status, "active"), eq(members.isChild, false));

      const [statusCounts, [households], [inGroups], [onTeams], [avgRow], trend, noGroup, noTeam, guests, withBirthdays] =
        await Promise.all([
          db.select({ status: members.status, n: count() }).from(members).groupBy(members.status),
          db.select({ n: count() }).from(families),
          db.select({ n: countDistinct(groupMemberships.memberId) }).from(groupMemberships),
          db.select({ n: countDistinct(teamMemberships.memberId) }).from(teamMemberships),
          db
            .select({ avg: avg(attendanceReports.attendance) })
            .from(attendanceReports)
            .where(and(eq(attendanceReports.eventType, "sunday_service"), gte(attendanceReports.date, isoDay(quarterAgo)))),
          db
            .select({ date: attendanceReports.date, attendance: attendanceReports.attendance })
            .from(attendanceReports)
            .where(and(eq(attendanceReports.eventType, "sunday_service"), gte(attendanceReports.date, isoDay(halfYearAgo))))
            .orderBy(asc(attendanceReports.date)),
          db
            .select()
            .from(members)
            .where(
              and(
                activeAdult,
                notExists(db.select({ one: sql`1` }).from(groupMemberships).where(eq(groupMemberships.memberId, members.id))),
              ),
            )
            .orderBy(members.lastName, members.firstName),
          db
            .select()
            .from(members)
            .where(
              and(
                activeAdult,
                notExists(db.select({ one: sql`1` }).from(teamMemberships).where(eq(teamMemberships.memberId, members.id))),
              ),
            )
            .orderBy(members.lastName, members.firstName),
          db.select().from(members).where(eq(members.status, "guest")).orderBy(desc(members.createdAt)).limit(6),
          db
            .select()
            .from(members)
            .where(and(isNotNull(members.birthdate), ne(members.status, "archived"))),
        ]);

      const byStatus = Object.fromEntries(statusCounts.map((r) => [r.status, r.n])) as Partial<Record<MemberStatus, number>>;
      const total = statusCounts.filter((r) => r.status !== "archived").reduce((sum, r) => sum + r.n, 0);

      const horizon = today.getTime() + 30 * 24 * 60 * 60 * 1000;
      const upcomingBirthdays = withBirthdays
        .map((m) => ({ ...personRef(m), next: nextBirthday(m.birthdate!, today) }))
        .filter((m) => m.next.getTime() <= horizon)
        .sort((a, b) => a.next.getTime() - b.next.getTime())
        .slice(0, 8)
        .map(({ next, ...m }) => ({ ...m, nextBirthday: isoDay(next) }));

      return c.json(
        {
          counts: {
            total,
            active: byStatus.active ?? 0,
            prospective: byStatus.prospective ?? 0,
            guest: byStatus.guest ?? 0,
            inactive: byStatus.inactive ?? 0,
            households: households?.n ?? 0,
            inGroups: inGroups?.n ?? 0,
            onTeams: onTeams?.n ?? 0,
          },
          averageSundayAttendance: avgRow?.avg == null ? null : Math.round(Number(avgRow.avg)),
          sundayTrend: trend,
          adultsWithoutGroup: noGroup.map(personRef),
          adultsWithoutTeam: noTeam.map(personRef),
          recentGuests: guests.map((m) => ({ ...personRef(m), createdAt: m.createdAt.toISOString() })),
          upcomingBirthdays,
        },
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/search",
      tags: ["Search"],
      summary: "Search across people, households, groups and teams",
      security,
      request: { query: z.object({ q: z.string().trim().min(1) }) },
      responses: { 200: jsonContent(SearchResult), ...authErrors },
    }),
    async (c) => {
      const { q } = c.req.valid("query");
      const { db } = c.var.deps;
      const pattern = likePattern(q);
      const [m, f, g, t] = await Promise.all([
        db.select().from(members).where(memberSearchCondition(q)).orderBy(members.lastName, members.firstName).limit(8),
        db.select({ id: families.id, name: families.name }).from(families).where(sql`${families.name} ilike ${pattern}`).limit(5),
        db.select({ id: groups.id, name: groups.name }).from(groups).where(sql`${groups.name} ilike ${pattern}`).limit(5),
        db.select({ id: teams.id, name: teams.name }).from(teams).where(sql`${teams.name} ilike ${pattern}`).limit(5),
      ]);
      return c.json({ members: m.map(personRef), families: f, groups: g, teams: t }, 200);
    },
  );
