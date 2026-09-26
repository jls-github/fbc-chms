import { randomBytes } from "node:crypto";
import { createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ATTENDANCE_EVENT_LABELS, LINK_REPORT_EVENT_TYPES, type LinkReportEventType } from "@shared/constants";
import { ErrorResponse, LeaderReportForm, LeaderReportInput, ReportLink } from "@shared/schemas";
import { requireRole } from "../auth/middleware";
import type { Db } from "../db/client";
import { attendanceReports, reportLinks } from "../db/schema";
import { clientIp } from "../lib/client-ip";
import { ApiError } from "../lib/errors";
import { authErrors, jsonBody, jsonContent, security, validationError } from "../lib/openapi";
import { rateLimiter } from "../lib/rate-limit";
import { createRouter } from "../lib/router";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Public submissions: a few per person in a burst, a daily cap per person, and a daily cap per link. */
export const leaderReportLimits = {
  burst: rateLimiter({ limit: 5, windowMs: 10 * MINUTE }),
  daily: rateLimiter({ limit: 20, windowMs: DAY }),
  perLink: rateLimiter({ limit: 150, windowMs: DAY }),
  lookups: rateLimiter({ limit: 60, windowMs: 10 * MINUTE }),
  reset() {
    this.burst.reset();
    this.daily.reset();
    this.perLink.reset();
    this.lookups.reset();
  },
};

const tooMany = { 429: jsonContent(ErrorResponse, "Too many submissions") } as const;
const notFound = { 404: jsonContent(ErrorResponse, "Unknown or retired link") } as const;
const TokenParam = z.object({ token: z.string().min(10).max(100) });

const newToken = () => randomBytes(16).toString("base64url");
const toLink = (eventType: LinkReportEventType, token: string) => ({ eventType, token, path: `/r/${token}` });

async function findLink(db: Db, token: string) {
  const [link] = await db.select().from(reportLinks).where(eq(reportLinks.token, token));
  const eventType = link?.eventType as LinkReportEventType | undefined;
  if (!eventType || !LINK_REPORT_EVENT_TYPES.includes(eventType)) {
    throw new ApiError(404, "This link isn't active. Ask the church office for the current one.");
  }
  return eventType;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// ----------------------------------------------------------- public (no auth)

export const publicReportRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/public/reports/{token}",
      tags: ["Leader reports (public)"],
      summary: "Look up a leader report link",
      description: "No authentication. Tells the form which gathering the link is for.",
      request: { params: TokenParam },
      responses: { 200: jsonContent(LeaderReportForm), ...notFound, ...tooMany },
    }),
    async (c) => {
      if (leaderReportLimits.lookups.hit(clientIp(c))) throw new ApiError(429, "Too many requests. Please wait a few minutes.");
      const eventType = await findLink(c.var.deps.db, c.req.valid("param").token);
      return c.json({ eventType, label: ATTENDANCE_EVENT_LABELS[eventType] }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/public/reports/{token}",
      tags: ["Leader reports (public)"],
      summary: "Submit attendance through a leader report link",
      description: "No authentication; rate limited per IP address and per link.",
      request: { params: TokenParam, ...jsonBody(LeaderReportInput) },
      responses: { 201: jsonContent(z.object({ ok: z.literal(true) }), "Recorded"), ...notFound, ...tooMany, ...validationError },
    }),
    async (c) => {
      const { token } = c.req.valid("param");
      const { date, attendance, notes, website } = c.req.valid("json");
      const ip = clientIp(c);
      if (leaderReportLimits.burst.hit(ip) || leaderReportLimits.daily.hit(ip)) {
        throw new ApiError(429, "You've sent a lot of reports in a short time. Please wait a bit and try again.");
      }
      const { db } = c.var.deps;
      const eventType = await findLink(db, token);
      if (leaderReportLimits.perLink.hit(token)) {
        throw new ApiError(429, "This link has had too many reports today. Please contact the church office.");
      }
      // Bots fill in the hidden field; tell them it worked and keep the data out.
      if (website) return c.json({ ok: true as const }, 201);

      const today = new Date();
      const tomorrow = isoDay(new Date(today.getTime() + DAY)); // leaders are a timezone behind UTC
      const yearAgo = isoDay(new Date(today.getTime() - 366 * DAY));
      if (date > tomorrow) throw new ApiError(422, "Please fix the highlighted fields.", { date: ["That date is in the future"] });
      if (date < yearAgo) throw new ApiError(422, "Please fix the highlighted fields.", { date: ["That date is more than a year ago"] });

      await db.insert(attendanceReports).values({ eventType, date, attendance, notes, source: "leader_link" });
      return c.json({ ok: true as const }, 201);
    },
  );

// ------------------------------------------------------------- staff (auth)

export const reportLinkRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/report-links",
      tags: ["Attendance"],
      summary: "Shareable leader report links",
      description: "Creates the links the first time they're requested.",
      security,
      responses: { 200: jsonContent(z.object({ links: z.array(ReportLink) })), ...authErrors },
    }),
    async (c) => {
      const { db } = c.var.deps;
      await db
        .insert(reportLinks)
        .values(LINK_REPORT_EVENT_TYPES.map((eventType) => ({ eventType, token: newToken() })))
        .onConflictDoNothing();
      const rows = await db.select().from(reportLinks);
      const links = LINK_REPORT_EVENT_TYPES.map((t) => toLink(t, rows.find((r) => r.eventType === t)!.token));
      return c.json({ links }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/report-links/{eventType}/rotate",
      tags: ["Attendance"],
      summary: "Replace a leader report link (admin only)",
      description: "The old link stops working immediately.",
      security,
      middleware: [requireRole("admin")] as const,
      request: { params: z.object({ eventType: z.enum(LINK_REPORT_EVENT_TYPES) }) },
      responses: { 200: jsonContent(z.object({ link: ReportLink })), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { eventType } = c.req.valid("param");
      const token = newToken();
      await c.var.deps.db
        .insert(reportLinks)
        .values({ eventType, token })
        .onConflictDoUpdate({ target: reportLinks.eventType, set: { token } });
      return c.json({ link: toLink(eventType, token) }, 200);
    },
  );
