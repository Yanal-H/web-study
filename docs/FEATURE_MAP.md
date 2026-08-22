# Feature map

Where each feature lives, and which files to open first for a change to it. The
goal: identify the feature, open the 2–4 files named here (plus their direct
imports), change it, run the gate. Do not scan the repository.

Every route is a lazy-loaded `…View.tsx` under `src/features/<name>/` — see
`src/app/routes.tsx` for the route → file table.

---

## Flashcards — the core, and the most carefully engineered area
Route `flashcards` · `src/features/flashcards/`

The review loop is built from **pure, clock-injected modules** with a thin UI
driver. Read `.claude/rules/flashcards.md` before changing review behaviour.

| Concern | File |
|---|---|
| The review screen (UI driver) | `ReviewSession.tsx` |
| Live re-show queue (Again comes back this session) | `liveQueue.ts` (pure) |
| Daily new/review limits | `dailyLimits.ts` (pure) |
| Leech detection | `leech.ts` (pure) |
| Sibling burying | `siblings.ts` (pure) |
| Progress statistics | `stats.ts` (pure) + `StatsPanel.tsx` |
| Per-card ops (forget, set due, history) | `cardOps.ts` (pure) |
| Anki-style search | `search.ts` (pure) |
| Queue building, both engines bridged | `deck.ts` |
| Deck picker / card browser | `FlashcardsView.tsx`, `DeckBrowser.tsx`, `CardBrowser.tsx` |
| Content-card scheduling engine | `../../data/fsrs.ts`, `../../data/session.ts` |
| Personal-card scheduling engine | `../../lib/scheduler.ts` |

Living plan for this area: `docs/FLASHCARD_ENGINEERING_PLAN.md`.

## Question bank (MCQ / EMQ)
Route `qbank` · `src/features/qbank/`
Start with `QbankView.tsx` (entry) and `QuestionRunner.tsx` (the player:
answering, feedback, navigation, timed mode).

## Study library & reader
Routes `study`, `study/:id` · `src/features/study/`
`StudyView.tsx` is the library; `ReaderView.tsx` is the chapter reader (TOC,
tables, mark-reviewed, "review these cards" hand-off to flashcards).

## Community (chat + daily lecture logs)
Route `community` · `src/features/community/`
`CommunityView.tsx` is the shell (channels, discussion tab). `DailyLogPanel.tsx`
+ `dailyLog.ts` are the "Today's lectures" collection and the admin digest.
`CommunityAdmin.tsx` is moderation/roster. **Backend:** the `supabase/community-*.sql`
files; run `supabase/community-ALL-IN-ONE.sql` once. Setup + troubleshooting:
`supabase/COMMUNITY_SETUP.md`.

## Dashboard
Route `` (index) · `src/features/dashboard/`
`DashboardView.tsx`; the contribution heatmap is `ActivityCalendar.tsx`.

## Planner, Notes, Calculators, Mnemonics, Resources
Routes of the same name · `src/features/{planner,notes,calculators,mnemonics,resources}/`
Each is a single `…View.tsx` plus small local helpers.

## Settings
Route `settings` · `src/features/settings/SettingsView.tsx`
All scheduler tunables (new/day, learning steps, leech threshold, bury
siblings), reading comfort, themes, and the content **publish** panel live here.

## Admin
Route `admin` (admin-only) · `src/features/admin/`
`AdminView.tsx`. Gated by the server; `src/lib/admin.ts` is the check.

## Auth
`src/features/auth/`
`session.ts` (send/verify email codes, sign out), `SignIn.tsx`. The server
decides who may sign in — see `src/lib/supabase.ts` and `supabase/setup.sql`.

## Cross-cutting services (not routes)

| Concern | Where |
|---|---|
| IndexedDB, review log, stores | `src/data/db.ts` |
| Content download / online-only sync | `src/data/remoteContent.ts`, `src/data/contentStore.ts` |
| Content import (worker + fallback) | `src/data/importPack.ts`, `import.worker.ts`, `importClient.ts` |
| Publishing content to the cohort | `src/lib/publish.ts` |
| Reactive store, migrations | `src/state/store.ts`, `src/state/constants.ts` |
| Design tokens & primitives | `src/design/base.css`, `src/design/primitives.{tsx,css}` |
| Feature styles (one file per feature) | `src/features/<name>/<name>.css` |
| App-shell / shared styles | `src/features/shell.css` |
| Shared markdown body styles | `src/design/markdown.css` |
| Content schema (Zod) | `src/content/schema.ts` |
