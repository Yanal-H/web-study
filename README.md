# Foundation · Med School Toolkit

An offline-first study website — a textbook **Reader**, **Recall-grade flashcards**
(with image occlusion), a **quiz-template-grade Q-Bank** (MCQ + EMQ), notes,
planner, calculators and more. **by Yanal · Cairo 2026.**

Multi-file **Vite + React + TypeScript** site on Vercel, with sign-in and chapter
content served by Supabase. Offline after the first signed-in load, self-hosted
fonts, no third-party requests beyond authentication and content.

**Access:** students sign in with an email code, restricted to one email domain.
Chapters are **not** in the JavaScript bundle — they are fetched for a signed-in
account and cached on the device — so a visitor who is not signed in receives an
empty shell.

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
- **Content** (`src/content/`, `content/`) — chapters authored as JSON, validated
  by one canonical **Zod schema** at build time and at runtime import. Loaded via
  `import.meta.glob` (inlined, offline). See _Adding content_.
- **Design** (`src/design/`) — token system (elevated tinted neutrals + one teal
  accent, light/dark parity), primitives, ⌘K command palette, self-hosted fonts.
- **Features** (`src/features/`) — dashboard, study (Library + Reader), flashcards
  (SM-2+ engine, occlusion, Anki TSV/CSV), qbank (MCQ/EMQ engine), planner, notes,
  calculators, mnemonics, resources, settings.
- **Offline** — a lean service worker (`public/sw.js`) caches the shell and, after
  first paint, every route chunk (incl. the content bundle) is warmed. Personal
  imports live in localStorage, so they are available offline and survive redeploys.

## Adding content

**Build-time (shipped).** Drop a file at `content/<subject>/<chapter>.json`. On the
next build it appears in the site — Reader sections, flashcards, and questions —
**with no code changes**. Author against the emitted contract:

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

**Runtime (personal).** In the app: **Study → Import chapter** (paste or file). The
same Zod schema validates it in the browser — all-or-nothing — and stores it under
a **separate** namespaced key (`foundation_user_content_v1`), so a redeploy never
clobbers personal imports.

## How migrations work

`SCHEMA_VERSION` (currently 7) versions the state blob. `runMigrations` is additive:
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

After the first **signed-in** visit the app boots and navigates fully offline,
including downloaded chapters and any personally-imported chapter. Only that first
load needs a connection, which is the unavoidable cost of not shipping the content
to anonymous visitors. On a redeploy, `index.html`
is served `no-cache` so the new shell loads; a `vite:preloadError` guard reloads
once if a lazy chunk hash changed. Open sessions and personal imports are never
lost across a redeploy.

## Reference / legacy files (kept during migration)

- `Foundation__Med_School_Toolkit-8.html` — the shipped single-file app; source of
  truth for the ported state/migration layer, scheduler, MCQ engine, and the
  migrated Surgery ch.1 content.
- `Recall__Flashcards.html`, earlier prototypes, and `study-hub/` (a separate
  multi-user server experiment) are not part of this site.
