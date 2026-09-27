import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { chatMessages, users } from "../src/server/db/schema";
import { parseSeriesList, parseSeriesSermons, parseSiteDate, sizedImage } from "../src/server/lib/sermons";
import { withinOneEdit } from "../src/server/routes/app-accounts";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
let staff: Awaited<ReturnType<typeof ctx.signIn>>;
beforeEach(async () => {
  await ctx.reset();
  staff = await ctx.signIn("office@test.org", "admin");
});
afterAll(() => ctx.close());

type Client = ReturnType<typeof ctx.client>;
const bearer = (token: string) => {
  const c = ctx.client();
  const h = { authorization: `Bearer ${token}` };
  return {
    get: (p: string) => c.get(p, h),
    post: (p: string, b?: unknown) => c.post(p, b ?? {}, h),
    patch: (p: string, b: unknown) => c.patch(p, b, h),
    delete: (p: string) => c.delete(p, h),
  };
};
type App = ReturnType<typeof bearer>;

const person = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) =>
  staff.post("/members", { firstName, lastName, status: "active", ...extra }).then((r) => r.json.member);

const signup = (overrides: Record<string, unknown> = {}) =>
  ctx.client().post("/public/app/signup", {
    firstName: "Lydia",
    lastName: "Purple",
    email: "Lydia@Example.org",
    phone: "(360) 555-0101",
    password: "sellers of purple",
    ...overrides,
  });

async function activeMember(first = "Lydia", last = "Purple", phone = "3605550101") {
  const m = await person(first, last, { phone, email: `${first}@example.org`.toLowerCase() });
  const s = await signup({ firstName: first, lastName: last, email: `${first}@example.org`, phone });
  await staff.post(`/app-accounts/${s.json.user.id}/approve`, { memberId: m.id });
  return { member: m, app: bearer(s.json.token) };
}

describe("self sign-up and staff approval", () => {
  it("creates a pending account that can only see its own status", async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    expect(res.json.user).toMatchObject({ role: "member", status: "pending", email: "lydia@example.org", phone: "3605550101", memberId: null });
    const app = bearer(res.json.token);

    const me = (await app.get("/app/me")).json;
    expect(me.user.status).toBe("pending");
    expect(me.profile.member).toBeNull();
    expect((await app.get("/app/directory")).status).toBe(403);
    for (const path of ["/members", "/dashboard", "/directory", "/app-accounts", "/users", "/checkin/roster"]) {
      expect((await app.get(path)).status, path).toBe(403);
    }
  });

  it("rejects duplicates and points invited people to their code", async () => {
    await signup();
    expect((await signup({ phone: null })).status).toBe(409);
    expect((await signup({ email: null, phone: "360.555.0101" })).status).toBe(409);
    const m = await person("Dorcas", "Joppa", { email: "dorcas@example.org" });
    await staff.post(`/members/${m.id}/app-invite`);
    const res = await signup({ firstName: "Dorcas", lastName: "Joppa", email: "dorcas@example.org", phone: null });
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/invited/i);
    expect((await signup({ email: "", phone: "" })).json.error.fieldErrors.email).toBeDefined();
  });

  it("suggests likely matches and links on approval; then sign-in works by email or phone", async () => {
    const lydia = await person("Lydia", "Purple", { email: "lydia@example.org" });
    await person("Lydie", "Purple");
    await person("Someone", "Else");
    await person("Little", "Purple", { isChild: true });
    const s = await signup();

    const { accounts, pendingCount } = (await staff.get("/app-accounts")).json;
    expect(pendingCount).toBe(1);
    const suggestions = accounts[0].suggestions;
    expect(suggestions[0]).toMatchObject({ member: { id: lydia.id }, reasons: ["Same email", "Same last name", "Same first name"] });
    expect(suggestions.map((x: { member: { firstName: string } }) => x.member.firstName)).toEqual(["Lydia", "Lydie"]);

    const approved = await staff.post(`/app-accounts/${s.json.user.id}/approve`, { memberId: lydia.id });
    expect(approved.json.account).toMatchObject({ status: "active", member: { id: lydia.id }, reviewedBy: "office@test.org" });

    for (const identifier of ["lydia@example.org", "(360) 555-0101", "+1 360 555 0101"]) {
      const login = await ctx.client().post("/auth/token", { identifier, password: "sellers of purple" });
      expect(login.status, identifier).toBe(200);
    }
    const app = bearer(s.json.token);
    expect((await app.get("/app/me")).json.profile.member).toMatchObject({ id: lydia.id, firstName: "Lydia" });
    expect((await app.get("/app/directory")).status).toBe(200);
  });

  it("suggests people whose last name is one letter off", async () => {
    await person("Rachel", "Anderson");
    await person("Rachel", "Andrews");
    await signup({ firstName: "Rachel", lastName: "Andersen", email: "rachel@example.net", phone: null });
    const [account] = (await staff.get("/app-accounts")).json.accounts;
    expect(account.suggestions.map((s: { member: { lastName: string }; reasons: string[] }) => [s.member.lastName, s.reasons])).toEqual([
      ["Anderson", ["Similar last name", "Same first name"]],
    ]);
    expect(withinOneEdit("anderson", "andersen")).toBe(true);
    expect(withinOneEdit("smith", "smyth")).toBe(true);
    expect(withinOneEdit("jon", "john")).toBe(true);
    expect(withinOneEdit("andrews", "andersen")).toBe(false);
  });

  it("can approve as a new person, or turn a sign-up down", async () => {
    const s = await signup();
    const res = await staff.post(`/app-accounts/${s.json.user.id}/approve`, { createMember: true });
    const memberId = res.json.account.member.id;
    const m = (await staff.get(`/members/${memberId}`)).json.member;
    expect(m).toMatchObject({ firstName: "Lydia", lastName: "Purple", email: "lydia@example.org", phone: "(360) 555-0101", status: "guest" });

    const other = await signup({ email: "spam@example.org", phone: null, firstName: "Spam" });
    expect((await staff.post(`/app-accounts/${other.json.user.id}/reject`)).status).toBe(204);
    expect((await bearer(other.json.token).get("/app/me")).status).toBe(401);
  });

  it("reconciles: approving someone with an unclaimed invite replaces the invite; an active account is a conflict", async () => {
    const m = await person("Aquila", "Tent", { email: "aquila@work.org" });
    await staff.post(`/members/${m.id}/app-invite`);
    const s = await signup({ firstName: "Aquila", lastName: "Tent", email: "aquila@home.org", phone: null });
    const res = await staff.post(`/app-accounts/${s.json.user.id}/approve`, { memberId: m.id });
    expect(res.status).toBe(200);
    const invited = (await staff.get("/app-accounts?status=invited")).json.accounts;
    expect(invited).toEqual([]);

    const s2 = await signup({ firstName: "Aquila", lastName: "Tent", email: "aquila2@home.org", phone: null });
    const clash = await staff.post(`/app-accounts/${s2.json.user.id}/approve`, { memberId: m.id });
    expect(clash.status).toBe(409);
  });

  it("offers to link a matching staff login instead of inviting (which would clash)", async () => {
    const pastor = await person("Office", "Admin", { email: "Office@Test.org" });
    const detail = (await staff.get(`/members/${pastor.id}`)).json.member;
    expect(detail.appAccount).toBeNull();
    expect(detail.linkableStaffLogin).toMatchObject({ email: "office@test.org", role: "admin" });
    expect((await staff.post(`/members/${pastor.id}/app-invite`)).status).toBe(409);

    await staff.post(`/app-accounts/${detail.linkableStaffLogin.id}/link`, { memberId: pastor.id });
    const after = (await staff.get(`/members/${pastor.id}`)).json.member;
    expect(after.linkableStaffLogin).toBeNull();
    expect(after.appAccount).toMatchObject({ role: "admin", status: "active", email: "office@test.org" });
    expect((await staff.get("/users")).json.users.find((u: { email: string }) => u.email === "office@test.org").memberId).toBe(pastor.id);
    expect((await staff.get("/app/me")).json.profile.member.id).toBe(pastor.id);

    // Unlinking a staff login is allowed (member-app accounts must stay linked).
    expect((await staff.post(`/app-accounts/${detail.linkableStaffLogin.id}/link`, { memberId: null })).status).toBe(200);
    expect((await staff.get("/app/directory")).status).toBe(403);
  });

  it("links a staff login to a person so staff can use the app too", async () => {
    const pastor = await person("Paul", "Tarsus");
    const [me] = await ctx.db.select().from(users).where(eq(users.email, "office@test.org"));
    expect((await staff.get("/app/directory")).status).toBe(403);
    await staff.post(`/app-accounts/${me!.id}/link`, { memberId: pastor.id });
    expect((await staff.get("/app/directory")).status).toBe(200);
    expect((await staff.get("/members")).status).toBe(200);
  });
});

describe("invitations", () => {
  it("lets an invited person set a password with their code and sign in", async () => {
    const m = await person("Timothy", "Lystra", { phone: "(253) 555-0199" });
    const invite = await staff.post(`/members/${m.id}/app-invite`);
    expect(invite.status).toBe(200);
    expect(invite.json.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(invite.json.link).toContain("/app/invite?code=");
    expect(invite.json.emailed).toBe(false);

    // Can't sign in before claiming.
    const early = await ctx.client().post("/auth/token", { identifier: "2535550199", password: "whatever12" });
    expect(early.json.error.message).toMatch(/invitation/i);

    const claim = await ctx.client().post("/public/app/claim-invite", { code: invite.json.code.toLowerCase().replace("-", " "), password: "grandma lois" });
    expect(claim.status).toBe(200);
    expect(claim.json.user).toMatchObject({ status: "active", memberId: m.id });
    expect((await bearer(claim.json.token).get("/app/directory")).status).toBe(200);
    expect((await ctx.client().post("/auth/token", { identifier: "253-555-0199", password: "grandma lois" })).status).toBe(200);
    expect((await ctx.client().post("/public/app/claim-invite", { code: invite.json.code, password: "another one" })).status).toBe(400);
  });

  it("needs a way to sign in, refuses duplicates, and defers to a waiting sign-up", async () => {
    const noContact = await person("No", "Contact");
    expect((await staff.post(`/members/${noContact.id}/app-invite`)).status).toBe(422);
    const kid = await person("Kid", "Contact", { isChild: true, email: "kid@example.org" });
    expect((await staff.post(`/members/${kid.id}/app-invite`)).status).toBe(422);

    const m = await person("Lydia", "Purple", { email: "lydia@example.org" });
    await signup();
    const res = await staff.post(`/members/${m.id}/app-invite`);
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/waiting for approval/);

    const { member } = await activeMember("Silas", "Companion", "3605550177");
    expect((await staff.post(`/members/${member.id}/app-invite`)).status).toBe(409);
  });

  it("re-inviting replaces the old code; expired codes fail", async () => {
    const m = await person("Titus", "Crete", { email: "titus@example.org" });
    const first = (await staff.post(`/members/${m.id}/app-invite`)).json.code;
    const second = (await staff.post(`/members/${m.id}/app-invite`)).json.code;
    expect((await ctx.client().post("/public/app/claim-invite", { code: first, password: "cretan pass" })).status).toBe(400);
    await ctx.db.update(users).set({ inviteExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.email, "titus@example.org"));
    expect((await ctx.client().post("/public/app/claim-invite", { code: second, password: "cretan pass" })).status).toBe(400);
  });
});

describe("account controls", () => {
  it("signing out of the app doesn't sign the same browser out of the staff site", async () => {
    const { app } = await activeMember();
    const res = await ctx.app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie: staff.cookie, "content-type": "application/json" },
      body: "{}",
    });
    // Cookie-session logout clears the cookie…
    expect(res.headers.get("set-cookie")).toMatch(/fbc_session=;/);
    // …but a bearer-token logout leaves it alone.
    const token = (await ctx.client().post("/auth/token", { identifier: "lydia@example.org", password: "sellers of purple" })).json.token;
    const appLogout = await ctx.app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, cookie: "fbc_session=still-here", "content-type": "application/json" },
      body: "{}",
    });
    expect(appLogout.status).toBe(204);
    expect(appLogout.headers.get("set-cookie")).toBeNull();
    expect((await app.get("/app/me")).status).toBe(200);
  });

  it("turning an account off signs it out everywhere", async () => {
    const { app } = await activeMember();
    const id = (await app.get("/app/me")).json.user.id;
    await staff.post(`/app-accounts/${id}/status`, { status: "disabled" });
    expect((await app.get("/app/me")).status).toBe(401);
    const login = await ctx.client().post("/auth/token", { identifier: "lydia@example.org", password: "sellers of purple" });
    expect(login.json.error.message).toMatch(/turned off/);
    await staff.post(`/app-accounts/${id}/status`, { status: "active" });
    expect((await ctx.client().post("/auth/token", { identifier: "lydia@example.org", password: "sellers of purple" })).status).toBe(200);
  });

  it("lets members delete their own account (their directory entry stays)", async () => {
    const { member, app } = await activeMember();
    expect((await app.delete("/app/me")).status).toBe(204);
    expect((await app.get("/app/me")).status).toBe(401);
    expect((await ctx.client().post("/auth/token", { identifier: "lydia@example.org", password: "sellers of purple" })).status).toBe(401);
    expect((await staff.get(`/members/${member.id}`)).json.member).toMatchObject({ id: member.id, appAccount: null });
    // Staff can't delete their login from the app.
    expect((await staff.delete("/app/me")).status).toBe(422);
  });

  it("keeps member-app accounts out of staff account management", async () => {
    const { app } = await activeMember();
    const id = (await app.get("/app/me")).json.user.id;
    expect((await staff.get("/users")).json.users.map((u: { role: string }) => u.role)).not.toContain("member");
    expect((await staff.patch(`/users/${id}`, { role: "admin" })).status).toBe(404);
    expect((await staff.delete(`/users/${id}`)).status).toBe(404);
  });
});

describe("profile and directory privacy", () => {
  it("lets members choose what the directory shows, in the app and in print", async () => {
    const fam = (await staff.post("/families", { name: "The Purples" })).json.family;
    const { member, app } = await activeMember();
    await staff.patch(`/members/${member.id}`, { familyId: fam.id, birthdate: "1990-04-12", address1: "1 Dye Works Ln" });

    const before = (await app.get("/app/directory")).json.entries[0];
    expect(before.adults[0]).toMatchObject({ phone: "3605550101", email: "lydia@example.org", birthday: "04-12" });
    expect(before.address.line1).toBe("1 Dye Works Ln");

    const saved = await app.patch("/app/me/profile", { dirShowPhone: false, dirShowBirthday: false, dirShowAddress: false, phone: "(360) 555-0102" });
    expect(saved.json.member).toMatchObject({ dirShowPhone: false, phone: "(360) 555-0102", householdName: "The Purples" });

    for (const [client, path] of [[app, "/app/directory"], [staff, "/directory"]] as const) {
      const entry = (await (client as App | Client).get(path)).json.entries[0];
      expect(entry.adults[0], path).toMatchObject({ phone: null, email: "lydia@example.org", birthday: null });
      expect(entry.address, path).toBeNull();
    }

    await app.patch("/app/me/profile", { directoryOptOut: true });
    expect((await app.get("/app/directory")).json.entries).toEqual([]);
    expect((await app.patch("/app/me/profile", { email: "not an email" })).status).toBe(422);
  });

  it("serves household photos through signed, expiring links", async () => {
    const fam = (await staff.post("/families", { name: "The Purples" })).json.family;
    const { member, app } = await activeMember();
    await staff.patch(`/members/${member.id}`, { familyId: fam.id });
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    await ctx.app.request(`/api/v1/families/${fam.id}/photo`, { method: "PUT", headers: { cookie: staff.cookie, "content-type": "image/jpeg" }, body: new Uint8Array(jpeg) });

    const url: string = (await app.get("/app/directory")).json.entries[0].photoUrl;
    expect(url).toMatch(/^\/api\/v1\/public\/app\/photos\/\d+\?v=\d+&exp=\d+&sig=/);
    const ok = await ctx.app.request(url);
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).equals(jpeg)).toBe(true);
    expect((await ctx.app.request(url.replace(/sig=.*/, "sig=forged"))).status).toBe(403);
    expect((await ctx.app.request(url.replace(/exp=\d+/, "exp=1000"))).status).toBe(403);
    const otherFamily = url.replace(/photos\/\d+/, `photos/${fam.id + 1}`);
    expect((await ctx.app.request(otherFamily)).status).toBe(403);
  });
});

describe("group chat", () => {
  async function setup() {
    const a = await activeMember("Priscilla", "Tent", "3605550111");
    const b = await activeMember("Apollos", "Alexandria", "3605550112");
    const outsider = await activeMember("Demas", "Away", "3605550113");
    const group = (await staff.post("/groups", { name: "Corinth House Church", meetingTime: "Sundays" })).json.group;
    await staff.post(`/groups/${group.id}/members`, { memberId: a.member.id });
    await staff.post(`/groups/${group.id}/members`, { memberId: b.member.id });
    return { a, b, outsider, group };
  }

  it("lets group members talk, with unread counts and polling", async () => {
    const { a, b, group } = await setup();
    const g = `/app/groups/${group.id}`;
    expect((await a.app.get("/app/chats")).json.groups).toEqual([
      expect.objectContaining({ id: group.id, kind: "group", name: "Corinth House Church", detail: "Sundays", memberCount: 2, unread: 0, lastMessage: null }),
    ]);

    const sent = await a.app.post(`${g}/messages`, { body: "  Welcome, everyone!  " });
    expect(sent.status).toBe(201);
    expect(sent.json.message).toMatchObject({ body: "Welcome, everyone!", mine: true, author: { name: "Priscilla Tent" } });
    await a.app.post(`${g}/messages`, { body: "Potluck Sunday?" });

    const theirs = (await b.app.get("/app/chats")).json.groups[0];
    expect(theirs).toMatchObject({ unread: 2, lastMessage: { body: "Potluck Sunday?", authorName: "Priscilla" } });
    expect((await a.app.get("/app/chats")).json.groups[0].unread).toBe(0);

    const history = (await b.app.get(`${g}/messages`)).json;
    expect(history.messages.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ["Welcome, everyone!", false],
      ["Potluck Sunday?", false],
    ]);
    const lastId = history.messages.at(-1).id;
    await b.app.post(`${g}/read`, { lastMessageId: lastId });
    expect((await b.app.get("/app/chats")).json.groups[0].unread).toBe(0);
    await b.app.post(`${g}/read`, { lastMessageId: 0 }); // never moves backwards
    expect((await b.app.get("/app/chats")).json.groups[0].unread).toBe(0);

    await b.app.post(`${g}/messages`, { body: "Yes! I'll bring bread." });
    const poll = (await a.app.get(`${g}/messages?after=${lastId}`)).json.messages;
    expect(poll.map((m: { body: string }) => m.body)).toEqual(["Yes! I'll bring bread."]);
  });

  it("pages through history", async () => {
    const { a, group } = await setup();
    const g = `/app/groups/${group.id}`;
    for (let i = 1; i <= 5; i++) await ctx.db.insert(chatMessages).values({ groupId: group.id, memberId: a.member.id, body: `msg ${i}` });
    const page1 = (await a.app.get(`${g}/messages?limit=2`)).json;
    expect(page1.messages.map((m: { body: string }) => m.body)).toEqual(["msg 4", "msg 5"]);
    expect(page1.hasMore).toBe(true);
    const page2 = (await a.app.get(`${g}/messages?limit=10&before=${page1.messages[0].id}`)).json;
    expect(page2.messages.map((m: { body: string }) => m.body)).toEqual(["msg 1", "msg 2", "msg 3"]);
    expect(page2.hasMore).toBe(false);
  });

  it("keeps outsiders out and only lets authors delete their messages", async () => {
    const { a, b, outsider, group } = await setup();
    const g = `/app/groups/${group.id}`;
    expect((await outsider.app.get("/app/chats")).json.groups).toEqual([]);
    expect((await outsider.app.get(`${g}/messages`)).status).toBe(404);
    expect((await outsider.app.post(`${g}/messages`, { body: "hi" })).status).toBe(404);

    const msg = (await a.app.post(`${g}/messages`, { body: "oops" })).json.message;
    expect((await b.app.delete(`${g}/messages/${msg.id}`)).status).toBe(404);
    expect((await a.app.delete(`${g}/messages/${msg.id}`)).status).toBe(204);
    const [shown] = (await b.app.get(`${g}/messages`)).json.messages;
    expect(shown).toMatchObject({ id: msg.id, deleted: true, body: "" });
    expect((await a.app.post(`${g}/messages`, { body: "   " })).status).toBe(422);
  });

  it("rate limits rapid posting", async () => {
    const { a, group } = await setup();
    const statuses = [];
    for (let i = 0; i < 22; i++) statuses.push((await a.app.post(`/app/groups/${group.id}/messages`, { body: `m${i}` })).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
});

describe("team chat", () => {
  async function setup() {
    const leader = await activeMember("Nehemiah", "Wall", "3605550121");
    const helper = await activeMember("Ezra", "Scribe", "3605550122");
    const outsider = await activeMember("Sanballat", "Horonite", "3605550123");
    const team = (await staff.post("/teams", { name: "Rebuilding Crew", leaderId: leader.member.id })).json.team;
    await staff.post(`/teams/${team.id}/members`, { memberId: helper.member.id, role: "Gate keeper" });
    return { leader, helper, outsider, team };
  }

  it("includes the team's members and its leader", async () => {
    const { leader, helper, outsider, team } = await setup();
    const t = `/app/teams/${team.id}`;
    const listed = (await leader.app.get("/app/chats")).json;
    expect(listed.groups).toEqual([]);
    expect(listed.teams).toEqual([
      expect.objectContaining({ id: team.id, kind: "team", name: "Rebuilding Crew", detail: "Team leader", memberCount: 2, unread: 0 }),
    ]);
    expect((await helper.app.get("/app/chats")).json.teams[0].detail).toBe("Gate keeper");

    expect((await leader.app.post(`${t}/messages`, { body: "Let us rise up and build." })).status).toBe(201);
    expect((await helper.app.get("/app/chats")).json.teams[0]).toMatchObject({ unread: 1, lastMessage: { authorName: "Nehemiah" } });
    const [msg] = (await helper.app.get(`${t}/messages`)).json.messages;
    await helper.app.post(`${t}/read`, { lastMessageId: msg.id });
    expect((await helper.app.get("/app/chats")).json.teams[0].unread).toBe(0);

    expect((await outsider.app.get("/app/chats")).json.teams).toEqual([]);
    expect((await outsider.app.get(`${t}/messages`)).status).toBe(404);
    expect((await outsider.app.post(`${t}/messages`, { body: "hi" })).status).toBe(404);
  });

  it("keeps team and group chats separate even when ids match", async () => {
    const { leader, team } = await setup();
    const group = (await staff.post("/groups", { name: "Jerusalem Group" })).json.group;
    await staff.post(`/groups/${group.id}/members`, { memberId: leader.member.id });
    expect(group.id).toBe(team.id);
    await leader.app.post(`/app/teams/${team.id}/messages`, { body: "team only" });
    await leader.app.post(`/app/groups/${group.id}/messages`, { body: "group only" });
    const bodies = async (p: string) => (await leader.app.get(p)).json.messages.map((m: { body: string }) => m.body);
    expect(await bodies(`/app/teams/${team.id}/messages`)).toEqual(["team only"]);
    expect(await bodies(`/app/groups/${group.id}/messages`)).toEqual(["group only"]);
  });

  it("closes the chat to someone taken off the team", async () => {
    const { helper, team } = await setup();
    await staff.delete(`/teams/${team.id}/members/${helper.member.id}`);
    expect((await helper.app.get(`/app/teams/${team.id}/messages`)).status).toBe(404);
  });
});

describe("sermons", () => {
  it("parses the church website's media pages", () => {
    const series = parseSeriesList(readFileSync(new URL("./fixtures/sermon-media.html", import.meta.url), "utf8"));
    expect(series[0]).toEqual({ href: "/media/series/cyvmsrw/stories-of-the-king", title: "Stories of the King" });
    expect(series.length).toBeGreaterThan(5);

    const sermons = parseSeriesSermons(readFileSync(new URL("./fixtures/sermon-series.html", import.meta.url), "utf8"), "Ancient and Modern");
    expect(sermons.length).toBeGreaterThan(2);
    expect(sermons[0]).toMatchObject({
      series: "Ancient and Modern",
      speaker: "John Souza",
      url: expect.stringMatching(/^https:\/\/fbcenumclaw\.com\/media\/[a-z0-9]+\//),
      playerUrl: expect.stringMatching(/^https:\/\/subsplash\.com\/u\/-T9N865\/media\/embed\/d\/[a-z0-9]+$/),
      imageUrl: expect.stringMatching(/^https:\/\/images\.subsplash\.com\/image\.jpg\?id=[0-9a-f-]{36}&w=1280&h=720$/),
      thumbnailUrl: expect.stringMatching(/&w=400&h=225$/),
    });
    expect(sermons.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date ?? ""))).toBe(true);
    expect(parseSiteDate("Sept 6, 2026")).toBe("2026-09-06");
    // Full-size originals are swapped for resized copies.
    expect(sizedImage("https://cdn.subsplash.com/images/T9N865/_source/81de3395-3eb2-4743-b0d1-5b4315c08e8a/image.png", 400)).toBe(
      "https://images.subsplash.com/image.jpg?id=81de3395-3eb2-4743-b0d1-5b4315c08e8a&w=400&h=225",
    );
    expect(sizedImage("https://example.org/art.png", 400)).toBe("https://example.org/art.png");
  });

  it("serves recent sermons to members", async () => {
    ctx.sermons.push({ id: "abc", title: "Jesus Walks Among the Outcasts", date: "2026-09-20", speaker: "John Souza", series: "Stories of the King", imageUrl: null, thumbnailUrl: null, url: "https://fbcenumclaw.com/media/abc/x", playerUrl: "https://subsplash.com/u/-T9N865/media/embed/d/abc" });
    const { app } = await activeMember();
    const res = await app.get("/app/sermons");
    expect(res.json).toMatchObject({ stale: false, sermons: [{ id: "abc", speaker: "John Souza" }] });
    const pending = bearer((await signup({ email: "new@example.org", phone: null })).json.token);
    expect((await pending.get("/app/sermons")).status).toBe(403);
  });
});
