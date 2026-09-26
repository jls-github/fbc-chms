/**
 * One-time migration from the original Rails app (SQLite) to Postgres.
 *
 * IDs are preserved so links and relationships survive, and Rails'
 * bcrypt password digests are copied as-is so staff keep their passwords.
 */
import { DatabaseSync } from "node:sqlite";
import { count, sql } from "drizzle-orm";
import { ATTENDANCE_EVENT_TYPES, MEMBER_STATUSES } from "@shared/constants";
import type { Db } from "./client";
import * as s from "./schema";

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const int = (v: unknown) => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null);
/** Rails stores UTC timestamps in SQLite as "YYYY-MM-DD HH:MM:SS.ffffff". */
const time = (v: unknown) => {
  const text = str(v);
  if (!text) return new Date();
  const d = new Date(`${text.replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? "" : "Z"}`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
const day = (v: unknown) => {
  const text = str(v);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};
const stamps = (r: Row) => ({ createdAt: time(r.created_at), updatedAt: time(r.updated_at) });

const DOMAIN_TABLES = [
  "attendance_reports",
  "team_memberships",
  "group_memberships",
  "teams",
  "groups",
  "members",
  "families",
  "password_resets",
  "sessions",
  "users",
];

export async function importRailsSqlite(db: Db, file: string, { replace }: { replace: boolean }) {
  const source = new DatabaseSync(file, { readOnly: true });
  const all = (table: string): Row[] => {
    const exists = source.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table);
    return exists ? (source.prepare(`select * from ${table} order by id`).all() as Row[]) : [];
  };

  const families = all("families");
  const members = all("members");
  const groups = all("groups");
  const groupMembers = all("group_members");
  const teams = all("teams");
  const teamMembers = all("team_members");
  const attendance = all("attendance_reports");
  const users = all("users");
  source.close();

  const memberIds = new Set(members.map((m) => int(m.id)));
  const familyIds = new Set(families.map((f) => int(f.id)));
  const groupIds = new Set(groups.map((g) => int(g.id)));
  const teamIds = new Set(teams.map((t) => int(t.id)));
  const gm = groupMembers.filter((r) => groupIds.has(int(r.group_id)) && memberIds.has(int(r.member_id)));
  const tm = teamMembers.filter((r) => teamIds.has(int(r.team_id)) && memberIds.has(int(r.member_id)));
  const reports = attendance.filter((r) => day(r.date));

  await db.transaction(async (tx) => {
    if (replace) {
      await tx.execute(sql.raw(`truncate ${DOMAIN_TABLES.join(", ")} restart identity cascade`));
    } else {
      const [m] = await tx.select({ n: count() }).from(s.members);
      const [u] = await tx.select({ n: count() }).from(s.users);
      if ((m?.n ?? 0) + (u?.n ?? 0) > 0) throw new Error("Target database already has data. Re-run with --replace to overwrite it.");
    }

    if (families.length) {
      await tx.insert(s.families).values(families.map((f) => ({ id: int(f.id)!, name: str(f.name) ?? "Unnamed household", ...stamps(f) })));
    }
    if (members.length) {
      await tx.insert(s.members).values(
        members.map((m) => ({
          id: int(m.id)!,
          firstName: str(m.first_name) ?? "(unknown)",
          lastName: str(m.last_name) ?? "(unknown)",
          email: str(m.email),
          phone: str(m.phone),
          address1: str(m.address_1),
          address2: str(m.address_2),
          city: str(m.city),
          state: str(m.state),
          postalCode: str(m.postal_code),
          birthdate: day(m.birthdate),
          status: MEMBER_STATUSES[int(m.status) ?? 0] ?? "guest",
          isChild: int(m.child_or_teen) === 1 || m.child_or_teen === true,
          familyId: familyIds.has(int(m.family_id)) ? int(m.family_id) : null,
          ...stamps(m),
        })),
      );
    }
    if (groups.length) {
      await tx.insert(s.groups).values(
        groups.map((g) => ({
          id: int(g.id)!,
          name: str(g.name) ?? "Untitled group",
          meetingTime: str(g.meeting_time),
          meetingLocation: str(g.meeting_location),
          ...stamps(g),
        })),
      );
    }
    if (gm.length) {
      await tx
        .insert(s.groupMemberships)
        .values(gm.map((r) => ({ groupId: int(r.group_id)!, memberId: int(r.member_id)!, ...stamps(r) })))
        .onConflictDoNothing();
    }
    if (teams.length) {
      await tx.insert(s.teams).values(
        teams.map((t) => ({
          id: int(t.id)!,
          name: str(t.name) ?? "Untitled team",
          leaderId: memberIds.has(int(t.team_leader_id)) ? int(t.team_leader_id) : null,
          ...stamps(t),
        })),
      );
    }
    if (tm.length) {
      await tx
        .insert(s.teamMemberships)
        .values(tm.map((r) => ({ teamId: int(r.team_id)!, memberId: int(r.member_id)!, role: str(r.role), ...stamps(r) })))
        .onConflictDoNothing();
    }
    if (reports.length) {
      await tx.insert(s.attendanceReports).values(
        reports.map((r) => ({
          id: int(r.id)!,
          eventType: ATTENDANCE_EVENT_TYPES[int(r.event_type) ?? 0] ?? "sunday_service",
          date: day(r.date)!,
          attendance: Math.max(0, int(r.attendance) ?? 0),
          ...stamps(r),
        })),
      );
    }
    if (users.length) {
      await tx.insert(s.users).values(
        users.map((u) => ({
          id: int(u.id)!,
          email: String(u.email_address).toLowerCase(),
          passwordDigest: String(u.password_digest),
          // Everyone had full access in the old app.
          role: "admin" as const,
          ...stamps(u),
        })),
      );
    }

    // Explicit IDs don't advance serial sequences; move them past the imported rows.
    for (const table of ["families", "members", "groups", "group_memberships", "teams", "team_memberships", "attendance_reports", "users"]) {
      await tx.execute(
        sql.raw(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${table}), 0) + 1, false)`),
      );
    }
  });

  return {
    households: families.length,
    members: members.length,
    groups: groups.length,
    groupMemberships: gm.length,
    teams: teams.length,
    teamMemberships: tm.length,
    attendanceReports: reports.length,
    skippedAttendanceWithoutDate: attendance.length - reports.length,
    staffAccounts: users.length,
  };
}
