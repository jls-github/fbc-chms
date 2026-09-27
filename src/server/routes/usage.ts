import { createRoute } from "@hono/zod-openapi";
import { and, count, eq, gte } from "drizzle-orm";
import { UsageReport } from "@shared/schemas";
import { requireRole } from "../auth/middleware";
import { attendanceReports, chatMessages, checkins, users } from "../db/schema";
import { serviceDate } from "../lib/church-time";
import { authErrors, jsonContent, security } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { recentSermons } from "../lib/sermons";
import { activeCounts, addDays, counterTotals, periodStarts, rollUpUsage } from "../lib/usage";

/** Breakdowns under this many people are hidden so they can't point to an individual. */
export const MIN_GROUP = 3;
const mask = (n: number | undefined) => (n && n >= MIN_GROUP ? n : null);

export const usageRoutes = createRouter().openapi(
  createRoute({
    method: "get",
    path: "/usage",
    tags: ["Usage statistics"],
    summary: "Anonymous usage statistics (admins only)",
    description: "Aggregates only; see docs/PRIVACY.md for what's collected and how.",
    security,
    middleware: [requireRole("admin")] as const,
    responses: { 200: jsonContent(UsageReport), ...authErrors },
  }),
  async (c) => {
    const { db } = c.var.deps;
    const now = new Date();
    await rollUpUsage(db, now);
    const today = serviceDate(now);
    const starts = periodStarts(today);
    const since = addDays(today, -29);
    const sinceTime = new Date(Date.now() - 30 * 86_400_000);
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(starts.week, -7 * (11 - i)));

    const [day, week, month, weekly, counters, [messages], [kids], [leaders], accountRows, [signUps]] = await Promise.all([
      activeCounts(db, "day", [starts.day]),
      activeCounts(db, "week", [starts.week]),
      activeCounts(db, "month", [starts.month]),
      activeCounts(db, "week", weeks),
      counterTotals(db, since),
      db.select({ n: count() }).from(chatMessages).where(gte(chatMessages.createdAt, sinceTime)),
      db.select({ n: count() }).from(checkins).where(gte(checkins.serviceDate, since)),
      db
        .select({ n: count() })
        .from(attendanceReports)
        .where(and(eq(attendanceReports.source, "leader_link"), gte(attendanceReports.createdAt, sinceTime))),
      db
        .select({ status: users.status, optedOut: users.usageOptOut, n: count() })
        .from(users)
        .where(eq(users.role, "member"))
        .groupBy(users.status, users.usageOptOut),
      db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, "member"), gte(users.createdAt, sinceTime))),
    ]);

    const get = (rows: { platform: string; n: number }[], platform: string) => rows.find((r) => r.platform === platform)?.n ?? 0;
    const metric = (name: string) => counters.filter((r) => r.metric === name).reduce((sum, r) => sum + r.n, 0);
    const accounts = (status: string) => accountRows.filter((r) => r.status === status).reduce((sum, r) => sum + r.n, 0);

    // Sermon titles come from the cached sermon list (best effort; never blocks the report on the website).
    let titles = new Map<string, string>();
    try {
      titles = new Map((await Promise.race([recentSermons(c.var.deps.scrapeSermons), new Promise<never>((_, r) => void setTimeout(r, 1500).unref())])).sermons.map((s) => [s.id, s.title]));
    } catch {
      /* titles are optional */
    }

    return c.json(
      {
        generatedAt: now.toISOString(),
        active: {
          app: { today: get(day, "app"), week: get(week, "app"), month: get(month, "app") },
          staff: { today: get(day, "staff"), week: get(week, "staff"), month: get(month, "staff") },
        },
        weeklyApp: weeks.map((weekStart) => ({
          weekStart,
          count: weekly.find((r) => r.periodStart === weekStart && r.platform === "app")?.n ?? 0,
        })),
        platformsThisMonth: { ios: mask(get(month, "ios")), android: mask(get(month, "android")), web: mask(get(month, "web")) },
        last30Days: {
          directoryViews: metric("directory_view"),
          sermonOpens: metric("sermon_open"),
          chatsOpened: metric("group_open") + metric("team_open"),
          messagesSent: messages?.n ?? 0,
          kidsCheckedIn: kids?.n ?? 0,
          leaderReports: leaders?.n ?? 0,
          signUps: signUps?.n ?? 0,
        },
        topSermons: counters
          .filter((r) => r.metric === "sermon_open" && r.dimension)
          .sort((a, b) => b.n - a.n)
          .slice(0, 5)
          .map((r) => ({ id: r.dimension, title: titles.get(r.dimension) ?? null, opens: r.n })),
        accounts: {
          active: accounts("active"),
          pending: accounts("pending"),
          invited: accounts("invited"),
          optedOut: accountRows.filter((r) => r.optedOut).reduce((sum, r) => sum + r.n, 0),
        },
      },
      200,
    );
  },
);
