import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { UserRole } from "@shared/constants";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../lib/router";
import { findSession } from "./sessions";

export const SESSION_COOKIE = "fbc_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Accepts either `Authorization: Bearer <token>` (mobile / API clients) or the
 * httpOnly session cookie (web app). Cookie-authenticated writes must come from
 * our own origin, which together with SameSite=Lax blocks CSRF.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization");
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer ?? getCookie(c, SESSION_COOKIE);
  if (!token) throw new ApiError(401, "Please sign in.");

  if (!bearer && !SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header("origin");
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (origin && host && new URL(origin).host !== host) {
      throw new ApiError(403, "Cross-origin request blocked.");
    }
  }

  const found = await findSession(c.var.deps.db, token);
  if (!found) throw new ApiError(401, "Your session has expired. Please sign in again.");

  const { user, session } = found;
  if (user.status === "disabled" || user.status === "invited") {
    throw new ApiError(401, "This account can't sign in right now. Please contact the church office.");
  }
  c.set("user", {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role,
    status: user.status,
    memberId: user.memberId,
    createdAt: user.createdAt,
  });
  c.set("session", { id: session.id, kind: session.kind, label: session.label });
  await next();
});

export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.var.user.role)) throw new ApiError(403, "You don't have permission to do that.");
    await next();
  });
