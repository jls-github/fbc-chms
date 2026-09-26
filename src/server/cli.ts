/**
 * Maintenance commands. Run with `npm run cli -- <command>` locally, or
 * `node dist/server/cli.js <command>` inside the production container.
 *
 *   migrate                                  Apply pending database migrations
 *   seed [--force]                           Load demo data (refuses in production without --force)
 *   create-user --email E --password P [--name N] [--role admin|staff]
 *   import-rails <production.sqlite3> [--replace]
 *                                            Copy data from the old Rails app's SQLite database
 */
import { parseArgs } from "node:util";
import { USER_ROLES, type UserRole } from "@shared/constants";
import { hashPassword } from "./auth/crypto";
import { connect } from "./db/client";
import { seed } from "./db/seed";
import * as schema from "./db/schema";
import { env } from "./env";

const [command, ...rest] = process.argv.slice(2);
const database = connect(env.databaseUrl);

try {
  switch (command) {
    case "migrate": {
      await database.migrate();
      console.info("Migrations applied.");
      break;
    }
    case "seed": {
      const { values } = parseArgs({ args: rest, options: { force: { type: "boolean" } } });
      if (env.isProduction && !values.force) throw new Error("Refusing to seed demo data in production (pass --force).");
      await database.migrate();
      await seed(database.db);
      break;
    }
    case "create-user": {
      const { values } = parseArgs({
        args: rest,
        options: {
          email: { type: "string" },
          password: { type: "string" },
          name: { type: "string" },
          role: { type: "string", default: "admin" },
        },
      });
      if (!values.email || !values.password) throw new Error("--email and --password are required");
      if (values.password.length < 8) throw new Error("Password must be at least 8 characters");
      if (!USER_ROLES.includes(values.role as UserRole)) throw new Error(`--role must be one of ${USER_ROLES.join(", ")}`);
      await database.db.insert(schema.users).values({
        email: values.email.toLowerCase(),
        name: values.name ?? null,
        role: values.role as UserRole,
        passwordDigest: await hashPassword(values.password),
      });
      console.info(`Created ${values.role} ${values.email}.`);
      break;
    }
    case "import-rails": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { replace: { type: "boolean" } },
      });
      const file = positionals[0];
      if (!file) throw new Error("Usage: import-rails <path/to/production.sqlite3> [--replace]");
      await database.migrate();
      // Loaded lazily: node:sqlite prints an experimental warning on import.
      const { importRailsSqlite } = await import("./db/import-rails");
      const counts = await importRailsSqlite(database.db, file, { replace: values.replace ?? false });
      console.table(counts);
      break;
    }
    default:
      console.info("Commands: migrate | seed | create-user | import-rails  (see src/server/cli.ts)");
      process.exitCode = command ? 1 : 0;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await database.close();
}
