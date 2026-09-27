import { createRoute } from "@hono/zod-openapi";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { FacebookPost, FacebookSettingsInput, FacebookSkipInput, FacebookStatus } from "@shared/schemas";
import { requireRole } from "../auth/middleware";
import type { Db } from "../db/client";
import { facebookPosts, users } from "../db/schema";
import { churchTimezone } from "../lib/church-time";
import { ApiError } from "../lib/errors";
import {
  currentSunday,
  DEFAULT_TEMPLATE,
  facebookSettings,
  pageStatus,
  postForSunday,
  publishSermon,
  renderMessage,
  saveFacebookSettings,
  sermonFor,
  TEMPLATE_FIELDS,
  type FacebookPostRow,
} from "../lib/facebook";
import { authErrors, jsonBody, jsonContent, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { recentSermons } from "../lib/sermons";

const tags = ["Facebook"];

async function serializePosts(db: Db, rows: FacebookPostRow[]): Promise<FacebookPost[]> {
  const ids = [...new Set(rows.map((r) => r.byUserId).filter((id): id is number => id !== null))];
  const people = ids.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
  const names = new Map(people.map((u) => [u.id, u.name ?? u.email]));
  return rows.map((r) => ({
    id: r.id,
    sunday: r.sunday,
    status: r.status,
    sermonId: r.sermonId,
    sermonTitle: r.sermonTitle,
    message: r.message,
    link: r.link,
    facebookUrl: r.facebookPostId ? `https://www.facebook.com/${r.facebookPostId}` : null,
    error: r.error,
    attempts: r.attempts,
    byName: r.byUserId ? (names.get(r.byUserId) ?? null) : null,
    postedAt: r.postedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

const onePost = async (db: Db, row: FacebookPostRow) => (await serializePosts(db, [row]))[0]!;

export const facebookRoutes = createRouter();
facebookRoutes.use("/facebook", requireRole("admin"));
facebookRoutes.use("/facebook/*", requireRole("admin"));

facebookRoutes
  .openapi(
    createRoute({
      method: "get",
      path: "/facebook",
      tags,
      summary: "Facebook sermon posts: connection, this week's post and history (admin only)",
      security,
      responses: { 200: jsonContent(FacebookStatus), ...authErrors },
    }),
    async (c) => {
      const { db, facebook } = c.var.deps;
      const settings = await facebookSettings(db);
      const sunday = currentSunday();
      const [status, post, history, sermons] = await Promise.all([
        facebook ? pageStatus(facebook) : null,
        postForSunday(db, sunday),
        db.select().from(facebookPosts).orderBy(desc(facebookPosts.sunday)).limit(12),
        // The preview uses the cached list so Settings stays fast; posting always re-reads the website.
        recentSermons(c.var.deps.scrapeSermons).then((r) => r.sermons).catch(() => []),
      ]);
      const sermon = sermons.find((s) => s.date === sunday) ?? null;
      return c.json(
        {
          configured: !!facebook,
          page: status?.page ? { id: status.page.id, name: status.page.name, link: status.page.link } : null,
          pageError: status?.error ?? null,
          dataAccessExpiresAt: status?.page?.dataAccessExpiresAt ?? null,
          autoPost: settings.autoPost,
          template: settings.template,
          defaultTemplate: DEFAULT_TEMPLATE,
          templateFields: [...TEMPLATE_FIELDS],
          schedule: `Mondays, 8am–noon (${churchTimezone()})`,
          thisWeek: {
            sunday,
            sermon,
            preview: sermon ? renderMessage(settings.template, sermon) : null,
            post: post ? await onePost(db, post) : null,
          },
          history: await serializePosts(db, history),
        },
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/facebook",
      tags,
      summary: "Turn Monday posting on or off, or change the message template (admin only)",
      security,
      request: jsonBody(FacebookSettingsInput),
      responses: { 204: { description: "Saved" }, ...authErrors, ...validationError },
    }),
    async (c) => {
      await saveFacebookSettings(c.var.deps.db, c.req.valid("json"));
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/facebook/post",
      tags,
      summary: "Post this week's sermon to Facebook now (admin only)",
      description: "Allowed unless this week has already been posted. Reads the sermon fresh from the church website.",
      security,
      responses: { 200: jsonContent(z.object({ post: FacebookPost })), ...authErrors, ...validationError },
    }),
    async (c) => {
      const { db, facebook } = c.var.deps;
      if (!facebook) throw new ApiError(422, "Facebook isn't connected yet.");
      const sunday = currentSunday();
      const existing = await postForSunday(db, sunday);
      if (existing?.status === "posted") throw new ApiError(422, "This week's sermon is already on Facebook.");
      if (existing?.status === "posting") throw new ApiError(422, "This week's sermon is being posted right now.");
      const sermon = await sermonFor(c.var.deps, sunday).catch(() => {
        throw new ApiError(502, "Couldn't reach the church website. Please try again.");
      });
      if (!sermon) throw new ApiError(422, "This Sunday's sermon isn't on the church website yet.");
      const { template } = await facebookSettings(db);
      const row = await publishSermon({ ...c.var.deps, facebook }, sunday, sermon, {
        template,
        from: ["failed", "missing", "skipped"],
        byUserId: c.var.user.id,
      });
      if (!row) throw new ApiError(422, "This week's sermon has already been handled.");
      if (row.status === "failed") throw new ApiError(502, `Facebook didn't accept the post: ${row.error}`);
      return c.json({ post: await onePost(db, row) }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/facebook/skip",
      tags,
      summary: "Skip this week's post, or undo skipping it (admin only)",
      security,
      request: jsonBody(FacebookSkipInput),
      responses: { 204: { description: "Saved" }, ...authErrors, ...validationError },
    }),
    async (c) => {
      const { db } = c.var.deps;
      const sunday = currentSunday();
      const existing = await postForSunday(db, sunday);
      if (existing?.status === "posted" || existing?.status === "posting") throw new ApiError(422, "This week's sermon is already on Facebook.");
      if (c.req.valid("json").skip) {
        await db
          .insert(facebookPosts)
          .values({ sunday, status: "skipped", byUserId: c.var.user.id })
          .onConflictDoUpdate({ target: facebookPosts.sunday, set: { status: "skipped", byUserId: c.var.user.id, error: null } });
      } else if (existing?.status === "skipped") {
        // Back to "not handled yet", so the Monday job (or Post now) can pick it up.
        await db.delete(facebookPosts).where(eq(facebookPosts.id, existing.id));
      }
      return c.body(null, 204);
    },
  );
