import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, PASSWORD } from "./helpers";

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe("authentication", () => {
  it("rejects unauthenticated API requests", async () => {
    const res = await ctx.client().get("/members");
    expect(res.status).toBe(401);
    expect(res.json.error.message).toMatch(/sign in/i);
  });

  it("rejects a wrong password without revealing whether the email exists", async () => {
    await ctx.createUser("pastor@test.org");
    const wrong = await ctx.client().post("/auth/login", { email: "pastor@test.org", password: "nope" });
    const unknown = await ctx.client().post("/auth/login", { email: "ghost@test.org", password: "nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.error.message).toBe(unknown.json.error.message);
  });

  it("signs in with a case-insensitive email, sets an httpOnly cookie, and signs out", async () => {
    await ctx.createUser("pastor@test.org");
    const res = await ctx.client().post("/auth/login", { email: "Pastor@Test.org", password: PASSWORD });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/fbc_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const api = ctx.client(setCookie.split(";")[0]);
    expect((await api.get("/auth/me")).json.user.email).toBe("pastor@test.org");
    expect((await api.post("/auth/logout")).status).toBe(204);
    expect((await api.get("/auth/me")).status).toBe(401);
  });

  it("issues bearer tokens for mobile clients", async () => {
    await ctx.createUser("app@test.org");
    const res = await ctx.client().post("/auth/token", { email: "app@test.org", password: PASSWORD, deviceName: "iPad" });
    expect(res.status).toBe(200);
    const auth = { authorization: `Bearer ${res.json.token}` };
    const api = ctx.client();
    expect((await api.get("/members", auth)).status).toBe(200);
    // Bearer clients aren't subject to the browser origin check.
    expect((await api.post("/families", { name: "X" }, { ...auth, origin: "capacitor://localhost" })).status).toBe(201);
    expect((await api.post("/auth/logout", {}, auth)).status).toBe(204);
    expect((await api.get("/members", auth)).status).toBe(401);
  });

  it("blocks cross-origin writes made with the session cookie", async () => {
    const api = await ctx.signIn();
    const res = await api.post("/families", { name: "Evil" }, { origin: "https://evil.example", host: "localhost" });
    expect(res.status).toBe(403);
    const same = await api.post("/families", { name: "Good" }, { origin: "http://localhost", host: "localhost" });
    expect(same.status).toBe(201);
  });

  it("rate limits repeated sign-in attempts", async () => {
    const api = ctx.client();
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await api.post("/auth/login", { email: "a@test.org", password: "x" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("resets a forgotten password via an emailed one-time link and revokes old sessions", async () => {
    const api = await ctx.signIn("pastor@test.org");
    const res = await ctx.client().post("/auth/password/forgot", { email: "pastor@test.org" });
    expect(res.status).toBe(202);
    expect(ctx.mail).toHaveLength(1);
    const token = decodeURIComponent(ctx.mail[0]!.text.match(/token=([^\s]+)/)![1]!);

    // Unknown emails look identical to callers and send nothing.
    expect((await ctx.client().post("/auth/password/forgot", { email: "ghost@test.org" })).status).toBe(202);
    expect(ctx.mail).toHaveLength(1);

    const short = await ctx.client().post("/auth/password/reset", { token, password: "short" });
    expect(short.status).toBe(422);
    expect(short.json.error.fieldErrors.password).toBeDefined();

    expect((await ctx.client().post("/auth/password/reset", { token, password: "brand new password" })).status).toBe(204);
    expect((await ctx.client().post("/auth/password/reset", { token, password: "again again again" })).status).toBe(400);
    expect((await api.get("/auth/me")).status).toBe(401);
    expect((await ctx.client().post("/auth/login", { email: "pastor@test.org", password: "brand new password" })).status).toBe(200);
  });

  it("changes the signed-in user's password after checking the current one", async () => {
    const api = await ctx.signIn();
    const bad = await api.post("/auth/password/change", { currentPassword: "wrong", newPassword: "another password" });
    expect(bad.status).toBe(422);
    expect(bad.json.error.fieldErrors.currentPassword).toBeDefined();
    expect((await api.post("/auth/password/change", { currentPassword: PASSWORD, newPassword: "another password" })).status).toBe(204);
    expect((await ctx.client().post("/auth/login", { email: "admin@test.org", password: "another password" })).status).toBe(200);
  });
});

describe("staff accounts", () => {
  it("are managed by admins only", async () => {
    const staff = await ctx.signIn("staff@test.org", "staff");
    expect((await staff.get("/users")).status).toBe(403);

    const admin = await ctx.signIn("boss@test.org", "admin");
    const created = await admin.post("/users", { email: "New@Test.org", password: "password123", role: "staff", name: "" });
    expect(created.status).toBe(201);
    expect(created.json.user).toMatchObject({ email: "new@test.org", role: "staff", name: null });
    expect((await admin.post("/users", { email: "new@test.org", password: "password123" })).json.error.fieldErrors.email).toBeDefined();
    expect((await admin.get("/users")).json.users).toHaveLength(3);
  });

  it("keeps at least one admin and never lets you delete yourself", async () => {
    const admin = await ctx.signIn("boss@test.org", "admin");
    const me = (await admin.get("/auth/me")).json.user;
    expect((await admin.delete(`/users/${me.id}`)).status).toBe(422);
    expect((await admin.patch(`/users/${me.id}`, { role: "staff" })).status).toBe(422);
    const other = await admin.post("/users", { email: "second@test.org", password: "password123", role: "admin" });
    expect((await admin.patch(`/users/${me.id}`, { role: "staff" })).status).toBe(200);
    expect(other.status).toBe(201);
  });
});

describe("app shell", () => {
  it("sets a strict content security policy, loosened only for the member app's sermon player", async () => {
    const staffPolicy = (await ctx.app.request("/up")).headers.get("content-security-policy")!;
    expect(staffPolicy).toContain("frame-src 'none'");
    expect(staffPolicy).toContain("frame-ancestors 'none'");
    const appPolicy = (await ctx.app.request("/app/")).headers.get("content-security-policy")!;
    expect(appPolicy).toContain("frame-src https://subsplash.com https://*.subsplash.com");
    expect(appPolicy).toContain("img-src 'self' data: blob: https://images.subsplash.com");
    expect(appPolicy).toContain("script-src 'self'");
  });

  it("serves health checks and the OpenAPI document without auth", async () => {
    expect((await ctx.app.request("/up")).status).toBe(200);
    const spec = await (await ctx.app.request("/api/openapi.json")).json();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/members"]).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
  });

  it("returns JSON 404s for unknown API routes and malformed JSON as 400", async () => {
    const api = await ctx.signIn();
    expect((await api.get("/nope")).status).toBe(404);
    const res = await ctx.app.request("/api/v1/families", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: api.cookie },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});
