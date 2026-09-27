import { createRoute } from "@hono/zod-openapi";
import { and, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { STAFF_ROLES } from "@shared/constants";
import { normalizePhone } from "@shared/phone";
import { z } from "zod";
import { IdParam, MemberDetail, MemberInput, MemberListQuery, MemberPatch, MemberSummary } from "@shared/schemas";
import type { Db } from "../db/client";
import { members, users } from "../db/schema";
import { notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { byName, likePattern, memberSummary, personRef } from "../lib/serializers";

const withRelations = {
  family: { columns: { id: true, name: true } },
  groupMemberships: { columns: {}, with: { group: { columns: { id: true, name: true } } } },
  teamMemberships: { columns: { role: true }, with: { team: { columns: { id: true, name: true } } } },
} as const;

export function memberSearchCondition(q: string): SQL {
  const pattern = likePattern(q);
  return or(
    ilike(members.firstName, pattern),
    ilike(members.lastName, pattern),
    ilike(sql`${members.firstName} || ' ' || ${members.lastName}`, pattern),
    ilike(members.email, pattern),
    ilike(members.phone, pattern),
  )!;
}

async function loadDetail(db: Db, id: number) {
  const member = await db.query.members.findFirst({ where: eq(members.id, id), with: withRelations });
  if (!member) throw notFound("Member");
  const household = member.familyId
    ? await db.query.members.findMany({
        where: and(eq(members.familyId, member.familyId), ne(members.id, member.id)),
      })
    : [];
  const [account] = await db.select().from(users).where(eq(users.memberId, member.id));
  const email = member.email?.trim().toLowerCase();
  const phone = normalizePhone(member.phone);
  const [staffLogin] =
    !account && (email || phone) && !member.isChild
      ? await db
          .select()
          .from(users)
          .where(
            and(
              isNull(users.memberId),
              inArray(users.role, [...STAFF_ROLES]),
              or(email ? eq(sql`lower(${users.email})`, email) : sql`false`, phone ? eq(users.phone, phone) : sql`false`),
            ),
          )
          .limit(1)
      : [];
  return {
    ...memberSummary(member),
    household: household.map(personRef).sort(byName),
    linkableStaffLogin: staffLogin ? { id: staffLogin.id, email: staffLogin.email, role: staffLogin.role } : null,
    appAccount: account
      ? {
          id: account.id,
          role: account.role,
          status: account.status,
          email: account.email,
          phone: account.phone,
          inviteExpiresAt: account.status === "invited" ? (account.inviteExpiresAt?.toISOString() ?? null) : null,
        }
      : null,
  };
}

const tags = ["Members"];

export const memberRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/members",
      tags,
      summary: "List members",
      description: "Sorted by last name. Filter with `status` and search names, email and phone with `q`.",
      security,
      request: { query: MemberListQuery },
      responses: { 200: jsonContent(z.object({ members: z.array(MemberSummary) })), ...authErrors },
    }),
    async (c) => {
      const { q, status } = c.req.valid("query");
      const conditions: SQL[] = [];
      if (status) conditions.push(eq(members.status, status));
      if (q) conditions.push(memberSearchCondition(q));
      const rows = await c.var.deps.db.query.members.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        with: withRelations,
        orderBy: [members.lastName, members.firstName],
      });
      return c.json({ members: rows.map(memberSummary) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/members",
      tags,
      summary: "Create a member",
      security,
      request: jsonBody(MemberInput),
      responses: { 201: jsonContent(z.object({ member: MemberDetail }), "Created"), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { db } = c.var.deps;
      const [row] = await db.insert(members).values(c.req.valid("json")).returning({ id: members.id });
      return c.json({ member: await loadDetail(db, row!.id) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/members/{id}",
      tags,
      summary: "Get a member, including their household",
      security,
      request: { params: IdParam },
      responses: { 200: jsonContent(z.object({ member: MemberDetail })), ...authErrors, ...notFoundError },
    }),
    async (c) => c.json({ member: await loadDetail(c.var.deps.db, c.req.valid("param").id) }, 200),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/members/{id}",
      tags,
      summary: "Update a member",
      description: "Send only the fields you want to change.",
      security,
      request: { params: IdParam, ...jsonBody(MemberPatch) },
      responses: {
        200: jsonContent(z.object({ member: MemberDetail })),
        ...authErrors,
        ...notFoundError,
        ...validationError,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { db } = c.var.deps;
      const input = c.req.valid("json");
      if (Object.keys(input).length > 0) {
        const updated = await db.update(members).set(input).where(eq(members.id, id)).returning({ id: members.id });
        if (updated.length === 0) throw notFound("Member");
      }
      return c.json({ member: await loadDetail(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/members/{id}",
      tags,
      summary: "Delete a member",
      description: "Also removes their group and team memberships.",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const deleted = await c.var.deps.db
        .delete(members)
        .where(eq(members.id, c.req.valid("param").id))
        .returning({ id: members.id });
      if (deleted.length === 0) throw notFound("Member");
      return c.body(null, 204);
    },
  );
