import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importRailsSqlite } from "../src/server/db/import-rails";
import { createTestContext } from "./helpers";

const ctx = await createTestContext();
const dir = mkdtempSync(join(tmpdir(), "fbc-import-"));
beforeEach(() => ctx.reset());
afterAll(async () => {
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A SQLite file with the old Rails app's schema (db/schema.rb @ c94365d). */
function railsDatabase() {
  const file = join(dir, `rails-${Math.random().toString(36).slice(2)}.sqlite3`);
  const db = new DatabaseSync(file);
  db.exec(`
    create table families (id integer primary key, name varchar not null, created_at datetime not null, updated_at datetime not null);
    create table members (id integer primary key, first_name varchar, last_name varchar, address_1 varchar, address_2 varchar,
      postal_code varchar, phone varchar, email varchar, created_at datetime not null, updated_at datetime not null,
      city varchar, state varchar, status integer, child_or_teen boolean, family_id integer, birthdate date);
    create table groups (id integer primary key, name varchar, meeting_time varchar, meeting_location varchar, created_at datetime not null, updated_at datetime not null);
    create table group_members (id integer primary key, member_id integer not null, group_id integer not null, created_at datetime not null, updated_at datetime not null);
    create table teams (id integer primary key, name varchar, created_at datetime not null, updated_at datetime not null, team_leader_id integer);
    create table team_members (id integer primary key, team_id integer not null, member_id integer not null, status integer, created_at datetime not null, updated_at datetime not null, role varchar);
    create table attendance_reports (id integer primary key, event_type integer, date date, attendance integer, created_at datetime not null, updated_at datetime not null);
    create table users (id integer primary key, email_address varchar not null, password_digest varchar not null, created_at datetime not null, updated_at datetime not null);
  `);
  const t = "'2025-12-06 20:57:55.123456'";
  db.exec(`
    insert into families values (3, 'The Souzas', ${t}, ${t});
    insert into members values (5, 'John', 'Souza', '1 Main', '', '98022', '555', 'j@x.org', ${t}, ${t}, 'Enumclaw', 'WA', 2, 0, 3, '1990-04-02');
    insert into members values (8, 'Kiddo', 'Souza', null, null, null, null, null, ${t}, ${t}, null, null, 0, 1, 3, null);
    insert into members values (9, 'Nobody', null, null, null, null, null, null, ${t}, ${t}, null, null, null, null, 77, null);
    insert into groups values (2, 'Tuesday', 'Tue 7pm', 'Church', ${t}, ${t});
    insert into group_members values (1, 5, 2, ${t}, ${t});
    insert into group_members values (2, 5, 2, ${t}, ${t});
    insert into group_members values (3, 404, 2, ${t}, ${t});
    insert into teams values (4, 'Worship', ${t}, ${t}, 5);
    insert into teams values (6, 'Orphaned leader', ${t}, ${t}, 999);
    insert into team_members values (1, 4, 5, 1, ${t}, ${t}, 'Guitar');
    insert into attendance_reports values (11, 0, '2025-12-14', 104, ${t}, ${t});
    insert into attendance_reports values (12, 1, '2025-12-16', 25, ${t}, ${t});
    insert into attendance_reports values (13, 0, null, 50, ${t}, ${t});
    insert into users values (1, 'Pastor@Church.org', '${bcrypt.hashSync("rails password", 4)}', ${t}, ${t});
  `);
  db.close();
  return file;
}

describe("import-rails", () => {
  it("copies everything, preserving IDs, relationships and passwords", async () => {
    const counts = await importRailsSqlite(ctx.db, railsDatabase(), { replace: false });
    expect(counts).toMatchObject({ members: 3, groupMemberships: 2, teamMemberships: 1, attendanceReports: 2, skippedAttendanceWithoutDate: 1, staffAccounts: 1 });

    const login = await ctx.client().post("/auth/login", { email: "pastor@church.org", password: "rails password" });
    expect(login.status).toBe(200);
    expect(login.json.user.role).toBe("admin");
    const api = ctx.client(login.headers.get("set-cookie")!.split(";")[0]);

    const john = (await api.get("/members/5")).json.member;
    expect(john).toMatchObject({ firstName: "John", status: "active", isChild: false, address2: null, birthdate: "1990-04-02" });
    expect(john.family).toEqual({ id: 3, name: "The Souzas" });
    expect(john.groups).toEqual([{ id: 2, name: "Tuesday" }]);
    expect(john.teams).toEqual([{ id: 4, name: "Worship", role: "Guitar" }]);
    expect(john.createdAt).toBe("2025-12-06T20:57:55.123Z");
    expect(john.household).toEqual([expect.objectContaining({ id: 8, isChild: true, status: "guest" })]);

    const nobody = (await api.get("/members/9")).json.member;
    expect(nobody).toMatchObject({ lastName: "(unknown)", status: "guest", family: null });
    expect((await api.get("/teams/6")).json.team.leader).toBeNull();
    expect((await api.get("/attendance?eventType=community_group")).json.reports[0]).toMatchObject({ id: 12, attendance: 25 });

    // Sequences continue after the imported IDs.
    expect((await api.post("/members", { firstName: "New", lastName: "Person" })).json.member.id).toBe(10);
    expect((await api.post("/families", { name: "New" })).json.family.id).toBe(4);
  });

  it("refuses to import over existing data unless --replace is given", async () => {
    const file = railsDatabase();
    await importRailsSqlite(ctx.db, file, { replace: false });
    await expect(importRailsSqlite(ctx.db, file, { replace: false })).rejects.toThrow(/--replace/);
    await expect(importRailsSqlite(ctx.db, file, { replace: true })).resolves.toMatchObject({ members: 3 });
  });
});
