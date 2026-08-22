# Architecture

Foundation is a **Vite + React 18 + TypeScript** single-page app, deployed as
static files on Vercel's free tier, backed by Supabase (auth + shared content)
and IndexedDB (each student's private study data). It is online-only and £0 by
design.

This document is the map. Read it, then `FEATURE_MAP.md` for where a given
feature lives, then `CHANGE_GUIDE.md` for what to open for a given change. The
point of all three is that a change to one feature should require reading that
feature, not the app.

## The shape in one screen

```
index.html ──▶ src/main.tsx ──▶ src/app/App.tsx
                                   │
                 ┌─────────────────┼──────────────────┐
                 ▼                 ▼                  ▼
           src/app/routes.tsx  auth gate        app shell / nav
                 │            (features/auth)
                 ▼
     one lazy-loaded view per route (src/features/*/…View.tsx)
                 │
   ┌─────────────┼───────────────────────────┐
   ▼             ▼                            ▼
 domain logic   services                    UI
 (pure .ts)     (data/, lib/, content/)     (design/, components in features/)
   │             │
   ▼             ▼
 tested with   IndexedDB (private data)  +  Supabase (shared content, auth)
 fake clocks
```

## Directory map (the live app is `src/`)

| Path | What lives here |
|---|---|
| `src/app/` | Bootstrap, router (`routes.tsx`), app shell + navigation (`App.tsx`) |
| `src/features/<name>/` | One folder per feature. Its `…View.tsx` is the route entry; supporting logic, components and tests sit beside it. |
| `src/data/` | The card **engine** and persistence: IndexedDB (`db.ts`), the FSRS scheduler (`fsrs.ts`), session/queue building (`session.ts`), content import (`importPack.ts`), remote sync (`remoteContent.ts`), the in-memory content store (`contentStore.ts`). |
| `src/lib/` | Cross-feature services and utilities: the SM-2+ scheduler (`scheduler.ts`), publishing (`publish.ts`), Supabase client (`supabase.ts`), admin checks (`admin.ts`), search worker, lexicon, sound, stats. |
| `src/state/` | The reactive store (`store.ts`), types (`types.ts`), constants/defaults (`constants.ts`), schema migrations. |
| `src/design/` | The design system: tokens and base CSS (`base.css`), primitive components (`primitives.tsx` + `primitives.css`), icons. |
| `src/content/` | Content-as-data: the Zod schema (`schema.ts`), loader, deck-path logic, catalog. |
| `supabase/` | SQL you run once in the Supabase dashboard. Not part of the build. See `supabase/COMMUNITY_SETUP.md`. |
| `docs/` | This map, the feature map, the change guide, and the flashcard engineering plan. |

## The two schedulers (important, and a common confusion)

There are **two** spaced-repetition engines, by design:

- **FSRS** (`src/data/fsrs.ts`) schedules **content cards** — the published
  curriculum, the majority of a student's deck. State lives in IndexedDB
  (`SCHEDULING` store).
- **SM-2+** (`src/lib/scheduler.ts`) schedules **personal cards** — the
  student's own. State lives in the reactive store (`state.study.cardSched`).

They share one vocabulary (`CardState`: new / learning / review / relearning)
so callers can treat a card the same way regardless of which engine owns it.
`src/features/flashcards/deck.ts` is the bridge: it unifies both into one
`ReviewItem` queue and routes each grade to the right engine.

If you change scheduling behaviour, decide first **which engine** you mean, and
keep them in step — a fix applied to one and not the other is a recurring bug
class here (see the flashcard plan).

## Data flow (a review, end to end)

```
published content (Supabase)
  ─▶ downloaded per session, held in memory (data/remoteContent, data/contentStore)
  ─▶ imported into the IndexedDB card + scheduling stores (data/importPack)
queue built for a deck            (data/session buildQueue, features/flashcards/deck)
  ─▶ ReviewSession shows a card    (features/flashcards/ReviewSession.tsx)
  ─▶ student grades it
  ─▶ persist BEFORE advancing      (deck.gradeItemLive → the owning scheduler)
  ─▶ live queue decides re-show    (features/flashcards/liveQueue.ts — pure)
  ─▶ daily allowance charged       (features/flashcards/dailyLimits.ts — pure)
```

The rule the whole flashcard system is built on: **domain logic is pure and
clock-injected**, so timing is tested with a fake clock, never by sleeping. The
UI (`ReviewSession.tsx`) is a thin driver over pure modules (`liveQueue`,
`dailyLimits`, `leech`, `siblings`, `stats`, `cardOps`, `search`).

## State ownership

| State | Lives in | Notes |
|---|---|---|
| Auth session | Supabase, mirrored in `features/auth/session.ts` | Server decides who may sign in. |
| Shared curriculum | Supabase `chapters`, cached in memory for the session | Never written to disk — online-only by design. |
| Card schedules & review log | IndexedDB (`src/data/db.ts`) | The irreplaceable data. Never mass-rewrite it. |
| Personal cards, notes, settings, daily ledger | Reactive store (`src/state/store.ts`), persisted to localStorage | Versioned; migrations are forward-only and additive. |
| Per-view UI state | React component state | Nothing persistent. |

## Persistence & migrations

The reactive store carries a `schemaVersion` (`src/state/constants.ts`). Every
migration is guarded by a version check, is idempotent, and only **adds** —
it never drops a student's history. IndexedDB rows are similarly forward-only:
new fields are optional, and code that reads them tolerates their absence (e.g.
`ReviewLog.prevState`, added for statistics). Storage keys are never renamed
without migration logic. See `.claude/rules/data-safety.md`.

## Auth & security boundaries

The browser never decides who may sign in or who is an admin. A Supabase
server-side trigger and `is_admin()` (reading `auth.jwt() ->> 'email'`) own
that, and row-level security is the enforcement point for reading and
publishing content. Anything in the client is presentation only — the top of
`src/lib/publish.ts` says so explicitly. Never place a real access decision, or
a secret, in frontend code.

## Testing

Pure logic → Vitest unit tests with fake clocks. React → Testing Library under
jsdom. The gate (`.claude/rules/testing.md`): `tsc --noEmit`, `npm run build`,
`npx vitest run`, `npx eslint src` — all green before commit. 423 tests at last
count.

## Build & deploy

`npm run build` (which validates content first) emits `dist/`, which Vercel
serves. `vercel.json` holds the rewrites and the strict CSP. A service worker
(`public/sw.js`) caches the shell for offline use; scheduling and content
services never cache Supabase responses to disk.

## Known hotspot

`src/features/features.css` (~4.7k lines) holds every feature's styles in one
file — the one place in the live app where a small change means opening a large
file. `CHANGE_GUIDE.md` records the incremental split plan; it is deferred
because CSS order is cascade-sensitive and a live medical app warrants visual
QA per screen before it lands.
