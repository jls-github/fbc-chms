import { randomInt } from "node:crypto";
import { createRoute } from "@hono/zod-openapi";
import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import {
  CheckoutInput,
  CreateKioskInput,
  ErrorResponse,
  IdParam,
  KioskCheckinInput,
  KioskCheckinResult,
  KioskChildInput,
  KioskDevice,
  KioskHousehold,
  KioskLookupQuery,
  KioskRegisterInput,
  RosterEntry,
  RosterQuery,
} from "@shared/schemas";
import { requireRole, SESSION_COOKIE } from "../auth/middleware";
import { createSession, destroySession } from "../auth/sessions";
import type { Db } from "../db/client";
import { checkins, families, members, sessions, users } from "../db/schema";
import { env } from "../env";
import { serviceDate } from "../lib/church-time";
import { clientIp } from "../lib/client-ip";
import { ApiError, notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter, whoIs, type AppEnv } from "../lib/router";
import { likePattern, prefixPattern } from "../lib/serializers";
import type { Context } from "hono";

type MemberRow = typeof members.$inferSelect;
type CheckinRow = typeof checkins.$inferSelect;

/** No 0/O, 1/I/L, 2/Z, 5/S, 8/B — easy to read aloud and match at a glance. */
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
const newCode = () => Array.from({ length: 3 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

const digits = (v: string) => v.replace(/\D/g, "");
const formatPhone = (v: string) => {
  const d = digits(v).slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v.trim();
};

/** Who did it, for the audit trail: the kiosk's name, or the staff member's email. */
const actor = (c: Context<AppEnv>) =>
  c.var.session.kind === "kiosk" ? `Kiosk: ${c.var.session.label ?? "unnamed"}` : whoIs(c.var.user);

async function loadHouseholds(db: Db, familyIds: number[], day: string) {
  if (familyIds.length === 0) return [];
  const [fams, people, todays] = await Promise.all([
    db.select().from(families).where(inArray(families.id, familyIds)).orderBy(asc(families.name)),
    db
      .select()
      .from(members)
      .where(and(inArray(members.familyId, familyIds), sql`${members.status} <> 'archived'`))
      .orderBy(asc(members.birthdate), asc(members.firstName)),
    db
      .select()
      .from(checkins)
      .where(and(eq(checkins.serviceDate, day), inArray(checkins.familyId, familyIds))),
  ]);
  const active = new Map(todays.filter((c) => !c.checkedOutAt).map((c) => [c.memberId, c.securityCode]));
  return fams.map((f) => {
    const mine = people.filter((m) => m.familyId === f.id);
    return {
      id: f.id,
      name: f.name,
      adults: mine.filter((m) => !m.isChild).map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName })),
      children: mine
        .filter((m) => m.isChild)
        .map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          birthdate: m.birthdate,
          medicalNotes: m.medicalNotes,
          checkedIn: active.has(m.id),
          securityCode: active.get(m.id) ?? null,
        })),
    };
  });
}

async function loadHousehold(db: Db, familyId: number) {
  const [household] = await loadHouseholds(db, [familyId], serviceDate());
  if (!household) throw notFound("Household");
  return household;
}

// ---------------------------------------------------------------------- kiosk

const kioskTags = ["Kids check-in: kiosk"];
const conflict = { 409: jsonContent(ErrorResponse, "Already registered") } as const;

export const kioskRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/kiosk/status",
      tags: kioskTags,
      summary: "Confirm this device can run the check-in kiosk",
      security,
      responses: { 200: jsonContent(z.object({ label: z.string().nullable(), serviceDate: z.string() })), ...authErrors },
    }),
    (c) => c.json({ label: c.var.session.kind === "kiosk" ? c.var.session.label : null, serviceDate: serviceDate() }, 200),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/kiosk/households",
      tags: kioskTags,
      summary: "Find a household by phone number (full or last 4 digits) or last name",
      security,
      request: { query: KioskLookupQuery },
      responses: { 200: jsonContent(z.object({ households: z.array(KioskHousehold) })), ...authErrors, ...validationError },
    }),
    async (c) => {
      const q = c.req.valid("query").q;
      const { db } = c.var.deps;
      const d = digits(q);
      const looksLikePhone = d.length >= 4 && /^[\d\s()+.-]+$/.test(q);
      if (/^[\d\s()+.-]+$/.test(q) && !looksLikePhone) {
        throw new ApiError(422, "Please fix the highlighted fields.", { q: ["Enter at least the last 4 digits of your phone number"] });
      }
      const matches = await db
        .selectDistinct({ familyId: members.familyId })
        .from(members)
        .leftJoin(families, eq(families.id, members.familyId))
        .where(
          and(
            isNotNull(members.familyId),
            looksLikePhone
              ? sql`regexp_replace(coalesce(${members.phone}, ''), '\\D', '', 'g') like ${`%${d.slice(-10)}`}`
              : or(ilike(members.lastName, prefixPattern(q)), ilike(families.name, likePattern(q))),
          ),
        )
        .limit(8);
      const households = await loadHouseholds(
        db,
        matches.map((m) => m.familyId!),
        serviceDate(),
      );
      return c.json({ households }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/kiosk/households",
      tags: kioskTags,
      summary: "Register a first-time family (a parent and their kids)",
      security,
      request: jsonBody(KioskRegisterInput),
      responses: { 201: jsonContent(z.object({ household: KioskHousehold }), "Registered"), ...authErrors, ...conflict, ...validationError },
    }),
    async (c) => {
      const { parent, children } = c.req.valid("json");
      const { db } = c.var.deps;
      const phone = digits(parent.phone).slice(-10);
      const [existing] = await db
        .select({ id: members.id })
        .from(members)
        .where(and(isNotNull(members.familyId), sql`regexp_replace(coalesce(${members.phone}, ''), '\\D', '', 'g') like ${`%${phone}`}`))
        .limit(1);
      if (existing) {
        throw new ApiError(409, "Looks like you're already registered! Go back and search for your phone number.");
      }
      const familyId = await db.transaction(async (tx) => {
        const [family] = await tx.insert(families).values({ name: `The ${parent.lastName} Family` }).returning();
        await tx.insert(members).values({
          firstName: parent.firstName,
          lastName: parent.lastName,
          phone: formatPhone(parent.phone),
          email: parent.email,
          status: "guest",
          familyId: family!.id,
          notes: "Registered at the kids check-in kiosk.",
        });
        await tx.insert(members).values(
          children.map((k) => ({
            firstName: k.firstName,
            lastName: k.lastName ?? parent.lastName,
            birthdate: k.birthdate,
            medicalNotes: k.medicalNotes,
            isChild: true,
            status: "guest" as const,
            familyId: family!.id,
          })),
        );
        return family!.id;
      });
      return c.json({ household: await loadHousehold(db, familyId) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/kiosk/households/{id}/children",
      tags: kioskTags,
      summary: "Add a child to an existing household",
      security,
      request: { params: IdParam, ...jsonBody(KioskChildInput) },
      responses: { 201: jsonContent(z.object({ household: KioskHousehold }), "Added"), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const child = c.req.valid("json");
      const { db } = c.var.deps;
      const household = await loadHousehold(db, id);
      const lastName = child.lastName ?? household.adults[0]?.lastName ?? household.children[0]?.lastName ?? household.name.replace(/^The | Family$/g, "");
      await db.insert(members).values({ ...child, lastName, isChild: true, status: "guest", familyId: id });
      return c.json({ household: await loadHousehold(db, id) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/kiosk/checkins",
      tags: kioskTags,
      summary: "Check kids in for today",
      description:
        "All of a household's kids share one security code per day. Checking in a child who is already checked in is a no-op; a child who was picked up earlier is checked back in.",
      security,
      request: jsonBody(KioskCheckinInput),
      responses: { 201: jsonContent(KioskCheckinResult, "Checked in"), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { householdId, childIds } = c.req.valid("json");
      const { db } = c.var.deps;
      const day = serviceDate();
      const household = await loadHousehold(db, householdId);
      const kids = new Map(household.children.map((k) => [k.id, k]));
      const invalid = childIds.filter((id) => !kids.has(id));
      if (invalid.length) {
        throw new ApiError(422, "Please fix the highlighted fields.", { childIds: ["Those children aren't in this household"] });
      }

      const code = await db.transaction(async (tx) => {
        // Serialize code assignment for the day so two kiosks can't hand out the same code.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`checkin:${day}`}))`);
        const todays: CheckinRow[] = await tx.select().from(checkins).where(eq(checkins.serviceDate, day));
        const familyCode = todays.find((r) => r.familyId === householdId && !r.checkedOutAt)?.securityCode;
        let code = familyCode;
        if (!code) {
          const used = new Set(todays.map((r) => r.securityCode));
          for (let i = 0; i < 50 && (!code || used.has(code)); i++) code = newCode();
          if (!code || used.has(code)) throw new ApiError(503, "Couldn't create a security code. Please try again.");
        }
        const by = actor(c);
        await tx
          .insert(checkins)
          .values(childIds.map((memberId) => ({ memberId, familyId: householdId, serviceDate: day, securityCode: code!, checkedInBy: by })))
          .onConflictDoUpdate({
            target: [checkins.memberId, checkins.serviceDate],
            // Only re-open rows for kids who were already picked up; active check-ins are left alone.
            set: { securityCode: code!, familyId: householdId, checkedInAt: new Date(), checkedInBy: by, checkedOutAt: null, checkedOutBy: null },
            setWhere: isNotNull(checkins.checkedOutAt),
          });
        return code!;
      });

      const refreshed = await loadHousehold(db, householdId);
      return c.json(
        {
          securityCode: code,
          serviceDate: day,
          householdName: refreshed.name,
          children: refreshed.children.filter((k) => childIds.includes(k.id)),
        },
        201,
      );
    },
  );

// ---------------------------------------------------------- volunteers/staff

const rosterTags = ["Kids check-in: roster"];

async function loadRoster(db: Db, day: string) {
  const rows = await db
    .select({ checkin: checkins, child: members, family: families })
    .from(checkins)
    .innerJoin(members, eq(members.id, checkins.memberId))
    .leftJoin(families, eq(families.id, checkins.familyId))
    .where(eq(checkins.serviceDate, day));
  const familyIds = [...new Set(rows.map((r) => r.family?.id).filter((id): id is number => !!id))];
  const adults: MemberRow[] = familyIds.length
    ? await db
        .select()
        .from(members)
        .where(and(inArray(members.familyId, familyIds), eq(members.isChild, false)))
    : [];
  return rows
    .map(({ checkin, child, family }) => ({
      id: checkin.id,
      child: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        birthdate: child.birthdate,
        medicalNotes: child.medicalNotes,
      },
      household: family ? { id: family.id, name: family.name } : null,
      contacts: adults
        .filter((a) => a.familyId === family?.id)
        .map((a) => ({ name: `${a.firstName} ${a.lastName}`, phone: a.phone })),
      securityCode: checkin.securityCode,
      checkedInAt: checkin.checkedInAt.toISOString(),
      checkedInBy: checkin.checkedInBy,
      checkedOutAt: checkin.checkedOutAt?.toISOString() ?? null,
      checkedOutBy: checkin.checkedOutBy,
    }))
    .sort((a, b) => a.child.lastName.localeCompare(b.child.lastName) || a.child.firstName.localeCompare(b.child.firstName));
}

const RosterResponse = z.object({ serviceDate: z.string(), today: z.string(), entries: z.array(RosterEntry) });

export const rosterRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/checkin/roster",
      tags: rosterTags,
      summary: "Kids checked in on a day (defaults to today)",
      security,
      request: { query: RosterQuery },
      responses: { 200: jsonContent(RosterResponse), ...authErrors },
    }),
    async (c) => {
      const today = serviceDate();
      const day = c.req.valid("query").date ?? today;
      return c.json({ serviceDate: day, today, entries: await loadRoster(c.var.deps.db, day) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/checkin/checkout",
      tags: rosterTags,
      summary: "Check kids out (picked up)",
      description: "Volunteers should match the security code on the parent's tag before checking a child out.",
      security,
      request: jsonBody(CheckoutInput),
      responses: { 200: jsonContent(z.object({ checkedOut: z.number() })), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { checkinIds } = c.req.valid("json");
      const updated = await c.var.deps.db
        .update(checkins)
        .set({ checkedOutAt: new Date(), checkedOutBy: whoIs(c.var.user) })
        .where(and(inArray(checkins.id, checkinIds), isNull(checkins.checkedOutAt)))
        .returning({ id: checkins.id });
      return c.json({ checkedOut: updated.length }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/checkin/checkins/{id}/undo-checkout",
      tags: rosterTags,
      summary: "Undo a checkout made by mistake",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const updated = await c.var.deps.db
        .update(checkins)
        .set({ checkedOutAt: null, checkedOutBy: null })
        .where(and(eq(checkins.id, c.req.valid("param").id), isNotNull(checkins.checkedOutAt)))
        .returning({ id: checkins.id });
      if (!updated.length) throw notFound("Checked-out child");
      return c.body(null, 204);
    },
  )
  // ------------------------------------------------ kiosk devices (staff+)
  .openapi(
    createRoute({
      method: "get",
      path: "/checkin/kiosks",
      tags: rosterTags,
      summary: "Devices set up as check-in kiosks (staff and admins)",
      security,
      middleware: [requireRole("admin", "staff")] as const,
      responses: { 200: jsonContent(z.object({ kiosks: z.array(KioskDevice) })), ...authErrors },
    }),
    async (c) => {
      const rows = await c.var.deps.db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.kind, "kiosk"), sql`${sessions.expiresAt} > now()`))
        .orderBy(asc(sessions.createdAt));
      return c.json(
        {
          kiosks: rows.map(({ session, user }) => ({
            id: session.id,
            label: session.label,
            createdAt: session.createdAt.toISOString(),
            lastUsedAt: session.lastUsedAt.toISOString(),
            setUpBy: whoIs(user),
          })),
        },
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/checkin/kiosks",
      tags: rosterTags,
      summary: "Turn this browser into a check-in kiosk (staff and admins)",
      description:
        "Replaces the current sign-in on this device with a kiosk session that can only reach the /kiosk endpoints. Leaving kiosk mode requires a staff sign-in.",
      security,
      middleware: [requireRole("admin", "staff")] as const,
      request: jsonBody(CreateKioskInput),
      responses: { 201: jsonContent(z.object({ ok: z.literal(true) }), "Kiosk ready"), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { label } = c.req.valid("json");
      const { db } = c.var.deps;
      const { token, expiresAt } = await createSession(db, c.var.user.id, "kiosk", {
        label,
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent"),
      });
      if (c.var.session.kind === "web") await destroySession(db, c.var.session.id);
      setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: env.isProduction, sameSite: "Lax", path: "/", expires: expiresAt });
      return c.json({ ok: true as const }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/checkin/kiosks/{id}",
      tags: rosterTags,
      summary: "Turn off a kiosk (staff and admins)",
      security,
      middleware: [requireRole("admin", "staff")] as const,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const deleted = await c.var.deps.db
        .delete(sessions)
        .where(and(eq(sessions.id, c.req.valid("param").id), eq(sessions.kind, "kiosk")))
        .returning({ id: sessions.id });
      if (!deleted.length) throw notFound("Kiosk");
      return c.body(null, 204);
    },
  );
