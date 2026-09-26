import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
let api: Awaited<ReturnType<typeof ctx.signIn>>;
beforeEach(async () => {
  await ctx.reset();
  api = await ctx.signIn();
});
afterAll(() => ctx.close());

const person = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) =>
  api.post("/members", { firstName, lastName, status: "active", ...extra }).then((r) => r.json.member);
const household = (name: string) => api.post("/families", { name }).then((r) => r.json.family);

// Smallest valid images of each type.
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const upload = (familyId: number, body: Buffer | string, type = "image/jpeg") =>
  ctx.app.request(`/api/v1/families/${familyId}/photo`, { method: "PUT", headers: { cookie: api.cookie, "content-type": type }, body: typeof body === "string" ? body : new Uint8Array(body) });

describe("directory", () => {
  it("lists households and single people A–Z by last name with contact info and birthdays", async () => {
    const zed = await household("The Zimmerman Family");
    await person("Zoe", "Zimmerman", { familyId: zed.id, phone: "555-1111", birthdate: "1980-03-14", address1: "1 Oak St", city: "Enumclaw", state: "WA", postalCode: "98022" });
    await person("Zach", "Zimmerman", { familyId: zed.id });
    await person("Tiny", "Zimmerman", { familyId: zed.id, isChild: true, birthdate: "2020-06-01" });
    await person("Big", "Zimmerman", { familyId: zed.id, isChild: true, birthdate: "2015-01-20" });
    await person("Amy", "Adams", { email: "amy@x.org" });
    const mixed = await household("Blended");
    await person("Pat", "Brown", { familyId: mixed.id });
    await person("Chris", "Clark", { familyId: mixed.id });
    await person("Kid", "Brown", { familyId: mixed.id, isChild: true });

    const { entries } = (await api.get("/directory")).json;
    expect(entries.map((e: { title: string }) => e.title)).toEqual(["Adams", "Brown / Clark", "Zimmerman"]);
    const [adams, blended, zimmerman] = entries;
    expect(adams).toMatchObject({ kind: "individual", householdId: null, adults: [{ firstName: "Amy", email: "amy@x.org" }] });
    expect(blended.adults.map((p: { firstName: string }) => p.firstName)).toEqual(["Chris", "Pat"]);
    expect(zimmerman).toMatchObject({
      kind: "household",
      householdId: zed.id,
      address: { line1: "1 Oak St", city: "Enumclaw", state: "WA", postalCode: "98022", line2: null },
      photoUrl: null,
    });
    expect(zimmerman.adults.find((p: { firstName: string }) => p.firstName === "Zoe")).toMatchObject({ phone: "555-1111", birthday: "03-14" });
    // Kids oldest first; birthdays have no year.
    expect(zimmerman.children.map((p: { firstName: string; birthday: string }) => [p.firstName, p.birthday])).toEqual([
      ["Big", "01-20"],
      ["Tiny", "06-01"],
    ]);
  });

  it("includes only the chosen statuses and respects opt-outs", async () => {
    const fam = await household("The Smiths");
    await person("Sam", "Smith", { familyId: fam.id });
    await person("Private", "Smith", { familyId: fam.id, directoryOptOut: true });
    await person("Guest", "Visitor", { status: "guest" });
    await person("Gone", "Away", { status: "inactive" });

    const def = (await api.get("/directory")).json;
    expect(def.statuses).toEqual(["active", "prospective"]);
    expect(def.entries.map((e: { title: string }) => e.title)).toEqual(["Smith"]);
    expect(def.entries[0].adults.map((p: { firstName: string }) => p.firstName)).toEqual(["Sam"]);
    expect(def.optedOut).toBe(1);

    const all = (await api.get("/directory?statuses=active,guest,inactive")).json;
    expect(all.entries.map((e: { title: string }) => e.title)).toEqual(["Away", "Smith", "Visitor"]);
    expect((await api.get("/directory?statuses=nope")).status).toBe(422);
  });

  it("is off-limits to volunteers and kiosks", async () => {
    await api.post("/users", { email: "helper@test.org", password: "password123", role: "volunteer" });
    const login = await ctx.client().post("/auth/login", { email: "helper@test.org", password: "password123" });
    const volunteer = ctx.client(login.headers.get("set-cookie")!.split(";")[0]);
    expect((await volunteer.get("/directory")).status).toBe(403);
    expect((await volunteer.get("/families/1/photo")).status).toBe(403);
  });
});

describe("household photos", () => {
  it("uploads, serves, replaces and removes a photo", async () => {
    const fam = await household("The Photographers");
    await person("Ann", "Photographer", { familyId: fam.id });

    const res = await upload(fam.id, JPEG);
    expect(res.status).toBe(200);
    const { family } = await res.json();
    expect(family.photoUrl).toMatch(new RegExp(`^/api/v1/families/${fam.id}/photo\\?v=\\d+$`));
    expect((await api.get("/directory")).json.entries[0].photoUrl).toBe(family.photoUrl);

    const img = await ctx.app.request(family.photoUrl, { headers: { cookie: api.cookie } });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("cache-control")).toMatch(/private/);
    expect(Buffer.from(await img.arrayBuffer()).equals(JPEG)).toBe(true);
    const cached = await ctx.app.request(family.photoUrl, { headers: { cookie: api.cookie, "if-none-match": img.headers.get("etag")! } });
    expect(cached.status).toBe(304);

    // Anonymous visitors can't fetch family photos.
    expect((await ctx.app.request(family.photoUrl)).status).toBe(401);

    await new Promise((r) => setTimeout(r, 5));
    const replaced = await (await upload(fam.id, PNG, "image/png")).json();
    expect(replaced.family.photoUrl).not.toBe(family.photoUrl);
    const png = await ctx.app.request(replaced.family.photoUrl, { headers: { cookie: api.cookie } });
    expect(png.headers.get("content-type")).toBe("image/png");

    expect((await api.delete(`/families/${fam.id}/photo`)).status).toBe(204);
    expect((await api.get(`/families/${fam.id}`)).json.family.photoUrl).toBeNull();
    expect((await api.get(`/families/${fam.id}/photo`)).status).toBe(404);
  });

  it("rejects things that aren't images, oversized uploads, and unknown households", async () => {
    const fam = await household("The Careful");
    expect((await upload(fam.id, "<svg onload=alert(1)>", "image/jpeg")).status).toBe(422);
    expect((await upload(fam.id, JPEG, "text/html")).status).toBe(422);
    expect((await upload(fam.id, Buffer.concat([JPEG, Buffer.alloc(7 * 1024 * 1024)]))).status).toBe(413);
    expect((await upload(9999, JPEG)).status).toBe(404);
  });

  it("caps ordinary JSON bodies at 1 MB", async () => {
    const res = await api.post("/families", { name: "x".repeat(2 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
});
