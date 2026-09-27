import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { compress } from "hono/compress";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "drizzle-orm";
import { requireAuth, SESSION_COOKIE } from "./auth/middleware";
import { ApiError, pgErrorCode } from "./lib/errors";
import { createRouter, type AppDeps, type AppEnv } from "./lib/router";
import { createMiddleware } from "hono/factory";
import { bodyLimit } from "hono/body-limit";
import type { Context } from "hono";
import { attendanceRoutes } from "./routes/attendance";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { familyRoutes, MAX_PHOTO_MB } from "./routes/families";
import { groupRoutes } from "./routes/groups";
import { memberRoutes } from "./routes/members";
import { teamRoutes } from "./routes/teams";
import { publicReportRoutes, reportLinkRoutes } from "./routes/report-links";
import { kioskRoutes, rosterRoutes } from "./routes/checkin";
import { appAccountRoutes } from "./routes/app-accounts";
import { directoryRoutes } from "./routes/directory";
import { usageRoutes } from "./routes/usage";
import { inBackground, mayTrack, platformFor, recordActive } from "./lib/usage";
import { chatRoutes } from "./routes/chats";
import { memberAppRoutes, publicMemberAppRoutes } from "./routes/member-app";
import { userRoutes } from "./routes/users";

export const API_VERSION = "v1";

/** Endpoints under /api/v1 that don't need a session. Everything else does. */
const PUBLIC_API_PATHS = new Set(
  ["/auth/login", "/auth/token", "/auth/password/forgot", "/auth/password/reset"].map((p) => `/api/${API_VERSION}${p}`),
);

/** Everything under /api/v1/public/ is intentionally unauthenticated (and rate limited per route). */
const PUBLIC_PREFIX = `/api/${API_VERSION}/public/`;

const v1 = (p: string) => `/api/${API_VERSION}${p}`;

/**
 * Kiosk devices and check-in volunteers see children's details, so they get
 * the narrowest possible access:
 * - a kiosk session can only use the kiosk endpoints (plus who-am-I and sign-out);
 * - a volunteer can only use the check-in roster (plus their own account);
 * - a church member can only use the member app (/app) and their own account.
 * Anyone linked to a person may also use the member app.
 */
const limitRestrictedSessions = createMiddleware<AppEnv>(async (c, next) => {
  const path = c.req.path;
  const session = c.get("session");
  if (!session) return next(); // public endpoints
  const user = c.get("user");
  const memberApp = path.startsWith(v1("/app/"));
  const allowed =
    session.kind === "kiosk"
      ? path.startsWith(v1("/kiosk/")) || path === v1("/auth/me") || path === v1("/auth/logout")
      : user.role === "member"
        ? path.startsWith(v1("/auth/")) || memberApp
        : user.role === "volunteer"
          ? path.startsWith(v1("/auth/")) || memberApp || (path.startsWith(v1("/checkin/")) && !path.startsWith(v1("/checkin/kiosks")))
          : true;
  if (!allowed) throw new ApiError(403, "You don't have access to that.");
  await next();
});

const tooLarge = (c: Context) => c.json({ error: { message: "That upload is too large." } }, 413);
const jsonBodyLimit = bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge });
const photoBodyLimit = bodyLimit({ maxSize: (MAX_PHOTO_MB + 1) * 1024 * 1024, onError: tooLarge });

/**
 * Counts signed-in people as active (anonymously; see lib/usage.ts) after a
 * successful request. Runs in the background so it never slows a response.
 */
const countActiveUse = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  const session = c.get("session");
  const user = c.get("user");
  if (!session || !user || c.res.status >= 400) return;
  // The request that changes the privacy setting isn't counted either way.
  if (c.req.method === "PATCH" && c.req.path.endsWith("/auth/me")) return;
  const platform = platformFor(session, c.req.path);
  if (!platform || !mayTrack(user.usageOptOut, { get: (n) => c.req.header(n) })) return;
  inBackground(recordActive(c.var.deps.db, user.id, platform), "record activity");
});

export function buildApi() {
  const api = createRouter();
  api.use("*", (c, next) =>
    PUBLIC_API_PATHS.has(c.req.path) || c.req.path.startsWith(PUBLIC_PREFIX) ? next() : requireAuth(c, next),
  );
  api.use("*", limitRestrictedSessions);
  api.use("*", (c, next) => (c.req.path.endsWith("/photo") ? photoBodyLimit(c, next) : jsonBodyLimit(c, next)));
  api.use("*", countActiveUse);
  api
    .route("/", authRoutes)
    .route("/", dashboardRoutes)
    .route("/", memberRoutes)
    .route("/", familyRoutes)
    .route("/", groupRoutes)
    .route("/", teamRoutes)
    .route("/", attendanceRoutes)
    .route("/", userRoutes)
    .route("/", publicReportRoutes)
    .route("/", reportLinkRoutes)
    .route("/", kioskRoutes)
    .route("/", rosterRoutes)
    .route("/", directoryRoutes)
    .route("/", appAccountRoutes)
    .route("/", publicMemberAppRoutes)
    .route("/", memberAppRoutes)
    .route("/", chatRoutes)
    .route("/", usageRoutes);

  api.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Token from POST /auth/token. Use this from native / mobile apps.",
  });
  api.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
    description: "Set by POST /auth/login. Used by the web app.",
  });
  return api;
}

export function openApiDocument(api: ReturnType<typeof buildApi>) {
  return api.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "FBC Church Management API",
      version: "1.0.0",
      description:
        "REST API behind the FBC Church Management web app, usable by native clients. " +
        "Authenticate with `POST /auth/token` and send `Authorization: Bearer <token>`.",
    },
    servers: [{ url: `/api/${API_VERSION}` }],
  });
}

const csp = (imgSrc: string, frameSrc = "'none'") => [
  "default-src 'self'",
  `img-src ${imgSrc}`,
  `frame-src ${frameSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const CSP = csp("'self' data:");
/** The member app also shows sermon artwork and embeds the sermon player, both hosted by Subsplash. */
const MEMBER_APP_CSP = csp("'self' data: blob: https://images.subsplash.com", "https://subsplash.com https://*.subsplash.com");

export function createApp(deps: AppDeps, opts: { staticDir?: string; memberAppDir?: string; log?: boolean } = {}) {
  const app = new Hono<AppEnv>();

  if (opts.log) app.use("*", logger());
  // Text responses (the web bundles, JSON) are gzipped; images are left alone.
  app.use("*", compress());
  app.use("*", secureHeaders({ contentSecurityPolicy: undefined, crossOriginEmbedderPolicy: false }));
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
    // Swagger UI pulls its assets from a CDN, so it gets the default (no CSP).
    const path = c.req.path;
    if (path === "/app" || path.startsWith("/app/")) c.header("Content-Security-Policy", MEMBER_APP_CSP);
    else if (!path.startsWith("/api/docs")) c.header("Content-Security-Policy", CSP);
  });

  app.get("/up", async (c) => {
    await deps.db.execute(sql`select 1`);
    return c.text("ok");
  });

  const api = buildApi();
  const spec = openApiDocument(api);
  app.get("/api/openapi.json", (c) => c.json(spec));
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json", title: "FBC Church Management API" }));
  app.route(`/api/${API_VERSION}`, api);
  app.all("/api/*", (c) => c.json({ error: { message: "Not found" } }, 404));

  // The member app's web version (Expo export, built with baseUrl "/app").
  if (opts.memberAppDir) {
    const root = opts.memberAppDir;
    app.use("/app/_expo/*", async (c, next) => {
      await next();
      if (c.res.status === 200) c.header("Cache-Control", "public, max-age=31536000, immutable");
    });
    app.use("/app/*", serveStatic({ root, rewriteRequestPath: (p) => p.replace(/^\/app/, "") }));
    app.get("/app/_expo/*", (c) => c.text("Not found", 404));
    let appShell: string | undefined;
    const memberAppShell = async (c: Context) => {
      appShell ??= await readFile(join(root, "index.html"), "utf8");
      c.header("Cache-Control", "no-cache");
      return c.html(appShell);
    };
    app.get("/app", memberAppShell);
    app.get("/app/*", memberAppShell);
  }

  if (opts.staticDir) {
    const root = opts.staticDir;
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.status === 200) c.header("Cache-Control", "public, max-age=31536000, immutable");
    });
    app.use("*", serveStatic({ root }));
    // A missing hashed asset (e.g. an old tab after a deploy) must 404, not get the HTML shell.
    app.get("/assets/*", (c) => c.text("Not found", 404));
    // Client-side routing: any other GET renders the SPA shell.
    let shell: string | undefined;
    app.get("*", async (c) => {
      shell ??= await readFile(join(root, "index.html"), "utf8");
      c.header("Cache-Control", "no-cache");
      return c.html(shell);
    });
  }

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { message: err.message, fieldErrors: err.fieldErrors } }, err.status);
    }
    if (err instanceof HTTPException) return c.json({ error: { message: err.message } }, err.status);
    switch (pgErrorCode(err)) {
      case "23505":
        return c.json({ error: { message: "That already exists." } }, 409);
      case "23503":
        return c.json({ error: { message: "That refers to a record that doesn't exist." } }, 422);
      case "22P02":
      case "22007":
      case "22008":
        return c.json({ error: { message: "One of the values isn't valid." } }, 422);
    }
    console.error(err);
    return c.json({ error: { message: "Something went wrong on our end." } }, 500);
  });

  return app;
}
