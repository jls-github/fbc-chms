/**
 * Posts each Sunday's sermon to the church's Facebook Page on Monday morning.
 *
 * The Page ID and a Page access token come from FACEBOOK_PAGE_ID and
 * FACEBOOK_PAGE_TOKEN (see docs/DEPLOYING.md for getting them). A timer in
 * index.ts calls runFacebookJob every 15 minutes; between 8am and noon on
 * Monday (church time) it looks for a sermon on the website dated the day
 * before and posts it once, as a link post so Facebook shows the sermon
 * page's artwork. If none has appeared by noon, admins get an email instead.
 * One row per Sunday in facebook_posts guarantees a week is never posted twice.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Sermon } from "@shared/schemas";
import type { Db } from "../db/client";
import { appSettings, facebookPosts, users } from "../db/schema";
import { env } from "../env";
import { churchClock, serviceDate, sundayOnOrBefore } from "./church-time";
import type { AppDeps } from "./router";
import { scrapeSermons } from "./sermons";

const GRAPH = "https://graph.facebook.com/v25.0";

export const POST_WEEKDAY = 1; // Monday
export const POST_FROM_HOUR = 8;
export const GIVE_UP_HOUR = 12;
export const MAX_ATTEMPTS = 3;
/** Admins are warned this long before Facebook's data-access date passes. */
const EXPIRY_WARNING_DAYS = 14;

export type FacebookPage = { id: string; name: string; link: string | null; dataAccessExpiresAt: string | null };

export type FacebookClient = {
  pageId: string;
  /** Publishes a post with a link preview and returns the new post's ID. */
  publish(message: string, link: string): Promise<string>;
  page(): Promise<FacebookPage>;
};

async function graph<T>(token: string, path: string, body?: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}` },
    body: body ? new URLSearchParams(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Facebook returned ${res.status}`);
  return json;
}

export function graphClient(pageId: string, token: string): FacebookClient {
  return {
    pageId,
    async publish(message, link) {
      const { id } = await graph<{ id: string }>(token, `/${pageId}/feed`, { message, link });
      return id;
    },
    async page() {
      const [page, debug] = await Promise.all([
        graph<{ id: string; name: string; link?: string }>(token, `/${pageId}?fields=id,name,link`),
        graph<{ data?: { data_access_expires_at?: number } }>(token, `/debug_token?input_token=${encodeURIComponent(token)}`).catch(() => ({ data: undefined })),
      ]);
      const expires = debug.data?.data_access_expires_at;
      return { id: page.id, name: page.name, link: page.link ?? null, dataAccessExpiresAt: expires ? new Date(expires * 1000).toISOString() : null };
    },
  };
}

/** The Page client from FACEBOOK_PAGE_ID / FACEBOOK_PAGE_TOKEN, or undefined when they aren't set. */
export function facebookFromEnv(): FacebookClient | undefined {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_TOKEN;
  return pageId && token ? graphClient(pageId, token) : undefined;
}

// ---------------------------------------------------------------------------
// Settings and the message
// ---------------------------------------------------------------------------

const AUTO_POST_KEY = "facebook_auto_post";
const TEMPLATE_KEY = "facebook_post_template";
const EXPIRY_WARNED_KEY = "facebook_expiry_warned";
const ERROR_WARNED_KEY = "facebook_error_warned";

export const DEFAULT_TEMPLATE = "Sunday's sermon: {title}\n{series} · {speaker}";
export const TEMPLATE_FIELDS = ["title", "series", "speaker", "date", "url"] as const;

async function getSetting(db: Db, key: string) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value;
}

async function setSetting(db: Db, key: string, value: string | null) {
  if (value === null) await db.delete(appSettings).where(eq(appSettings.key, key));
  else await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function facebookSettings(db: Db) {
  const [autoPost, template] = await Promise.all([getSetting(db, AUTO_POST_KEY), getSetting(db, TEMPLATE_KEY)]);
  return { autoPost: autoPost === "true", template: template ?? DEFAULT_TEMPLATE };
}

export async function saveFacebookSettings(db: Db, changes: { autoPost?: boolean; template?: string | null }) {
  if (changes.autoPost !== undefined) await setSetting(db, AUTO_POST_KEY, String(changes.autoPost));
  if (changes.template !== undefined) await setSetting(db, TEMPLATE_KEY, changes.template?.trim() || null);
}

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * Fills in {title}, {series}, {speaker}, {date} and {url}. A line whose fields
 * are all blank is dropped, and separators left dangling (" · Pastor") are trimmed.
 */
export function renderMessage(template: string, sermon: Sermon): string {
  const values: Record<string, string> = {
    title: sermon.title,
    series: sermon.series ?? "",
    speaker: sermon.speaker ?? "",
    date: sermon.date ? longDate(sermon.date) : "",
    url: sermon.url,
  };
  const lines: string[] = [];
  for (const line of template.split("\n")) {
    const fields = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((f) => f in values);
    const filled = line.replace(/\{(\w+)\}/g, (m, f: string) => values[f] ?? m);
    if (fields.length && fields.every((f) => !values[f])) continue;
    lines.push(fields.length ? filled.replace(/([·•|])(\s*[·•|])+/g, "$1").replace(/^[\s·•|–—-]+|[\s·•|–—-]+$/g, "") : filled);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

export type FacebookPostRow = typeof facebookPosts.$inferSelect;

/** The Sunday whose sermon is posted this week: today if it's Sunday, else the one before. */
export const currentSunday = (now = new Date()) => sundayOnOrBefore(churchClock(now).date);

export async function postForSunday(db: Db, sunday: string) {
  const [row] = await db.select().from(facebookPosts).where(eq(facebookPosts.sunday, sunday));
  return row;
}

/** That Sunday's sermon, fresh from the church website (never the cached list). */
export async function sermonFor(deps: AppDeps, sunday: string) {
  const sermons = await (deps.scrapeSermons ?? scrapeSermons)();
  return sermons.find((s) => s.date === sunday) ?? null;
}

type Status = FacebookPostRow["status"];

/**
 * Claims the week and posts it. Only a week in one of `from` (or with no row
 * yet) is claimed, so two runs can never both post. Returns the week's row,
 * or null if it was already taken.
 */
export async function publishSermon(
  deps: AppDeps & { facebook: FacebookClient },
  sunday: string,
  sermon: Sermon,
  opts: { template: string; from: Status[]; byUserId?: number | null },
): Promise<FacebookPostRow | null> {
  const { db } = deps;
  const message = renderMessage(opts.template, sermon);
  const values = { status: "posting" as const, sermonId: sermon.id, sermonTitle: sermon.title, message, link: sermon.url, error: null, byUserId: opts.byUserId ?? null };
  const [claimed] = await db
    .insert(facebookPosts)
    .values({ sunday, ...values, attempts: 1 })
    .onConflictDoUpdate({
      target: facebookPosts.sunday,
      set: { ...values, attempts: sql`${facebookPosts.attempts} + 1` },
      setWhere: inArray(facebookPosts.status, opts.from),
    })
    .returning();
  if (!claimed) return null;

  try {
    const facebookPostId = await deps.facebook.publish(message, sermon.url);
    const [posted] = await db
      .update(facebookPosts)
      .set({ status: "posted", facebookPostId, postedAt: new Date() })
      .where(eq(facebookPosts.id, claimed.id))
      .returning();
    return posted!;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`facebook: couldn't post the sermon for ${sunday}:`, error);
    const [failed] = await db.update(facebookPosts).set({ status: "failed", error }).where(eq(facebookPosts.id, claimed.id)).returning();
    return failed!;
  }
}

async function emailAdmins(deps: AppDeps, subject: string, text: string) {
  const admins = await deps.db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active"), isNotNull(users.email)));
  const body = `${text}\n\nFacebook settings: ${env.appUrl}/settings`;
  for (const { email } of admins) {
    await deps.mailer({ to: email!, subject, text: body }).catch((err) => console.error("facebook: couldn't email", email, err));
  }
}

/** Monday morning: post Sunday's sermon if it's on the website and this week hasn't been handled. */
export async function runFacebookJob(deps: AppDeps, now = new Date()) {
  const { facebook, db } = deps;
  if (!facebook) return;
  const settings = await facebookSettings(db);
  if (!settings.autoPost) return;
  const clock = churchClock(now);
  if (clock.weekday !== POST_WEEKDAY || clock.hour < POST_FROM_HOUR) return;

  const sunday = sundayOnOrBefore(clock.date);
  const existing = await postForSunday(db, sunday);
  if (existing && !(existing.status === "failed" && existing.attempts < MAX_ATTEMPTS)) return;

  let sermon: Sermon | null;
  try {
    sermon = await sermonFor(deps, sunday);
  } catch (err) {
    console.error("facebook: couldn't load sermons from the church website:", err);
    return;
  }

  if (!sermon) {
    if (existing || clock.hour < GIVE_UP_HOUR) return; // keep checking until noon
    const [missing] = await db.insert(facebookPosts).values({ sunday, status: "missing" }).onConflictDoNothing().returning();
    if (missing) {
      await emailAdmins(
        deps,
        "Sunday's sermon wasn't posted to Facebook",
        `The sermon from ${longDate(sunday)} wasn't on fbcenumclaw.com by noon, so it wasn't posted to Facebook.\n\nOnce it's on the website, you can post it from Settings with “Post now”.`,
      );
    }
    return;
  }

  const row = await publishSermon({ ...deps, facebook }, sunday, sermon, { template: settings.template, from: ["failed"] });
  if (row?.status === "failed" && row.attempts >= MAX_ATTEMPTS) {
    await emailAdmins(
      deps,
      "Sunday's sermon couldn't be posted to Facebook",
      `Posting “${sermon.title}” to Facebook failed ${MAX_ATTEMPTS} times. Facebook said:\n\n${row.error}\n\nIf the Page token has stopped working, generate a new one (see docs/DEPLOYING.md). You can retry from Settings with “Post now”.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Page status (for Settings and the daily token check)
// ---------------------------------------------------------------------------

const PAGE_CACHE_MS = 5 * 60 * 1000;
let pageCache: { at: number; page: FacebookPage | null; error: string | null } | undefined;

export const resetFacebookCache = () => {
  pageCache = undefined;
};

/** The connected Page, or the error Facebook gave. Cached for 5 minutes. */
export async function pageStatus(facebook: FacebookClient, fresh = false) {
  if (!fresh && pageCache && Date.now() - pageCache.at < PAGE_CACHE_MS) return pageCache;
  try {
    pageCache = { at: Date.now(), page: await facebook.page(), error: null };
  } catch (err) {
    pageCache = { at: Date.now(), page: null, error: err instanceof Error ? err.message : String(err) };
  }
  return pageCache;
}

/**
 * Once a day: email admins if the token stops working, or when Facebook's
 * data-access date is close (each warning is sent once).
 */
export async function checkFacebookToken(deps: AppDeps, now = new Date()) {
  const { facebook, db } = deps;
  if (!facebook) return;
  const { page, error } = await pageStatus(facebook, true);
  if (error) {
    if (!(await getSetting(db, ERROR_WARNED_KEY))) {
      await setSetting(db, ERROR_WARNED_KEY, now.toISOString());
      await emailAdmins(deps, "The Facebook connection has stopped working", `Facebook rejected the Page token:\n\n${error}\n\nSermons won't be posted until a new token is set up (see docs/DEPLOYING.md).`);
    }
    return;
  }
  await setSetting(db, ERROR_WARNED_KEY, null);
  const expires = page?.dataAccessExpiresAt;
  if (!expires || Date.parse(expires) - now.getTime() > EXPIRY_WARNING_DAYS * 86_400_000) return;
  if ((await getSetting(db, EXPIRY_WARNED_KEY)) === expires) return;
  await setSetting(db, EXPIRY_WARNED_KEY, expires);
  await emailAdmins(
    deps,
    "Renew the Facebook connection",
    `Facebook's data access for the church's Page ends on ${longDate(serviceDate(new Date(expires)))}. To keep Monday sermon posts working, a Page admin should reconnect the app in the Graph API Explorer and generate a new Page token (see docs/DEPLOYING.md).`,
  );
}

/** Runs the weekly job every 15 minutes and the token check daily. */
export function startFacebookSchedule(deps: AppDeps) {
  if (!deps.facebook) {
    console.info("facebook: FACEBOOK_PAGE_ID / FACEBOOK_PAGE_TOKEN not set; sermon posts are off.");
    return;
  }
  let checkedOn = "";
  const tick = async () => {
    try {
      const today = churchClock().date;
      if (today !== checkedOn) {
        checkedOn = today;
        await checkFacebookToken(deps);
      }
      await runFacebookJob(deps);
    } catch (err) {
      console.error("facebook: scheduled run failed", err);
    }
  };
  void tick();
  setInterval(tick, 15 * 60 * 1000).unref();
}
