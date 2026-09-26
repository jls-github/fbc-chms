import { createRoute } from "@hono/zod-openapi";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { Family, FamilyInput, IdParam } from "@shared/schemas";
import type { Db } from "../db/client";
import { families, members } from "../db/schema";
import { notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { byName, personRef, timestamps } from "../lib/serializers";

type FamilyRow = typeof families.$inferSelect & { members: (typeof members.$inferSelect)[] };

const serialize = (f: FamilyRow): Family => ({
  id: f.id,
  name: f.name,
  members: f.members
    .map((m) => ({ ...personRef(m), email: m.email, phone: m.phone }))
    .sort((a, b) => Number(a.isChild) - Number(b.isChild) || byName(a, b)),
  ...timestamps(f),
});

async function load(db: Db, id: number) {
  const family = await db.query.families.findFirst({ where: eq(families.id, id), with: { members: true } });
  if (!family) throw notFound("Household");
  return serialize(family);
}

async function setMembers(db: Db, familyId: number, memberIds: number[]) {
  await db
    .update(members)
    .set({ familyId: null })
    .where(
      memberIds.length
        ? and(eq(members.familyId, familyId), notInArray(members.id, memberIds))
        : eq(members.familyId, familyId),
    );
  if (memberIds.length) await db.update(members).set({ familyId }).where(inArray(members.id, memberIds));
}

const tags = ["Households"];
const FamilyEnvelope = z.object({ family: Family });

export const familyRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/families",
      tags,
      summary: "List households with their members",
      security,
      responses: { 200: jsonContent(z.object({ families: z.array(Family) })), ...authErrors },
    }),
    async (c) => {
      const rows = await c.var.deps.db.query.families.findMany({ with: { members: true }, orderBy: families.name });
      return c.json({ families: rows.map(serialize) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/families",
      tags,
      summary: "Create a household",
      security,
      request: jsonBody(FamilyInput),
      responses: { 201: jsonContent(FamilyEnvelope, "Created"), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { name, memberIds } = c.req.valid("json");
      const { db } = c.var.deps;
      const id = await db.transaction(async (tx) => {
        const [row] = await tx.insert(families).values({ name }).returning({ id: families.id });
        if (memberIds) await setMembers(tx, row!.id, memberIds);
        return row!.id;
      });
      return c.json({ family: await load(db, id) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/families/{id}",
      tags,
      summary: "Get a household",
      security,
      request: { params: IdParam },
      responses: { 200: jsonContent(FamilyEnvelope), ...authErrors, ...notFoundError },
    }),
    async (c) => c.json({ family: await load(c.var.deps.db, c.req.valid("param").id) }, 200),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/families/{id}",
      tags,
      summary: "Update a household",
      description: "If `memberIds` is sent, the household's members are replaced with that list.",
      security,
      request: { params: IdParam, ...jsonBody(FamilyInput.partial()) },
      responses: { 200: jsonContent(FamilyEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name, memberIds } = c.req.valid("json");
      const { db } = c.var.deps;
      await db.transaction(async (tx) => {
        const exists = await tx.query.families.findFirst({ where: eq(families.id, id), columns: { id: true } });
        if (!exists) throw notFound("Household");
        if (name) await tx.update(families).set({ name }).where(eq(families.id, id));
        if (memberIds) await setMembers(tx, id, memberIds);
      });
      return c.json({ family: await load(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/families/{id}",
      tags,
      summary: "Delete a household",
      description: "Members are kept; they just no longer belong to a household.",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const deleted = await c.var.deps.db
        .delete(families)
        .where(eq(families.id, c.req.valid("param").id))
        .returning({ id: families.id });
      if (deleted.length === 0) throw notFound("Household");
      return c.body(null, 204);
    },
  );
