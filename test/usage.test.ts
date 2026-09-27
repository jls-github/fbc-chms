import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appSettings, usageActives, usageActiveTotals } from "../src/server/db/schema";
import { flushUsage, platformFor, recordActive, rollUpUsage } from "../src/server/lib/usage";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
let staff: Awaited<ReturnType<typeof ctx.signIn>>;
beforeEach(async () => {
  await ctx.reset();
  staff = await ctx.signIn("office@test.org", "admin");
});
afterAll(() => ctx.close());

/** Creates an approved member-app account and returns a client using its bearer token. */
async function member(first: string, deviceName = "iPhone app") {
  const m = (await staff.post("/members", { firstName: first, lastName: "Test", status: "active", email: `${first}@x.org` })).json.member;
  const s = await ctx.client().post("/public/app/signup", { firstName: first, lastName: "Test", email: `${first}@x.org`, password: "long enough 1", deviceName });
  await staff.post(`/app-accounts/${s.json.user.id}/approve`, { memberId: m.id });
  const c = ctx.client();
  const auth = { authorization: `Bearer ${s.json.token}` };
  return {
    id: s.json.user.id as number,
    get: (p: string, h: Record<string, string> = {}) => c.get(p, { ...auth, ...h }),
    post: (p: string, b: unknown, h: Record<string, string> = {}) => c.post(p, b, { ...auth, ...h }),
    patch: (p: string, b: unknown) => c.patch(p, b, auth),
  };
}

const report = async () => {
  await flushUsage();
  const res = await staff.get("/usage");
  if (res.status !== 200) throw new Error(`/usage ${res.status}: ${JSON.stringify(res.json)}`);
  return res.json;
};

describe("usage statistics", () => {
  it("counts each active person once per period, by platform", async () => {
    const a = await member("Ana", "iPhone app");
    const b = await member("Ben", "Android app");
    const c = await member("Cal", "Web app");
    for (const x of [a, a, a, b, c]) await x.get("/app/me");
    const r = await report();
    expect(r.active.app).toEqual({ today: 3, week: 3, month: 3 });
    expect(r.active.staff.today).toBe(1); // the staff member reading the report
    // Fewer than 3 per platform is hidden so it can't point to someone.
    expect(r.platformsThisMonth).toEqual({ ios: null, android: null, web: null });
  });

  it("stores no account ids — only per-period keyed hashes", async () => {
    const a = await member("Ana");
    await a.get("/app/me");
    await flushUsage();
    const rows = await ctx.db.select().from(usageActives);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.visitor).toMatch(/^[A-Za-z0-9_-]{43}$/); // a SHA-256 HMAC, not an id
      expect(row.visitor).not.toBe(String(a.id));
    }
    // Same person, different periods → unrelated hashes.
    const visitors = new Set(rows.filter((r) => r.platform === "app").map((r) => r.visitor));
    expect(visitors.size).toBe(3);
  });

  it("closes out finished periods: keeps totals, deletes hashes and the period key", async () => {
    const monday = new Date("2026-09-14T18:00:00Z"); // a Monday in church time
    await recordActive(ctx.db, 101, "ios", monday);
    await recordActive(ctx.db, 102, "android", monday);
    await recordActive(ctx.db, 101, "ios", new Date("2026-09-15T18:00:00Z"));
    const keysBefore = await ctx.db.select().from(appSettings).where(sql`${appSettings.key} like 'usage_key:%'`);
    expect(keysBefore.length).toBe(4); // two days, one week, one month

    await rollUpUsage(ctx.db, new Date("2026-10-02T18:00:00Z"));
    expect(await ctx.db.select().from(usageActives)).toEqual([]);
    expect(await ctx.db.select().from(appSettings).where(sql`${appSettings.key} like 'usage_key:%'`)).toEqual([]);
    const totals = await ctx.db.select().from(usageActiveTotals).where(eq(usageActiveTotals.platform, "app"));
    expect(totals.map((t) => [t.period, t.periodStart, t.count]).sort()).toEqual([
      ["day", "2026-09-14", 2],
      ["day", "2026-09-15", 1],
      ["month", "2026-09-01", 2],
      ["week", "2026-09-13", 2],
    ]);
  });

  it("opting out also removes today's, this week's and this month's activity", async () => {
    const a = await member("Ana");
    await a.get("/app/me");
    expect((await report()).active.app.month).toBe(1);
    await a.patch("/auth/me", { usageOptOut: true });
    expect((await report()).active.app).toEqual({ today: 0, week: 0, month: 0 });
    await a.patch("/auth/me", { usageOptOut: false });
    await a.get("/app/me");
    expect((await report()).active.app.today).toBe(1);
  });

  it("respects the opt-out setting and browser privacy signals", async () => {
    const a = await member("Ana");
    const b = await member("Ben");
    const c = await member("Cal");
    expect((await a.patch("/auth/me", { usageOptOut: true })).json.user.usageOptOut).toBe(true);
    await a.get("/app/directory");
    await b.get("/app/directory", { "sec-gpc": "1" });
    await c.get("/app/directory", { dnt: "1" });
    const r = await report();
    expect(r.active.app.today).toBe(0);
    expect(r.last30Days.directoryViews).toBe(0);
    expect(r.accounts.optedOut).toBe(1);
  });

  it("counts feature use anonymously and lists the most-opened sermons", async () => {
    const a = await member("Ana");
    await a.get("/app/directory");
    await a.get("/app/directory");
    for (const id of ["abc123", "abc123", "zzz999"]) expect((await a.post("/app/events", { event: "sermon_open", sermonId: id })).status).toBe(204);
    expect((await a.post("/app/events", { event: "stalk_person" })).status).toBe(422);
    expect((await a.post("/app/events", { event: "sermon_open", sermonId: "../../etc" })).status).toBe(422);
    const r = await report();
    expect(r.last30Days).toMatchObject({ directoryViews: 2, sermonOpens: 3, signUps: 1 });
    expect(r.topSermons.map((s: { id: string; opens: number }) => [s.id, s.opens])).toEqual([
      ["abc123", 2],
      ["zzz999", 1],
    ]);
  });

  it("is visible to admins only", async () => {
    const a = await member("Ana");
    expect((await a.get("/usage")).status).toBe(403);
    const office = await ctx.signIn("secretary@test.org", "staff");
    expect((await office.get("/usage")).status).toBe(403);
    await staff.post("/users", { email: "helper@test.org", password: "password123", role: "volunteer" });
    const login = await ctx.client().post("/auth/login", { identifier: "helper@test.org", password: "password123" });
    expect((await ctx.client(login.headers.get("set-cookie")!.split(";")[0]).get("/usage")).status).toBe(403);
  });

  it("maps sign-in sessions to platforms", () => {
    expect(platformFor({ kind: "api", label: "iPhone app" }, "/api/v1/app/me")).toBe("ios");
    expect(platformFor({ kind: "api", label: "Android app" }, "/api/v1/app/me")).toBe("android");
    expect(platformFor({ kind: "api", label: "Web app" }, "/api/v1/app/me")).toBe("web");
    expect(platformFor({ kind: "web", label: null }, "/api/v1/members")).toBe("staff");
    expect(platformFor({ kind: "kiosk", label: "Lobby" }, "/api/v1/kiosk/status")).toBeNull();
  });
});
