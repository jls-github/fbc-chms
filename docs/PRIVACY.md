# Privacy

What the church management system and member app store, why, and the controls
people have. Use it as the basis for the public privacy policy the App Store and
Google Play require (have church leadership review the final wording — this is
not legal advice).

## Data the system holds

| Data | Why | Who can see it |
| --- | --- | --- |
| Directory records: names, household, contact details, birthday, address, photo, status, groups/teams, notes | Running the church; the directory | Staff. Members see the directory, limited by each person's sharing choices. |
| Allergies & medical notes (kids) | Child safety at check-in | Staff and check-in volunteers |
| Kids check-in records: who, when, pickup code, who checked in/out | Child safety | Staff and check-in volunteers |
| Accounts: email/phone, password (hashed with bcrypt), role | Signing in | Admins |
| Sign-in sessions: device type, when last used (tokens stored only as hashes) | Security | — |
| Group and team chat messages | The chats | Members of that group, or that team and its leader |
| Attendance headcounts | Ministry planning | Staff |
| Anonymous usage statistics (below) | Understanding how the app is used | Staff and admins |

Everything is stored on the church's own server (DigitalOcean) and database.
There are **no advertising, analytics or tracking services**, and nothing is sold
or shared with third parties. Sermons are shown from the church's Subsplash
account; playing one loads Subsplash's player, which is covered by Subsplash's
own privacy policy.

## People's controls

- **Directory sharing** (member app → Profile): show or hide phone, email,
  address and birthday, or leave the directory entirely. Applies to the app and
  the printed directory.
- **Usage statistics** (Profile in the app, Settings on the staff site): switch
  off "Share anonymous usage statistics".
- **Delete account** (Profile): deletes the sign-in immediately. The directory
  record is church data; the office removes it on request.
- **Correcting details:** members can update their own contact details in the app.

## Usage statistics

Implemented in `src/server/lib/usage.ts`, shown on the staff **Usage** page.

- **Aggregates only.** Daily counters such as "directory viewed 12 times" and
  "sermon *X* opened 4 times" — no user, device, IP address, search terms or
  content of what anyone viewed.
- **Active-user counts without tracking.** To count each person once per
  day/week/month, the server stores `HMAC(period key, account id)` while the
  period is open. Each period has its own random key, so codes can't be linked
  across periods. When a period ends, only the total is kept and both the codes
  and the key are deleted — it can no longer be traced to anyone.
- **Opt-out** is honored immediately and also removes the person's activity from
  the still-open periods. Browsers sending **Global Privacy Control** (`Sec-GPC`)
  or **Do Not Track** are never counted.
- **No cookies or fingerprinting** for statistics; the web app's only cookie is
  the staff sign-in session.
- **Small numbers are hidden:** breakdowns of fewer than 3 people show as
  "fewer than 3".
- **Retention:** statistics are deleted after 25 months.

## App store privacy answers

**Apple "App Privacy" / Google Play "Data safety":**

- *Contact info* (name, email, phone, address) — collected, linked to the user,
  used for app functionality; not used for tracking.
- *User content* (group and team chat messages, photos uploaded by staff) — app
  functionality.
- *Identifiers* (account ID) — app functionality.
- *Usage data* (product interaction) — collected as anonymous aggregates,
  **not linked to the user**, used for analytics; not used for tracking.
- *Sensitive info* (children's allergy/medical notes, entered by staff or parents
  at check-in) — app functionality (child safety); not visible to other members.
- Data is encrypted in transit (HTTPS). Users can request deletion (in-app
  account deletion; directory records via the church office).
- **Tracking:** none. The app does not use the App Tracking Transparency prompt
  because it doesn't track.
