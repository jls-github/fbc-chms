import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ATTENDANCE_EVENT_TYPES, ATTENDANCE_SOURCES, MEMBER_STATUSES, USER_ROLES } from "@shared/constants";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const memberStatus = pgEnum("member_status", MEMBER_STATUSES);
export const attendanceEventType = pgEnum("attendance_event_type", ATTENDANCE_EVENT_TYPES);
export const userRole = pgEnum("user_role", USER_ROLES);

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address1: text("address_1"),
    address2: text("address_2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    birthdate: date("birthdate"),
    status: memberStatus("status").notNull().default("guest"),
    isChild: boolean("is_child").notNull().default(false),
    notes: text("notes"),
    familyId: integer("family_id").references(() => families.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("members_family_id_idx").on(t.familyId),
    index("members_status_idx").on(t.status),
    index("members_name_idx").on(t.lastName, t.firstName),
  ],
);

// ---------------------------------------------------------------------------
// Community groups & ministry teams
// ---------------------------------------------------------------------------

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  meetingTime: text("meeting_time"),
  meetingLocation: text("meeting_location"),
  description: text("description"),
  ...timestamps,
});

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("group_memberships_group_member_idx").on(t.groupId, t.memberId),
    index("group_memberships_member_idx").on(t.memberId),
  ],
);

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  leaderId: integer("leader_id").references(() => members.id, { onDelete: "set null" }),
  ...timestamps,
});

export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: text("role"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("team_memberships_team_member_idx").on(t.teamId, t.memberId),
    index("team_memberships_member_idx").on(t.memberId),
  ],
);

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const attendanceReports = pgTable(
  "attendance_reports",
  {
    id: serial("id").primaryKey(),
    eventType: attendanceEventType("event_type").notNull(),
    date: date("date").notNull(),
    attendance: integer("attendance").notNull(),
    notes: text("notes"),
    /** Entered by staff in the app, or submitted by a leader through a report link. */
    source: text("source", { enum: ATTENDANCE_SOURCES }).notNull().default("staff"),
    ...timestamps,
  },
  (t) => [index("attendance_reports_type_date_idx").on(t.eventType, t.date)],
);

/**
 * One shareable, no-login submission link per gathering type. The token is the
 * only thing standing between the internet and the form, so it's long and
 * random; admins can rotate it if a link leaks.
 */
export const reportLinks = pgTable("report_links", {
  eventType: attendanceEventType("event_type").primaryKey(),
  token: text("token").notNull().unique(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Staff accounts & authentication
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    passwordDigest: text("password_digest").notNull(),
    role: userRole("role").notNull().default("staff"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

/**
 * One row per signed-in browser or mobile device. Only a SHA-256 hash of the
 * token is stored, so a database leak does not leak usable credentials.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    kind: text("kind", { enum: ["web", "api"] }).notNull(),
    label: text("label"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_resets_token_hash_idx").on(t.tokenHash)],
);

// ---------------------------------------------------------------------------
// Relations (used by the relational query builder)
// ---------------------------------------------------------------------------

export const familiesRelations = relations(families, ({ many }) => ({ members: many(members) }));

export const membersRelations = relations(members, ({ one, many }) => ({
  family: one(families, { fields: [members.familyId], references: [families.id] }),
  groupMemberships: many(groupMemberships),
  teamMemberships: many(teamMemberships),
}));

export const groupsRelations = relations(groups, ({ many }) => ({ memberships: many(groupMemberships) }));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, { fields: [groupMemberships.groupId], references: [groups.id] }),
  member: one(members, { fields: [groupMemberships.memberId], references: [members.id] }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  leader: one(members, { fields: [teams.leaderId], references: [members.id] }),
  memberships: many(teamMemberships),
}));

export const teamMembershipsRelations = relations(teamMemberships, ({ one }) => ({
  team: one(teams, { fields: [teamMemberships.teamId], references: [teams.id] }),
  member: one(members, { fields: [teamMemberships.memberId], references: [members.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({ sessions: many(sessions) }));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
