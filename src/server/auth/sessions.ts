import type { SessionKind } from "@shared/constants";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";
import { hashToken, newToken } from "./crypto";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL: Record<SessionKind, number> = { web: 30 * DAY, api: 365 * DAY, kiosk: 365 * DAY };

type SessionMeta = { ipAddress?: string | null; userAgent?: string | null; label?: string | null };

export async function createSession(db: Db, userId: number, kind: SessionKind, meta: SessionMeta = {}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL[kind]);
  await db.insert(sessions).values({
    userId,
    kind,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
    label: meta.label ?? null,
  });
  return { token, expiresAt };
}

export async function findSession(db: Db, token: string) {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  // Web sessions slide forward while in use; touch at most hourly to limit writes.
  const now = Date.now();
  if (now - row.session.lastUsedAt.getTime() > 60 * 60 * 1000) {
    const patch: Partial<typeof sessions.$inferInsert> = { lastUsedAt: new Date(now) };
    if (row.session.kind === "web") patch.expiresAt = new Date(now + SESSION_TTL.web);
    await db.update(sessions).set(patch).where(eq(sessions.id, row.session.id));
  }
  return row;
}

export async function destroySession(db: Db, sessionId: number) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
