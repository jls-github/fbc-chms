import { createRoute } from "@hono/zod-openapi";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { deleteCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { z } from "zod";
import {
  ChangePasswordInput,
  ErrorResponse,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  TokenInput,
  TokenResponse,
  User,
} from "@shared/schemas";
import { dummyDigest, hashPassword, hashToken, newToken, verifyPassword } from "../auth/crypto";
import { SESSION_COOKIE } from "../auth/middleware";
import { createSession, destroySession } from "../auth/sessions";
import type { Db } from "../db/client";
import { passwordResets, sessions, users } from "../db/schema";
import { env } from "../env";
import { ApiError } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, noContent, security, validationError } from "../lib/openapi";
import { rateLimiter } from "../lib/rate-limit";
import { createRouter, type AppEnv, type AuthUser } from "../lib/router";

export const authLimiter = rateLimiter({ limit: 10, windowMs: 5 * 60 * 1000 });

const tooMany = { 429: jsonContent(ErrorResponse, "Too many attempts") } as const;
const UserEnvelope = z.object({ user: User });

export const serializeUser = (u: AuthUser) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  createdAt: u.createdAt.toISOString(),
});

const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

async function authenticate(c: Context<AppEnv>, db: Db, email: string, password: string) {
  if (authLimiter.hit(`${clientIp(c)}:${email.toLowerCase()}`)) {
    throw new ApiError(429, "Too many sign-in attempts. Please wait a few minutes and try again.");
  }
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);
  // Always run bcrypt so response timing doesn't reveal which emails exist.
  const ok = await verifyPassword(password, user?.passwordDigest ?? (await dummyDigest()));
  if (!user || !ok) throw new ApiError(401, "That email and password don't match our records.");
  return user;
}

export const authRoutes = createRouter()
  .openapi(
    createRoute({
      method: "post",
      path: "/auth/login",
      tags: ["Auth"],
      summary: "Sign in (web)",
      description: "Starts a browser session and sets an httpOnly session cookie.",
      request: jsonBody(LoginInput),
      responses: { 200: jsonContent(UserEnvelope), 401: jsonContent(ErrorResponse, "Bad credentials"), ...tooMany, ...validationError },
    }),
    async (c) => {
      const { email, password } = c.req.valid("json");
      const { db } = c.var.deps;
      const user = await authenticate(c, db, email, password);
      const { token, expiresAt } = await createSession(db, user.id, "web", {
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent"),
      });
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "Lax",
        path: "/",
        expires: expiresAt,
      });
      return c.json({ user: serializeUser(user) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/auth/token",
      tags: ["Auth"],
      summary: "Issue an API token (mobile apps)",
      description: "Returns a long-lived bearer token. Send it as `Authorization: Bearer <token>`.",
      request: jsonBody(TokenInput),
      responses: { 200: jsonContent(TokenResponse), 401: jsonContent(ErrorResponse, "Bad credentials"), ...tooMany, ...validationError },
    }),
    async (c) => {
      const { email, password, deviceName } = c.req.valid("json");
      const { db } = c.var.deps;
      const user = await authenticate(c, db, email, password);
      const { token, expiresAt } = await createSession(db, user.id, "api", {
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent"),
        label: deviceName ?? null,
      });
      return c.json({ token, expiresAt: expiresAt.toISOString(), user: serializeUser(user) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/auth/password/forgot",
      tags: ["Auth"],
      summary: "Email a password reset link",
      description: "Always responds 202 so the response doesn't reveal whether an account exists.",
      request: jsonBody(ForgotPasswordInput),
      responses: { 202: { description: "Accepted" }, ...tooMany, ...validationError },
    }),
    async (c) => {
      const { email } = c.req.valid("json");
      if (authLimiter.hit(`forgot:${clientIp(c)}`)) throw new ApiError(429, "Too many requests. Try again shortly.");
      const { db, mailer } = c.var.deps;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
        .limit(1);
      if (user) {
        const token = newToken();
        await db.insert(passwordResets).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
        const link = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
        await mailer({
          to: user.email,
          subject: "Reset your FBC Church Management password",
          text: `Someone asked to reset the password for ${user.email}.\n\nReset it within the next hour here:\n${link}\n\nIf this wasn't you, you can ignore this email.`,
        });
      }
      return c.body(null, 202);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/auth/password/reset",
      tags: ["Auth"],
      summary: "Set a new password using a reset token",
      request: jsonBody(ResetPasswordInput),
      responses: { ...noContent, 400: jsonContent(ErrorResponse, "Invalid or expired token"), ...validationError },
    }),
    async (c) => {
      const { token, password } = c.req.valid("json");
      const { db } = c.var.deps;
      const [reset] = await db
        .select()
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.tokenHash, hashToken(token)),
            gt(passwordResets.expiresAt, new Date()),
            isNull(passwordResets.usedAt),
          ),
        )
        .limit(1);
      if (!reset) throw new ApiError(400, "That reset link is invalid or has expired. Please request a new one.");

      const digest = await hashPassword(password);
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordDigest: digest }).where(eq(users.id, reset.userId));
        await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
        // Sign out everywhere: whoever had the old password shouldn't keep access.
        await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
      });
      return c.body(null, 204);
    },
  )
  // Everything below requires a signed-in user (enforced in app.ts).
  .openapi(
    createRoute({
      method: "get",
      path: "/auth/me",
      tags: ["Auth"],
      summary: "The signed-in user",
      security,
      responses: { 200: jsonContent(UserEnvelope), ...authErrors },
    }),
    (c) => c.json({ user: serializeUser(c.var.user) }, 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/auth/logout",
      tags: ["Auth"],
      summary: "Sign out (revokes the current session or token)",
      security,
      responses: { ...noContent, ...authErrors },
    }),
    async (c) => {
      await destroySession(c.var.deps.db, c.var.session.id);
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/auth/password/change",
      tags: ["Auth"],
      summary: "Change the signed-in user's password",
      security,
      request: jsonBody(ChangePasswordInput),
      responses: { ...noContent, ...authErrors, ...validationError },
    }),
    async (c) => {
      const { currentPassword, newPassword } = c.req.valid("json");
      const { db } = c.var.deps;
      const [user] = await db.select().from(users).where(eq(users.id, c.var.user.id));
      if (!user || !(await verifyPassword(currentPassword, user.passwordDigest))) {
        throw new ApiError(422, "Please fix the highlighted fields.", { currentPassword: ["Current password is incorrect"] });
      }
      await db.update(users).set({ passwordDigest: await hashPassword(newPassword) }).where(eq(users.id, user.id));
      return c.body(null, 204);
    },
  );
