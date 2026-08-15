# Foundation · Med School Toolkit

An offline-first study website — flashcards, a question bank, notes, planner and
more. **by Yanal · Cairo 2026.**

This repository is mid-migration from a single-file HTML app to a multi-file,
offline-capable Vite + React + TypeScript site.

- **Phase 0** (scaffold) — complete: builds, lossless state port, offline shell.
- **Phase 1** (design system + all-pages UI) — complete: a new token system
  (retired the old aurora palette), self-hosted fonts, a primitive library, a
  ⌘K command palette, and functional re-skinned pages (Dashboard, Subjects,
  Planner, Notes, Calculators, Mnemonics, Resources, Settings) in light and dark.
  The Study, Flashcards and Q-Bank engines are intentionally still placeholders —
  they are built in Phases 3–4.

## Commands

```bash
npm install        # install dependencies
npm run dev        # local dev server (http://localhost:5173)
npm run build      # tsc --noEmit && vite build  → dist/
npm run preview    # serve the production build (http://localhost:4173)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest (migration + smoke tests)
npm run validate:content  # JSON content integrity (no content yet in Phase 0)
```

## What Phase 0 delivers

- **Vite + React + TypeScript** project, `tsc --noEmit` clean, ESLint clean.
- **App shell + router** with a lazy-loaded route (own chunk) for every view:
  Dashboard, Study, Subjects, Flashcards, Question Bank, Planner, Notes,
  Calculators, Mnemonics, Resources, Settings.
- **State layer ported verbatim** (`src/state/`): same localStorage keys
  (`foundation_med_study_v1`, `foundation_theme`), the full v1→v5 migration chain
  untouched, plus one additive **reserved v6** step (no-op). Existing data loads
  with zero loss — proven by `src/state/store.test.ts`.
- **Passphrase gate** (flash-free pre-paint, session-only) and a **per-buyer
  watermark seal** (signature + install id). The gate is a soft deterrent, not
  real security — real gating belongs at the host (Vercel password / SSO).
- **Offline**: a lean service worker (`public/sw.js`) caches the app shell and,
  after first paint, every route chunk is warmed so the whole app works offline.
  **Zero runtime third-party/network fetches** — system font stacks in Phase 0
  (the Great Vibes signature woff2 lands in a later phase).

## Deploying to Vercel

The project is configured for a zero-config Vercel deploy (`vercel.json`):

- Build command: `npm run build`, output: `dist/`.
- SPA rewrites to `/index.html` (except `/assets`, `/sw.js`).
- `Cache-Control: no-cache` on `index.html` and `sw.js`; long, immutable cache on
  hashed `/assets/*`.

To deploy: in the Vercel dashboard, import this repo and (once ready) point the
production deployment at the appropriate branch. Vercel installs, runs
`npm run build`, and serves `dist/`.

## Legacy / reference files (kept during migration)

- `Foundation__Med_School_Toolkit-8.html` — the shipped single-file app and the
  source of truth for the ported state/migration layer and content.
- `Foundation__Med_School_Toolkit.html`, `Recall__Flashcards.html` — earlier
  prototypes.
- `study-hub/` — a separate multi-user server experiment (not part of this site).
