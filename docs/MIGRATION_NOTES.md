# Migration notes

## What this "migration" actually was

A master engineering mission asked for the app to be transformed from a
single-giant-file monolith into a professional feature-first architecture, so
future AI sessions could change one feature without reading the whole app.

On inspection, **the app was already that architecture.** The migration the
mission describes had happened earlier (the React/TypeScript port — see the
project history). The live app is 171 TS/TSX files under `src/`, organised
feature-first, with a service layer, a design-token system, and 423 tests.

So this pass did not rewrite anything. Doing so would have been the exact
"dangerous giant rewrite" the mission itself forbids, on a live app a cohort
depends on, at real credit cost, for no architectural gain. The senior call was
to **verify the premise, find why it looked wrong, fix that, and document the
real architecture** so the misreading cannot recur.

## Why the app *looked* like a monolith

Three orphaned HTML files sat in the repo root:

- `Foundation__Med_School_Toolkit-8.html` (7,346 lines)
- `Foundation__Med_School_Toolkit.html` (3,233 lines)
- `Recall__Flashcards.html` (1,477 lines)

These were the pre-React single-file versions of the app — ~12,000 lines of
dead code, referenced by nothing, not in the build (`vercel.json` builds `dist/`
from Vite → `src/`). Anyone — human or AI — glancing at the repo root would
reasonably conclude the app was a giant HTML file. They were the single most
AI-hostile thing in the repository, and they are the reason this mission was
framed around a monolith that no longer exists.

**Removed** in this pass, after confirming they were unreferenced by any code,
config, or the build.

## What was added

- `docs/ARCHITECTURE.md` — the system map (structure, the two schedulers, data
  flow, state ownership, persistence, security, testing).
- `docs/FEATURE_MAP.md` — where each feature lives and which files to open first.
- `docs/CHANGE_GUIDE.md` — a routing table from "I want to change X" to the 2–4
  files to open.
- `CLAUDE.md` — extended with the Minimum Necessary Context principle.

## Persistence

Untouched. No storage keys renamed, no schema version bumped, no migration
added. Nothing in this pass affects a student's saved data.

## Debt cleared since

1. **`src/features/features.css` split (done).** The 4.7k-line file is gone.
   Its rules now live in one stylesheet per feature — `src/features/<name>/<name>.css`
   — plus a shared `src/features/shell.css` for app-wide furniture (sections,
   list rows, page titles, the dock, the viewer, route transitions) and
   `src/design/markdown.css` for the `.md` rules the reader, notes, AI panels and
   knowledge box all share. `src/main.tsx` imports them in the original document
   order, and that order **is** the cascade — a comment there says so. The split
   was proven safe, not eyeballed: the built stylesheet was diffed rule-by-rule
   (same 1,135 rules, same multiset) and the *computed* style of every one of
   ~700 classes was compared before vs after in a headless browser across light,
   dark, reduce-motion and dyslexia-font, at nine viewport widths from 360px to
   1280px — identical everywhere. Two blocks that had drifted from their feature
   were moved to where they belong (the narrow-phone `.grade-row` override into
   flashcards; the shared `.md` rules into the design layer), each move re-proven
   the same way.

2. **`study-hub/` removed (done).** The abandoned Express + Socket.io prototype
   (with its committed `node_modules`) is deleted. It was referenced by nothing
   in the live app — confirmed by grepping `src/`, `index.html`, `package.json`,
   `vite.config.ts` and `vercel.json` before removal.

## Remaining technical debt (real, not invented)

3. A few large views (`ReaderView.tsx`, `QuestionRunner.tsx` ~640–720 lines) are
   big but cohesive — each is one screen's worth of one feature. Not a problem
   worth the churn today; split only if one grows a second responsibility.
