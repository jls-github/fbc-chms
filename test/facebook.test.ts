import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { churchClock, sundayOnOrBefore } from "../src/server/lib/church-time";
import { checkFacebookToken, currentSunday, MAX_ATTEMPTS, renderMessage, runFacebookJob, saveFacebookSettings } from "../src/server/lib/facebook";
import type { AppDeps } from "../src/server/lib/router";
import type { Sermon } from "../src/shared/schemas";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const deps: AppDeps = { db: ctx.db, mailer: async (m) => void ctx.mail.push(m), scrapeSermons: async () => ctx.sermons, facebook: ctx.facebook };

const sermon = (date: string, extra: Partial<Sermon> = {}): Sermon => ({
  id: `s${date.replaceAll("-", "")}`,
  title: "Jesus Walks Among the Outcasts",
  date,
  speaker: "John Souza",
  series: "Stories of the King",
  imageUrl: null,
  thumbnailUrl: null,
  url: `https://fbcenumclaw.com/media/s${date.replaceAll("-", "")}/x`,
  playerUrl: "https://subsplash.com/embed/x",
  ...extra,
});

// Sunday Sep 27, 2026 and the Monday after, in Pacific time (UTC-7 in September).
const SUNDAY = "2026-09-27";
const monday = (hour: number, minute = 0) => new Date(Date.UTC(2026, 8, 28, hour + 7, minute));

describe("church time", () => {
  it("knows the local weekday and hour, and the Sunday of the week", () => {
    expect(churchClock(monday(8))).toEqual({ date: "2026-09-28", weekday: 1, hour: 8 });
    // 11pm Sunday in Pacific time is already Monday in UTC.
    expect(churchClock(new Date("2026-09-28T06:00:00Z"))).toMatchObject({ date: SUNDAY, weekday: 0, hour: 23 });
    expect(sundayOnOrBefore("2026-09-28")).toBe(SUNDAY);
    expect(sundayOnOrBefore(SUNDAY)).toBe(SUNDAY);
    expect(sundayOnOrBefore("2026-10-03")).toBe(SUNDAY);
  });
});

describe("post message", () => {
  it("fills in the sermon and tidies up blank fields", () => {
    expect(renderMessage("Sunday's sermon: {title}\n{series} · {speaker}", sermon(SUNDAY))).toBe(
      "Sunday's sermon: Jesus Walks Among the Outcasts\nStories of the King · John Souza",
    );
    expect(renderMessage("{title}\n{series} · {speaker}", sermon(SUNDAY, { series: null }))).toBe("Jesus Walks Among the Outcasts\nJohn Souza");
    expect(renderMessage("{title}\n{series}\n\nPreached {date}", sermon(SUNDAY, { series: null }))).toBe(
      "Jesus Walks Among the Outcasts\n\nPreached September 27, 2026",
    );
  });
});

describe("Monday job", () => {
  beforeEach(() => saveFacebookSettings(ctx.db, { autoPost: true }));

  it("posts Sunday's sermon once, between 8am and noon on Monday", async () => {
    ctx.sermons.push(sermon("2026-09-20", { id: "old" }), sermon(SUNDAY));
    await runFacebookJob(deps, monday(7, 45));
    await runFacebookJob(deps, new Date(`${SUNDAY}T20:00:00Z`)); // Sunday afternoon
    expect(ctx.fb.published).toHaveLength(0);

    await runFacebookJob(deps, monday(8));
    await runFacebookJob(deps, monday(8, 15));
    await Promise.all([runFacebookJob(deps, monday(9)), runFacebookJob(deps, monday(9))]);
    expect(ctx.fb.published).toEqual([{ message: "Sunday's sermon: Jesus Walks Among the Outcasts\nStories of the King · John Souza", link: sermon(SUNDAY).url }]);
  });

  it("does nothing when automatic posting is off", async () => {
    await saveFacebookSettings(ctx.db, { autoPost: false });
    ctx.sermons.push(sermon(SUNDAY));
    await runFacebookJob(deps, monday(9));
    expect(ctx.fb.published).toHaveLength(0);
  });

  it("waits for a late upload, then emails admins at noon instead of posting an old sermon", async () => {
    await ctx.createUser("admin@test.org", "admin");
    await ctx.createUser("staff@test.org", "staff");
    ctx.sermons.push(sermon("2026-09-20"));
    await runFacebookJob(deps, monday(9));
    await runFacebookJob(deps, monday(11, 45));
    expect(ctx.mail).toHaveLength(0);

    await runFacebookJob(deps, monday(12));
    await runFacebookJob(deps, monday(12, 15));
    expect(ctx.fb.published).toHaveLength(0);
    expect(ctx.mail.map((m) => m.to)).toEqual(["admin@test.org"]);
    expect(ctx.mail[0]!.subject).toMatch(/wasn't posted/);
  });

  it("posts a late upload that arrives before noon", async () => {
    await runFacebookJob(deps, monday(8));
    ctx.sermons.push(sermon(SUNDAY));
    await runFacebookJob(deps, monday(10, 30));
    expect(ctx.fb.published).toHaveLength(1);
  });

  it(`retries a failed post, and emails admins after ${MAX_ATTEMPTS} failures`, async () => {
    await ctx.createUser("admin@test.org", "admin");
    ctx.sermons.push(sermon(SUNDAY));
    ctx.fb.fail = "Error validating access token";
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await runFacebookJob(deps, monday(8, i * 15));
    expect(ctx.mail).toHaveLength(1);
    expect(ctx.mail[0]!.text).toContain("Error validating access token");

    ctx.fb.fail = null;
    await runFacebookJob(deps, monday(11));
    expect(ctx.fb.published).toHaveLength(0); // gave up; an admin can use Post now
  });

  it("emails admins once when the token stops working", async () => {
    await ctx.createUser("admin@test.org", "admin");
    const broken = { ...deps, facebook: { ...ctx.facebook, page: async () => Promise.reject(new Error("Session has expired")) } };
    await checkFacebookToken(broken);
    await checkFacebookToken(broken);
    expect(ctx.mail).toHaveLength(1);
    expect(ctx.mail[0]!.text).toContain("Session has expired");
  });
});

describe("Facebook API", () => {
  it("is for admins only", async () => {
    const staff = await ctx.signIn("staff@test.org", "staff");
    expect((await staff.get("/facebook")).status).toBe(403);
    expect((await staff.post("/facebook/post")).status).toBe(403);
  });

  it("shows the connection, this week's preview, and saves settings", async () => {
    const admin = await ctx.signIn();
    ctx.sermons.push(sermon(currentSunday(), { series: null }));
    const res = await admin.get("/facebook");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      configured: true,
      page: { name: "FBC Enumclaw" },
      autoPost: false,
      thisWeek: { sunday: currentSunday(), preview: "Sunday's sermon: Jesus Walks Among the Outcasts\nJohn Souza", post: null },
    });

    expect((await admin.patch("/facebook", { autoPost: true, template: "New sermon: {title}" })).status).toBe(204);
    expect((await admin.get("/facebook")).json).toMatchObject({ autoPost: true, template: "New sermon: {title}", thisWeek: { preview: "New sermon: Jesus Walks Among the Outcasts" } });
    await admin.patch("/facebook", { template: "" });
    expect((await admin.get("/facebook")).json.template).toBe((await admin.get("/facebook")).json.defaultTemplate);
  });

  it("posts now, once", async () => {
    const admin = await ctx.signIn();
    expect((await admin.post("/facebook/post")).json.error.message).toMatch(/isn't on the church website/);
    ctx.sermons.push(sermon(currentSunday()));
    const res = await admin.post("/facebook/post");
    expect(res.status).toBe(200);
    expect(res.json.post).toMatchObject({ status: "posted", facebookUrl: "https://www.facebook.com/1234_1", byName: "admin@test.org" });
    expect((await admin.post("/facebook/post")).status).toBe(422);
    expect(ctx.fb.published).toHaveLength(1);
  });

  it("reports Facebook's error when posting now fails", async () => {
    const admin = await ctx.signIn();
    ctx.sermons.push(sermon(currentSunday()));
    ctx.fb.fail = "(#200) The user hasn't authorized the application";
    const res = await admin.post("/facebook/post");
    expect(res.status).toBe(502);
    expect(res.json.error.message).toContain("hasn't authorized");
    expect((await admin.get("/facebook")).json.thisWeek.post).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("skipping a week stops the Monday job, and can be undone", async () => {
    const admin = await ctx.signIn();
    await saveFacebookSettings(ctx.db, { autoPost: true });
    // Skip and un-skip act on the current week, so run the job for the Monday after it.
    const sunday = currentSunday();
    const mondayAfter = new Date(`${sunday}T16:00:00Z`);
    mondayAfter.setUTCDate(mondayAfter.getUTCDate() + 1);
    ctx.sermons.push(sermon(sunday));

    expect((await admin.post("/facebook/skip", { skip: true })).status).toBe(204);
    await runFacebookJob(deps, mondayAfter);
    expect(ctx.fb.published).toHaveLength(0);
    expect((await admin.get("/facebook")).json.thisWeek.post).toMatchObject({ status: "skipped" });

    await admin.post("/facebook/skip", { skip: false });
    await runFacebookJob(deps, mondayAfter);
    expect(ctx.fb.published).toHaveLength(1);
    expect((await admin.post("/facebook/skip", { skip: true })).status).toBe(422);
  });
});
