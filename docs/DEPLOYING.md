# Deploying

Production runs on the DigitalOcean droplet `137.184.91.29` using
[Kamal 2](https://kamal-deploy.org): the app container sits behind kamal-proxy
(automatic Let's Encrypt TLS for `manage.fbcenumclaw.com`), and PostgreSQL runs
as a Kamal accessory on the same droplet.

## Prerequisites (once, on your machine)

```bash
gem install kamal    # needs Ruby >= 3.1; Kamal >= 2.8
```

- SSH access to the droplet uses the `~/.ssh/fbc` key (set in `config/deploy.yml`).
- Images go to the droplet through Kamal's SSH-tunneled local registry, so no Docker Hub token is needed.
- The Postgres password lives in `~/.config/fbc-chms/deploy.env` (`POSTGRES_PASSWORD=...`, chmod 600).
  **Keep a copy in your password manager** — it's needed for every deploy.
  `.kamal/secrets` reads it from there; nothing secret is committed.

## Routine deploys

```bash
kamal deploy
```

Migrations run automatically when the new container boots; kamal-proxy only
switches traffic once `/up` is healthy, so a failed boot leaves the old version serving.

Handy aliases (from `config/deploy.yml`): `kamal logs`, `kamal shell`,
`kamal psql`, `kamal backup`, and `kamal cli <command>` (e.g.
`kamal cli create-user --email you@example.com --password '...' --role admin`).

## One-time cutover from the Rails app

The Rails app stored everything in SQLite on the Docker volume `volume_sfo3_01`.
The new app mounts that volume **read-only** at `/legacy-rails-storage` and copies
it into Postgres, preserving IDs and staff passwords (both apps use bcrypt).

1. **Back up the droplet** (DigitalOcean → Droplet → Backups/Snapshots → take a snapshot).
2. Start Postgres: `kamal accessory boot db`
3. Deploy the new app: `kamal deploy`. This replaces the Rails container (same
   Kamal service name), which also stops it cleanly — important, because Rails
   runs SQLite in WAL mode and a clean shutdown flushes the WAL into the main file.
4. Import: `kamal cli import-rails /legacy-rails-storage/production.sqlite3`
   It prints a count per table. It refuses to run if Postgres already has data;
   add `--replace` to wipe and re-import.
5. Sign in at https://manage.fbcenumclaw.com with your existing email and password.

### Rolling back

The SQLite files are never modified, so rolling back is: check out the Rails
code (`git checkout main`) and run its `bin/kamal deploy`. Anything entered in
the new app after the cutover would need re-entering.

## Backups

- Turn on DigitalOcean droplet backups (weekly, whole machine).
- `kamal backup` writes a `pg_dump` into the database volume on the droplet; to
  keep copies off the droplet, schedule it and copy the dumps to DigitalOcean
  Spaces or similar.

## Email

Password-reset emails need SMTP. Set `SMTP_URL` (e.g.
`smtp://user:pass@smtp.postmarkapp.com:587`) and `MAIL_FROM` by adding them to
`env.secret` in `config/deploy.yml` and to `.kamal/secrets`. Without SMTP the
reset link is written to the app log (`kamal logs`). Admins can also add staff
accounts from Settings, or run `kamal cli create-user`.
