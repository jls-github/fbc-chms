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
  api.post("/members", { firstName, lastName, ...extra }).then((r) => r.json.member);

describe("members", () => {
  it("validates input and reports field errors", async () => {
    const res = await api.post("/members", { firstName: " ", lastName: "Smith", email: "not-an-email", birthdate: "12/1/1990" });
    expect(res.status).toBe(422);
    expect(Object.keys(res.json.error.fieldErrors).sort()).toEqual(["birthdate", "email", "firstName"]);
  });

  it("creates members with defaults and normalizes blank fields to null", async () => {
    const res = await api.post("/members", { firstName: " Ruth ", lastName: "Moab", email: "", phone: "", familyId: "" });
    expect(res.status).toBe(201);
    expect(res.json.member).toMatchObject({
      firstName: "Ruth",
      status: "guest",
      isChild: false,
      email: null,
      phone: null,
      family: null,
      groups: [],
      teams: [],
      household: [],
    });
  });

  it("PATCH only changes the fields sent", async () => {
    const m = await person("Boaz", "Bethlehem", { status: "active", phone: "555" });
    const res = await api.patch(`/members/${m.id}`, { lastName: "of Bethlehem" });
    expect(res.json.member).toMatchObject({ lastName: "of Bethlehem", status: "active", phone: "555" });
    expect((await api.patch("/members/9999", { lastName: "x" })).status).toBe(404);
  });

  it("lists sorted by last name with status filter and search", async () => {
    await person("Zed", "Adams", { status: "active", email: "zed@x.org" });
    await person("Amy", "Young", { status: "guest", phone: "(360) 555-0100" });
    await person("Bob", "Adams", { status: "active" });
    const all = (await api.get("/members")).json.members.map((m: { firstName: string }) => m.firstName);
    expect(all).toEqual(["Bob", "Zed", "Amy"]);
    expect((await api.get("/members?status=guest")).json.members).toHaveLength(1);
    expect((await api.get("/members?q=bob%20ad")).json.members).toHaveLength(1);
    expect((await api.get("/members?q=555-0100")).json.members[0].firstName).toBe("Amy");
    expect((await api.get("/members?q=%25")).json.members).toHaveLength(0);
  });

  it("shows the rest of the household on a member's detail", async () => {
    const fam = (await api.post("/families", { name: "The Smiths" })).json.family;
    const dad = await person("John", "Smith", { familyId: fam.id });
    await person("Jane", "Smith", { familyId: fam.id });
    await person("Kid", "Smith", { familyId: fam.id, isChild: true });
    const detail = (await api.get(`/members/${dad.id}`)).json.member;
    expect(detail.family).toEqual({ id: fam.id, name: "The Smiths" });
    expect(detail.household.map((p: { firstName: string }) => p.firstName)).toEqual(["Jane", "Kid"]);
  });

  it("rejects a family that doesn't exist", async () => {
    const res = await api.post("/members", { firstName: "A", lastName: "B", familyId: 424242 });
    expect(res.status).toBe(422);
  });

  it("deleting a member removes their memberships", async () => {
    const m = await person("Temp", "Person");
    const g = (await api.post("/groups", { name: "G" })).json.group;
    await api.post(`/groups/${g.id}/members`, { memberId: m.id });
    expect((await api.delete(`/members/${m.id}`)).status).toBe(204);
    expect((await api.get(`/groups/${g.id}`)).json.group.members).toEqual([]);
    expect((await api.delete(`/members/${m.id}`)).status).toBe(404);
  });
});

describe("households", () => {
  it("creates with members, replaces the member list on update, and frees members on delete", async () => {
    const a = await person("A", "One");
    const b = await person("B", "One");
    const c = await person("C", "One");
    const fam = (await api.post("/families", { name: "The Ones", memberIds: [a.id, b.id] })).json.family;
    expect(fam.members.map((m: { id: number }) => m.id).sort()).toEqual([a.id, b.id].sort());

    const updated = (await api.patch(`/families/${fam.id}`, { memberIds: [b.id, c.id] })).json.family;
    expect(updated.members.map((m: { id: number }) => m.id).sort()).toEqual([b.id, c.id].sort());
    expect((await api.get(`/members/${a.id}`)).json.member.family).toBeNull();

    const renamed = (await api.patch(`/families/${fam.id}`, { name: "The Twos" })).json.family;
    expect(renamed.members).toHaveLength(2);

    expect((await api.delete(`/families/${fam.id}`)).status).toBe(204);
    expect((await api.get(`/members/${b.id}`)).json.member.family).toBeNull();
    expect((await api.get("/families")).json.families).toEqual([]);
  });

  it("lists adults before children", async () => {
    const fam = (await api.post("/families", { name: "Mixed" })).json.family;
    await person("Zoe", "Mixed", { familyId: fam.id, isChild: true });
    await person("Adam", "Mixed", { familyId: fam.id });
    const [first, second] = (await api.get(`/families/${fam.id}`)).json.family.members;
    expect([first.firstName, second.firstName]).toEqual(["Adam", "Zoe"]);
  });
});
