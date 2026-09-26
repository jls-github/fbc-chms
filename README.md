# FBC Church Management

Church management for FBC Enumclaw: people and households, community groups,
ministry teams, attendance, and a dashboard of who needs follow-up.

**Stack:** TypeScript end to end — [Hono](https://hono.dev) REST API with an
OpenAPI spec, [Drizzle ORM](https://orm.drizzle.team) on PostgreSQL, and a
React + Vite + Tailwind single-page app. One Docker image serves both.

- Web app → `/`
- REST API → `/api/v1` (used by the web app, and by native apps via bearer tokens)
- Interactive API reference → `/api/docs` (spec at `/api/openapi.json`)

## Local development

Requires Node 22+ and Docker (for Postgres).

```bash
docker run -d --name fbc-chms-pg -e POSTGRES_USER=fbc -e POSTGRES_PASSWORD=fbc \
  -e POSTGRES_DB=fbc_chms_dev -p 55432:5432 postgres:17-alpine
cp .env.example .env
npm install
npm run db:seed      # migrations + demo data + a dev admin (credentials in src/server/db/seed.ts)
npm run dev          # API on :3000, web on http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm test` | API integration tests (in-memory Postgres via PGlite; no Docker needed) |
| `npm run typecheck` | TypeScript across server, web and shared code |
| `npm run build` | Production build into `dist/` |
| `npm run db:generate` | Create a migration after editing `src/server/db/schema.ts` |
| `npm run cli -- <cmd>` | `migrate`, `seed`, `create-user`, `import-rails` (see `src/server/cli.ts`) |

## Layout

```
src/shared/     API contract: Zod schemas + constants used by server and web
src/server/     Hono app, routes/, auth/, db/ (schema, migrations runner, seed, Rails import)
src/web/        React SPA: pages/, components/, lib/ (API client, queries)
drizzle/        Generated SQL migrations (applied automatically on boot)
test/           API integration tests
config/deploy.yml, .kamal/   Kamal deployment to DigitalOcean
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions and the
roadmap (kids check-in, task dashboard, mobile app), and
[docs/DEPLOYING.md](docs/DEPLOYING.md) for deploying and the one-time migration
from the Rails app.
