# Study Hub

A real-time, invite-only study platform for a med school group, built to cover
the same ground as AMBOSS/UWorld (question bank), Anki (spaced-repetition
flashcards), and a shared study wiki — plus the collaboration those don't do:
shared subjects with a community topic checklist, live group chat (global +
one room per subject), a collaborative notes wiki per subject that everyone
edits together, a **community question bank** with tutor-mode instant
feedback, **spaced-repetition flashcards** (SM-2-style scheduling per
learner), a **lab values quick reference**, **global search** across
everything, a shared mnemonics vault, a shared resource link vault, a group
Q-bank leaderboard, a **study streak heatmap** and weak/strong subject
breakdown, personal tools (planner, pomodoro timer, task list, clinical
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
- **Question bank** — anyone can write a multiple-choice question (stem, 2–6
  choices, explanation, tags). Practicing is tutor-mode: answer, see the
  correct choice highlighted immediately with the explanation, then move on.
  Filter a practice session by subject and by "unanswered only" or
  "previously missed" to focus review. Every answer feeds personal accuracy
  stats (dashboard "Readiness estimate" and the per-subject weak/strong
  breakdown) — correct answers/explanations are only sent to the client
  *after* you submit an answer, so browsing the question list doesn't spoil it.
- **Flashcards** — community-created front/back cards per subject, reviewed
  with **[FSRS-5](https://github.com/open-spaced-repetition/ts-fsrs)**, the
  open-source, evidence-based scheduler that Anki itself switched to as its
  default algorithm (replacing the older SM-2). Scheduling (due dates,
  stability, difficulty) is tracked per learner, independent of who wrote the
  card. The sidebar badge shows how many cards are due right now, and each
  rating shows you the next interval it just earned.
- **CSV import/export** — bulk-add questions or flashcards by pasting or
  uploading a CSV instead of typing one at a time (handy for bringing in an
  existing Anki/Quizlet export or a set a professor handed out), and export
  either bank back out to CSV any time. Format is documented inline on each
  import panel.
- **Math & markdown** — subject notes have a Source/Preview toggle that
  renders Markdown (via [marked](https://github.com/markedjs/marked)) and
  LaTeX math (via [KaTeX](https://katex.org), `$x^2$` / `$$...$$`); the same
  LaTeX rendering applies to question stems/explanations and flashcard
  fronts/backs, so dosage formulas and biochem equations render properly.
- **Lab values & search** — a static, searchable reference table of standard
  normal ranges, plus a sidebar search box that does an instant, client-side
  search across subjects, topics, notes, mnemonics, resources, questions,
  flashcards, and lab values, and jumps you straight to the hit.
- **Study streak heatmap** — a GitHub-style contribution calendar on the
  dashboard, built from your pomodoro sessions, Q-bank log entries, practice
  question answers, and flashcard reviews.
- **Eight color themes, and a live-feeling UI** — Midnight, Aurora, Sunset,
  Forest, Neon, Bloom, Ocean, and Paper, each a deliberate 3-color accent
  chord rather than a re-tinted default. On top of that: a slowly drifting
  aurora background, a cursor-tracked spotlight glow on cards, count-up
  dashboard stats, a chat typing indicator, staggered list entrances, and a
  confetti burst when you finish a practice session 100% correct or clear
  your flashcard queue. All motion respects `prefers-reduced-motion`.
- **Data** — a small hand-rolled JSON-file store (`lib/store.js`,
  `data/db.json`), atomic-write on every mutation. Every dependency (FSRS
  scheduling, KaTeX, Markdown) is pure JavaScript, so `npm install` never
  needs a C/C++ compiler. Fine for a study group's scale; see "Production
  hardening" below if you outgrow it.
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

## Deploying — get a real URL without a terminal

There's a [`render.yaml`](../render.yaml) blueprint at the repo root, so you
can deploy on [Render](https://render.com) with clicks, not commands:

1. Create a free Render account (GitHub sign-in is fastest).
2. In the Render dashboard: **New +** → **Blueprint**.
3. Connect this GitHub repo and pick the branch you want deployed.
4. Render reads `render.yaml` automatically — it already knows to build from
   the `study-hub/` folder, run `npm install` / `npm start`, and generate a
   random `SESSION_SECRET` for you. Click **Apply**.
5. In a few minutes you'll get a live URL like `study-hub-xxxx.onrender.com`.
   Open it, register the first account (it becomes admin), and generate
   invite codes for everyone else from **Manage → Invites**.

**Important free-tier caveat:** Render's free web services don't get a
persistent disk, and they spin down after inactivity — so `data/db.json`
(everyone's accounts, notes, questions, flashcards) **resets** whenever the
service restarts or redeploys. That's fine for trying it out or a short-lived
study session, but not for anything you want to keep. To make it durable:
in the Render dashboard, upgrade the service to the **Starter** plan (~$7/mo)
and add a **Disk** (Render docs: [Persistent Disks](https://render.com/docs/disks))
mounted at `/opt/render/project/src/study-hub/data` — then the JSON store
survives restarts and redeploys like it would on a VPS.

**Railway / Fly.io / any other Node host** work the same way manually:
build command `npm install` (run inside `study-hub/`), start command
`npm start`, set `SESSION_SECRET` and `COOKIE_SECURE=1`, and attach whatever
that platform calls a persistent volume/disk to `study-hub/data`.

**Your own VPS** (fully persistent by default, no disk caveats):
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
web-study/
  render.yaml              Render blueprint (deploys study-hub/ as a web service)
  study-hub/
    server.js              Express app, REST API, Socket.IO wiring
    lib/store.js            JSON-file datastore + FSRS scheduling (users, subjects, chat, etc.)
    lib/seedData.js          Seed subjects/topics/notes content
    public/index.html        App shell (auth screen + SPA)
    public/css/styles.css    Six color themes + all component styles
    public/js/app.js         All client-side logic (fetch + socket.io client)
    public/vendor/           Self-hosted KaTeX + marked browser bundles (no CDN)
    data/db.json              Runtime database (git-ignored, created on first run)
```
