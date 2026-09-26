import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app";
import { connect } from "./db/client";
import { env } from "./env";
import { createMailer } from "./lib/mailer";

const database = connect(env.databaseUrl);

if (process.env.MIGRATE_ON_BOOT !== "false") {
  await database.migrate();
  console.info("Database migrations are up to date.");
}

const app = createApp(
  { db: database.db, mailer: createMailer() },
  {
    staticDir: env.isProduction ? resolve(process.cwd(), "dist/web") : undefined,
    memberAppDir: env.isProduction ? resolve(process.cwd(), "dist/member-app") : undefined,
    log: true,
  },
);

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.info(`FBC Church Management listening on http://localhost:${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void database.close().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
