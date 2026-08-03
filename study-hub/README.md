# Study Hub

A real-time, invite-only study platform for a med school group: shared subjects
with a community topic checklist, live group chat (global + one room per
subject), a collaborative notes wiki per subject that everyone edits together,
a shared mnemonics vault, a shared resource link vault, a group Q-bank
leaderboard, personal tools (planner, pomodoro timer, task list, clinical
calculators), and an admin panel to manage members, invites, and moderation.

No build step, no external database — it's a single Node.js process with a
JSON file on disk, so it runs anywhere Node runs.

## Quick start (local)

```bash
cd study-hub
npm install
npm start
```

Open `http://localhost:3000`. The **first account you register becomes the
admin** — no invite code needed for that one. Everyone after that needs an
invite code, which the admin generates from **Manage → Invites**.

## How it works

- **Accounts & invites** — `express-session` + `bcryptjs`. Registration is
  blocked without a valid invite code once the hub has its first (admin)
  user. Admins can promote/demote, ban/unban, or delete members, and
  generate/revoke invite codes from the **Manage** screen.
- **Real-time** — Socket.IO, using the same session middleware as the HTTP
  server, so a socket connection is automatically tied to the logged-in
  user (no separate socket auth token to manage).
  - Chat: a `global` room ("Study Hall") plus one room per subject.
  - Notes: opening a subject's notes page joins that subject's room; edits
    are debounced client-side (~350ms) and broadcast to everyone else
    currently on that page. If you're mid-typing when someone else's edit
    arrives, it won't clobber you — you get a small "X just updated this
    note — Load latest" banner instead of a silent overwrite.
  - Presence: each room tracks who's currently in it; the sidebar shows a
    live "N studying now" count across the whole hub.
- **Data** — a small hand-rolled JSON-file store (`lib/store.js`,
  `data/db.json`), atomic-write on every mutation. No native dependencies,
  so `npm install` never needs a compiler. Fine for a study group's scale;
  see "Scaling up" below if you outgrow it.
- **Personal vs. shared** — subjects, topics (the catalog), notes,
  mnemonics, resources, and chat are shared/community-editable. Topic
  *completion* is personal per learner (with a small "3/12 learners have
  finished this" community counter for motivation). Tasks, the weekly
  planner, and pomodoro settings are private to each account.
- **Seed content** — the subject catalog ships pre-populated with a
  foundational topic checklist and a short overview note for Anatomy,
  Histology & Embryology, Physiology, Biochemistry & Genetics, Immunology,
  Microbiology, Pathology, Pharmacology, Neuroscience, Behavioral Science &
  Biostatistics, and the core clinical clerkships. All of it is
  community-editable from day one — add, rename, or remove anything.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | random per boot | Set this explicitly in production so logged-in sessions survive a restart |
| `COOKIE_SECURE` | unset (`0`) | Set to `1` when served over HTTPS, so session cookies are marked `Secure` |

## Deploying

This is a plain Node.js + Express app — deploy it anywhere that runs Node 18+:

**Render / Railway / Fly.io / a PaaS**
1. Push this `study-hub/` folder to a Git repo (or point the platform at
   this subfolder).
2. Build command: `npm install`. Start command: `npm start`.
3. Set `SESSION_SECRET` and `COOKIE_SECURE=1` in the platform's environment
   variables.
4. Attach a persistent volume/disk mounted at `study-hub/data` — otherwise
   the JSON database resets on every redeploy.

**Your own VPS**
```bash
git clone <your fork>
cd study-hub && npm install
SESSION_SECRET=$(openssl rand -hex 32) COOKIE_SECURE=1 PORT=3000 node server.js
```
Put it behind Nginx/Caddy for TLS, and run it under `pm2` or a systemd unit
so it restarts on crash/reboot.

## Production hardening (do this before opening it up widely)

This was built for a small, trusted study group — a few of these are worth
tightening if the group grows or the hub becomes higher-stakes:
- **Session store**: sessions are in-memory by default (they reset on
  restart, and won't scale past one process). Swap in
  `connect-sqlite3`/`connect-redis` for anything long-lived.
- **Rate limiting**: login/register have no throttling. Add something like
  `express-rate-limit` in front of `/api/login` and `/api/register`.
- **Backups**: use **Manage → Stats** as a sanity check, and periodically
  hit `GET /api/admin/export` (as an admin, in a browser tab) to download a
  full JSON snapshot of `data/db.json`.
- **Concurrency**: the JSON store is fine for a study group's write volume
  (a handful of people editing/chatting at once). If you outgrow it,
  `lib/store.js` is a small, isolated module — swap it for SQLite/Postgres
  without touching the rest of the app.

## Project layout

```
study-hub/
  server.js            Express app, REST API, Socket.IO wiring
  lib/store.js          JSON-file datastore (users, subjects, chat, etc.)
  lib/seedData.js        Seed subjects/topics/notes content
  public/index.html      App shell (auth screen + SPA)
  public/css/styles.css  Six color themes + all component styles
  public/js/app.js       All client-side logic (fetch + socket.io client)
  data/db.json            Runtime database (git-ignored, created on first run)
```
