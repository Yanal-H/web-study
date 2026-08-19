# Feature map — where every tab & function lives

Use this to write focused "improve X" prompts. For any tab, name the files under
**Files** and tell me what to change; they're small and self-contained.

Everything is under `src/`. Shared building blocks first, then each tab.

---

## Shared building blocks (used by every tab)

| Concern | Files | What it does |
|---|---|---|
| Design tokens (colours, type, spacing, motion; light/dark) | `src/design/tokens.css` | The whole palette + theme. Change the look here. |
| Base layout + app shell (sidebar, topbar, scrollbars) | `src/design/base.css` | Shell + global element styles. |
| UI primitives (Button, Card, Input, Tabs, Segmented, Badge, ProgressRing, Skeleton, Stat…) | `src/design/primitives.tsx`, `src/design/primitives.css` | Reusable components + their styles. |
| Dialog / Drawer, Toast, Command palette, Icons | `src/design/Dialog.tsx`, `src/design/Toast.tsx`, `src/design/CommandPalette.tsx`, `src/design/icons.tsx` | Overlays, notifications, ⌘K, all SVG icons. |
| Fonts (self-hosted) | `src/design/fonts.css`, `public/fonts/*` | Fraunces / Inter / JetBrains Mono / Great Vibes. |
| App shell, routing, nav, ⌘K wiring, keyboard shortcuts | `src/app/App.tsx`, `src/app/routes.tsx` | The frame around every tab. |
| State + migrations (localStorage) | `src/state/store.ts`, `src/state/constants.ts`, `src/state/types.ts`, `src/state/useStore.ts`, `src/state/theme.ts` | Persistence, the migration chain, the `useStore()` hook. |
| Sign-in pre-paint shell + theme | `index.html` | The loading shell + flash-free theme. |
| Watermark seal | `src/features/gate/Watermark.tsx`, `.../watermark.css` | Per-buyer signature + install id. |
| Feature styles (most page CSS) | `src/features/features.css` | One stylesheet for dashboard/reader/flashcards/qbank/etc. |

---

## Tabs

### Dashboard
- **Files:** `src/features/dashboard/DashboardView.tsx`; math in `src/lib/stats.ts`.
- Hero + signature, at-a-glance stats, streak, activity heatmap, daily-goal ring,
  14-day forecast, weak spots, next-best-action. All figures come from real data.

### Study (Library + Reader)
- **Files:** `src/features/study/StudyView.tsx` (shared library), `src/features/study/ReaderView.tsx` (reader), `src/features/study/progress.ts` (per-chapter %).
- Content pipeline: `src/content/schema.ts` (Zod) → `src/lib/publish.ts` (admin validation/publish) → `src/data/remoteContent.ts` / `src/data/bootstrap.ts` → `src/content/loader.ts`. Chapters authored in `content/**/*.json` can be seeded with `npm run upload:content`; the live app publishes them from **Settings → Admin**.
- Students can read only the shared curriculum. The database RLS policy in `supabase/setup.sql`, not a browser flag, enforces it.
- Reader has: TOC, reading-progress bar, Focus mode, Print, mark-read, [[wikilinks]], tables, figures.

### Flashcards
- **Files:** `src/features/flashcards/FlashcardsView.tsx` (home/launcher/heatmap/import-export), `ReviewSession.tsx` (the study session), `deck.ts` (queue), `Occlusion.tsx` + `OcclusionEditor.tsx` (image occlusion), `CardBrowser.tsx` (browse/edit), `anki.ts` (TSV/CSV), `makeCard.ts` ("make a card" hook).
- Scheduler: `src/lib/scheduler.ts` (SM-2+, tested in `scheduler.test.ts`).
- Card renderers (basic/reversed/cloze/type/image/occlusion) live inside `ReviewSession.tsx`.

### Question Bank (MCQ + EMQ)
- **Files:** `src/features/qbank/QbankView.tsx` (setup/modes), `QuestionRunner.tsx` (question screen + navigator + results), `EmqRunner.tsx` (EMQ), `engine.ts` (pools/session), `perf.ts` (performance store).
- Modes, per-option rationale, timed exams, results analytics, make-flashcard-from-missed.

### Subjects
- **Files:** `src/features/subjects/SubjectsView.tsx`. CRUD for subjects + colours.

### Planner
- **Files:** `src/features/planner/PlannerView.tsx`. Weekly block grid + task list.

### Notes
- **Files:** `src/features/notes/NotesView.tsx`; markdown/cloze/wikilinks in `src/lib/markdown.ts`.
- Markdown editor + preview, [[wikilinks]], backlinks, callouts, cloze.

### Calculators
- **Files:** `src/features/calculators/CalculatorsView.tsx` (UI), `formulas.ts` (the maths, tested in `formulas.test.ts`).
- BMI, MAP, Cockcroft–Gault, corrected Ca/Na, anion gap, BSA — each cited.

### Mnemonics
- **Files:** `src/features/mnemonics/MnemonicsView.tsx`. Add/list memory hooks.

### Resources
- **Files:** `src/features/resources/ResourcesView.tsx`. Links + notes.

### Settings
- **Files:** `src/features/settings/SettingsView.tsx`, `appearance.ts`.
- Theme, text size, density, reduced motion, goals, scheduler, MCQ options,
  export/import backup, reset-with-backup.

### Global search (⌘K)
- **Files:** `src/lib/search.ts` (index), wired in `src/app/App.tsx`.

---

## How to prompt me per tab (template)

> "Improve the **Flashcards review session**. Files: `src/features/flashcards/ReviewSession.tsx`
> (+ `deck.ts`, `features.css`). I want: [your changes]. Keep the SM-2+ scheduler and
> lossless migrations intact; keep light/dark parity and offline; run the tests."

Naming the files + "keep migrations/offline/theme intact" gets the tightest result.
