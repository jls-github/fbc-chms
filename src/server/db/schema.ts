import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  primaryKey,
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
import { ATTENDANCE_EVENT_TYPES, ATTENDANCE_SOURCES, MEMBER_STATUSES, SESSION_KINDS, USER_ROLES, USER_STATUSES } from "@shared/constants";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

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
export const userStatus = pgEnum("user_status", USER_STATUSES);

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

/**
 * One photo per household, for the church directory. Stored in Postgres so the
 * regular database backups include them; images are resized in the browser
 * before upload, so each is typically 100–300 KB.
 */
export const familyPhotos = pgTable("family_photos", {
  familyId: integer("family_id")
    .primaryKey()
    .references(() => families.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
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
    /** Allergies, medications, special needs — shown to check-in volunteers and on kids' name tags. */
    medicalNotes: text("medical_notes"),
    /** Leave this person out of the printed church directory. */
    directoryOptOut: boolean("directory_opt_out").notNull().default(false),
    /** What this person shares in the directory (they can change these in the member app). */
    dirShowPhone: boolean("dir_show_phone").notNull().default(true),
    dirShowEmail: boolean("dir_show_email").notNull().default(true),
    dirShowAddress: boolean("dir_show_address").notNull().default(true),
    dirShowBirthday: boolean("dir_show_birthday").notNull().default(true),
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
// Kids check-in
// ---------------------------------------------------------------------------

/**
 * One row per child per service day. Every child a household checks in on a
 * given day shares one security code, which is printed on the kids' name tags
 * and on the parent's pickup tag.
 */
export const checkins = pgTable(
  "checkins",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    familyId: integer("family_id").references(() => families.id, { onDelete: "set null" }),
    /** The church's local calendar date (see CHURCH_TIMEZONE), not UTC. */
    serviceDate: date("service_date").notNull(),
    securityCode: text("security_code").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    /** Kiosk label or staff email, for the audit trail. */
    checkedInBy: text("checked_in_by"),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    checkedOutBy: text("checked_out_by"),
  },
  (t) => [
    uniqueIndex("checkins_member_day_idx").on(t.memberId, t.serviceDate),
    index("checkins_day_code_idx").on(t.serviceDate, t.securityCode),
  ],
);

// ---------------------------------------------------------------------------
// Staff accounts & authentication
// ---------------------------------------------------------------------------

/**
 * Everyone who can sign in: staff (admin/staff/volunteer) and church members
 * using the member app. Members sign in with an email or a phone number, and
 * their account is linked to exactly one person in `members`.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email"),
    /** Digits only (e.g. "3605550142"), so any formatting matches at sign-in. */
    phone: text("phone"),
    name: text("name"),
    /** Null until an invited account is claimed. */
    passwordDigest: text("password_digest"),
    role: userRole("role").notNull().default("staff"),
    status: userStatus("status").notNull().default("active"),
    memberId: integer("member_id").references(() => members.id, { onDelete: "set null" }),
    /** What a self-signup told us about themselves, for staff to match against the directory. */
    signupFirstName: text("signup_first_name"),
    signupLastName: text("signup_last_name"),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_idx").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_idx").on(t.phone),
    uniqueIndex("users_member_idx").on(t.memberId),
    uniqueIndex("users_invite_token_idx").on(t.inviteTokenHash),
  ],
);

// ---------------------------------------------------------------------------
// Group chat (member app)
// ---------------------------------------------------------------------------

export const groupMessages = pgTable(
  "group_messages",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    /** Null if the author was later removed from the directory. */
    memberId: integer("member_id").references(() => members.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("group_messages_group_id_idx").on(t.groupId, t.id)],
);

/** How far each person has read in each group's chat (for unread counts). */
export const groupReads = pgTable(
  "group_reads",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    lastReadMessageId: integer("last_read_message_id").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.memberId] })],
);

/** Small key/value store for server-generated settings (e.g. the URL-signing secret). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

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
    kind: text("kind", { enum: SESSION_KINDS }).notNull(),
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

export const familiesRelations = relations(families, ({ many, one }) => ({
  members: many(members),
  photo: one(familyPhotos, { fields: [families.id], references: [familyPhotos.familyId] }),
}));

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

export const checkinsRelations = relations(checkins, ({ one }) => ({
  member: one(members, { fields: [checkins.memberId], references: [members.id] }),
  family: one(families, { fields: [checkins.familyId], references: [families.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({ sessions: many(sessions) }));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
