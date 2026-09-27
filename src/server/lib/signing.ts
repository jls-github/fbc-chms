import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { appSettings } from "../db/schema";

const KEY = "url_signing_secret";
let cached: Buffer | undefined;

/** A server-wide secret for signed URLs, created on first use and kept in the database. */
async function secret(db: Db): Promise<Buffer> {
  if (cached) return cached;
  await db.insert(appSettings).values({ key: KEY, value: randomBytes(32).toString("base64url") }).onConflictDoNothing();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  cached = Buffer.from(row!.value, "base64url");
  return cached;
}

export const resetSigningCache = () => {
  cached = undefined;
};

const mac = (key: Buffer, payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

/** Signs `payload` until `expiresAt` (seconds since epoch). */
export async function sign(db: Db, payload: string, expiresAt: number) {
  return mac(await secret(db), `${payload}:${expiresAt}`);
}

export async function verify(db: Db, payload: string, expiresAt: number, signature: string) {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = Buffer.from(await sign(db, payload, expiresAt));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
