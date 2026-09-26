import { createRoute } from "@hono/zod-openapi";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { IdParam, User, UserInput, UserPatch } from "@shared/schemas";
import { hashPassword } from "../auth/crypto";
import { requireRole } from "../auth/middleware";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { ApiError, notFound } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, notFoundError, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { serializeUser } from "./auth";

const tags = ["Staff accounts"];

async function assertAnotherAdmin(db: Db, exceptId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), ne(users.id, exceptId)));
  if (!row || row.n === 0) throw new ApiError(422, "There must always be at least one admin.");
}

export const userRoutes = createRouter();
userRoutes.use("/users", requireRole("admin"));
userRoutes.use("/users/*", requireRole("admin"));

userRoutes
  .openapi(
    createRoute({
      method: "get",
      path: "/users",
      tags,
      summary: "List staff accounts (admin only)",
      security,
      responses: { 200: jsonContent(z.object({ users: z.array(User) })), ...authErrors },
    }),
    async (c) => {
      const rows = await c.var.deps.db.select().from(users).orderBy(users.email);
      return c.json({ users: rows.map(serializeUser) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/users",
      tags,
      summary: "Create a staff account (admin only)",
      security,
      request: jsonBody(UserInput),
      responses: {
        201: jsonContent(z.object({ user: User }), "Created"),
        ...authErrors,
        ...validationError,
      },
    }),
    async (c) => {
      const { password, email, ...rest } = c.req.valid("json");
      const { db } = c.var.deps;
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(sql`lower(${users.email})`, email.toLowerCase()));
      if (existing) {
        throw new ApiError(422, "Please fix the highlighted fields.", { email: ["Someone already uses that email"] });
      }
      const [user] = await db
        .insert(users)
        .values({ ...rest, email: email.toLowerCase(), passwordDigest: await hashPassword(password) })
        .returning();
      return c.json({ user: serializeUser(user!) }, 201);
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/users/{id}",
      tags,
      summary: "Update a staff account's name or role (admin only)",
      security,
      request: { params: IdParam, ...jsonBody(UserPatch) },
      responses: { 200: jsonContent(z.object({ user: User })), ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const { db } = c.var.deps;
      if (input.role && input.role !== "admin") await assertAnotherAdmin(db, id);
      const [user] = Object.keys(input).length
        ? await db.update(users).set(input).where(eq(users.id, id)).returning()
        : await db.select().from(users).where(eq(users.id, id));
      if (!user) throw notFound("User");
      return c.json({ user: serializeUser(user) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/users/{id}",
      tags,
      summary: "Delete a staff account (admin only)",
      security,
      request: { params: IdParam },
      responses: { ...noContent, ...authErrors, ...notFoundError, ...validationError },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      if (id === c.var.user.id) throw new ApiError(422, "You can't delete your own account.");
      const { db } = c.var.deps;
      const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
      if (deleted.length === 0) throw notFound("User");
      return c.body(null, 204);
    },
  );
