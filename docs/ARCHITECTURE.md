# Architecture

## Why this shape

The app is **API-first**. The React web app has no special access: it calls
the same versioned REST API (`/api/v1`) that a native mobile app will. That
keeps the mobile app from ever needing its own backend and forces every
feature to be expressible as an API.

- **One language.** Server, web and the API contract are TypeScript. The Zod
  schemas in `src/shared/schemas.ts` validate requests on the server, type the
  web app, and generate the OpenAPI document at `/api/openapi.json`. A React
  Native / Expo app can import `src/shared` directly; a Swift or Kotlin app can
  generate a client from the OpenAPI spec.
- **Two ways to authenticate, one session table.** Browsers get an httpOnly,
  SameSite=Lax cookie from `POST /auth/login`; native apps get a bearer token
  from `POST /auth/token`. Both are rows in `sessions` (only a SHA-256 hash of
  the token is stored), so revoking a device is deleting a row.
- **PostgreSQL** instead of SQLite, because check-in means several kiosks and
  phones writing at the same moment on Sunday morning.
- **Roles** (`admin`, `staff`) are enforced per route with `requireRole`. New
  roles for the features below slot into `USER_ROLES`.

## Request flow

```
browser / mobile ──► kamal-proxy (TLS) ──► Hono app ──► Drizzle ──► Postgres
                                         ├─ /api/v1/*   JSON API (auth required except sign-in)
                                         ├─ /api/docs   Swagger UI
                                         └─ /*          SPA (dist/web)
```

Every route lives in `src/server/routes/<area>.ts`, is declared with
`createRoute` (so it's documented automatically), and returns explicit,
serialized shapes rather than raw rows, so the database can change without
breaking API clients.

## Roadmap: how the planned features fit

### Kids check-in (Planning Center / KidCheck style)

Builds on what exists: `members.isChild`, `birthdate`, and households
(`families`) already model kids and their guardians.

- **Schema:** `checkin_events` (e.g. "Sunday 10:30"), `checkin_rooms` (with age/
  grade ranges and capacity), `checkins` (child, event, room, `security_code`,
  checked-in/out timestamps and staff), `authorized_pickups` (per household),
  and medical/allergy notes on `members`.
- **API:** `/api/v1/checkin/...` — family lookup by phone's last 4 digits, check
  a household in (generating a matching child/parent security code), check out
  by code, and a live room roster.
- **Roles:** a `checkin_volunteer` role that can only reach check-in routes,
  plus kiosk devices signed in with long-lived bearer tokens (already supported).
- **Real time:** a Server-Sent Events stream (`/api/v1/checkin/stream`) so room
  rosters update instantly; Hono supports SSE natively.
- **Labels:** kiosks print name tags + pickup tags; start with browser printing
  to a Brother/Dymo label printer, or a native kiosk app on iPad.

### Task dashboard

- **Schema:** `tasks` (title, notes, due date, status, priority, assignee user,
  optional link to a member/household/group/team), `task_comments`.
- **Automation hooks:** create follow-up tasks automatically, e.g. "Welcome
  call" when a guest is added, or a reminder when an active adult has no group.
  The dashboard's "Not in a group" and "Newest guests" lists are the natural
  source.
- **UI:** a "My tasks" view plus a board by status.

### Native mobile app

Ready today: bearer-token auth, the OpenAPI spec, stable JSON shapes, and CORS
isn't needed for native apps. When building it, add push-notification device
registration (`device_tokens` table) and pagination on list endpoints as the
directory grows.
