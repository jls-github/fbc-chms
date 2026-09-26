import { createRoute } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AddGroupMemberInput, Group, GroupInput, IdParam, MemberIdParam } from "@shared/schemas";
import type { Db } from "../db/client";
import { groupMemberships, groups, members } from "../db/schema";
import { ApiError, notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { byName, personRef, timestamps } from "../lib/serializers";

const withMembers = { memberships: { with: { member: true } } } as const;

type GroupRow = typeof groups.$inferSelect & {
  memberships: { member: typeof members.$inferSelect }[];
};

const serialize = (g: GroupRow): Group => ({
  id: g.id,
  name: g.name,
  meetingTime: g.meetingTime,
  meetingLocation: g.meetingLocation,
  description: g.description,
  members: g.memberships.map((m) => personRef(m.member)).sort(byName),
  ...timestamps(g),
});

async function load(db: Db, id: number) {
  const group = await db.query.groups.findFirst({ where: eq(groups.id, id), with: withMembers });
  if (!group) throw notFound("Group");
  return serialize(group);
}

export async function assertMemberExists(db: Db, memberId: number) {
  const found = await db.query.members.findFirst({ where: eq(members.id, memberId), columns: { id: true } });
  if (!found) throw new ApiError(422, "Please fix the highlighted fields.", { memberId: ["Member not found"] });
}

const tags = ["Groups"];
const GroupEnvelope = z.object({ group: Group });

export const groupRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/groups",
      tags,
      summary: "List community groups with members",
      security,
      responses: { 200: jsonContent(z.object({ groups: z.array(Group) })), ...authErrors },
    }),
    async (c) => {
      const rows = await c.var.deps.db.query.groups.findMany({ with: withMembers, orderBy: groups.name });
      return c.json({ groups: rows.map(serialize) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/groups",
      tags,
      summary: "Create a group",
      security,
      request: jsonBody(GroupInput),
      responses: { 201: jsonContent(GroupEnvelope, "Created"), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { db } = c.var.deps;
      const [row] = await db.insert(groups).values(c.req.valid("json")).returning({ id: groups.id });
      return c.json({ group: await load(db, row!.id) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/groups/{id}",
      tags,
      summary: "Get a group",
      security,
      request: { params: IdParam },
      responses: { 200: jsonContent(GroupEnvelope), ...authErrors, ...notFoundError },
    }),
    async (c) => c.json({ group: await load(c.var.deps.db, c.req.valid("param").id) }, 200),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/groups/{id}",
      tags,
      summary: "Update a group",
      security,
      request: { params: IdParam, ...jsonBody(GroupInput.partial()) },
      responses: { 200: jsonContent(GroupEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const { db } = c.var.deps;
      if (Object.keys(input).length) {
        const updated = await db.update(groups).set(input).where(eq(groups.id, id)).returning({ id: groups.id });
        if (updated.length === 0) throw notFound("Group");
      }
      return c.json({ group: await load(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/groups/{id}",
      tags,
      summary: "Delete a group",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const deleted = await c.var.deps.db
        .delete(groups)
        .where(eq(groups.id, c.req.valid("param").id))
        .returning({ id: groups.id });
      if (deleted.length === 0) throw notFound("Group");
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/groups/{id}/members",
      tags,
      summary: "Add a member to a group",
      description: "Idempotent: adding someone already in the group is a no-op.",
      security,
      request: { params: IdParam, ...jsonBody(AddGroupMemberInput) },
      responses: { 200: jsonContent(GroupEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { memberId } = c.req.valid("json");
      const { db } = c.var.deps;
      await load(db, id);
      await assertMemberExists(db, memberId);
      await db.insert(groupMemberships).values({ groupId: id, memberId }).onConflictDoNothing();
      return c.json({ group: await load(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/groups/{id}/members/{memberId}",
      tags,
      summary: "Remove a member from a group",
      security,
      request: { params: MemberIdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const { id, memberId } = c.req.valid("param");
      const deleted = await c.var.deps.db
        .delete(groupMemberships)
        .where(and(eq(groupMemberships.groupId, id), eq(groupMemberships.memberId, memberId)))
        .returning({ id: groupMemberships.id });
      if (deleted.length === 0) throw notFound("Group membership");
      return c.body(null, 204);
    },
  );
