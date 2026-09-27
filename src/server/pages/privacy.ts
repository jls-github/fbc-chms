/**
 * The public privacy policy at /privacy — the URL given to Apple, Google and
 * Meta. Server-rendered HTML (no JavaScript) so their reviewers' crawlers can
 * read it. Plain-language version of docs/PRIVACY.md; keep the two in step.
 */

export const PRIVACY_UPDATED = "September 26, 2026";

const CONTACT_EMAIL = "church@fbcenumclaw.com";

const body = `
<header>
  <img src="/brand/logo-primary.png" alt="First Baptist Church of Enumclaw" width="220">
  <h1>Privacy Policy</h1>
  <p class="meta">Last updated ${PRIVACY_UPDATED}</p>
</header>

<p>First Baptist Church of Enumclaw (“FBC Enumclaw”, “the church”, “we”) runs a
church management system: the staff site at <strong>manage.fbcenumclaw.com</strong>,
the <strong>FBC Enumclaw member app</strong> (iPhone, Android and web), and kids
check-in. This policy explains what information these hold, why, who can see it,
and the choices you have. It also covers the sermon posts we publish
automatically to the church’s Facebook Page.</p>

<p class="callout"><strong>The short version:</strong> we keep the information a
church needs to care for its people, on the church’s own server. We don’t show
ads, we don’t use tracking or analytics services, and we never sell or share your
information with anyone for their own use.</p>

<h2>Information we hold</h2>
<table>
  <thead><tr><th>Information</th><th>Why we have it</th><th>Who can see it</th></tr></thead>
  <tbody>
    <tr><td>Directory details: names, household, phone, email, address, birthday, photo, the groups and teams you’re part of, and staff notes</td><td>Caring for and organizing the church; the church directory</td><td>Church staff. Other members see only what you choose to share in the directory.</td></tr>
    <tr><td>Children’s allergy and medical notes</td><td>Keeping children safe at check-in</td><td>Staff and check-in volunteers only</td></tr>
    <tr><td>Kids check-in records: who was checked in and out, when, by whom, and the pickup code</td><td>Keeping children safe</td><td>Staff and check-in volunteers</td></tr>
    <tr><td>Your account: email or phone, password (stored only in scrambled, hashed form), and role</td><td>Signing in</td><td>Church administrators (never your password)</td></tr>
    <tr><td>Sign-in sessions: type of device and when it was last used</td><td>Keeping your account secure</td><td>No one routinely; used by the system</td></tr>
    <tr><td>Group and team chat messages</td><td>The chats in the member app</td><td>Members of that group, or that team and its leader</td></tr>
    <tr><td>Attendance headcounts</td><td>Ministry planning</td><td>Staff</td></tr>
    <tr><td>Anonymous usage statistics (see below)</td><td>Understanding which features are used</td><td>Church administrators</td></tr>
  </tbody>
</table>
<p>Most of this is entered by church staff, by parents at check-in, or by you in
the member app. We use it only to run the church’s ministries and to provide the
app’s features.</p>

<h2>What we don’t do</h2>
<ul>
  <li>No advertising, and no advertising or analytics companies’ code in the apps.</li>
  <li>No tracking across other apps or websites.</li>
  <li>No selling, renting or trading your information.</li>
</ul>

<h2>Services that help us run the system</h2>
<p>These providers handle information only to provide their service to the church:</p>
<ul>
  <li><strong>DigitalOcean</strong> hosts the church’s server and database, in the United States.</li>
  <li><strong>Our email provider</strong> delivers the emails the system sends, such as app invitations and password resets.</li>
  <li><strong>Subsplash</strong> hosts our sermon recordings and artwork. Playing a sermon in the app loads Subsplash’s player, which is covered by <a href="https://www.subsplash.com/legal/privacy">Subsplash’s privacy policy</a>.</li>
  <li><strong>Apple and Google</strong> distribute the member app through their app stores under their own policies.</li>
</ul>

<h2>Facebook</h2>
<p>Once a week, the system posts the most recent sermon to the church’s Facebook
Page: its title, series, speaker and a link to watch it. To do this it uses an
access key for the church’s own Page, which only lets it publish to and read
basic details of that Page. <strong>No information about members, visitors or
children is ever sent to Facebook.</strong> Anything you do on Facebook itself,
such as liking or commenting on the post, is covered by
<a href="https://www.facebook.com/privacy/policy/">Meta’s privacy policy</a>.</p>

<h2>Anonymous usage statistics</h2>
<p>To learn which features are useful, the system keeps daily counts such as
“the directory was viewed 12 times” or “this sermon was opened 4 times”. These
counts don’t record who you are, your device, your IP address, what you searched
for or what you looked at.</p>
<ul>
  <li>To count how many people used the app in a day, week or month without
  tracking anyone, the system keeps a temporary, scrambled code for each account
  while that period is open. When the period ends, only the total is kept and the
  codes are deleted, so the numbers can no longer be linked to anyone.</li>
  <li>Groups smaller than three people are shown as “fewer than 3”.</li>
  <li>Statistics are deleted after 25 months.</li>
  <li>You can switch this off at any time: <em>Profile</em> in the member app or
  <em>Settings</em> on the staff site (“Share anonymous usage statistics”).
  Turning it off also removes your activity from counts that are still open.
  Browsers that send a Global Privacy Control or Do Not Track signal are never counted.</li>
</ul>

<h2>Cookies</h2>
<p>The staff site uses a single cookie to keep you signed in. The member app keeps
you signed in with a secure token stored on your device. We don’t use cookies for
advertising, analytics or tracking.</p>

<h2>Your choices</h2>
<ul>
  <li><strong>Directory sharing:</strong> in the member app under <em>Profile</em>,
  choose whether your phone, email, address and birthday appear in the directory,
  or leave the directory entirely. Your choices apply to the app and the printed directory.</li>
  <li><strong>Updating your details:</strong> update your own contact details in
  the app, or ask the church office.</li>
  <li><strong>Deleting your account:</strong> in the member app under
  <em>Profile</em>. This deletes your sign-in straight away and signs you out
  everywhere. Chat messages you’ve posted stay unless you delete them first.</li>
  <li><strong>Removing your directory record:</strong> your record in the church
  directory is kept by the church office. Email us and we’ll remove it.</li>
  <li><strong>A copy of your information:</strong> email us and we’ll tell you what we hold about you.</li>
</ul>

<h2>How long we keep information</h2>
<p>We keep directory and check-in records while you’re part of the church family
and for as long as they’re needed for ministry and child-safety purposes, and we
remove them when you ask. Accounts are kept until you or the church deletes them.
Usage statistics are deleted after 25 months.</p>

<h2>Security</h2>
<p>All connections use HTTPS. Passwords and sign-in tokens are stored only in
hashed form, so they can’t be read even by us. Access within the system is
limited by role: check-in volunteers, for example, see only the check-in roster.</p>

<h2>Children</h2>
<p>Information about children is entered by parents or church staff for kids
check-in, and is visible only to staff and check-in volunteers. Member app
accounts are for adults and older students in the church; the app isn’t
directed at children under 13.</p>

<h2>Changes to this policy</h2>
<p>If we change this policy, we’ll update it here and change the date at the top.
For significant changes, we’ll also let members know through the app or by email.</p>

<h2>Contact us</h2>
<p>Questions or requests about your information:<br>
First Baptist Church of Enumclaw<br>
3466 Porter St, Enumclaw, WA 98022<br>
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
`;

export const privacyPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy · First Baptist Church of Enumclaw</title>
<meta name="description" content="How First Baptist Church of Enumclaw's church management system and member app handle your information.">
<link rel="icon" href="/favicon.png" type="image/png">
<style>
  :root { color-scheme: light dark; --bg: #eef3f2; --card: #fff; --text: #27272a; --muted: #58595b; --brand: #40605f; --line: #dce8e6; }
  @media (prefers-color-scheme: dark) { :root { --bg: #09090b; --card: #18181b; --text: #f4f4f5; --muted: #a1a1aa; --brand: #8bada6; --line: #27272a; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 "Filson Pro", Figtree, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 32px auto; padding: 32px; background: var(--card); border-radius: 16px; }
  header img { display: block; height: auto; max-width: 60%; margin-bottom: 16px; }
  @media (prefers-color-scheme: dark) { header img { background: #eef3f2; padding: 8px 12px; border-radius: 8px; } }
  h1 { margin: 0; font-size: 2rem; line-height: 1.2; color: var(--brand); }
  h2 { margin: 2rem 0 .5rem; font-size: 1.2rem; color: var(--brand); }
  .meta { margin: 4px 0 24px; color: var(--muted); font-size: .9rem; }
  .callout { padding: 12px 16px; border-left: 4px solid var(--brand); background: color-mix(in srgb, var(--brand) 8%, transparent); border-radius: 4px; }
  a { color: var(--brand); }
  ul { padding-left: 1.25rem; }
  li { margin: .35rem 0; }
  table { width: 100%; border-collapse: collapse; font-size: .92rem; margin: .5rem 0; display: block; overflow-x: auto; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; }
  @media (max-width: 600px) { main { margin: 0; padding: 20px 16px; border-radius: 0; } h1 { font-size: 1.6rem; } }
</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
