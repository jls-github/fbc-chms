/**
 * Recent sermons from the church website (fbcenumclaw.com, a SnapPages site
 * whose media library is powered by Subsplash). Subsplash's own API needs a
 * key, so we read the public pages: /media lists series newest-first, and
 * each series page lists its sermons with date and speaker.
 */
import type { Sermon } from "@shared/schemas";

export const SERMON_SITE = () => (process.env.SERMON_SITE ?? "https://fbcenumclaw.com").replace(/\/$/, "");
const SUBSPLASH_ACCOUNT = () => process.env.SUBSPLASH_ACCOUNT ?? "T9N865";

const CACHE_MS = 30 * 60 * 1000;
const WANT = 15;
const MAX_SERIES = 5;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  bull: "•",
  bullet: "•",
  middot: "·",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};
export const decodeHtml = (s: string) =>
  s
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();

const stripTags = (s: string) => decodeHtml(s.replace(/<[^>]*>/g, " "));

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "Sep 20, 2026" → "2026-09-20". */
export function parseSiteDate(text: string): string | null {
  const m = text.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/);
  const month = m && MONTHS[m[1]!.toLowerCase()];
  return m && month ? `${m[3]}-${month}-${m[2]!.padStart(2, "0")}` : null;
}

type Item = { href: string; title: string; subtitle: string; image: string | null };

function parseItems(html: string): Item[] {
  const items: Item[] = [];
  const re = /<a[^>]*class="[^"]*sp-media-item[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const body = m[2]!;
    const title = body.match(/class="sp-media-title"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!title) continue;
    items.push({
      href: decodeHtml(m[1]!),
      title: stripTags(title),
      subtitle: stripTags(body.match(/class="sp-media-subtitle"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ""),
      image: body.match(/background-image:\s*url\(([^)]+)\)/)?.[1]?.replace(/&amp;/g, "&") ?? null,
    });
  }
  return items;
}

/** Series on the /media page, in the order the site shows them (newest first). */
export function parseSeriesList(html: string) {
  return parseItems(html)
    .filter((i) => i.href.startsWith("/media/series/"))
    .map((i) => ({ href: i.href, title: i.title }));
}

const SUBSPLASH_IMAGE_ID = /(?:[?&]id=|\/_source\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * A Subsplash image resized to fit. The website links some artwork as the
 * full-size original (often a 2–3 MB PNG), which is slow on phones.
 */
export function sizedImage(url: string | null, width: number): string | null {
  const id = url?.match(SUBSPLASH_IMAGE_ID)?.[1];
  if (!id) return url;
  return `https://images.subsplash.com/image.jpg?id=${id}&w=${width}&h=${Math.round((width * 9) / 16)}`;
}

/** Sermons on a series page. */
export function parseSeriesSermons(html: string, series: string | null): Sermon[] {
  const site = SERMON_SITE();
  return parseItems(html)
    .map((i) => {
      const code = i.href.match(/^\/media\/([a-z0-9]+)\/[^/]+$/i)?.[1];
      if (!code) return null;
      const [datePart = "", speaker = ""] = i.subtitle.split("•").map((p) => p.trim());
      return {
        id: code,
        title: i.title,
        date: parseSiteDate(datePart),
        speaker: speaker || null,
        series,
        imageUrl: sizedImage(i.image, 1280),
        thumbnailUrl: sizedImage(i.image, 400),
        url: `${site}${i.href}`,
        playerUrl: `https://subsplash.com/u/-${SUBSPLASH_ACCOUNT()}/media/embed/d/${code}`,
      } satisfies Sermon;
    })
    .filter((s): s is Sermon => s !== null);
}

async function fetchPage(path: string) {
  const res = await fetch(`${SERMON_SITE()}${path}`, {
    headers: { "user-agent": "FBC-Church-Management/1.0 (+https://manage.fbcenumclaw.com)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.text();
}

export async function scrapeSermons(): Promise<Sermon[]> {
  const series = parseSeriesList(await fetchPage("/media"));
  const all: Sermon[] = [];
  for (const s of series.slice(0, MAX_SERIES)) {
    all.push(...parseSeriesSermons(await fetchPage(s.href), s.title));
    if (all.length >= WANT) break;
  }
  const seen = new Set<string>();
  return all
    .filter((s) => !seen.has(s.id) && seen.add(s.id))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, WANT);
}

let cache: { at: number; sermons: Sermon[] } | undefined;
let inflight: Promise<Sermon[]> | undefined;

/** Cached for 30 minutes; if the website is down, the last good list is served. */
export async function recentSermons(scrape = scrapeSermons): Promise<{ sermons: Sermon[]; stale: boolean }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return { sermons: cache.sermons, stale: false };
  try {
    inflight ??= scrape().finally(() => (inflight = undefined));
    const sermons = await inflight;
    cache = { at: Date.now(), sermons };
    return { sermons, stale: false };
  } catch (err) {
    console.error("Couldn't load sermons from the church website:", err);
    if (cache) return { sermons: cache.sermons, stale: true };
    throw err;
  }
}

export const resetSermonCache = () => {
  cache = undefined;
};
