import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { nextBirthday } from "../src/server/routes/dashboard";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
let api: Awaited<ReturnType<typeof ctx.signIn>>;
beforeEach(async () => {
  await ctx.reset();
  api = await ctx.signIn();
});
afterAll(() => ctx.close());

const person = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) =>
  api.post("/members", { firstName, lastName, ...extra }).then((r) => r.json.member);

describe("groups", () => {
  it("adds members idempotently and removes them", async () => {
    const m = await person("Lydia", "Thyatira");
    const g = (await api.post("/groups", { name: "Riverside", meetingTime: "Sat 9am", meetingLocation: "" })).json.group;
    expect(g.meetingLocation).toBeNull();
    await api.post(`/groups/${g.id}/members`, { memberId: m.id });
    const again = await api.post(`/groups/${g.id}/members`, { memberId: m.id });
    expect(again.status).toBe(200);
    expect(again.json.group.members).toHaveLength(1);
    expect((await api.get(`/members/${m.id}`)).json.member.groups).toEqual([{ id: g.id, name: "Riverside" }]);

    expect((await api.post(`/groups/${g.id}/members`, { memberId: 9999 })).status).toBe(422);
    expect((await api.post(`/groups/9999/members`, { memberId: m.id })).status).toBe(404);
    expect((await api.delete(`/groups/${g.id}/members/${m.id}`)).status).toBe(204);
    expect((await api.delete(`/groups/${g.id}/members/${m.id}`)).status).toBe(404);
  });

  it("updates and deletes", async () => {
    const g = (await api.post("/groups", { name: "Old" })).json.group;
    expect((await api.patch(`/groups/${g.id}`, { name: "New" })).json.group.name).toBe("New");
    expect((await api.patch(`/groups/${g.id}`, { name: "" })).status).toBe(422);
    expect((await api.delete(`/groups/${g.id}`)).status).toBe(204);
    expect((await api.get(`/groups/${g.id}`)).status).toBe(404);
  });
});

describe("teams", () => {
  it("tracks a leader and member roles", async () => {
    const lead = await person("Asaph", "Levi");
    const singer = await person("Heman", "Levi");
    const t = (await api.post("/teams", { name: "Worship", leaderId: lead.id })).json.team;
    expect(t.leader.id).toBe(lead.id);

    await api.post(`/teams/${t.id}/members`, { memberId: singer.id, role: "Vocals" });
    const upsert = await api.post(`/teams/${t.id}/members`, { memberId: singer.id, role: "Lead vocals" });
    expect(upsert.json.team.members).toEqual([expect.objectContaining({ id: singer.id, role: "Lead vocals" })]);

    const patched = await api.patch(`/teams/${t.id}/members/${singer.id}`, { role: "" });
    expect(patched.json.team.members[0].role).toBeNull();
    expect((await api.get(`/members/${singer.id}`)).json.member.teams).toEqual([{ id: t.id, name: "Worship", role: null }]);

    expect((await api.post("/teams", { name: "X", leaderId: 9999 })).status).toBe(422);
    expect((await api.patch(`/teams/${t.id}`, { leaderId: null })).json.team.leader).toBeNull();

    // Deleting the leader's member record clears the leader rather than failing.
    await api.patch(`/teams/${t.id}`, { leaderId: lead.id });
    await api.delete(`/members/${lead.id}`);
    expect((await api.get(`/teams/${t.id}`)).json.team.leader).toBeNull();
  });
});

describe("attendance", () => {
  it("records, filters, edits and deletes reports", async () => {
    const created = await api.post("/attendance", { eventType: "sunday_service", date: "2026-09-06", attendance: "112" });
    expect(created.status).toBe(201);
    expect(created.json.report.attendance).toBe(112);
    await api.post("/attendance", { eventType: "community_group", date: "2026-09-08", attendance: 30 });
    await api.post("/attendance", { eventType: "sunday_service", date: "2026-09-13", attendance: 120 });

    const sundays = (await api.get("/attendance?eventType=sunday_service")).json.reports;
    expect(sundays.map((r: { date: string }) => r.date)).toEqual(["2026-09-13", "2026-09-06"]);
    expect((await api.get("/attendance?from=2026-09-07&to=2026-09-10")).json.reports).toHaveLength(1);

    expect((await api.post("/attendance", { eventType: "sunday_service", date: "2026-09-20", attendance: -1 })).status).toBe(422);
    expect((await api.post("/attendance", { eventType: "potluck", date: "2026-09-20", attendance: 1 })).status).toBe(422);

    const id = created.json.report.id;
    expect((await api.patch(`/attendance/${id}`, { attendance: 115 })).json.report).toMatchObject({ attendance: 115, date: "2026-09-06" });
    expect((await api.delete(`/attendance/${id}`)).status).toBe(204);
    expect((await api.get(`/attendance/${id}`)).status).toBe(404);
  });
});

describe("dashboard", () => {
  it("works on an empty database", async () => {
    const d = (await api.get("/dashboard")).json;
    expect(d.counts.total).toBe(0);
    expect(d.averageSundayAttendance).toBeNull();
    expect(d.sundayTrend).toEqual([]);
  });

  it("summarizes membership and flags active adults missing a group or team", async () => {
    const inBoth = await person("Both", "A", { status: "active" });
    await person("Neither", "B", { status: "active" });
    await person("Child", "C", { status: "active", isChild: true });
    await person("Visitor", "D", { status: "guest" });
    await person("Gone", "E", { status: "archived" });
    const g = (await api.post("/groups", { name: "G" })).json.group;
    const t = (await api.post("/teams", { name: "T" })).json.team;
    await api.post(`/groups/${g.id}/members`, { memberId: inBoth.id });
    await api.post(`/teams/${t.id}/members`, { memberId: inBoth.id });
    const today = new Date().toISOString().slice(0, 10);
    await api.post("/attendance", { eventType: "sunday_service", date: today, attendance: 100 });
    await api.post("/attendance", { eventType: "sunday_service", date: today, attendance: 81 });

    const d = (await api.get("/dashboard")).json;
    expect(d.counts).toMatchObject({ total: 4, active: 3, guest: 1, inGroups: 1, onTeams: 1 });
    expect(d.adultsWithoutGroup.map((p: { firstName: string }) => p.firstName)).toEqual(["Neither"]);
    expect(d.adultsWithoutTeam.map((p: { firstName: string }) => p.firstName)).toEqual(["Neither"]);
    expect(d.recentGuests.map((p: { firstName: string }) => p.firstName)).toEqual(["Visitor"]);
    expect(d.averageSundayAttendance).toBe(91);
  });

  it("includes a 4-week rolling average that looks back past the charted range", async () => {
    const day = (weeksAgo: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - weeksAgo * 7);
      return d.toISOString().slice(0, 10);
    };
    // Six-plus months back so the oldest charted Sunday has full history behind it.
    for (let w = 29; w >= 0; w--) {
      await api.post("/attendance", { eventType: "sunday_service", date: day(w), attendance: 100 + (w % 2) * 20 });
    }
    await api.post("/attendance", { eventType: "community_group", date: day(0), attendance: 5 });
    const { sundayTrend } = (await api.get("/dashboard")).json;
    expect(sundayTrend.length).toBeGreaterThanOrEqual(25);
    expect(sundayTrend.length).toBeLessThan(30);
    // Alternating 100/120 → every full 4-week window averages 110, including the first charted week.
    expect(sundayTrend.every((p: { rollingAverage: number; windowCount: number }) => p.rollingAverage === 110 && p.windowCount === 4)).toBe(true);
    expect(sundayTrend.at(-1).attendance).toBe(100);
  });

  it("computes the next birthday, rolling into next year and handling leap days", () => {
    const today = new Date(Date.UTC(2026, 8, 25));
    expect(nextBirthday("1990-10-01", today).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(nextBirthday("1990-09-25", today).toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(nextBirthday("1990-01-05", today).toISOString().slice(0, 10)).toBe("2027-01-05");
    expect(nextBirthday("2000-02-29", today).toISOString().slice(0, 10)).toBe("2027-03-01");
  });

  it("searches people, households, groups and teams", async () => {
    await person("Priscilla", "Tentmaker");
    await api.post("/families", { name: "Tentmaker household" });
    await api.post("/groups", { name: "Tent group" });
    const r = (await api.get("/search?q=tent")).json;
    expect(r.members).toHaveLength(1);
    expect(r.families).toHaveLength(1);
    expect(r.groups).toHaveLength(1);
    expect(r.teams).toHaveLength(0);
  });
});
