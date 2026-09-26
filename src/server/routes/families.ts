import { createRoute } from "@hono/zod-openapi";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { Family, FamilyInput, IdParam } from "@shared/schemas";
import type { Db } from "../db/client";
import { familyPhotos, families, members } from "../db/schema";
import { ApiError, notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { byName, familyPhotoUrl, personRef, timestamps } from "../lib/serializers";

type FamilyRow = typeof families.$inferSelect & {
  members: (typeof members.$inferSelect)[];
  photo: { updatedAt: Date } | null;
};

/** Never load the image bytes when listing households — just when the photo last changed. */
const withMembersAndPhoto = { members: true, photo: { columns: { updatedAt: true } } } as const;

const serialize = (f: FamilyRow): Family => ({
  id: f.id,
  name: f.name,
  members: f.members
    .map((m) => ({ ...personRef(m), email: m.email, phone: m.phone }))
    .sort((a, b) => Number(a.isChild) - Number(b.isChild) || byName(a, b)),
  photoUrl: familyPhotoUrl(f.id, f.photo),
  ...timestamps(f),
});

async function load(db: Db, id: number) {
  const family = await db.query.families.findFirst({ where: eq(families.id, id), with: withMembersAndPhoto });
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

export const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type PhotoType = (typeof PHOTO_TYPES)[number];

/** Trust the bytes, not the header: identify the image format from its signature. */
function sniffImageType(b: Buffer): PhotoType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
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
      const rows = await c.var.deps.db.query.families.findMany({ with: withMembersAndPhoto, orderBy: families.name });
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
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/families/{id}/photo",
      tags,
      summary: "A household's photo",
      security,
      request: { params: IdParam },
      responses: {
        200: { description: "The image", content: { "image/jpeg": { schema: z.string().meta({ format: "binary" }) } } },
        ...authErrors,
        ...notFoundError,
      },
    }),
    async (c) => {
      const [photo] = await c.var.deps.db.select().from(familyPhotos).where(eq(familyPhotos.familyId, c.req.valid("param").id));
      if (!photo) throw notFound("Photo");
      const etag = `"${photo.updatedAt.getTime()}"`;
      // URLs carry ?v=<timestamp>, so a given URL never changes; only signed-in browsers may cache it.
      c.header("Cache-Control", "private, max-age=31536000, immutable");
      c.header("ETag", etag);
      if (c.req.header("if-none-match") === etag) return c.body(null, 304);
      return c.body(new Uint8Array(photo.data), 200, { "Content-Type": photo.contentType });
    },
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/families/{id}/photo",
      tags,
      summary: "Upload or replace a household's photo",
      description: `Send the raw image as the request body (JPEG, PNG or WebP, up to ${MAX_PHOTO_MB} MB).`,
      security,
      request: {
        params: IdParam,
        body: {
          required: true,
          content: Object.fromEntries(PHOTO_TYPES.map((t) => [t, { schema: z.string().meta({ format: "binary" }) }])),
        },
      },
      responses: { 200: jsonContent(FamilyEnvelope), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { db } = c.var.deps;
      const exists = await db.query.families.findFirst({ where: eq(families.id, id), columns: { id: true } });
      if (!exists) throw notFound("Household");
      const declared = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const data = Buffer.from(await c.req.arrayBuffer());
      const sniffed = sniffImageType(data);
      if (!sniffed || !PHOTO_TYPES.includes(declared as PhotoType)) {
        throw new ApiError(422, "Please upload a JPEG, PNG or WebP image.");
      }
      if (data.length > MAX_PHOTO_MB * 1024 * 1024) throw new ApiError(422, `That photo is too large (max ${MAX_PHOTO_MB} MB).`);
      await db
        .insert(familyPhotos)
        .values({ familyId: id, contentType: sniffed, data })
        .onConflictDoUpdate({ target: familyPhotos.familyId, set: { contentType: sniffed, data, updatedAt: new Date() } });
      return c.json({ family: await load(db, id) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/families/{id}/photo",
      tags,
      summary: "Remove a household's photo",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError },
    }),
    async (c) => {
      const deleted = await c.var.deps.db
        .delete(familyPhotos)
        .where(eq(familyPhotos.familyId, c.req.valid("param").id))
        .returning({ id: familyPhotos.familyId });
      if (deleted.length === 0) throw notFound("Photo");
      return c.body(null, 204);
    },
  );
