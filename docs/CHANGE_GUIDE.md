# Change guide

A routing table for common changes: what to open, and nothing more. Pair it with
`FEATURE_MAP.md`. If a change isn't listed, find the feature in the feature map
and open that folder.

The principle behind every row: **read the pure module for behaviour, the View
for presentation, and the test to see the contract.** Most changes here touch
2–4 files.

---

### Change the flashcard review controls (Again/Hard/Good/Easy, keys, timing)
`src/features/flashcards/ReviewSession.tsx` (UI) and `liveQueue.ts` (when a card
re-shows). Prove timing changes in `liveQueue.test.ts` / `ReviewSession.test.tsx`.
Do **not** change the schedulers to alter queue behaviour.

### Change FSRS scheduling (content cards)
`src/data/fsrs.ts` and its `fsrs.test.ts`. Nothing in `features/` should need
touching. Remember the SM-2+ twin below if the change is conceptual.

### Change SM-2+ scheduling (personal cards)
`src/lib/scheduler.ts`. Keep it in step with FSRS if the change is about steps,
leeches, or lapses — a fix to one engine and not the other is a known bug class.

### Change daily limits / new-card pacing
`src/features/flashcards/dailyLimits.ts` (pure) and where it's applied in
`FlashcardsView.tsx`. Settings for it: `SettingsView.tsx`.

### Change leech or sibling-bury behaviour
`src/features/flashcards/leech.ts` or `siblings.ts` (both pure, both tested).
Wired into `deck.ts` (leech) and `ReviewSession.tsx` (siblings).

### Change Browse search syntax
`src/features/flashcards/search.ts` (pure, `search.test.ts`). Used by
`CardBrowser.tsx`.

### Change the Progress / statistics screen
`src/features/flashcards/stats.ts` (pure) and `StatsPanel.tsx`.

### Change MCQ answering, feedback, or timed mode
`src/features/qbank/QuestionRunner.tsx`; entry `QbankView.tsx`.

### Add / fix study content (a chapter, cards, questions)
Content is data, not code. Author JSON against `src/content/schema.ts`, then
publish it via **Settings → publish panel** (`src/lib/publish.ts` handles ids,
validation, and import). You should not edit application code to add a chapter.

### Change the dashboard cards or heatmap
`src/features/dashboard/DashboardView.tsx`; heatmap in `ActivityCalendar.tsx`.

### Change Community chat, or the daily-lecture logs
Chat/shell: `src/features/community/CommunityView.tsx`. Daily logs + admin
digest: `DailyLogPanel.tsx` + `dailyLog.ts`. Database side: the
`supabase/community-*.sql` files (`COMMUNITY_SETUP.md` explains running them).

### Change global typography, colour, spacing, radius, shadow
`src/design/base.css` — it's all tokens. Change the token, not the call sites.
Primitive component looks: `src/design/primitives.css`.

### Change one feature's styling
`src/features/features.css` today (all feature CSS is here — search for the
feature's class prefix). See the hotspot note in `ARCHITECTURE.md`.

### Change the mobile navigation / app shell
`src/app/App.tsx` (nav, shell, command palette). Routes: `src/app/routes.tsx`.

### Add a new top-level page
Add a `…View.tsx` under a new `src/features/<name>/`, then one `route(...)` line
in `src/app/routes.tsx`. Nothing else needs to know about it.

### Change persistence / add a stored field
`src/state/store.ts` + `src/state/constants.ts` (bump `SCHEMA_VERSION`, add a
guarded, additive migration). For IndexedDB rows, add optional fields and
tolerate their absence. Never rename a storage key without a migration. Read
`.claude/rules/data-safety.md` first.

### Change who counts as an admin, or sign-in rules
Server, not client: `supabase/setup.sql` (`admin_emails()` / `is_admin()`). The
client (`src/features/auth/`, `src/lib/admin.ts`) only presents the result.
