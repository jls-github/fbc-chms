import { OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db/client";
import type { Mailer } from "./mailer";
import type { SessionKind, UserRole } from "@shared/constants";

export type AppDeps = { db: Db; mailer: Mailer };

export type AuthUser = { id: number; email: string; name: string | null; role: UserRole; createdAt: Date };
export type AuthSession = { id: number; kind: SessionKind; label: string | null };

export type AppEnv = {
  Variables: { deps: AppDeps; user: AuthUser; session: AuthSession };
};

/** An OpenAPI-aware router whose validation failures use our standard 422 error shape. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (result.success) return;
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return c.json({ error: { message: "Please fix the highlighted fields.", fieldErrors } }, 422);
    },
  });
}
