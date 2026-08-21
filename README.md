# Foundation · Med School Toolkit

An online-to-study, privacy-first website — a textbook **Reader**, **Recall-grade flashcards**
(with image occlusion), a **quiz-template-grade Q-Bank** (MCQ + EMQ), notes,
planner, calculators and more. **by Yanal · Cairo 2026.**

Multi-file **Vite + React + TypeScript** site on Vercel, with sign-in and chapter
content served by Supabase. Self-hosted fonts, no third-party requests beyond
authentication and content.

**Access:** students sign in with an email code, restricted to one email domain.
Chapters are **not** in the JavaScript bundle and are **never written to disk** —
they are downloaded into memory for a signed-in account and dropped when the tab
closes. A visitor who is not signed in receives an empty shell.

**Online-only, deliberately.** Keeping no copy on the device means a borrowed or
lost phone carries no library and revoking an account is not undone by a stale
offline cache. The cost is that studying needs a connection. Personal data —
progress, review history, notes, personal cards — stays on the device and works
regardless.

> **Honest caveat:** a signed-in student can still extract what their browser has
> received; that is true of every web app and cannot be engineered away. What this
> design buys is that anonymous visitors get nothing, outsiders cannot register,
> anyone can be revoked, and every page carries the account it was served to.

**Deploying for the first time? See [DEPLOY.md](DEPLOY.md).**

## Commands

```bash
npm install
npm run dev              # dev server (http://localhost:5173)
npm run build            # validate content → tsc → vite build → dist/
npm run preview          # serve the production build (http://localhost:4173)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm test                 # vitest (scheduler, engines, schema, search, migrations…)
npm run validate:content # validate every content/**/*.json against the Zod schema
npm run make:schema      # emit content/_schema/chapter.schema.json + template.json
```

`prebuild` runs `validate:content`, so an invalid chapter JSON **fails the build**.

## Architecture

- **State** (`src/state/`) — a single localStorage blob (`foundation_med_study_v1`)
  with a versioned, additive, lossless migration chain (v1 → v7). Never resets;
  corrupt data is backed up, not destroyed. A tiny reactive layer (`useStore`,
  `commit`) drives React re-renders.
- **Content** (`src/content/`, `content/`) — chapters authored as JSON and
  validated by one canonical **Zod schema**. Administrators publish validated
  packs to Supabase; signed-in students receive those packs in memory only. See
  _Adding content_.
- **Design** (`src/design/`) — token system (elevated tinted neutrals + one teal
  accent, light/dark parity), primitives, ⌘K command palette, self-hosted fonts.
- **Features** (`src/features/`) — dashboard, study (Library + Reader), flashcards
  (SM-2+ engine, occlusion, Anki TSV/CSV), qbank (MCQ/EMQ engine), planner, notes,
  calculators, mnemonics, resources, settings.
- **Installable shell** — a lean service worker (`public/sw.js`) and web-app
  manifest make Foundation installable on Windows and Android/Honor devices.
  Shared chapters are deliberately excluded from the cache; learner progress,
  notes and personal cards persist locally and survive redeploys.

## Adding content

**Source-controlled packs.** Drop a file at `content/<subject>/<chapter>.json`.
It is validated on build, then seed it to Supabase with `npm run upload:content`.
After first deployment, administrators can publish the same JSON directly from
the app without a redeploy. Author against the emitted contract:

```bash
npm run make:schema     # writes content/_schema/chapter.schema.json + template.json
```

Point your editor's JSON Schema at `chapter.schema.json`, or copy `template.json`
(it has inline field docs) and fill it in. A chapter carries `sections[]`
(summarised digests, `highYield`, `tables`, `figures`), `cards[]`
(`foundation.card/v2`: basic / reversed / cloze / type / image / occlusion),
`mcqs[]` (`foundation.mcq/v2`: per-option rationale, ordered explanation,
`keyFacts`, `teachingPoint`, difficulty, optional figure) and `emqs[]`
(`foundation.emq/v1`: shared option bank + stems). Figures require `alt` text.

**Runtime (shared, administrator-only).** Sign in as an administrator and open
**Admin → Shared study content**. Choose one or more JSON files on Windows/Android,
or paste one document directly. Complete chapters, study guides, flashcard decks,
and MCQ banks are accepted; specialised files are normalised into the canonical
chapter contract before anything is written to Supabase. The database policy then
rejects every student write. Students only
receive the published curriculum. See `authoring/AI_CONTENT_PROMPT.md` for a
ready-to-use AI authoring prompt, including optional Chinese/bilingual knowledge
extensions.

For future AI-led maintenance, start with [AI_MAINTAINER_GUIDE.md](AI_MAINTAINER_GUIDE.md).

## How migrations work

`SCHEMA_VERSION` (currently 8) versions the state blob. `runMigrations` is additive:
it only fills missing keys and upgrades shapes, never removing user data. Each load
runs the full chain, so data from the original single-file app (v1) upgrades to the
current shape with zero loss; a written round-trip re-reads identically. Content
cards are scheduled in `study.cardSched` (v7) **without** touching the user's own
`flashcards` (their SM-2 fields are preserved exactly).

## Deploying

**Step-by-step walkthrough: [DEPLOY.md](DEPLOY.md).** Short version:

Hosting is zero-config via `vercel.json`: build `npm run build`, output `dist/`,
SPA rewrites, `Cache-Control: no-cache` on `index.html`/`sw.js`, and immutable
long-cache on hashed `/assets/*`.

Sign-in and content need a Supabase project (free tier: 50,000 monthly users,
500 MB database). Run `supabase/setup.sql` there, then set in Vercel:

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public by design) |
| `VITE_ALLOWED_EMAIL_DOMAIN` | the domain students sign in with |

Environment variables are read at **build** time, so redeploy after changing
them. Seed the chapters once with `npm run upload:content`.

## Offline & updates

The app shell is cached by the service worker, so it boots instantly, but
**chapters are fetched every visit and never cached** — that is what keeps them
off the device. The service worker skips cross-origin requests, which is what
enforces it; do not relax that rule.

Personal data (progress, notes, personal cards) lives in IndexedDB and needs no
connection. A device upgrading from an older build has its stored chapters purged
at boot, so the copy an earlier version left behind is actually removed. On a redeploy, `index.html`
is served `no-cache` so the new shell loads. Installed apps perform a throttled
update check when they reconnect or return to the foreground, and reload once
when a new worker takes control. A `vite:preloadError` guard also recovers if a
lazy chunk hash changed. Open sessions and learner-owned progress, notes and
cards are never lost across a redeploy.

Chapter synchronization first requests a small revision manifest, then downloads
changed packs in bounded groups. Reopening search reuses a revision-aware index;
the worker receives only searchable text, not figures, explanations or progress.

## Reference / legacy files (kept during migration)

- `Foundation__Med_School_Toolkit-8.html` — the shipped single-file app; source of
  truth for the ported state/migration layer, scheduler, MCQ engine, and the
  migrated Surgery ch.1 content.
- `Recall__Flashcards.html`, earlier prototypes, and `study-hub/` (a separate
  multi-user server experiment) are not part of this site.
