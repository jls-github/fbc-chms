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

### Kids check-in (built)

- **Kiosk:** a staff member opens *Kids check-in* on an iPad and turns it into
  a kiosk. That swaps their sign-in for a `kiosk` session that can only reach
  `/api/v1/kiosk/*` (enforced centrally in `app.ts`). Families find themselves
  by phone (full or last 4 digits) or last name, or register (parent + kids,
  birthdays, allergies). The kiosk resets itself after inactivity.
- **Security codes:** one 3-character code per household per day (unambiguous
  characters only), shared by siblings, printed on name tags and the parent's
  pickup tag (4×2in labels via AirPrint).
- **Volunteers:** the `volunteer` role sees only the roster: who's here, ages,
  allergies, parent phone numbers, and checkout by matching the code.
- **Dates:** "today" is the church's local date (`CHURCH_TIMEZONE`).
- **Next steps:** rooms/classes by age, SMS to parents, and a native kiosk app
  for direct label printing.

### Task dashboard

- **Schema:** `tasks` (title, notes, due date, status, priority, assignee user,
  optional link to a member/household/group/team), `task_comments`.
- **Automation hooks:** create follow-up tasks automatically, e.g. "Welcome
  call" when a guest is added, or a reminder when an active adult has no group.
  The dashboard's "Not in a group" and "Newest guests" lists are the natural
  source.
- **UI:** a "My tasks" view plus a board by status.

### Member app (built)

`mobile/` is an Expo app (iOS, Android, web) for church members; see
`mobile/README.md`. It uses `/api/v1/app/*` with bearer tokens, and its web
build is served at `/app`.

**Accounts and reconciliation.** Everyone who signs in is a row in `users`;
members have `role = member` and are linked to exactly one person
(`users.member_id`, unique).

- *Self sign-up* creates a `pending` account. We can't verify the email/phone
  they typed, so nothing is linked automatically: staff review it on **App
  accounts**, where likely matches are suggested (same email or phone, same or
  one-letter-off last name, same or similar first name), and approve it as an
  existing person or as a new one — or turn it down.
- *Staff invitation* (person → **Invite to app**) creates an `invited` account
  already linked to the person, with a one-time code (14 days) shared by text or
  email. Claiming it sets a password.
- *Collisions:* approving a sign-up for someone with an unclaimed invitation
  replaces the invitation; someone with an active account is a conflict. A
  sign-up using an invited person's email/phone is pointed to their code; an
  invitation for someone whose sign-up is pending is pointed to the review queue.
- *Staff* can link their own login to their person record to use the app.

**Privacy.** Each person chooses whether their phone, email, address and
birthday appear in the directory (or opts out entirely); the app and the
printed directory both honor it. Household photos in the app use signed,
expiring URLs because image tags can't send bearer tokens.

**Chats** (`routes/chats.ts`): every community group and every ministry team
has one. A group chat is limited to the group's members; a team chat to the
team's members plus its leader. Both share the `chat_messages` / `chat_reads`
tables (exactly one of `group_id` / `team_id` set), with polling (4 s while a
chat is open), unread counts, and author-only deletion.

**Next:** push notifications for new messages (device-token registration plus
APNs/FCM via Expo push), and email/SMS verification so self-sign-ups that match
a verified email or phone can be linked without staff review.
