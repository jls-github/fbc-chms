import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { hashPassword } from "../src/server/auth/crypto";
import { createApp } from "../src/server/app";
import { MIGRATIONS_FOLDER, type Db } from "../src/server/db/client";
import * as schema from "../src/server/db/schema";
import type { Mail } from "../src/server/lib/mailer";
import { authLimiter } from "../src/server/routes/auth";
import { leaderReportLimits } from "../src/server/routes/report-links";
import { memberAppLimits } from "../src/server/routes/member-app";
import { resetSigningCache } from "../src/server/lib/signing";
import { flushUsage, resetUsageCaches } from "../src/server/lib/usage";
import { resetSermonCache } from "../src/server/lib/sermons";
import { resetFacebookCache, type FacebookClient } from "../src/server/lib/facebook";
import type { Sermon } from "../src/shared/schemas";

export const PASSWORD = "correct horse battery";

/** A fresh in-memory Postgres (PGlite) with migrations applied, plus the app wired to it. */
export async function createTestContext() {
  const pglite = new PGlite();
  const pg = drizzle(pglite, { schema });
  await migrate(pg, { migrationsFolder: MIGRATIONS_FOLDER });
  const db = pg as unknown as Db;
  const mail: Mail[] = [];
  const sermons: Sermon[] = [];
  /** A fake Facebook Page: records what's published; set `fail` to make publishing throw. */
  const fb = { published: [] as { message: string; link: string }[], fail: null as string | null };
  const facebook: FacebookClient = {
    pageId: "1234",
    async publish(message, link) {
      if (fb.fail) throw new Error(fb.fail);
      fb.published.push({ message, link });
      return `1234_${fb.published.length}`;
    },
    async page() {
      return { id: "1234", name: "FBC Enumclaw", link: "https://www.facebook.com/1234", dataAccessExpiresAt: null };
    },
  };
  const app = createApp({ db, mailer: async (m) => void mail.push(m), scrapeSermons: async () => sermons, facebook });

  async function reset() {
    await flushUsage();
    authLimiter.reset();
    leaderReportLimits.reset();
    resetSigningCache();
    resetUsageCaches();
    resetSermonCache();
    resetFacebookCache();
    fb.published.length = 0;
    fb.fail = null;
    sermons.length = 0;
    memberAppLimits.reset();
    mail.length = 0;
    await db.execute(
      sql.raw(
        "truncate facebook_posts, usage_counters, usage_actives, usage_active_totals, chat_reads, chat_messages, app_settings, family_photos, checkins, report_links, attendance_reports, team_memberships, group_memberships, teams, groups, members, families, password_resets, sessions, users restart identity cascade",
      ),
    );
  }

  async function createUser(email = "admin@test.org", role: "admin" | "staff" = "admin") {
    const [user] = await db
      .insert(schema.users)
      .values({ email, role, passwordDigest: await hashPassword(PASSWORD) })
      .returning();
    return user!;
  }

  /** Signs in with the cookie flow and returns a request helper that sends the cookie. */
  async function signIn(email = "admin@test.org", role: "admin" | "staff" = "admin") {
    await createUser(email, role);
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    return { ...client(cookie), cookie };
  }

  function client(cookie?: string) {
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await app.request(`/api/v1${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = text ? JSON.parse(text) : null;
      return { status: res.status, json, headers: res.headers };
    };
    return {
      get: (p: string, h?: Record<string, string>) => call("GET", p, undefined, h),
      post: (p: string, b?: unknown, h?: Record<string, string>) => call("POST", p, b ?? {}, h),
      patch: (p: string, b: unknown, h?: Record<string, string>) => call("PATCH", p, b, h),
      delete: (p: string, h?: Record<string, string>) => call("DELETE", p, undefined, h),
    };
  }

  return { app, db, mail, sermons, fb, facebook, reset, createUser, signIn, client, close: () => pglite.close() };
}
