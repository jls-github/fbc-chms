/**
 * The member app's API: public sign-up / invite claiming, and — for signed-in
 * members linked to a person — their profile, the directory, sermons and
 * group chat. The app authenticates with bearer tokens on every platform.
 */
import { createRoute } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { normalizePhone } from "@shared/phone";
import {
  AppSignupInput,
  ChatGroup,
  ChatMessage,
  ChatMessagesQuery,
  ClaimInviteInput,
  DirectoryEntry,
  ErrorResponse,
  IdParam,
  MyProfile,
  MyProfilePatch,
  PostMessageInput,
  Sermon,
  TokenResponse,
  User,
} from "@shared/schemas";
import { hashPassword, hashToken } from "../auth/crypto";
import { createSession } from "../auth/sessions";
import type { Db } from "../db/client";
import { families, familyPhotos, groupMemberships, groupMessages, groupReads, groups, members, users } from "../db/schema";
import { clientIp } from "../lib/client-ip";
import { buildDirectory } from "../lib/directory";
import { ApiError, notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { rateLimiter } from "../lib/rate-limit";
import { createRouter, type AppEnv } from "../lib/router";
import { recentSermons } from "../lib/sermons";
import { sign, verify } from "../lib/signing";
import { normalizeInviteCode } from "./app-accounts";
import { serializeUser } from "./auth";

const HOUR = 60 * 60 * 1000;
export const memberAppLimits = {
  signup: rateLimiter({ limit: 5, windowMs: HOUR }),
  claim: rateLimiter({ limit: 10, windowMs: HOUR }),
  post: rateLimiter({ limit: 20, windowMs: 60 * 1000 }),
  reset() {
    this.signup.reset();
    this.claim.reset();
    this.post.reset();
  },
};

const tooMany = { 429: jsonContent(ErrorResponse, "Too many attempts") } as const;
const conflict = { 409: jsonContent(ErrorResponse, "Already exists") } as const;
const DIRECTORY_STATUSES = ["active", "prospective"] as const;

const publicTags = ["Member app: accounts"];
const appTags = ["Member app"];

// --------------------------------------------------------------- public

/** Household photos for the app use short-lived signed URLs (an <img> can't send a bearer token). */
async function signedPhotoUrl(db: Db, familyId: number, updatedAt: Date) {
  // Expiry rounded to the hour so the URL (and the image cache) is stable for a while.
  const exp = Math.ceil((Date.now() + 24 * HOUR) / HOUR) * (HOUR / 1000);
  const sig = await sign(db, `photo:${familyId}:${updatedAt.getTime()}`, exp);
  return `/api/v1/public/app/photos/${familyId}?v=${updatedAt.getTime()}&exp=${exp}&sig=${sig}`;
}

export const publicMemberAppRoutes = createRouter()
  .openapi(
    createRoute({
      method: "post",
      path: "/public/app/signup",
      tags: publicTags,
      summary: "Create a member-app account",
      description:
        "Creates a pending account and signs the person in. Church staff then match it to the right person in the directory; until then the app only shows the account's status.",
      request: jsonBody(AppSignupInput),
      responses: { 201: jsonContent(TokenResponse, "Created"), ...conflict, ...tooMany, ...validationError },
    }),
    async (c) => {
      const input = c.req.valid("json");
      if (memberAppLimits.signup.hit(clientIp(c))) throw new ApiError(429, "Too many sign-ups from here. Please try again later.");
      const { db } = c.var.deps;
      const phone = normalizePhone(input.phone);
      const [existing] = await db
        .select()
        .from(users)
        .where(or(input.email ? eq(sql`lower(${users.email})`, input.email) : sql`false`, phone ? eq(users.phone, phone) : sql`false`))
        .limit(1);
      if (existing?.status === "invited") {
        throw new ApiError(409, "You've already been invited! Use the code from your invitation to finish setting up, or ask the church office to send a new one.");
      }
      if (existing) throw new ApiError(409, "There's already an account with that email or phone number. Try signing in instead.");

      const [user] = await db
        .insert(users)
        .values({
          email: input.email,
          phone,
          name: `${input.firstName} ${input.lastName}`,
          passwordDigest: await hashPassword(input.password),
          role: "member",
          status: "pending",
          signupFirstName: input.firstName,
          signupLastName: input.lastName,
        })
        .returning();
      const { token, expiresAt } = await createSession(db, user!.id, "api", {
        label: input.deviceName ?? null,
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent"),
      });
      return c.json({ token, expiresAt: expiresAt.toISOString(), user: serializeUser(user!) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/public/app/claim-invite",
      tags: publicTags,
      summary: "Finish setting up an invited account",
      description: "Sets a password using the invitation code and signs the person in.",
      request: jsonBody(ClaimInviteInput),
      responses: { 200: jsonContent(TokenResponse), 400: jsonContent(ErrorResponse, "Bad code"), ...tooMany, ...validationError },
    }),
    async (c) => {
      const { code, password, deviceName } = c.req.valid("json");
      if (memberAppLimits.claim.hit(clientIp(c))) throw new ApiError(429, "Too many attempts. Please wait a while and try again.");
      const { db } = c.var.deps;
      const [invited] = await db
        .select()
        .from(users)
        .where(and(eq(users.inviteTokenHash, hashToken(normalizeInviteCode(code))), eq(users.status, "invited")));
      if (!invited || !invited.inviteExpiresAt || invited.inviteExpiresAt < new Date()) {
        throw new ApiError(400, "That invitation code isn't valid or has expired. Ask the church office for a new one.");
      }
      const [user] = await db
        .update(users)
        .set({ passwordDigest: await hashPassword(password), status: "active", inviteTokenHash: null, inviteExpiresAt: null })
        .where(eq(users.id, invited.id))
        .returning();
      const { token, expiresAt } = await createSession(db, user!.id, "api", {
        label: deviceName ?? null,
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent"),
      });
      return c.json({ token, expiresAt: expiresAt.toISOString(), user: serializeUser(user!) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/public/app/photos/{id}",
      tags: publicTags,
      summary: "A household photo, via a signed URL from the app directory",
      request: {
        params: IdParam,
        query: z.object({ v: z.coerce.number(), exp: z.coerce.number(), sig: z.string().max(100) }),
      },
      responses: {
        200: { description: "The image", content: { "image/jpeg": { schema: z.string().meta({ format: "binary" }) } } },
        403: jsonContent(ErrorResponse, "Bad or expired signature"),
        ...notFoundError,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { v, exp, sig } = c.req.valid("query");
      const { db } = c.var.deps;
      if (!(await verify(db, `photo:${id}:${v}`, exp, sig))) throw new ApiError(403, "This photo link has expired.");
      const [photo] = await db.select().from(familyPhotos).where(eq(familyPhotos.familyId, id));
      if (!photo || photo.updatedAt.getTime() !== v) throw notFound("Photo");
      c.header("Cache-Control", "private, max-age=86400");
      return c.body(new Uint8Array(photo.data), 200, { "Content-Type": photo.contentType });
    },
  );

// ---------------------------------------------------------- signed in

/** The person this account belongs to; the rest of the app requires one. */
async function requireMember(c: Context<AppEnv>) {
  const { user } = c.var;
  if (user.status === "pending") throw new ApiError(403, "Your account is waiting for the church office to confirm who you are.");
  if (!user.memberId) throw new ApiError(403, "Your account isn't linked to anyone in the church directory yet. Please contact the church office.");
  const [member] = await c.var.deps.db.select().from(members).where(eq(members.id, user.memberId));
  if (!member || member.status === "archived") throw new ApiError(403, "Your directory listing isn't active. Please contact the church office.");
  return member;
}

async function myProfile(db: Db, memberId: number | null): Promise<MyProfile> {
  if (!memberId) return { member: null };
  const [row] = await db
    .select({ m: members, householdName: families.name })
    .from(members)
    .leftJoin(families, eq(families.id, members.familyId))
    .where(eq(members.id, memberId));
  if (!row) return { member: null };
  const { m } = row;
  return {
    member: {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: m.phone,
      address1: m.address1,
      address2: m.address2,
      city: m.city,
      state: m.state,
      postalCode: m.postalCode,
      birthdate: m.birthdate,
      householdName: row.householdName,
      directoryOptOut: m.directoryOptOut,
      dirShowPhone: m.dirShowPhone,
      dirShowEmail: m.dirShowEmail,
      dirShowAddress: m.dirShowAddress,
      dirShowBirthday: m.dirShowBirthday,
    },
  };
}

/** Groups this person belongs to; chat is limited to them. */
async function requireGroupMember(c: Context<AppEnv>, groupId: number) {
  const member = await requireMember(c);
  const [membership] = await c.var.deps.db
    .select()
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.memberId, member.id)));
  if (!membership) throw notFound("Group");
  return member;
}

type MessageRow = { message: typeof groupMessages.$inferSelect; author: typeof members.$inferSelect | null };

const serializeMessage = ({ message, author }: MessageRow, me: number): ChatMessage => ({
  id: message.id,
  body: message.deletedAt ? "" : message.body,
  createdAt: message.createdAt.toISOString(),
  author: { memberId: author?.id ?? null, name: author ? `${author.firstName} ${author.lastName}` : "Former member" },
  mine: author?.id === me,
  deleted: !!message.deletedAt,
});

const MeResponse = z.object({ user: User, profile: MyProfile });

export const memberAppRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/app/me",
      tags: appTags,
      summary: "The signed-in account and their directory profile",
      description: "Works while an account is pending; check `user.status`.",
      security,
      responses: { 200: jsonContent(MeResponse), ...authErrors },
    }),
    async (c) => c.json({ user: serializeUser(c.var.user), profile: await myProfile(c.var.deps.db, c.var.user.memberId) }, 200),
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/app/me",
      tags: appTags,
      summary: "Delete my member-app account",
      description:
        "Deletes the sign-in (and signs out everywhere). The person's entry in the church directory is church data and stays; staff can remove it on request. Staff accounts can't be deleted this way.",
      security,
      responses: { ...noContent, ...authErrors, ...validationError },
    }),
    async (c) => {
      if (c.var.user.role !== "member") throw new ApiError(422, "Staff accounts can't be deleted from the app. Please ask an admin.");
      await c.var.deps.db.delete(users).where(eq(users.id, c.var.user.id));
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/app/me/profile",
      tags: appTags,
      summary: "Update my contact details and what I share in the directory",
      security,
      request: jsonBody(MyProfilePatch),
      responses: { 200: jsonContent(MyProfile), ...authErrors, ...validationError },
    }),
    async (c) => {
      const member = await requireMember(c);
      const input = c.req.valid("json");
      const { db } = c.var.deps;
      if (Object.keys(input).length) await db.update(members).set(input).where(eq(members.id, member.id));
      return c.json(await myProfile(db, member.id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/app/directory",
      tags: appTags,
      summary: "The church directory",
      description: "Active and prospective members, respecting everyone's sharing choices. Photos use signed URLs.",
      security,
      responses: { 200: jsonContent(z.object({ entries: z.array(DirectoryEntry) })), ...authErrors },
    }),
    async (c) => {
      await requireMember(c);
      const { db } = c.var.deps;
      const { entries } = await buildDirectory(db, [...DIRECTORY_STATUSES], (familyId, updatedAt) => signedPhotoUrl(db, familyId, updatedAt));
      return c.json({ entries }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/app/sermons",
      tags: appTags,
      summary: "Recent sermons from fbcenumclaw.com",
      security,
      responses: {
        200: jsonContent(z.object({ sermons: z.array(Sermon), stale: z.boolean() })),
        502: jsonContent(ErrorResponse, "The church website couldn't be reached"),
        ...authErrors,
      },
    }),
    async (c) => {
      await requireMember(c);
      try {
        return c.json(await recentSermons(c.var.deps.scrapeSermons), 200);
      } catch {
        throw new ApiError(502, "Sermons aren't available right now. Please try again later.");
      }
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/app/groups",
      tags: appTags,
      summary: "My groups, with the latest message and unread count",
      security,
      responses: { 200: jsonContent(z.object({ groups: z.array(ChatGroup) })), ...authErrors },
    }),
    async (c) => {
      const me = await requireMember(c);
      const { db } = c.var.deps;
      const mine = await db
        .select({ group: groups })
        .from(groupMemberships)
        .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
        .where(eq(groupMemberships.memberId, me.id))
        .orderBy(asc(groups.name));
      const ids = mine.map((g) => g.group.id);
      if (ids.length === 0) return c.json({ groups: [] }, 200);

      const [sizes, latest] = await Promise.all([
        db.select({ groupId: groupMemberships.groupId, n: count() }).from(groupMemberships).where(inArray(groupMemberships.groupId, ids)).groupBy(groupMemberships.groupId),
        db
          .selectDistinctOn([groupMessages.groupId], { message: groupMessages, author: members })
          .from(groupMessages)
          .leftJoin(members, eq(members.id, groupMessages.memberId))
          .where(and(inArray(groupMessages.groupId, ids), isNull(groupMessages.deletedAt)))
          .orderBy(groupMessages.groupId, desc(groupMessages.id)),
      ]);
      // Unread = messages from other people after my read marker.
      const unread = await db
        .select({ groupId: groupMessages.groupId, n: count() })
        .from(groupMessages)
        .leftJoin(groupReads, and(eq(groupReads.groupId, groupMessages.groupId), eq(groupReads.memberId, me.id)))
        .where(
          and(
            inArray(groupMessages.groupId, ids),
            gt(groupMessages.id, sql`coalesce(${groupReads.lastReadMessageId}, 0)`),
            isNull(groupMessages.deletedAt),
            sql`${groupMessages.memberId} is distinct from ${me.id}`,
          ),
        )
        .groupBy(groupMessages.groupId);
      const unreadBy = new Map(unread.map((u) => [u.groupId, u.n]));
      return c.json(
        {
          groups: mine.map(({ group }) => {
            const last = latest.find((l) => l.message.groupId === group.id);
            return {
              id: group.id,
              name: group.name,
              meetingTime: group.meetingTime,
              memberCount: sizes.find((s) => s.groupId === group.id)?.n ?? 0,
              unread: unreadBy.get(group.id) ?? 0,
              lastMessage: last
                ? {
                    body: last.message.body,
                    authorName: last.author ? last.author.firstName : "Former member",
                    createdAt: last.message.createdAt.toISOString(),
                  }
                : null,
            };
          }),
        },
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/app/groups/{id}/messages",
      tags: appTags,
      summary: "A group's chat messages (oldest first)",
      description: "Pass `after` with the newest id you have to poll for new messages, or `before` to load older history.",
      security,
      request: { params: IdParam, query: ChatMessagesQuery },
      responses: { 200: jsonContent(z.object({ messages: z.array(ChatMessage), hasMore: z.boolean() })), ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { after, before, limit } = c.req.valid("query");
      const me = await requireGroupMember(c, id);
      const { db } = c.var.deps;
      const base = db
        .select({ message: groupMessages, author: members })
        .from(groupMessages)
        .leftJoin(members, eq(members.id, groupMessages.memberId));
      let rows: MessageRow[];
      let hasMore = false;
      if (after !== undefined) {
        rows = await base.where(and(eq(groupMessages.groupId, id), gt(groupMessages.id, after))).orderBy(asc(groupMessages.id)).limit(limit);
      } else {
        const newestFirst = await base
          .where(and(eq(groupMessages.groupId, id), before ? lt(groupMessages.id, before) : sql`true`))
          .orderBy(desc(groupMessages.id))
          .limit(limit + 1);
        hasMore = newestFirst.length > limit;
        rows = newestFirst.slice(0, limit).reverse();
      }
      return c.json({ messages: rows.map((r) => serializeMessage(r, me.id)), hasMore }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/app/groups/{id}/messages",
      tags: appTags,
      summary: "Send a message to a group",
      security,
      request: { params: IdParam, ...jsonBody(PostMessageInput) },
      responses: { 201: jsonContent(z.object({ message: ChatMessage }), "Sent"), ...authErrors, ...notFoundError, ...tooMany, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { body } = c.req.valid("json");
      const me = await requireGroupMember(c, id);
      if (memberAppLimits.post.hit(String(me.id))) throw new ApiError(429, "You're sending messages very quickly. Please slow down a little.");
      const { db } = c.var.deps;
      const [message] = await db.insert(groupMessages).values({ groupId: id, memberId: me.id, body }).returning();
      // Your own message counts as read.
      await db
        .insert(groupReads)
        .values({ groupId: id, memberId: me.id, lastReadMessageId: message!.id })
        .onConflictDoUpdate({ target: [groupReads.groupId, groupReads.memberId], set: { lastReadMessageId: message!.id } });
      return c.json({ message: serializeMessage({ message: message!, author: me }, me.id) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/app/groups/{id}/messages/{messageId}",
      tags: appTags,
      summary: "Delete one of my messages",
      security,
      request: { params: z.object({ id: z.coerce.number().int().positive(), messageId: z.coerce.number().int().positive() }) },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const { id, messageId } = c.req.valid("param");
      const me = await requireGroupMember(c, id);
      const deleted = await c.var.deps.db
        .update(groupMessages)
        .set({ deletedAt: new Date() })
        .where(and(eq(groupMessages.id, messageId), eq(groupMessages.groupId, id), eq(groupMessages.memberId, me.id), isNull(groupMessages.deletedAt)))
        .returning({ id: groupMessages.id });
      if (!deleted.length) throw notFound("Message");
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/app/groups/{id}/read",
      tags: appTags,
      summary: "Mark a group's chat as read up to a message",
      security,
      request: { params: IdParam, ...jsonBody(z.object({ lastMessageId: z.number().int().nonnegative() })) },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { lastMessageId } = c.req.valid("json");
      const me = await requireGroupMember(c, id);
      await c.var.deps.db
        .insert(groupReads)
        .values({ groupId: id, memberId: me.id, lastReadMessageId: lastMessageId })
        .onConflictDoUpdate({
          target: [groupReads.groupId, groupReads.memberId],
          // Never move the read marker backwards.
          set: { lastReadMessageId: sql`greatest(${groupReads.lastReadMessageId}, ${lastMessageId})` },
        });
      return c.body(null, 204);
    },
  );
