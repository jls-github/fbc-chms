import { createRoute } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AddTeamMemberInput, IdParam, MemberIdParam, Team, TeamInput, UpdateTeamMemberInput } from "@shared/schemas";
import type { Db } from "../db/client";
import { members, teamMemberships, teams } from "../db/schema";
import { notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { byName, personRef, timestamps } from "../lib/serializers";
import { assertMemberExists } from "./groups";

const withMembers = { leader: true, memberships: { with: { member: true } } } as const;

type MemberRow = typeof members.$inferSelect;
type TeamRow = typeof teams.$inferSelect & {
  leader: MemberRow | null;
  memberships: { role: string | null; member: MemberRow }[];
};

const serialize = (t: TeamRow): Team => ({
  id: t.id,
  name: t.name,
  description: t.description,
  leader: t.leader ? personRef(t.leader) : null,
  members: t.memberships.map((m) => ({ ...personRef(m.member), role: m.role })).sort(byName),
  ...timestamps(t),
});

async function load(db: Db, id: number) {
  const team = await db.query.teams.findFirst({ where: eq(teams.id, id), with: withMembers });
  if (!team) throw notFound("Team");
  return serialize(team);
}

const tags = ["Teams"];
const TeamEnvelope = z.object({ team: Team });

export const teamRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/teams",
      tags,
      summary: "List ministry teams with members",
      security,
      responses: { 200: jsonContent(z.object({ teams: z.array(Team) })), ...authErrors },
    }),
    async (c) => {
      const rows = await c.var.deps.db.query.teams.findMany({ with: withMembers, orderBy: teams.name });
      return c.json({ teams: rows.map(serialize) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/teams",
      tags,
      summary: "Create a team",
      security,
      request: jsonBody(TeamInput),
      responses: { 201: jsonContent(TeamEnvelope, "Created"), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { db } = c.var.deps;
      const input = c.req.valid("json");
      if (input.leaderId) await assertMemberExists(db, input.leaderId);
      const [row] = await db.insert(teams).values(input).returning({ id: teams.id });
      return c.json({ team: await load(db, row!.id) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/teams/{id}",
      tags,
      summary: "Get a team",
      security,
      request: { params: IdParam },
      responses: { 200: jsonContent(TeamEnvelope), ...authErrors, ...notFoundError },
    }),
    async (c) => c.json({ team: await load(c.var.deps.db, c.req.valid("param").id) }, 200),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/teams/{id}",
      tags,
      summary: "Update a team",
      security,
      request: { params: IdParam, ...jsonBody(TeamInput.partial()) },
      responses: { 200: jsonContent(TeamEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const { db } = c.var.deps;
      if (input.leaderId) await assertMemberExists(db, input.leaderId);
      if (Object.keys(input).length) {
        const updated = await db.update(teams).set(input).where(eq(teams.id, id)).returning({ id: teams.id });
        if (updated.length === 0) throw notFound("Team");
      }
      return c.json({ team: await load(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/teams/{id}",
      tags,
      summary: "Delete a team",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const deleted = await c.var.deps.db
        .delete(teams)
        .where(eq(teams.id, c.req.valid("param").id))
        .returning({ id: teams.id });
      if (deleted.length === 0) throw notFound("Team");
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/teams/{id}/members",
      tags,
      summary: "Add a member to a team",
      description: "If they're already on the team, their role is updated instead.",
      security,
      request: { params: IdParam, ...jsonBody(AddTeamMemberInput) },
      responses: { 200: jsonContent(TeamEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { memberId, role } = c.req.valid("json");
      const { db } = c.var.deps;
      await load(db, id);
      await assertMemberExists(db, memberId);
      await db
        .insert(teamMemberships)
        .values({ teamId: id, memberId, role })
        .onConflictDoUpdate({ target: [teamMemberships.teamId, teamMemberships.memberId], set: { role } });
      return c.json({ team: await load(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/teams/{id}/members/{memberId}",
      tags,
      summary: "Change a team member's role",
      security,
      request: { params: MemberIdParam, ...jsonBody(UpdateTeamMemberInput) },
      responses: { 200: jsonContent(TeamEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id, memberId } = c.req.valid("param");
      const { role } = c.req.valid("json");
      const { db } = c.var.deps;
      const updated = await db
        .update(teamMemberships)
        .set({ role })
        .where(and(eq(teamMemberships.teamId, id), eq(teamMemberships.memberId, memberId)))
        .returning({ id: teamMemberships.id });
      if (updated.length === 0) throw notFound("Team membership");
      return c.json({ team: await load(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/teams/{id}/members/{memberId}",
      tags,
      summary: "Remove a member from a team",
      security,
      request: { params: MemberIdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const { id, memberId } = c.req.valid("param");
      const deleted = await c.var.deps.db
        .delete(teamMemberships)
        .where(and(eq(teamMemberships.teamId, id), eq(teamMemberships.memberId, memberId)))
        .returning({ id: teamMemberships.id });
      if (deleted.length === 0) throw notFound("Team membership");
      return c.body(null, 204);
    },
  );
