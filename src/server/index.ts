import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app";
import { connect } from "./db/client";
import { env } from "./env";
import { facebookFromEnv, startFacebookSchedule } from "./lib/facebook";
import { createMailer } from "./lib/mailer";
import { rollUpUsage } from "./lib/usage";

const database = connect(env.databaseUrl);

if (process.env.MIGRATE_ON_BOOT !== "false") {
  await database.migrate();
  console.info("Database migrations are up to date.");
}

const deps = { db: database.db, mailer: createMailer(), facebook: facebookFromEnv() };
const app = createApp(
  deps,
  {
    staticDir: env.isProduction ? resolve(process.cwd(), "dist/web") : undefined,
    memberAppDir: env.isProduction ? resolve(process.cwd(), "dist/member-app") : undefined,
    log: true,
  },
);

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.info(`FBC Church Management listening on http://localhost:${info.port}`);
});

// Close out finished usage periods (drop their hashes and keys) at startup and hourly.
const rollUp = () => rollUpUsage(database.db).catch((err) => console.error("usage: roll-up failed", err));
void rollUp();
setInterval(rollUp, 60 * 60 * 1000).unref();

// Monday-morning sermon posts to the church's Facebook Page (lib/facebook.ts).
startFacebookSchedule(deps);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void database.close().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
