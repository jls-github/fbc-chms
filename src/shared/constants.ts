export const MEMBER_STATUSES = ["guest", "prospective", "active", "inactive", "archived"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  guest: "Guest",
  prospective: "Prospective",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export const ATTENDANCE_EVENT_TYPES = ["sunday_service", "community_group", "discipleship_meeting"] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export const ATTENDANCE_EVENT_LABELS: Record<AttendanceEventType, string> = {
  sunday_service: "Sunday Service",
  community_group: "Community Group",
  discipleship_meeting: "Discipleship Meeting",
};

/**
 * admin: everything, including managing staff accounts.
 * staff: day-to-day church management.
 * volunteer: kids check-in only (the roster and pickups) — no directory access.
 * member: a church member using the member app (directory, sermons, group chat).
 */
export const USER_ROLES = ["admin", "staff", "volunteer", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Gatherings whose leaders can submit attendance through a shareable, no-login link. */
export const LINK_REPORT_EVENT_TYPES = ["community_group", "discipleship_meeting"] as const satisfies readonly AttendanceEventType[];
export type LinkReportEventType = (typeof LINK_REPORT_EVENT_TYPES)[number];

export const ATTENDANCE_SOURCES = ["staff", "leader_link"] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  staff: "Staff",
  volunteer: "Check-in volunteer",
  member: "Member (app)",
};

/** Roles that use the staff web app (members use the member app). */
export const STAFF_ROLES = ["admin", "staff", "volunteer"] as const satisfies readonly UserRole[];

/**
 * active: can sign in and use everything their role allows.
 * pending: signed up in the member app; waiting for staff to match them to a person.
 * invited: created by staff; waiting for the person to claim it with their invite code.
 * disabled: can't sign in.
 */
export const USER_STATUSES = ["active", "pending", "invited", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * web: browser sign-in · api: bearer token for native apps ·
 * kiosk: a shared check-in iPad that can only reach the kiosk endpoints.
 */
export const SESSION_KINDS = ["web", "api", "kiosk"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];
