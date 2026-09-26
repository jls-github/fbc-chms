import type { Context } from "hono";

/**
 * The client's IP as seen by kamal-proxy. The proxy appends the real peer
 * address to X-Forwarded-For, so the LAST entry is trustworthy; earlier
 * entries come from the client and can be forged.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "unknown";
}
