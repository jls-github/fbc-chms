/**
 * Privacy-preserving usage statistics.
 *
 * What we keep:
 * - Anonymous daily counters (usage_counters): "directory viewed 12 times on
 *   Sept 27". No user, device, IP or content details.
 * - How many people were active per day/week/month (usage_active_totals).
 *
 * How active people are counted without tracking them: while a period is open,
 * each active account is stored as HMAC(period key, account id) so it's counted
 * once. Every period has its own random key, so hashes can't be linked across
 * periods. When the period ends we store only the total and delete the hashes
 * and the key — after that nobody (including us) can tell who was active.
 *
 * Nothing is recorded for accounts that opted out, or for browsers sending
 * Global Privacy Control / Do Not Track. Aggregates are deleted after 25 months.
 */
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { weekStart } from "@shared/rolling";
import type { Db } from "../db/client";
import { appSettings, usageActives, usageActiveTotals, usageCounters } from "../db/schema";
import { serviceDate } from "./church-time";

export type Period = "day" | "week" | "month";
const PERIODS: Period[] = ["day", "week", "month"];

/** Member app platforms, plus the staff site. "app" / "staff" are the rolled-up groups. */
export type Platform = "ios" | "android" | "web" | "other" | "staff";
export const RETENTION_MONTHS = 25;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nextMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

export function periodStarts(today: string): Record<Period, string> {
  return { day: today, week: weekStart(today), month: `${today.slice(0, 7)}-01` };
}

const periodEnd = (period: Period, start: string) => (period === "day" ? addDays(start, 1) : period === "week" ? addDays(start, 7) : nextMonth(start));

// --------------------------------------------------------------- keys

const keyCache = new Map<string, Buffer>();
const settingKey = (period: Period, start: string) => `usage_key:${period}:${start}`;

async function periodKey(db: Db, period: Period, start: string) {
  const name = settingKey(period, start);
  const cached = keyCache.get(name);
  if (cached) return cached;
  await db.insert(appSettings).values({ key: name, value: randomBytes(32).toString("base64url") }).onConflictDoNothing();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, name));
  const key = Buffer.from(row!.value, "base64url");
  keyCache.set(name, key);
  return key;
}

// ------------------------------------------------------------ recording

/** Whether this request may be counted: honors the account setting and browser privacy signals. */
export function mayTrack(optedOut: boolean, headers: { get(name: string): string | undefined }) {
  return !optedOut && headers.get("sec-gpc") !== "1" && headers.get("dnt") !== "1";
}

/** Which surface a session is using, from how it signed in. */
export function platformFor(session: { kind: string; label: string | null }, path: string): Platform | null {
  if (session.kind === "kiosk") return null;
  if (session.kind === "web") return path.includes("/app/") ? "web" : "staff";
  const label = (session.label ?? "").toLowerCase();
  if (label.includes("iphone") || label.includes("ipad") || label.includes("ios")) return "ios";
  if (label.includes("android")) return "android";
  if (label.includes("web")) return "web";
  return "other";
}

const groupOf = (p: Platform) => (p === "staff" ? "staff" : "app");

// Remembers who's already been counted this period, so most requests skip the database.
const seen = new Set<string>();

export async function recordActive(db: Db, accountId: number, platform: Platform, now = new Date()) {
  const starts = periodStarts(serviceDate(now));
  const rows: (typeof usageActives.$inferInsert)[] = [];
  const memos: string[] = [];
  for (const period of PERIODS) {
    for (const plat of [platform, groupOf(platform)]) {
      const memo = `${period}:${starts[period]}:${plat}:${accountId}`;
      if (seen.has(memo)) continue;
      memos.push(memo);
      const key = await periodKey(db, period, starts[period]);
      const visitor = createHmac("sha256", key).update(String(accountId)).digest("base64url");
      rows.push({ period, periodStart: starts[period], platform: plat, visitor });
    }
  }
  if (rows.length) await db.insert(usageActives).values(rows).onConflictDoNothing();
  if (seen.size > 100_000) seen.clear();
  for (const memo of memos) seen.add(memo);
}

/**
 * Removes someone from the still-open periods' active counts (when they opt
 * out). Closed periods are already just totals and can't be traced to anyone.
 */
export async function forgetActive(db: Db, accountId: number, now = new Date()) {
  const starts = periodStarts(serviceDate(now));
  for (const period of PERIODS) {
    const key = await periodKey(db, period, starts[period]);
    const visitor = createHmac("sha256", key).update(String(accountId)).digest("base64url");
    await db
      .delete(usageActives)
      .where(and(eq(usageActives.period, period), eq(usageActives.periodStart, starts[period]), eq(usageActives.visitor, visitor)));
  }
  for (const memo of [...seen]) if (memo.endsWith(`:${accountId}`)) seen.delete(memo);
}

/** Adds to an anonymous daily counter. */
export async function countEvent(db: Db, metric: string, dimension = "", by = 1, now = new Date()) {
  await db
    .insert(usageCounters)
    .values({ day: serviceDate(now), metric, dimension, count: by })
    .onConflictDoUpdate({
      target: [usageCounters.day, usageCounters.metric, usageCounters.dimension],
      set: { count: sql`${usageCounters.count} + ${by}` },
    });
}

// --------------------------------------------------------------- rollup

/**
 * Finishes every period that has ended: keeps the totals, deletes the hashes
 * and the period's key. Also applies the retention limit. Safe to run often.
 */
export async function rollUpUsage(db: Db, now = new Date()) {
  const today = serviceDate(now);
  const open = await db.selectDistinct({ period: usageActives.period, periodStart: usageActives.periodStart }).from(usageActives);
  for (const { period, periodStart } of open) {
    if (periodEnd(period, periodStart) > today) continue;
    await db.transaction(async (tx) => {
      const totals = await tx
        .select({ platform: usageActives.platform, n: sql<number>`count(*)::int` })
        .from(usageActives)
        .where(and(eq(usageActives.period, period), eq(usageActives.periodStart, periodStart)))
        .groupBy(usageActives.platform);
      if (totals.length) {
        await tx
          .insert(usageActiveTotals)
          .values(totals.map((t) => ({ period, periodStart, platform: t.platform, count: t.n })))
          .onConflictDoUpdate({
            target: [usageActiveTotals.period, usageActiveTotals.periodStart, usageActiveTotals.platform],
            set: { count: sql`excluded.count` },
          });
      }
      await tx.delete(usageActives).where(and(eq(usageActives.period, period), eq(usageActives.periodStart, periodStart)));
      await tx.delete(appSettings).where(eq(appSettings.key, settingKey(period, periodStart)));
    });
    keyCache.delete(settingKey(period, periodStart));
  }
  // Periods that ended with nobody active still leave a key behind; remove those too.
  const staleKeys = await db.select({ key: appSettings.key }).from(appSettings).where(sql`${appSettings.key} like 'usage_key:%'`);
  for (const { key } of staleKeys) {
    const [, period, start] = key.split(":") as [string, Period, string];
    if (periodEnd(period, start) <= today) {
      await db.delete(appSettings).where(eq(appSettings.key, key));
      keyCache.delete(key);
    }
  }
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  await db.delete(usageCounters).where(lt(usageCounters.day, cutoffDay));
  await db.delete(usageActiveTotals).where(lt(usageActiveTotals.periodStart, cutoffDay));
}

// --------------------------------------------------------------- reading

/** Distinct active accounts for each platform in a period (live if still open, else the stored total). */
export async function activeCounts(db: Db, period: Period, starts: string[]) {
  if (starts.length === 0) return [];
  const [live, closed] = await Promise.all([
    db
      .select({ periodStart: usageActives.periodStart, platform: usageActives.platform, n: sql<number>`count(*)::int` })
      .from(usageActives)
      .where(and(eq(usageActives.period, period), inArray(usageActives.periodStart, starts)))
      .groupBy(usageActives.periodStart, usageActives.platform),
    db
      .select({ periodStart: usageActiveTotals.periodStart, platform: usageActiveTotals.platform, n: usageActiveTotals.count })
      .from(usageActiveTotals)
      .where(and(eq(usageActiveTotals.period, period), inArray(usageActiveTotals.periodStart, starts))),
  ]);
  return [...closed, ...live];
}

export async function counterTotals(db: Db, since: string) {
  return db
    .select({ metric: usageCounters.metric, dimension: usageCounters.dimension, n: sql<number>`sum(${usageCounters.count})::int` })
    .from(usageCounters)
    .where(gte(usageCounters.day, since))
    .groupBy(usageCounters.metric, usageCounters.dimension);
}

// Background writes in flight, so tests (and shutdown) can wait for them.
const inflight = new Set<Promise<unknown>>();
export function inBackground(p: Promise<unknown>, what: string) {
  const tracked = p.catch((err) => console.error(`usage: couldn't ${what}`, err)).finally(() => inflight.delete(tracked));
  inflight.add(tracked);
}
export const flushUsage = () => Promise.all([...inflight]);

export const resetUsageCaches = () => {
  seen.clear();
  keyCache.clear();
};
export { addDays };
