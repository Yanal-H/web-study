# Foundation · Med School Toolkit

An offline-first study website — a textbook **Reader**, **Recall-grade flashcards**
(with image occlusion), a **quiz-template-grade Q-Bank** (MCQ + EMQ), notes,
planner, calculators and more. **by Yanal · Cairo 2026.**

Multi-file **Vite + React + TypeScript** static site, deployed on Vercel. Fully
offline after first load, self-hosted fonts, no runtime third-party requests.

> **Honest caveat:** a static site is downloadable, so the built-in passphrase gate
> is only a **deterrent**. Real access control needs Vercel Password Protection or
> SSO (see _Deploying_ below).

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

## Deploying to Vercel

Zero-config via `vercel.json`: build `npm run build`, output `dist/`, SPA rewrites,
`Cache-Control: no-cache` on `index.html`/`sw.js`, and immutable long-cache on
hashed `/assets/*`. Import the repo in Vercel and point production at the branch.

For **real** access control (not just the passphrase deterrent), enable **Vercel
Password Protection** or **SSO** in the project's Deployment Protection settings.

## Offline & updates

After the first online visit the app boots and navigates fully offline, including
shipped chapters and any personally-imported chapter. On a redeploy, `index.html`
is served `no-cache` so the new shell loads; a `vite:preloadError` guard reloads
once if a lazy chunk hash changed. Open sessions and personal imports are never
lost across a redeploy.

## Reference / legacy files (kept during migration)

- `Foundation__Med_School_Toolkit-8.html` — the shipped single-file app; source of
  truth for the ported state/migration layer, scheduler, MCQ engine, and the
  migrated Surgery ch.1 content.
- `Recall__Flashcards.html`, earlier prototypes, and `study-hub/` (a separate
  multi-user server experiment) are not part of this site.
