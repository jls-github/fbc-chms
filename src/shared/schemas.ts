/**
 * The API contract. Request schemas validate input on the server and in web
 * forms; response schemas document the payloads for OpenAPI (and therefore for
 * a future native mobile client).
 */
import { z } from "zod";
import { ATTENDANCE_EVENT_TYPES, ATTENDANCE_SOURCES, LINK_REPORT_EVENT_TYPES, MEMBER_STATUSES, SESSION_KINDS, USER_ROLES } from "./constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Optional free-text field: trims, and turns "" into null so blanks clear values. */
const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const requiredText = (label: string, max = 255) =>
  z.string().trim().min(1, `${label} is required`).max(max);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");

const optionalDate = z
  .union([isoDate, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

const optionalId = z.coerce
  .number()
  .int()
  .positive()
  .nullish()
  .or(z.literal("").transform(() => null))
  .transform((v) => v ?? null);

export const IdParam = z.object({ id: z.coerce.number().int().positive() });

export const ErrorResponse = z
  .object({
    error: z.object({
      message: z.string(),
      fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    }),
  })
  .meta({ id: "Error" });

const timestamps = { createdAt: z.string(), updatedAt: z.string() };

// ---------------------------------------------------------------------------
// Auth & users
// ---------------------------------------------------------------------------

export const LoginInput = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const TokenInput = LoginInput.extend({
  deviceName: z.string().trim().max(100).optional(),
});

export const ForgotPasswordInput = z.object({ email: z.string().trim().email() });

const password = z.string().min(8, "Use at least 8 characters").max(72);

export const ResetPasswordInput = z.object({ token: z.string().min(1), password });

export const ChangePasswordInput = z.object({ currentPassword: z.string().min(1), newPassword: password });

export const User = z
  .object({
    id: z.number(),
    email: z.string(),
    name: z.string().nullable(),
    role: z.enum(USER_ROLES),
    createdAt: z.string(),
  })
  .meta({ id: "User" });

export const MeResponse = z.object({
  user: User,
  /** "kiosk" means this device is a locked-down check-in iPad. */
  session: z.object({ kind: z.enum(SESSION_KINDS), label: z.string().nullable() }),
});

export const UserPatch = z
  .object({ name: optionalText(), role: z.enum(USER_ROLES) })
  .partial();

export const UserInput = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  name: optionalText(),
  role: z.enum(USER_ROLES).default("staff"),
  password,
});

export const TokenResponse = z
  .object({ token: z.string(), expiresAt: z.string(), user: User })
  .meta({ id: "TokenResponse" });

// ---------------------------------------------------------------------------
// Members & families
// ---------------------------------------------------------------------------

const memberInputShape = {
  firstName: requiredText("First name"),
  lastName: requiredText("Last name"),
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  phone: optionalText(40),
  address1: optionalText(),
  address2: optionalText(),
  city: optionalText(),
  state: optionalText(),
  postalCode: optionalText(20),
  birthdate: optionalDate,
  status: z.enum(MEMBER_STATUSES),
  isChild: z.boolean(),
  notes: optionalText(5000),
  medicalNotes: optionalText(2000),
  familyId: optionalId,
};

export const MemberInput = z.object({
  ...memberInputShape,
  status: memberInputShape.status.default("guest"),
  isChild: memberInputShape.isChild.default(false),
});
export type MemberInput = z.input<typeof MemberInput>;

/** PATCH body: no defaults, so omitted fields are left untouched. */
export const MemberPatch = z.object(memberInputShape).partial();

const MemberFields = {
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address1: z.string().nullable(),
  address2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  birthdate: z.string().nullable(),
  status: z.enum(MEMBER_STATUSES),
  isChild: z.boolean(),
  notes: z.string().nullable(),
  medicalNotes: z.string().nullable(),
  familyId: z.number().nullable(),
  ...timestamps,
};

const NamedRef = z.object({ id: z.number(), name: z.string() });

export const MemberSummary = z
  .object({
    ...MemberFields,
    family: NamedRef.nullable(),
    groups: z.array(NamedRef),
    teams: z.array(NamedRef.extend({ role: z.string().nullable() })),
  })
  .meta({ id: "MemberSummary" });
export type MemberSummary = z.infer<typeof MemberSummary>;

export const PersonRef = z
  .object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    status: z.enum(MEMBER_STATUSES),
    isChild: z.boolean(),
    birthdate: z.string().nullable(),
  })
  .meta({ id: "PersonRef" });
export type PersonRef = z.infer<typeof PersonRef>;

export const MemberDetail = MemberSummary.extend({
  household: z.array(PersonRef),
}).meta({ id: "MemberDetail" });
export type MemberDetail = z.infer<typeof MemberDetail>;

export const MemberListQuery = z.object({
  q: z.string().trim().optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
});

export const FamilyInput = z.object({
  name: requiredText("Household name"),
  /** When present, the household's members become exactly this list. */
  memberIds: z.array(z.number().int().positive()).max(50).optional(),
});

export const Family = z
  .object({
    id: z.number(),
    name: z.string(),
    members: z.array(PersonRef.extend({ email: z.string().nullable(), phone: z.string().nullable() })),
    ...timestamps,
  })
  .meta({ id: "Family" });
export type Family = z.infer<typeof Family>;

// ---------------------------------------------------------------------------
// Groups & teams
// ---------------------------------------------------------------------------

export const GroupInput = z.object({
  name: requiredText("Name"),
  meetingTime: optionalText(),
  meetingLocation: optionalText(),
  description: optionalText(5000),
});

export const Group = z
  .object({
    id: z.number(),
    name: z.string(),
    meetingTime: z.string().nullable(),
    meetingLocation: z.string().nullable(),
    description: z.string().nullable(),
    members: z.array(PersonRef),
    ...timestamps,
  })
  .meta({ id: "Group" });
export type Group = z.infer<typeof Group>;

export const AddGroupMemberInput = z.object({ memberId: z.number().int().positive() });

export const TeamInput = z.object({
  name: requiredText("Name"),
  description: optionalText(5000),
  leaderId: optionalId,
});

export const Team = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    leader: PersonRef.nullable(),
    members: z.array(PersonRef.extend({ role: z.string().nullable() })),
    ...timestamps,
  })
  .meta({ id: "Team" });
export type Team = z.infer<typeof Team>;

export const AddTeamMemberInput = z.object({
  memberId: z.number().int().positive(),
  role: optionalText(100),
});

export const UpdateTeamMemberInput = z.object({ role: optionalText(100) });

export const MemberIdParam = z.object({
  id: z.coerce.number().int().positive(),
  memberId: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const AttendanceInput = z.object({
  eventType: z.enum(ATTENDANCE_EVENT_TYPES),
  date: isoDate,
  attendance: z.coerce.number().int().min(0, "Attendance can't be negative").max(100000),
  notes: optionalText(2000),
});
export type AttendanceInput = z.input<typeof AttendanceInput>;

export const AttendanceReport = z
  .object({
    id: z.number(),
    eventType: z.enum(ATTENDANCE_EVENT_TYPES),
    date: z.string(),
    attendance: z.number(),
    notes: z.string().nullable(),
    source: z.enum(ATTENDANCE_SOURCES),
    ...timestamps,
  })
  .meta({ id: "AttendanceReport" });
export type AttendanceReport = z.infer<typeof AttendanceReport>;

/** What a leader fills in on a public report link. */
export const LeaderReportInput = z.object({
  date: isoDate,
  attendance: z.coerce.number().int().min(0, "Can't be negative").max(1000, "That's more than we expect — double-check the number"),
  notes: optionalText(2000),
  /** Honeypot: hidden from people, so anything here means a bot. */
  website: z.string().optional(),
});
export type LeaderReportInput = z.input<typeof LeaderReportInput>;

export const LeaderReportForm = z
  .object({ eventType: z.enum(LINK_REPORT_EVENT_TYPES), label: z.string() })
  .meta({ id: "LeaderReportForm" });

export const ReportLink = z
  .object({ eventType: z.enum(LINK_REPORT_EVENT_TYPES), token: z.string(), path: z.string() })
  .meta({ id: "ReportLink" });
export type ReportLink = z.infer<typeof ReportLink>;

export const AttendanceListQuery = z.object({
  eventType: z.enum(ATTENDANCE_EVENT_TYPES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// ---------------------------------------------------------------------------
// Dashboard & search
// ---------------------------------------------------------------------------

export const Dashboard = z
  .object({
    counts: z.object({
      total: z.number(),
      active: z.number(),
      prospective: z.number(),
      guest: z.number(),
      inactive: z.number(),
      households: z.number(),
      inGroups: z.number(),
      onTeams: z.number(),
    }),
    averageSundayAttendance: z.number().nullable(),
    /** Last six months of Sunday services, each with its trailing 4-week (28-day) average. */
    sundayTrend: z.array(
      z.object({
        date: z.string(),
        attendance: z.number(),
        rollingAverage: z.number(),
        /** Reports in the 28-day window (fewer than 4 means missed or unrecorded weeks). */
        windowCount: z.number(),
      }),
    ),
    adultsWithoutGroup: z.array(PersonRef),
    adultsWithoutTeam: z.array(PersonRef),
    recentGuests: z.array(PersonRef.extend({ createdAt: z.string() })),
    upcomingBirthdays: z.array(PersonRef.extend({ nextBirthday: z.string() })),
  })
  .meta({ id: "Dashboard" });
export type Dashboard = z.infer<typeof Dashboard>;

export const SearchResult = z
  .object({
    members: z.array(PersonRef),
    families: z.array(NamedRef),
    groups: z.array(NamedRef),
    teams: z.array(NamedRef),
  })
  .meta({ id: "SearchResult" });
export type SearchResult = z.infer<typeof SearchResult>;

// ---------------------------------------------------------------------------
// Kids check-in
// ---------------------------------------------------------------------------

const phoneDigits = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 10, `${label} needs all 10 digits`);

export const KioskLookupQuery = z.object({ q: z.string().trim().min(2, "Type at least 2 letters or 4 digits") });

export const KioskChild = z
  .object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    birthdate: z.string().nullable(),
    medicalNotes: z.string().nullable(),
    checkedIn: z.boolean(),
    securityCode: z.string().nullable(),
  })
  .meta({ id: "KioskChild" });
export type KioskChild = z.infer<typeof KioskChild>;

export const KioskHousehold = z
  .object({
    id: z.number(),
    name: z.string(),
    adults: z.array(z.object({ id: z.number(), firstName: z.string(), lastName: z.string() })),
    children: z.array(KioskChild),
  })
  .meta({ id: "KioskHousehold" });
export type KioskHousehold = z.infer<typeof KioskHousehold>;

export const KioskChildInput = z.object({
  firstName: requiredText("First name", 100),
  lastName: optionalText(100),
  birthdate: isoDate,
  medicalNotes: optionalText(2000),
});
export type KioskChildInput = z.input<typeof KioskChildInput>;

export const KioskRegisterInput = z.object({
  parent: z.object({
    firstName: requiredText("First name", 100),
    lastName: requiredText("Last name", 100),
    phone: phoneDigits("Phone number"),
    email: z
      .union([z.string().trim().email("Enter a valid email address"), z.literal("")])
      .nullish()
      .transform((v) => (v ? v : null)),
  }),
  children: z.array(KioskChildInput).min(1, "Add at least one child").max(10),
});
export type KioskRegisterInput = z.input<typeof KioskRegisterInput>;

export const KioskCheckinInput = z.object({
  householdId: z.number().int().positive(),
  childIds: z.array(z.number().int().positive()).min(1, "Choose at least one child").max(20),
});

export const KioskCheckinResult = z
  .object({ securityCode: z.string(), serviceDate: z.string(), householdName: z.string(), children: z.array(KioskChild) })
  .meta({ id: "KioskCheckinResult" });
export type KioskCheckinResult = z.infer<typeof KioskCheckinResult>;

export const RosterEntry = z
  .object({
    id: z.number(),
    child: z.object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      birthdate: z.string().nullable(),
      medicalNotes: z.string().nullable(),
    }),
    household: z.object({ id: z.number(), name: z.string() }).nullable(),
    /** Adults in the household, so volunteers can reach a parent. */
    contacts: z.array(z.object({ name: z.string(), phone: z.string().nullable() })),
    securityCode: z.string(),
    checkedInAt: z.string(),
    checkedInBy: z.string().nullable(),
    checkedOutAt: z.string().nullable(),
    checkedOutBy: z.string().nullable(),
  })
  .meta({ id: "RosterEntry" });
export type RosterEntry = z.infer<typeof RosterEntry>;

export const RosterQuery = z.object({ date: isoDate.optional() });

export const CheckoutInput = z.object({ checkinIds: z.array(z.number().int().positive()).min(1).max(50) });

export const KioskDevice = z
  .object({ id: z.number(), label: z.string().nullable(), createdAt: z.string(), lastUsedAt: z.string(), setUpBy: z.string() })
  .meta({ id: "KioskDevice" });
export type KioskDevice = z.infer<typeof KioskDevice>;

export const CreateKioskInput = z.object({ label: requiredText("Name", 60) });
