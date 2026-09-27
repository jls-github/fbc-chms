/**
 * Staff tools for member-app accounts: reviewing self-signups and matching
 * them to people in the directory, inviting people, and turning accounts off.
 *
 * Reconciliation rules:
 * - A self-signup is never linked automatically (we can't verify they own the
 *   email/phone), so it waits as "pending" until staff approve it as an
 *   existing person or as a new person.
 * - Each person has at most one account. If staff approve a signup for someone
 *   who has an unclaimed invitation, the unused invitation is replaced.
 */
import { createRoute } from "@hono/zod-openapi";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { formatPhone, normalizePhone } from "@shared/phone";
import {
  AppAccount,
  AppAccountQuery,
  ApproveAccountInput,
  IdParam,
  InviteResponse,
  LinkAccountInput,
  type MatchCandidate,
} from "@shared/schemas";
import { randomInt } from "node:crypto";
import { hashToken } from "../auth/crypto";
import type { Db } from "../db/client";
import { members, sessions, users } from "../db/schema";
import { env } from "../env";
import { ApiError, notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter, whoIs } from "../lib/router";
import { personRef } from "../lib/serializers";

type UserRow = typeof users.$inferSelect;
type MemberRow = typeof members.$inferSelect;

const conflict = { 409: jsonContent(z.object({ error: z.object({ message: z.string() }) }), "Conflict") } as const;
const INVITE_DAYS = 14;
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

/** Invitation codes are 8 unambiguous characters, shown as "ABCD-EFGH". */
export const newInviteCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
export const normalizeInviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const displayCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

const lower = (s: string | null | undefined) => s?.trim().toLowerCase() ?? "";

/** True when a and b differ by at most one inserted, deleted or changed letter ("Andersen"/"Anderson"). */
export function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** People who might be behind a self-signup, best match first. */
export function suggestMatches(account: UserRow, people: MemberRow[], linked: Map<number, UserRow>): MatchCandidate[] {
  const first = lower(account.signupFirstName);
  const last = lower(account.signupLastName);
  return people
    .map((m) => {
      const reasons: string[] = [];
      let score = 0;
      if (account.email && lower(m.email) === lower(account.email)) {
        score += 60;
        reasons.push("Same email");
      }
      if (account.phone && normalizePhone(m.phone) === account.phone) {
        score += 60;
        reasons.push("Same phone");
      }
      if (last && lower(m.lastName) === last) {
        score += 20;
        reasons.push("Same last name");
      } else if (last.length >= 4 && withinOneEdit(lower(m.lastName), last)) {
        score += 15;
        reasons.push("Similar last name");
      }
      if (first && lower(m.firstName) === first) {
        score += 20;
        reasons.push("Same first name");
      } else if (first.length >= 3 && lower(m.firstName).slice(0, 3) === first.slice(0, 3)) {
        score += 10;
        reasons.push("Similar first name");
      }
      const existing = linked.get(m.id);
      return {
        member: { ...personRef(m), email: m.email, phone: m.phone },
        score,
        reasons,
        existingAccount: existing ? { id: existing.id, status: existing.status } : null,
      };
    })
    // Children don't get their own accounts.
    .filter((c) => c.score >= 30 && !c.member.isChild)
    .sort((a, b) => b.score - a.score || a.member.lastName.localeCompare(b.member.lastName))
    .slice(0, 5);
}

async function serialize(db: Db, rows: UserRow[]): Promise<AppAccount[]> {
  const memberIds = rows.map((r) => r.memberId).filter((id): id is number => id !== null);
  const needSuggestions = rows.some((r) => r.status === "pending");
  const [linkedPeople, everyone, allLinks] = await Promise.all([
    memberIds.length ? db.select().from(members).where(inArray(members.id, memberIds)) : Promise.resolve([] as MemberRow[]),
    needSuggestions ? db.select().from(members).where(ne(members.status, "archived")) : Promise.resolve([] as MemberRow[]),
    needSuggestions ? db.select().from(users).where(sql`${users.memberId} is not null`) : Promise.resolve([] as UserRow[]),
  ]);
  const byId = new Map(linkedPeople.map((m) => [m.id, m]));
  const linked = new Map(allLinks.map((u) => [u.memberId!, u]));
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    signupName: u.signupFirstName ? `${u.signupFirstName} ${u.signupLastName ?? ""}`.trim() : null,
    member: u.memberId && byId.get(u.memberId) ? personRef(byId.get(u.memberId)!) : null,
    createdAt: u.createdAt.toISOString(),
    reviewedBy: u.reviewedBy,
    reviewedAt: u.reviewedAt?.toISOString() ?? null,
    inviteExpiresAt: u.status === "invited" ? (u.inviteExpiresAt?.toISOString() ?? null) : null,
    suggestions: u.status === "pending" ? suggestMatches(u, everyone, linked) : [],
  }));
}

async function loadAccount(db: Db, id: number) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw notFound("Account");
  return u;
}

/**
 * Makes `memberId` belong to `accountId`. An unclaimed invitation for that
 * person is replaced; any other existing account for them is a conflict.
 */
async function claimMember(tx: Db, accountId: number, memberId: number) {
  const [person] = await tx.select().from(members).where(eq(members.id, memberId));
  if (!person) throw new ApiError(422, "Please fix the highlighted fields.", { memberId: ["Person not found"] });
  if (person.isChild) throw new ApiError(422, "Children can't have their own app account.");
  const [other] = await tx.select().from(users).where(and(eq(users.memberId, memberId), ne(users.id, accountId)));
  if (other?.status === "invited") {
    await tx.delete(users).where(eq(users.id, other.id));
  } else if (other) {
    throw new ApiError(409, `${person.firstName} ${person.lastName} already has an app account (${other.email ?? formatPhone(other.phone)}).`);
  }
  return person;
}

const tags = ["App accounts"];

export const appAccountRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/app-accounts",
      tags,
      summary: "Member-app accounts (staff)",
      description: "Pending self-signups come with suggested matches from the directory.",
      security,
      request: { query: AppAccountQuery },
      responses: { 200: jsonContent(z.object({ accounts: z.array(AppAccount), pendingCount: z.number() })), ...authErrors },
    }),
    async (c) => {
      const { status } = c.req.valid("query");
      const { db } = c.var.deps;
      // Member accounts, plus staff accounts that are linked to a person (they use the app too).
      const scope = or(eq(users.role, "member"), sql`${users.memberId} is not null`)!;
      const rows = await db
        .select()
        .from(users)
        .where(status === "all" ? scope : and(scope, eq(users.status, status)))
        .orderBy(desc(users.createdAt));
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "member"), eq(users.status, "pending")));
      return c.json({ accounts: await serialize(db, rows), pendingCount: n }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/app-accounts/{id}/approve",
      tags,
      summary: "Approve a self-signup as an existing person, or as a new person",
      security,
      request: { params: IdParam, ...jsonBody(ApproveAccountInput) },
      responses: { 200: jsonContent(z.object({ account: AppAccount })), ...authErrors, ...notFoundError, ...conflict, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const { db } = c.var.deps;
      const account = await loadAccount(db, id);
      if (account.status !== "pending") throw new ApiError(422, "This account isn't waiting for approval.");

      await db.transaction(async (tx) => {
        let person: MemberRow;
        if ("memberId" in input) {
          person = await claimMember(tx, id, input.memberId);
        } else {
          [person] = (await tx
            .insert(members)
            .values({
              firstName: account.signupFirstName ?? "New",
              lastName: account.signupLastName ?? "Member",
              email: account.email,
              phone: formatPhone(account.phone),
              status: "guest",
              notes: "Added when their member-app sign-up was approved.",
            })
            .returning()) as [MemberRow];
        }
        await tx
          .update(users)
          .set({
            status: "active",
            memberId: person.id,
            name: `${person.firstName} ${person.lastName}`,
            reviewedBy: whoIs(c.var.user),
            reviewedAt: new Date(),
          })
          .where(eq(users.id, id));
      });
      const [account2] = await serialize(db, [await loadAccount(db, id)]);
      return c.json({ account: account2! }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/app-accounts/{id}/reject",
      tags,
      summary: "Turn down a self-signup (deletes it)",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { db } = c.var.deps;
      const account = await loadAccount(db, id);
      if (account.status !== "pending") throw new ApiError(422, "Only pending sign-ups can be turned down.");
      await db.delete(users).where(eq(users.id, id));
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/app-accounts/{id}/status",
      tags,
      summary: "Turn a member-app account off or back on",
      security,
      request: { params: IdParam, ...jsonBody(z.object({ status: z.enum(["active", "disabled"]) })) },
      responses: { 200: jsonContent(z.object({ account: AppAccount })), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const { db } = c.var.deps;
      const account = await loadAccount(db, id);
      if (account.role !== "member") throw new ApiError(422, "Staff accounts are managed in Settings.");
      if (status === "active" && !account.memberId) throw new ApiError(422, "Match this account to a person first.");
      if (!["active", "disabled"].includes(account.status)) throw new ApiError(422, "Only approved accounts can be turned off or on.");
      await db.update(users).set({ status }).where(eq(users.id, id));
      if (status === "disabled") await db.delete(sessions).where(eq(sessions.userId, id));
      const [out] = await serialize(db, [await loadAccount(db, id)]);
      return c.json({ account: out! }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/app-accounts/{id}/link",
      tags,
      summary: "Link an account (e.g. a staff account) to a person, or unlink it",
      security,
      request: { params: IdParam, ...jsonBody(LinkAccountInput) },
      responses: { 200: jsonContent(z.object({ account: AppAccount })), ...authErrors, ...notFoundError, ...conflict, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { memberId } = c.req.valid("json");
      const { db } = c.var.deps;
      const account = await loadAccount(db, id);
      if (account.status === "pending") throw new ApiError(422, "Use Approve for pending sign-ups.");
      if (memberId === null && account.role === "member") throw new ApiError(422, "Member accounts must stay linked to a person. Turn the account off instead.");
      await db.transaction(async (tx) => {
        if (memberId !== null) await claimMember(tx, id, memberId);
        await tx.update(users).set({ memberId }).where(eq(users.id, id));
      });
      const [out] = await serialize(db, [await loadAccount(db, id)]);
      return c.json({ account: out! }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/members/{id}/app-invite",
      tags,
      summary: "Invite a person to the member app",
      description: `Creates (or refreshes) an invitation valid for ${INVITE_DAYS} days. Share the code or link; it's emailed too when email is set up.`,
      security,
      request: { params: IdParam },
      responses: { 200: jsonContent(InviteResponse), ...authErrors, ...notFoundError, ...conflict, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { db, mailer } = c.var.deps;
      const [person] = await db.select().from(members).where(eq(members.id, id));
      if (!person) throw notFound("Person");
      if (person.isChild) throw new ApiError(422, "Children can't have their own app account.");
      const email = person.email?.trim().toLowerCase() || null;
      const phone = normalizePhone(person.phone);
      if (!email && !phone) throw new ApiError(422, "Add an email address or phone number to this person first — that's what they'll sign in with.");

      const [existing] = await db.select().from(users).where(eq(users.memberId, id));
      if (existing && existing.status !== "invited") {
        throw new ApiError(409, `${person.firstName} already has an app account.`);
      }
      // Someone else may already be using this email/phone (a pending signup or a staff login).
      const clash = await db
        .select()
        .from(users)
        .where(
          and(
            or(email ? eq(sql`lower(${users.email})`, email) : sql`false`, phone ? eq(users.phone, phone) : sql`false`)!,
            existing ? ne(users.id, existing.id) : sql`true`,
          ),
        );
      if (clash[0]?.status === "pending") {
        throw new ApiError(409, `${person.firstName} already signed up in the app and is waiting for approval. Approve that sign-up on the App accounts page instead.`);
      }
      if (clash[0]) {
        throw new ApiError(409, "That email or phone number is already used by another account (perhaps a staff login). Link that account to this person instead.");
      }

      const code = newInviteCode();
      const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
      const values = {
        email,
        phone,
        name: `${person.firstName} ${person.lastName}`,
        role: "member" as const,
        status: "invited" as const,
        memberId: id,
        passwordDigest: null,
        inviteTokenHash: hashToken(code),
        inviteExpiresAt: expiresAt,
        reviewedBy: whoIs(c.var.user),
        reviewedAt: new Date(),
      };
      if (existing) await db.update(users).set(values).where(eq(users.id, existing.id));
      else await db.insert(users).values(values);

      const link = `${env.appUrl}/app/invite?code=${code}`;
      let emailed = false;
      if (email && env.smtpUrl) {
        await mailer({
          to: email,
          subject: "You're invited to the FBC Enumclaw app",
          text: `Hi ${person.firstName},\n\nYou've been invited to the FBC Enumclaw member app — the church directory, recent sermons and your group's chat.\n\nSet up your account here:\n${link}\n\nOr open the app and enter this code: ${displayCode(code)}\n\nThe invitation expires in ${INVITE_DAYS} days.`,
        });
        emailed = true;
      }
      return c.json({ code: displayCode(code), link, expiresAt: expiresAt.toISOString(), emailed }, 200);
    },
  );
