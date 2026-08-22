# Foundation — engineering guide for Claude

Foundation is an online-only med-school study web app for a ~1000-student cohort.
Vite + React 18 + TypeScript, Supabase for auth and the shared content store, and
IndexedDB for every student's private study data. It is deployed on Vercel's free
tier and must stay a £0 stack.

This file is the standing brief. Read it, and the rule files under `.claude/rules/`,
before changing anything. The repository — not any prior chat, summary, or plan
document — is the source of truth. Inspect the code before you assume how it works.

## Commands (the acceptance gate)

Run all four before committing. None may regress.

```
npx tsc --noEmit                       # 0 errors
npm run build                          # must succeed (runs content validation first)
npx vitest run                         # all green (176 at last count)
npx eslint src --ext .ts,.tsx          # 0 errors; ~29 warnings is the accepted baseline
```

Do not "fix" the baseline warnings as a side quest — they predate this work and
touching those files risks unrelated regressions. Add none of your own.

## Architecture, briefly

- **Auth** — Supabase email OTP, implicit flow. The browser never decides who may
  sign in; a server-side trigger and `is_admin()` (reading `auth.jwt() ->> 'email'`)
  own that. See `src/features/auth/`, `src/lib/supabase.ts`, `supabase/setup.sql`.
- **Content is data, not code** — chapters are authored as JSON, validated by Zod
  (`src/content/schema.ts`), and published to a Supabase table behind row-level
  security (`src/lib/publish.ts`). Students download chapters into memory each
  session (`src/data/remoteContent.ts`, `src/data/contentStore.ts`); nothing is
  persisted to disk, by design, so a lost device carries no material.
- **Study engine** — cards live in IndexedDB (`src/data/db.ts`). Scheduling is
  FSRS for engine cards (`src/data/session.ts`) and SM-2+ for content/user cards
  (`src/lib/scheduler.ts`), bridged in `src/features/flashcards/deck.ts`.
- **The live review queue** — `src/features/flashcards/liveQueue.ts` is a pure,
  clock-injected module that re-shows short learning/relearning steps within the
  same session. `ReviewSession.tsx` drives it. This is the heart of the flashcard
  work; see `.claude/rules/flashcards.md`.
- **Workers** — import and search run off the main thread with a main-thread
  fallback (`src/data/import.worker.ts`, `src/lib/search.worker.ts`).

## How this work proceeds

The flashcard system is being repaired in small, ordered **batches**. The living
plan is `docs/FLASHCARD_ENGINEERING_PLAN.md`.

- Implement **one** batch per session, prove it against the gate, then **stop** and
  report. Do not roll forward into the next batch on your own.
- Find the earliest incomplete batch in the plan and work that one.
- Every batch keeps the four gate commands green and preserves student data.

## Several sessions work on this repo at once

More than one Claude session edits Foundation, and `main` moves while you work.
A branch cut this morning went 35 commits behind by the afternoon and could not
be merged. Before starting, and again before you push:

```
git fetch origin main
git log --oneline HEAD..origin/main | head -20    # what landed while you were away
```

If `main` has moved, integrate EARLY rather than at merge time, and integrate by
re-applying your work onto its current files — never by overwriting them with
your older copies. Another session's commits are someone's finished work; read
what they changed before assuming your version is the newer one. When both sides
touched the same file, the newer `main` version is usually the better base, and
your change is usually the addition on top of it.

## Non-negotiables

- **Never weaken permissions.** Students may never reach admin-only actions;
  admins may never lose access. Auth rules live on the server — keep them there.
- **Never destroy student data.** No mass reschedule, no wiping IndexedDB, no
  resetting progress. Content imports overwrite by id and must not touch schedule
  rows. See `.claude/rules/data-safety.md`.
- **Stay £0 and online-only.** No paid services, no new hosting, no baking content
  into the bundle.
- Match the surrounding code's style, comment density, and idioms.
