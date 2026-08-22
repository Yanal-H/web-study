# Flashcard system — living engineering plan

This is the running plan for repairing and hardening Foundation's flashcard
system. It is a **living document**: the repository is the source of truth, and
this file is reconciled against it at the start of every session. Work proceeds
**one batch at a time** — implement the earliest incomplete batch, prove it
against the acceptance gate, then stop and report. Do not roll forward.

**Acceptance gate for every batch** (`.claude/rules/testing.md`): `tsc --noEmit`
clean, `npm run build` succeeds, `vitest run` all green, `eslint src` 0 errors and
no new warnings. Plus: student data preserved, permissions never weakened.

Status legend: ✅ done · 🔜 next · ⬜ planned

**Care level** is tagged on each batch and says how much reasoning the work needs:

- **HIGH** — scheduler maths, timing/concurrency, persistence, permissions, or
  anything that can silently corrupt a student's queue. Reason it through fully,
  design the test before the code, and expect edge cases to matter more than
  volume. Do not rush these.
- **STANDARD** — well-understood mechanical work against a clear spec: UI,
  performance, rendering, copy. Follow the surrounding patterns and the gate.

Match the effort to the tag. HIGH batches are where a wrong answer is invisible
until a thousand students have lost their progress.

---

## ✅ Batch 1 — P0: Live queue & one-minute review repair  · care: HIGH

**Problem.** A card graded "Again" was rescheduled for ~1 minute later but never
came back inside the session, because `ReviewSession` walked a frozen `queue`
array by a forward-only `idx`. Short learning steps were silently owed until the
student left and re-entered.

**Delivered.**

- `src/features/flashcards/liveQueue.ts` — a pure, clock-injected module with
  `ready`/`waiting` state: `initLive`, `placeGraded` (re-queues only
  learning/relearning steps due within the 20-minute session horizon),
  `promoteDue`, `nextDueAt`, `isDueSoon`, `isComplete`, `reinsertForUndo`,
  `aheadCounts`.
- `src/features/flashcards/deck.ts` — `gradeItemLive` awaits the scheduler and
  persists the grade *before* the card leaves the screen, returning the new
  `due`/`state` so the caller can place the card.
- `src/features/flashcards/ReviewSession.tsx` — rewired from the frozen snapshot
  to the live queue: one generation-guarded timer for the earliest waiting card,
  a per-second countdown, focus/visibilitychange revalidation, a "quick breather"
  screen while a card is due back soon, and a persist-before-advance `busy` guard.
- Tests: `liveQueue.test.ts` (15 fake-clock tests, incl. *Again at 08:00 → gone
  from ready → back at ~08:01, no duplicate*).

**Acceptance:** gate green (176 tests); the canonical fake-clock scenario passes.

---

## Roadmap beyond Batch 1 (provisional — reconcile with the repo each session)

The batches below are the planned order of work. They are provisional: confirm the
earliest genuinely-incomplete one against the code before starting, and revise this
list as reality dictates.

### ✅ Batch 2 — Session composition & daily limits · care: HIGH
**Shipped.** newPerDay/reviewsPerDay were named per day but applied per session,
so three sittings gave three times the cap; the `study.daily` ledger the v4
migration added was created, reset, and never incremented or read. `dailyLimits.ts`
wires it up: rollover (including a future-dated ledger), the remaining budget, and
what a grade costs — charged by the card's state BEFORE grading, so a live-queue
re-show spends nothing. The two card pools now share one budget instead of each
taking the full limit. The allowance is shown under the Start button.

### ✅ Batch 3 — Due-queue building & count accuracy · care: HIGH
**Shipped.** `deckStats` counted raw index entries via dueCount/newCount and so
included SUSPENDED cards, while nextDueBatch and the deck tree both skip them —
the Dashboard promised 12 due, the Flashcards page showed 8, the session served 8.
due/neu now come from the same cached pass that builds the deck tree; `total` stays
the library count. dueCount/newCount deleted rather than left as a wrong twin. The
"Due (N)" button now shows what the cap will actually deliver.

### ✅ Batch 4 — Cross-session learning-step persistence · care: HIGH
**Shipped.** Verified correct in both schedulers and pinned with 16 tests (the
failure is silent: a card that resets to step 0 on every reopen never graduates).
The real defect found: Settings offered learning/relearning steps, SM-2+ read them,
and the engine hard-coded [1, 10] — so the setting silently did nothing for every
content card. Both schedulers now read the same numbers, previews included, with
the shipped values as fallback and no change for anyone on defaults.

### ✅ Batch 5 — Undo hardening · care: HIGH
**Shipped.** Four defects: the daily ledger was charged but never refunded (grade →
undo → grade burned two of twenty new cards for one card); the engine's restore was
fired and forgotten, so undo-then-regrade raced and could erase the new rating; undo
shared no guard with grading, so it could pop the stack before an in-flight grade
pushed to it; and only the total was reversed in the tally, not the graded counts.
13 tests cover undo from waiting, from ready after promotion, from a completed
session, and on a card that graduated out of the session.

### 🔜 Batch 6 — Deck browser virtualisation (see task backlog) · care: STANDARD
Large decks render without jank; import stays worker-side.

### ✅ Batch 7 — Import robustness & progress preservation · care: HIGH
**Shipped.** seedScheduling was already correct — existing rows are never reset, and
a card that moves deck keeps its history. The latent catastrophe was card ids: `id`
is optional when authoring and fell back to the card's POSITION in the array, so
inserting one card at the top of a chapter shifted every id below it, orphaning every
scheduling row and returning the whole chapter as brand new with nothing on screen to
say so. `stampIds` now fixes ids at publish time, reproducing the historical
positional scheme exactly for an unstamped pack (so chapters already on devices keep
matching) and giving later additions the first unused slot. The CLI uploader stamps
identically so both paths agree on a chapter's revision.

### ⬜ Batches 8–15 — TBD · care: mixed (tag each when defined)
Remaining hardening (analytics accuracy, suspend/bury, filtered decks, leech
handling, performance at cohort scale, accessibility of the review UI). Define
each precisely when it becomes next, against the code as it then stands.

---

## Working discipline (repeat every session)

1. Read `CLAUDE.md` and `.claude/rules/*`.
2. Reconcile this plan with the repository; find the earliest incomplete batch.
3. Implement exactly that batch. Keep changes minimal and in-style.
4. Prove it: gate green + a test of the specific behaviour.
5. Update this file (mark the batch done, note what shipped).
6. Commit, push, and **stop** with a short report. Do not start the next batch.
