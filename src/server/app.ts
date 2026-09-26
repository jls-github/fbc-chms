import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "drizzle-orm";
import { requireAuth, SESSION_COOKIE } from "./auth/middleware";
import { ApiError, pgErrorCode } from "./lib/errors";
import { createRouter, type AppDeps, type AppEnv } from "./lib/router";
import { createMiddleware } from "hono/factory";
import { attendanceRoutes } from "./routes/attendance";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { familyRoutes } from "./routes/families";
import { groupRoutes } from "./routes/groups";
import { memberRoutes } from "./routes/members";
import { teamRoutes } from "./routes/teams";
import { publicReportRoutes, reportLinkRoutes } from "./routes/report-links";
import { kioskRoutes, rosterRoutes } from "./routes/checkin";
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
 * - a volunteer can only use the check-in roster (plus their own account).
 */
const limitRestrictedSessions = createMiddleware<AppEnv>(async (c, next) => {
  const path = c.req.path;
  const session = c.get("session");
  if (!session) return next(); // public endpoints
  const user = c.get("user");
  const allowed =
    session.kind === "kiosk"
      ? path.startsWith(v1("/kiosk/")) || path === v1("/auth/me") || path === v1("/auth/logout")
      : user.role === "volunteer"
        ? path.startsWith(v1("/auth/")) || (path.startsWith(v1("/checkin/")) && !path.startsWith(v1("/checkin/kiosks")))
        : true;
  if (!allowed) throw new ApiError(403, "You don't have access to that.");
  await next();
});

export function buildApi() {
  const api = createRouter();
  api.use("*", (c, next) =>
    PUBLIC_API_PATHS.has(c.req.path) || c.req.path.startsWith(PUBLIC_PREFIX) ? next() : requireAuth(c, next),
  );
  api.use("*", limitRestrictedSessions);
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
    .route("/", rosterRoutes);

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

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function createApp(deps: AppDeps, opts: { staticDir?: string; log?: boolean } = {}) {
  const app = new Hono<AppEnv>();

  if (opts.log) app.use("*", logger());
  app.use("*", secureHeaders({ contentSecurityPolicy: undefined, crossOriginEmbedderPolicy: false }));
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
    // Swagger UI pulls its assets from a CDN, so it gets the default (no CSP).
    if (!c.req.path.startsWith("/api/docs")) c.header("Content-Security-Policy", CSP);
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
