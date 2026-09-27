import { OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db/client";
import type { Mailer } from "./mailer";
import type { SessionKind, UserRole, UserStatus } from "@shared/constants";
import type { Sermon } from "@shared/schemas";

export type AppDeps = {
  db: Db;
  mailer: Mailer;
  /** Where recent sermons come from (the church website by default; tests pass a fake). */
  scrapeSermons?: () => Promise<Sermon[]>;
};

export type AuthUser = {
  id: number;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  memberId: number | null;
  usageOptOut: boolean;
  createdAt: Date;
};

/** A human-readable label for audit trails ("checked out by …"). */
export const whoIs = (u: Pick<AuthUser, "id" | "email" | "phone" | "name">) => u.email ?? u.name ?? u.phone ?? `account #${u.id}`;
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
