# Review prompt — Foundation Med-School Toolkit

Paste everything below the line into another AI (Claude, GPT, Gemini, …) and attach
the codebase digest **`REVIEW_BUNDLE.md`** (or the `foundation-app-source.zip`). The
reviewer's job is to critique and propose concrete improvements — the output is handed
straight back to the developer AI that builds the app, so findings must be specific and
reference real files and line ranges.

---

You are a senior reviewer auditing an **offline-first medical-study web app** for medical
students. It is a Vite + React 18 + TypeScript single-page app, deployed on Vercel,
using `HashRouter`. All state persists locally; the only network request the app can
ever make is the **opt-in AI tutor** (bring-your-own Anthropic key, off by default),
and only after the student presses a button.

Read the digest before writing anything. Then review against the dimensions below and
return findings in the exact format at the end.

## Hard constraints — never propose anything that breaks these
- **Zero runtime third-party or network fetches** other than the opt-in AI tutor.
  Everything is self-hosted: no CDNs, no web fonts, no remote images. Typography uses
  the system-font tokens `--font-display / --font-ui / --font-mono`.
- **Offline-capable** and installable. The service worker prefetches every route chunk.
- **Never lose user data.** Migrations are additive and lossless; an import backs up the
  prior state first. Storage is `localStorage` (app state) + IndexedDB (the card engine
  and the blob/file library).
- **No emoji anywhere** — icons are inline stroke SVGs in `src/design/icons.tsx`.
- **British spelling** throughout UI copy and comments.
- Preserve the brand: **"Yanal"**, the Great Vibes signature, and **"by Yanal · Cairo 2026"**.
- Medical-content integrity: answers derived independently, cited where authored, nothing
  fabricated. AI-tutor output is clearly labelled and never overrides the written rationale.

## Architecture (so you don't "discover" these as missing)
- **App shell** `src/app/` — lazy routes (`routes.tsx`), the shell/nav/command palette
  and shortcuts (`App.tsx`).
- **State** `src/state/` — a reactive store over `localStorage` via `useSyncExternalStore`
  (`useStore.ts`, `store.ts`); `useStoreVersion()` exists because the store object is
  mutated in place, so memos must key on the version counter.
- **Content-as-data** `src/content/` + `content/` — chapters validated by a Zod schema
  (`src/content/schema.ts`, `foundation.study-module/v1`) at build time
  (`scripts/validate-content.ts`) and at runtime import. 14 shipped chapters.
- **Card engine** `src/data/` — IndexedDB stores for chapters/cards/mcqs/scheduling/media,
  an FSRS scheduler, a `[deck, due]` compound index for O(log n) due-queue scans, chunked
  idempotent import, one-time bootstrap of the shipped packs.
- **Features** `src/features/` — dashboard, study (library + reader), subjects, flashcards
  (Anki-style deck tree, SM-2+/FSRS review, occlusion), qbank (single/multi/EMQ with
  per-option rationale + optional AI hints/explanations), planner, notes, calculators,
  mnemonics, resources (in-app PDF reader + blob library), settings, focus timer, music.
- **Design** `src/design/` — tokens (`tokens.css`), base/strength CSS, primitives,
  the semantic colour lexicon (`src/lib/lexicon.ts`).
- **Haki** — a synthesised living background (`src/features/effects/HakiField.tsx`) and a
  red/black "haki" aesthetic; the ambient thunder sound has been removed.

## Review these dimensions
1. **UX & visual design** — hierarchy, spacing, colour, motion, empty states, first-run
   experience, cross-navigation between Study / Flashcards / Question Bank, and whether the
   reader genuinely reads like a textbook.
2. **Accessibility** — keyboard reachability, visible focus, ARIA roles/labels, contrast in
   light and dark, `prefers-reduced-motion`, screen-reader flow.
3. **Correctness & robustness** — the reactive-store memo pitfall, async engine loads, data
   migrations, the FSRS/SM-2 scheduling, the import validation path, error handling.
4. **Performance** — the 1.6 MB main bundle and how to split it (content data / vendor /
   engine), virtualising very large deck lists, worker-side import, render churn from the
   in-place store.
5. **Medical & pedagogical value** — question quality, spaced-repetition design, whether the
   study loop actually drives retention for a ~1000-student cohort.
6. **Security & privacy** — the AI-tutor key handling (stored in `localStorage`, sent only in
   the direct model call), the soft passphrase gate, export/backup safety.

## Output format
Return a prioritised list. For each finding:
- **Title** — one line.
- **Severity** — critical / high / medium / low.
- **Where** — file path(s) and, if you can, the function or line range.
- **Problem** — what is wrong or weak, concretely.
- **Fix** — a specific, actionable change (not "consider improving"). Small code sketches welcome.
- **Constraint check** — confirm your fix respects every hard constraint above.

Then finish with a short **"Top 5 to do first"** ordered list. Do not rewrite the whole app;
propose changes the developer AI can apply file by file.
