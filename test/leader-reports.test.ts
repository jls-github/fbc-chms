import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const staff = await ctx.signIn();
  const { links } = (await staff.get("/report-links")).json;
  const token = (type: string) => links.find((l: { eventType: string }) => l.eventType === type).token as string;
  return { staff, links, cg: token("community_group"), dm: token("discipleship_meeting") };
}

/** A visitor with no session, optionally from a given IP (as kamal-proxy would report it). */
const visitor = (ip = "203.0.113.7") => {
  const c = ctx.client();
  const h = { "x-forwarded-for": ip };
  return {
    get: (p: string) => c.get(p, h),
    post: (p: string, b: unknown) => c.post(p, b, h),
  };
};

describe("leader report links", () => {
  it("gives staff one link per gathering type, stable across requests", async () => {
    const { staff, links } = await setup();
    expect(links.map((l: { eventType: string }) => l.eventType)).toEqual(["community_group", "discipleship_meeting"]);
    expect(links[0].path).toBe(`/r/${links[0].token}`);
    expect(links[0].token.length).toBeGreaterThanOrEqual(20);
    expect((await staff.get("/report-links")).json.links).toEqual(links);
    expect((await ctx.client().get("/report-links")).status).toBe(401);
  });

  it("lets anyone with the link submit a report without signing in", async () => {
    const { staff, cg, dm } = await setup();
    expect((await visitor().get(`/public/reports/${cg}`)).json).toEqual({ eventType: "community_group", label: "Community Group" });

    const res = await visitor().post(`/public/reports/${cg}`, { date: today(), attendance: "14", notes: "Tuesday group — great night" });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ ok: true });
    await visitor().post(`/public/reports/${dm}`, { date: today(), attendance: 3 });

    const reports = (await staff.get("/attendance")).json.reports;
    expect(reports).toHaveLength(2);
    expect(reports.find((r: { eventType: string }) => r.eventType === "community_group")).toMatchObject({
      attendance: 14,
      notes: "Tuesday group — great night",
      source: "leader_link",
    });
    // Staff entries are labelled as such.
    const staffEntry = await staff.post("/attendance", { eventType: "sunday_service", date: today(), attendance: 90 });
    expect(staffEntry.json.report.source).toBe("staff");
  });

  it("rejects unknown links, bad input, and far-off dates", async () => {
    const { cg } = await setup();
    const v = visitor();
    expect((await v.get("/public/reports/not-a-real-token-123")).status).toBe(404);
    expect((await v.post("/public/reports/not-a-real-token-123", { date: today(), attendance: 5 })).status).toBe(404);

    const bad = await v.post(`/public/reports/${cg}`, { date: "last tuesday", attendance: -2 });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.json.error.fieldErrors).sort()).toEqual(["attendance", "date"]);
    expect((await v.post(`/public/reports/${cg}`, { date: daysFromNow(3), attendance: 5 })).json.error.fieldErrors.date).toBeDefined();
    expect((await v.post(`/public/reports/${cg}`, { date: daysFromNow(-400), attendance: 5 })).json.error.fieldErrors.date).toBeDefined();
    expect((await v.post(`/public/reports/${cg}`, { date: daysFromNow(1), attendance: 5 })).status).toBe(201);
  });

  it("quietly drops submissions that fill the bot trap", async () => {
    const { staff, cg } = await setup();
    const res = await visitor().post(`/public/reports/${cg}`, { date: today(), attendance: 5, website: "http://spam.example" });
    expect(res.status).toBe(201);
    expect((await staff.get("/attendance")).json.reports).toHaveLength(0);
  });

  it("rate limits bursts per IP without affecting other people", async () => {
    const { cg } = await setup();
    const spammer = visitor("198.51.100.1");
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await spammer.post(`/public/reports/${cg}`, { date: today(), attendance: i })).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect((await visitor("198.51.100.2").post(`/public/reports/${cg}`, { date: today(), attendance: 8 })).status).toBe(201);
  });

  it("can't be dodged by forging X-Forwarded-For (the proxy's entry is last)", async () => {
    const { cg } = await setup();
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const c = ctx.client();
      const res = await c.post(`/public/reports/${cg}`, { date: today(), attendance: i }, { "x-forwarded-for": `10.0.0.${i}, 198.51.100.9` });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });

  it("lets admins retire a leaked link; staff can't", async () => {
    const { staff, cg } = await setup();
    const rotated = await staff.post("/report-links/community_group/rotate");
    expect(rotated.status).toBe(200);
    expect(rotated.json.link.token).not.toBe(cg);
    expect((await visitor().post(`/public/reports/${cg}`, { date: today(), attendance: 5 })).status).toBe(404);
    expect((await visitor().post(`/public/reports/${rotated.json.link.token}`, { date: today(), attendance: 5 })).status).toBe(201);
    expect((await staff.post("/report-links/sunday_service/rotate")).status).toBe(422);

    const nonAdmin = await ctx.signIn("helper@test.org", "staff");
    expect((await nonAdmin.get("/report-links")).status).toBe(200);
    expect((await nonAdmin.post("/report-links/community_group/rotate")).status).toBe(403);
  });
});
