/**
 * The API contract. Request schemas validate input on the server and in web
 * forms; response schemas document the payloads for OpenAPI (and therefore for
 * a future native mobile client).
 */
import { z } from "zod";
import {
  ATTENDANCE_EVENT_TYPES,
  ATTENDANCE_SOURCES,
  LINK_REPORT_EVENT_TYPES,
  MEMBER_STATUSES,
  SESSION_KINDS,
  STAFF_ROLES,
  USER_ROLES,
  USER_STATUSES,
} from "./constants";

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

/** Sign in with an email address or a phone number (`email` is accepted as an older alias). */
const loginShape = {
  identifier: z.string().trim().max(254).optional(),
  email: z.string().trim().max(254).optional(),
  password: z.string().min(1, "Password is required"),
};
const needsIdentifier = (v: { identifier?: string; email?: string }) => !!(v.identifier || v.email);
const identifierMessage = { message: "Enter your email or phone number", path: ["identifier"] };

export const LoginInput = z.object(loginShape).refine(needsIdentifier, identifierMessage);

export const TokenInput = z
  .object({ ...loginShape, deviceName: z.string().trim().max(100).optional() })
  .refine(needsIdentifier, identifierMessage);

export const ForgotPasswordInput = z.object({ email: z.string().trim().email() });

const password = z.string().min(8, "Use at least 8 characters").max(72);

export const ResetPasswordInput = z.object({ token: z.string().min(1), password });

export const ChangePasswordInput = z.object({ currentPassword: z.string().min(1), newPassword: password });

export const User = z
  .object({
    id: z.number(),
    email: z.string().nullable(),
    /** Digits only. */
    phone: z.string().nullable(),
    name: z.string().nullable(),
    role: z.enum(USER_ROLES),
    status: z.enum(USER_STATUSES),
    /** The directory person this account belongs to (member app). */
    memberId: z.number().nullable(),
    /** Left out of anonymous usage statistics. */
    usageOptOut: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: "User" });

export const AccountSettingsInput = z.object({ usageOptOut: z.boolean() });
export type User = z.infer<typeof User>;

export const MeResponse = z.object({
  user: User,
  /** "kiosk" means this device is a locked-down check-in iPad. */
  session: z.object({ kind: z.enum(SESSION_KINDS), label: z.string().nullable() }),
});

export const UserPatch = z
  .object({ name: optionalText(), role: z.enum(STAFF_ROLES) })
  .partial();

export const UserInput = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  name: optionalText(),
  role: z.enum(STAFF_ROLES).default("staff"),
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
  directoryOptOut: z.boolean(),
  familyId: optionalId,
};

export const MemberInput = z.object({
  ...memberInputShape,
  status: memberInputShape.status.default("guest"),
  isChild: memberInputShape.isChild.default(false),
  directoryOptOut: memberInputShape.directoryOptOut.default(false),
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
  directoryOptOut: z.boolean(),
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
  /** Their member-app account, if any. */
  appAccount: z
    .object({
      id: z.number(),
      role: z.enum(USER_ROLES),
      status: z.enum(USER_STATUSES),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      inviteExpiresAt: z.string().nullable(),
    })
    .nullable(),
  /**
   * An unlinked staff login using this person's email or phone. Link it rather
   * than inviting them (an invitation would clash with that login).
   */
  linkableStaffLogin: z.object({ id: z.number(), email: z.string().nullable(), role: z.enum(USER_ROLES) }).nullable(),
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
    /** Same-origin URL of the household photo (requires sign-in), or null. */
    photoUrl: z.string().nullable(),
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

// ---------------------------------------------------------------------------
// Church directory
// ---------------------------------------------------------------------------

export const DirectoryQuery = z.object({
  /** Comma-separated member statuses to include; defaults to active,prospective. */
  statuses: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : ["active", "prospective"]))
    .pipe(z.array(z.enum(MEMBER_STATUSES)).min(1, "Choose at least one status")),
});

export const DirectoryPerson = z
  .object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    /** "MM-DD" — the directory shows birthdays without the year. */
    birthday: z.string().nullable(),
  })
  .meta({ id: "DirectoryPerson" });
export type DirectoryPerson = z.infer<typeof DirectoryPerson>;

export const DirectoryEntry = z
  .object({
    /** A household, or a person who isn't in one. */
    kind: z.enum(["household", "individual"]),
    key: z.string(),
    householdId: z.number().nullable(),
    /** Surname heading, e.g. "Anderson" or "Smith / Jones". */
    title: z.string(),
    sortName: z.string(),
    adults: z.array(DirectoryPerson),
    children: z.array(DirectoryPerson),
    address: z
      .object({ line1: z.string(), line2: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(), postalCode: z.string().nullable() })
      .nullable(),
    photoUrl: z.string().nullable(),
  })
  .meta({ id: "DirectoryEntry" });
export type DirectoryEntry = z.infer<typeof DirectoryEntry>;

export const DirectoryResponse = z.object({
  statuses: z.array(z.enum(MEMBER_STATUSES)),
  entries: z.array(DirectoryEntry),
  optedOut: z.number(),
});
export type DirectoryResponse = z.infer<typeof DirectoryResponse>;

// ---------------------------------------------------------------------------
// Member app: accounts
// ---------------------------------------------------------------------------

const optionalPhone = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || v.replace(/\D/g, "").length >= 10, "Enter all 10 digits of your phone number");

export const AppSignupInput = z
  .object({
    firstName: requiredText("First name", 100),
    lastName: requiredText("Last name", 100),
    email: z
      .union([z.string().trim().email("Enter a valid email address"), z.literal("")])
      .nullish()
      .transform((v) => (v ? v.toLowerCase() : null)),
    phone: optionalPhone,
    password,
    deviceName: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.email || v.phone, { message: "Enter an email address or a phone number", path: ["email"] });

export const ClaimInviteInput = z.object({
  code: z.string().trim().min(6, "Enter the code from your invitation").max(64),
  password,
  deviceName: z.string().trim().max(100).optional(),
});

/** A person in the directory who might be the one behind a self-signup. */
export const MatchCandidate = z
  .object({
    member: PersonRef.extend({ email: z.string().nullable(), phone: z.string().nullable() }),
    score: z.number(),
    reasons: z.array(z.string()),
    /** Set when this person already has an app account. */
    existingAccount: z.object({ id: z.number(), status: z.enum(USER_STATUSES) }).nullable(),
  })
  .meta({ id: "MatchCandidate" });
export type MatchCandidate = z.infer<typeof MatchCandidate>;

export const AppAccount = z
  .object({
    id: z.number(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    role: z.enum(USER_ROLES),
    status: z.enum(USER_STATUSES),
    signupName: z.string().nullable(),
    member: PersonRef.nullable(),
    createdAt: z.string(),
    reviewedBy: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    inviteExpiresAt: z.string().nullable(),
    /** Only for pending accounts: likely matches, best first. */
    suggestions: z.array(MatchCandidate),
  })
  .meta({ id: "AppAccount" });
export type AppAccount = z.infer<typeof AppAccount>;

export const AppAccountQuery = z.object({ status: z.enum([...USER_STATUSES, "all"]).default("pending") });

export const ApproveAccountInput = z.union([
  z.object({ memberId: z.number().int().positive() }),
  z.object({ createMember: z.literal(true) }),
]);

export const LinkAccountInput = z.object({ memberId: z.number().int().positive().nullable() });

export const InviteResponse = z
  .object({ code: z.string(), link: z.string(), expiresAt: z.string(), emailed: z.boolean() })
  .meta({ id: "InviteResponse" });
export type InviteResponse = z.infer<typeof InviteResponse>;

// ---------------------------------------------------------------------------
// Member app: content
// ---------------------------------------------------------------------------

export const DirectoryPrivacy = z.object({
  directoryOptOut: z.boolean(),
  dirShowPhone: z.boolean(),
  dirShowEmail: z.boolean(),
  dirShowAddress: z.boolean(),
  dirShowBirthday: z.boolean(),
});

export const MyProfile = z
  .object({
    member: z
      .object({
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
        householdName: z.string().nullable(),
      })
      .extend(DirectoryPrivacy.shape)
      .nullable(),
  })
  .meta({ id: "MyProfile" });
export type MyProfile = z.infer<typeof MyProfile>;

export const MyProfilePatch = z
  .object({
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
  })
  .extend(DirectoryPrivacy.shape)
  .partial();

export const Sermon = z
  .object({
    id: z.string(),
    title: z.string(),
    date: z.string().nullable(),
    speaker: z.string().nullable(),
    series: z.string().nullable(),
    imageUrl: z.string().nullable(),
    /** The sermon's page on fbcenumclaw.com. */
    url: z.string(),
    /** Subsplash player that can be embedded or opened directly. */
    playerUrl: z.string(),
  })
  .meta({ id: "Sermon" });
export type Sermon = z.infer<typeof Sermon>;

/** A group's or team's chat, as listed in the member app. */
export const ChatRoom = z
  .object({
    id: z.number(),
    kind: z.enum(["group", "team"]),
    name: z.string(),
    /** Meeting time for a group; the person's role for a team. */
    detail: z.string().nullable(),
    memberCount: z.number(),
    unread: z.number(),
    lastMessage: z.object({ body: z.string(), authorName: z.string(), createdAt: z.string() }).nullable(),
  })
  .meta({ id: "ChatRoom" });
export type ChatRoom = z.infer<typeof ChatRoom>;

export const ChatList = z.object({ groups: z.array(ChatRoom), teams: z.array(ChatRoom) }).meta({ id: "ChatList" });
export type ChatList = z.infer<typeof ChatList>;

export const ChatMessage = z
  .object({
    id: z.number(),
    body: z.string(),
    createdAt: z.string(),
    author: z.object({ memberId: z.number().nullable(), name: z.string() }),
    mine: z.boolean(),
    deleted: z.boolean(),
  })
  .meta({ id: "ChatMessage" });
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatMessagesQuery = z.object({
  /** Only messages newer than this id (for polling). */
  after: z.coerce.number().int().nonnegative().optional(),
  /** Only messages older than this id (for loading history). */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const PostMessageInput = z.object({ body: z.string().trim().min(1, "Type a message").max(2000, "That message is too long") });

// ---------------------------------------------------------------------------
// Usage statistics (anonymous aggregates only)
// ---------------------------------------------------------------------------

export const AppEventInput = z.object({
  event: z.enum(["sermon_open"]),
  sermonId: z.string().regex(/^[a-z0-9]{3,20}$/i).optional(),
});

/** A count that's hidden (null) when it would describe fewer than 3 people. */
const maskedCount = z.number().nullable();

export const UsageReport = z
  .object({
    generatedAt: z.string(),
    active: z.object({
      app: z.object({ today: z.number(), week: z.number(), month: z.number() }),
      staff: z.object({ today: z.number(), week: z.number(), month: z.number() }),
    }),
    /** Weekly active member-app users, oldest first (the current week is still in progress). */
    weeklyApp: z.array(z.object({ weekStart: z.string(), count: z.number() })),
    platformsThisMonth: z.object({ ios: maskedCount, android: maskedCount, web: maskedCount }),
    last30Days: z.object({
      directoryViews: z.number(),
      sermonOpens: z.number(),
      chatsOpened: z.number(),
      messagesSent: z.number(),
      kidsCheckedIn: z.number(),
      leaderReports: z.number(),
      signUps: z.number(),
    }),
    topSermons: z.array(z.object({ id: z.string(), title: z.string().nullable(), opens: z.number() })),
    accounts: z.object({ active: z.number(), pending: z.number(), invited: z.number(), optedOut: z.number() }),
  })
  .meta({ id: "UsageReport" });
export type UsageReport = z.infer<typeof UsageReport>;
