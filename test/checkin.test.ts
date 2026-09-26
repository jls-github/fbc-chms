import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { serviceDate } from "../src/server/lib/church-time";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

/** Signs in a staff member, turns their browser into a kiosk, and returns a client using the kiosk cookie. */
async function setUpKiosk(label = "Lobby iPad") {
  const staff = await ctx.signIn("office@test.org", "staff");
  const res = await staff.post("/checkin/kiosks", { label });
  expect(res.status).toBe(201);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  // The staff sign-in on that device is gone; only the kiosk remains.
  expect((await staff.get("/members")).status).toBe(401);
  return { kiosk: ctx.client(cookie), staff: await ctx.signIn("admin@test.org", "admin") };
}

const register = (kiosk: ReturnType<typeof ctx.client>, overrides: Record<string, unknown> = {}) =>
  kiosk.post("/kiosk/households", {
    parent: { firstName: "Mary", lastName: "Martha", phone: "(360) 555-0142", email: "" },
    children: [
      { firstName: "Sam", birthdate: "2019-04-02", medicalNotes: "Peanut allergy" },
      { firstName: "Ruthie", birthdate: "2022-11-20" },
    ],
    ...overrides,
  });

describe("kiosk", () => {
  it("is locked to check-in: no directory, no admin, but knows it's a kiosk", async () => {
    const { kiosk } = await setUpKiosk();
    expect((await kiosk.get("/kiosk/status")).json).toEqual({ label: "Lobby iPad", serviceDate: serviceDate() });
    expect((await kiosk.get("/auth/me")).json.session).toEqual({ kind: "kiosk", label: "Lobby iPad" });
    for (const path of ["/members", "/dashboard", "/families", "/checkin/roster", "/users", "/search?q=a"]) {
      expect((await kiosk.get(path)).status, path).toBe(403);
    }
    expect((await kiosk.post("/auth/token", {})).status).toBe(422); // public endpoint, still just validation
  });

  it("registers a first-time family and finds them again by phone, last 4 digits, or last name", async () => {
    const { kiosk } = await setUpKiosk();
    const res = await register(kiosk);
    expect(res.status).toBe(201);
    const household = res.json.household;
    expect(household.name).toBe("The Martha Family");
    expect(household.adults).toEqual([expect.objectContaining({ firstName: "Mary" })]);
    expect(household.children.map((k: { firstName: string; lastName: string }) => `${k.firstName} ${k.lastName}`)).toEqual(["Sam Martha", "Ruthie Martha"]);
    expect(household.children[0].medicalNotes).toBe("Peanut allergy");

    for (const q of ["3605550142", "(360) 555-0142", "0142", "mart", "Martha"]) {
      const found = (await kiosk.get(`/kiosk/households?q=${encodeURIComponent(q)}`)).json.households;
      expect(found.map((h: { id: number }) => h.id), q).toEqual([household.id]);
    }
    expect((await kiosk.get("/kiosk/households?q=smith")).json.households).toEqual([]);
    expect((await kiosk.get("/kiosk/households?q=014")).status).toBe(422);

    // Registering the same phone again points them to search instead of making a duplicate family.
    const dup = await register(kiosk, { parent: { firstName: "Mary", lastName: "Martha", phone: "360-555-0142" } });
    expect(dup.status).toBe(409);

    // The new family shows up for staff as guests, with the child flagged.
    const { staff } = { staff: await ctx.signIn("pastor@test.org", "admin") };
    const people = (await staff.get("/members?q=martha")).json.members;
    expect(people.map((p: { status: string; isChild: boolean }) => [p.status, p.isChild]).sort()).toEqual([
      ["guest", false],
      ["guest", true],
      ["guest", true],
    ]);
  });

  it("validates registration", async () => {
    const { kiosk } = await setUpKiosk();
    const res = await kiosk.post("/kiosk/households", {
      parent: { firstName: "", lastName: "X", phone: "555-12" },
      children: [{ firstName: "Kid", birthdate: "soon" }],
    });
    expect(res.status).toBe(422);
    expect(Object.keys(res.json.error.fieldErrors).sort()).toEqual(["children.0.birthdate", "parent.firstName", "parent.phone"]);
    expect((await kiosk.post("/kiosk/households", { parent: { firstName: "A", lastName: "B", phone: "3605550000" }, children: [] })).status).toBe(422);
  });

  it("checks siblings in under one security code, and adds a new baby on the spot", async () => {
    const { kiosk } = await setUpKiosk();
    const h = (await register(kiosk)).json.household;
    const [sam, ruthie] = h.children;

    const first = await kiosk.post("/kiosk/checkins", { householdId: h.id, childIds: [sam.id] });
    expect(first.status).toBe(201);
    expect(first.json.securityCode).toMatch(/^[A-Z0-9]{3}$/);
    expect(first.json.serviceDate).toBe(serviceDate());
    expect(first.json.children).toEqual([expect.objectContaining({ id: sam.id, checkedIn: true, securityCode: first.json.securityCode })]);

    // Later that morning: the sibling gets the same code (matches the parent's tag); re-checking Sam is harmless.
    const second = await kiosk.post("/kiosk/checkins", { householdId: h.id, childIds: [sam.id, ruthie.id] });
    expect(second.json.securityCode).toBe(first.json.securityCode);

    const baby = await kiosk.post(`/kiosk/households/${h.id}/children`, { firstName: "Lois", birthdate: "2026-06-01" });
    expect(baby.status).toBe(201);
    const lois = baby.json.household.children.find((k: { firstName: string }) => k.firstName === "Lois");
    expect(lois.lastName).toBe("Martha");
    expect((await kiosk.post("/kiosk/checkins", { householdId: h.id, childIds: [lois.id] })).json.securityCode).toBe(first.json.securityCode);
  });

  it("won't check in kids from another household, or adults", async () => {
    const { kiosk } = await setUpKiosk();
    const a = (await register(kiosk)).json.household;
    const b = (await register(kiosk, { parent: { firstName: "Joe", lastName: "Other", phone: "3605559999" } })).json.household;
    expect((await kiosk.post("/kiosk/checkins", { householdId: a.id, childIds: [b.children[0].id] })).status).toBe(422);
    expect((await kiosk.post("/kiosk/checkins", { householdId: a.id, childIds: [a.adults[0].id] })).status).toBe(422);
  });

  it("can be turned off by staff, and leaving kiosk mode needs a staff sign-in", async () => {
    const { kiosk, staff } = await setUpKiosk();
    const list = (await staff.get("/checkin/kiosks")).json.kiosks;
    expect(list).toEqual([expect.objectContaining({ label: "Lobby iPad", setUpBy: "office@test.org" })]);
    expect((await staff.delete(`/checkin/kiosks/${list[0].id}`)).status).toBe(204);
    expect((await kiosk.get("/kiosk/status")).status).toBe(401);
  });
});

describe("volunteer roster", () => {
  it("shows today's kids with allergies and parent contacts, and handles pickup by code", async () => {
    const { kiosk, staff } = await setUpKiosk();
    const h = (await register(kiosk)).json.household;
    const { securityCode } = (await kiosk.post("/kiosk/checkins", { householdId: h.id, childIds: h.children.map((k: { id: number }) => k.id) })).json;

    await staff.post("/users", { email: "helper@test.org", password: "password123", role: "volunteer" });
    const volunteer = ctx.client(
      (await ctx.client().post("/auth/login", { email: "helper@test.org", password: "password123" })).headers.get("set-cookie")!.split(";")[0],
    );

    const roster = (await volunteer.get("/checkin/roster")).json;
    expect(roster.serviceDate).toBe(serviceDate());
    expect(roster.entries).toHaveLength(2);
    const sam = roster.entries.find((e: { child: { firstName: string } }) => e.child.firstName === "Sam");
    expect(sam).toMatchObject({
      securityCode,
      household: { name: "The Martha Family" },
      contacts: [{ name: "Mary Martha", phone: "(360) 555-0142" }],
      child: { medicalNotes: "Peanut allergy" },
      checkedOutAt: null,
      checkedInBy: "Kiosk: Lobby iPad",
    });

    const out = await volunteer.post("/checkin/checkout", { checkinIds: roster.entries.map((e: { id: number }) => e.id) });
    expect(out.json.checkedOut).toBe(2);
    expect((await volunteer.post("/checkin/checkout", { checkinIds: [sam.id] })).json.checkedOut).toBe(0);
    const after = (await volunteer.get("/checkin/roster")).json.entries;
    expect(after.every((e: { checkedOutAt: string | null; checkedOutBy: string }) => e.checkedOutAt && e.checkedOutBy === "helper@test.org")).toBe(true);

    expect((await volunteer.post(`/checkin/checkins/${sam.id}/undo-checkout`)).status).toBe(204);
    expect((await volunteer.get("/checkin/roster")).json.entries.filter((e: { checkedOutAt: string | null }) => !e.checkedOutAt)).toHaveLength(1);

    // Picked-up kids who come back get a fresh check-in.
    const ruthie = after.find((e: { child: { firstName: string } }) => e.child.firstName === "Ruthie");
    const again = await kiosk.post("/kiosk/checkins", { householdId: h.id, childIds: [ruthie.child.id] });
    expect(again.json.children[0].checkedIn).toBe(true);

    // Other days are separate.
    expect((await volunteer.get("/checkin/roster?date=2020-01-05")).json.entries).toEqual([]);
  });

  it("gives volunteers nothing but the roster", async () => {
    const admin = await ctx.signIn();
    await admin.post("/users", { email: "helper@test.org", password: "password123", role: "volunteer" });
    const volunteer = ctx.client(
      (await ctx.client().post("/auth/login", { email: "helper@test.org", password: "password123" })).headers.get("set-cookie")!.split(";")[0],
    );
    expect((await volunteer.get("/auth/me")).json.user.role).toBe("volunteer");
    expect((await volunteer.get("/checkin/roster")).status).toBe(200);
    for (const path of ["/members", "/dashboard", "/families", "/attendance", "/search?q=a", "/kiosk/households?q=smith", "/checkin/kiosks", "/report-links"]) {
      expect((await volunteer.get(path)).status, path).toBe(403);
    }
    expect((await volunteer.post("/checkin/kiosks", { label: "sneaky" })).status).toBe(403);
  });
});

describe("service date", () => {
  it("uses the church's local date, not UTC", () => {
    // 2026-09-27 05:30 UTC is still Saturday evening in Enumclaw.
    const lateSaturday = new Date("2026-09-27T05:30:00Z");
    expect(serviceDate(lateSaturday, "America/Los_Angeles")).toBe("2026-09-26");
    expect(serviceDate(lateSaturday, "UTC")).toBe("2026-09-27");
  });
});
