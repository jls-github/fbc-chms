/** Demo data for local development. Never run against real church data. */
import { count } from "drizzle-orm";
import type { MemberStatus } from "@shared/constants";
import { hashPassword } from "../auth/crypto";
import type { Db } from "./client";
import * as s from "./schema";

/** Local dev login. Override with DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD. */
export const DEV_ADMIN = {
  email: process.env.DEV_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.DEV_ADMIN_PASSWORD ?? "changeme123",
};

type Person = [first: string, status: MemberStatus, birthdate: string | null, child?: boolean];

const HOUSEHOLDS: { name: string; city: string; people: Person[] }[] = [
  { name: "Anderson", city: "Enumclaw", people: [["David", "active", "1979-03-14"], ["Rachel", "active", "1981-10-02"], ["Micah", "active", "2014-06-21", true], ["Lydia", "active", "2017-01-09", true]] },
  { name: "Brooks", city: "Buckley", people: [["Marcus", "active", "1968-11-30"], ["Denise", "active", "1970-05-17"]] },
  { name: "Castillo", city: "Enumclaw", people: [["Javier", "active", "1985-08-08"], ["Maria", "active", "1987-02-25"], ["Sofia", "active", "2019-09-12", true]] },
  { name: "Dawson", city: "Black Diamond", people: [["Eli", "prospective", "1992-12-01"], ["Hannah", "prospective", "1993-04-19"]] },
  { name: "Ellison", city: "Enumclaw", people: [["Grace", "active", "1955-07-04"]] },
  { name: "Fischer", city: "Auburn", people: [["Thomas", "active", "1976-01-22"], ["Anna", "active", "1978-09-30"], ["Caleb", "active", "2010-03-03", true], ["Noah", "active", "2012-11-15", true], ["Ruth", "active", "2016-08-27", true]] },
  { name: "Garcia", city: "Enumclaw", people: [["Luis", "guest", null], ["Elena", "guest", null]] },
  { name: "Harper", city: "Buckley", people: [["Nathan", "active", "1988-06-06"], ["Leah", "active", "1990-12-24"], ["Ezra", "active", "2021-02-14", true]] },
  { name: "Iverson", city: "Enumclaw", people: [["Paul", "inactive", "1960-10-10"], ["Susan", "inactive", "1962-03-08"]] },
  { name: "Jensen", city: "Enumclaw", people: [["Karl", "active", "1983-04-11"], ["Beth", "active", "1984-08-03"]] },
  { name: "Kim", city: "Maple Valley", people: [["Daniel", "prospective", "1995-05-05"]] },
  { name: "Lawson", city: "Enumclaw", people: [["Owen", "guest", null]] },
];

const GROUPS = [
  { name: "Tuesday Night Group", meetingTime: "Tuesdays, 7:00 PM", meetingLocation: "Anderson home", members: ["David Anderson", "Rachel Anderson", "Javier Castillo", "Maria Castillo", "Grace Ellison"] },
  { name: "Young Families", meetingTime: "Sundays, 5:00 PM", meetingLocation: "Fellowship Hall", members: ["Nathan Harper", "Leah Harper", "Karl Jensen"] },
  { name: "Men's Breakfast", meetingTime: "Saturdays, 7:30 AM", meetingLocation: "Mt. Peak Café", members: ["Marcus Brooks", "Thomas Fischer"] },
  { name: "Women's Bible Study", meetingTime: "Wednesdays, 10:00 AM", meetingLocation: "Room 3", members: ["Denise Brooks", "Anna Fischer"] },
];

const TEAMS = [
  { name: "Worship", leader: "Nathan Harper", members: [["Nathan Harper", "Guitar"], ["Leah Harper", "Vocals"], ["Karl Jensen", "Bass"]] },
  { name: "Children's Ministry", leader: "Rachel Anderson", members: [["Rachel Anderson", "Coordinator"], ["Maria Castillo", "Nursery"], ["Beth Jensen", "Pre-K teacher"]] },
  { name: "Hospitality", leader: "Denise Brooks", members: [["Denise Brooks", "Lead"], ["Grace Ellison", "Coffee"]] },
  { name: "Tech & Media", leader: "Thomas Fischer", members: [["Thomas Fischer", "Slides"], ["Javier Castillo", "Livestream"]] },
  { name: "Deacons", leader: "Marcus Brooks", members: [["Marcus Brooks", "Chair"], ["David Anderson", null]] },
] as const;

export async function seed(db: Db) {
  const [existing] = await db.select({ n: count() }).from(s.members);
  if ((existing?.n ?? 0) > 0) {
    console.info("Database already has members; skipping demo data.");
  } else {
    await db.transaction(async (tx) => {
      const ids = new Map<string, number>();
      for (const [i, h] of HOUSEHOLDS.entries()) {
        const [family] = await tx.insert(s.families).values({ name: `The ${h.name} Family` }).returning();
        for (const [first, status, birthdate, child] of h.people) {
          const [m] = await tx
            .insert(s.members)
            .values({
              firstName: first,
              lastName: h.name,
              status,
              birthdate,
              isChild: child ?? false,
              familyId: family!.id,
              city: h.city,
              state: "WA",
              postalCode: "98022",
              address1: `${100 + i * 37} ${["Cole St", "Griffin Ave", "Roosevelt Ave", "Porter St"][i % 4]}`,
              email: child ? null : `${first}.${h.name}@example.com`.toLowerCase(),
              phone: child ? null : `(360) 555-${String(1000 + i * 111).slice(0, 4)}`,
            })
            .returning();
          ids.set(`${first} ${h.name}`, m!.id);
        }
      }
      for (const g of GROUPS) {
        const [group] = await tx.insert(s.groups).values({ name: g.name, meetingTime: g.meetingTime, meetingLocation: g.meetingLocation }).returning();
        await tx.insert(s.groupMemberships).values(g.members.map((n) => ({ groupId: group!.id, memberId: ids.get(n)! })));
      }
      for (const t of TEAMS) {
        const [team] = await tx.insert(s.teams).values({ name: t.name, leaderId: ids.get(t.leader) }).returning();
        await tx
          .insert(s.teamMemberships)
          .values(t.members.map(([n, role]) => ({ teamId: team!.id, memberId: ids.get(n)!, role })));
      }
      // Six months of Sundays with a gentle upward trend.
      const sunday = new Date();
      sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
      const reports = [];
      for (let w = 25; w >= 0; w--) {
        const d = new Date(sunday);
        d.setUTCDate(d.getUTCDate() - w * 7);
        const date = d.toISOString().slice(0, 10);
        reports.push({ eventType: "sunday_service" as const, date, attendance: Math.round(78 + (25 - w) * 0.8 + Math.sin(w * 1.7) * 6) });
        if (w % 2 === 0) reports.push({ eventType: "community_group" as const, date, attendance: 28 + (w % 5) });
      }
      await tx.insert(s.attendanceReports).values(reports);
    });
    console.info("Loaded demo households, groups, teams and attendance.");
  }

  const [users] = await db.select({ n: count() }).from(s.users);
  if ((users?.n ?? 0) === 0) {
    await db.insert(s.users).values({
      email: DEV_ADMIN.email,
      name: "Demo Admin",
      role: "admin",
      passwordDigest: await hashPassword(DEV_ADMIN.password),
    });
    console.info(`Created dev admin ${DEV_ADMIN.email} (password set in src/server/db/seed.ts or DEV_ADMIN_PASSWORD).`);
  }
}
