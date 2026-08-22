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

### ✅ Batch 6 — Deck browser virtualisation (see task backlog) · care: STANDARD

**Shipped.** The "worker-side import" half of this task was already done (H5).
The remaining defect: `CardBrowser` ("Browse cards") hard-capped its list at
400 rows — `shown.slice(0, 400)` — so any card past the cut-off was simply
unreachable, with no way to find it except guessing a search term that
happened to narrow the list below 400. For a shared cohort library that can
hold thousands of cards, that is not a performance shortcut, it is cards
nobody can open.

- `src/lib/virtualList.ts` — pure windowing arithmetic (`windowFor`): given a
  scroll position, a fixed row height and a row count, which slice of indices
  needs to exist in the DOM. Unit-tested directly, no DOM involved.
- `src/design/primitives.tsx` — `VirtualList`, a thin generic component over
  that arithmetic: a scrollable pane of a fixed height, rendering only the
  windowed slice with top/bottom spacer divs so scrollbar size and position
  stay correct.
- `CardBrowser.tsx` — the 400-row cap is gone; the full card list (any size)
  renders through `VirtualList`. Row height and the list container's layout
  were made explicit (`.list--virtual`, no flex `gap`) so the windowing math
  and the actual rendered layout can't drift apart.
- `DeckBrowser.tsx` (the drill-down deck tree) was deliberately left as is: it
  renders one tree level at a time, which stays small under realistic decks —
  unlike Browse's flat list, which is the whole shared bank at once. Revisit if
  a single flat "My cards" bucket of personal cards ever grows large enough to
  need the same treatment.

**Proof:** `virtualList.test.ts` (8 tests, pure arithmetic) plus
`CardBrowser.test.tsx`, which renders 5,000 synthetic cards and asserts card
#4990 is absent at first render and appears only once scrolled to — the exact
shape of the regression this fixes.

Gate: tsc clean, build ok, 315 tests green (45 files), eslint 0 problems.

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

---

## Batches 8+ — closing the gap with Anki

Defined against the Anki manual (deck options, leeches, filtered decks, stats)
and an audit of what this repo actually implements. Several "settings" here are
offered in the UI and wired to nothing, which is worse than not offering them:
a student changes a number and believes something happened.

### ✅ Batch 8 — Leeches reach every card, and cards can be suspended · care: HIGH
`leechThreshold`/`leechAction` are implemented **only in the SM-2+ path**
(`lib/scheduler.ts`), so personal cards can become leeches and content cards —
the overwhelming majority of a student's deck — never can. Same shape as the
Batch 4 defect. Anki's rule: a lapse counter increments on failing a review
card; at the threshold (default 8) the note is tagged `leech` and the card
suspended; it is re-flagged every half-threshold thereafter. The data layer
already honours `suspended` everywhere (every queue query skips it) but nothing
ever SETS it for engine cards, and a student has no way to suspend one by hand.

**Shipped.** `leech.ts` holds the one rule both schedulers now call: fires on the
threshold and every half-threshold after, tags or suspends per the setting, and
is inert when the threshold is 0 or the caller passes nothing (so untouched call
sites behave exactly as before). The engine suspends a card that crosses the
threshold; SM-2+ was refactored onto the same function rather than keeping its
own copy. `setSuspended` / `toggleSuspend` give a student a Suspend button and
the `!` shortcut in review — suspending changes only that flag, leaving interval,
ease and history intact so unsuspending resumes rather than restarts.
22 tests. Gate: 339 green (47 files), build ok, eslint 0.

### ✅ Batch 9 — Bury siblings · care: HIGH
`burySiblings: true` ships in the defaults and has **zero implementation**.
Siblings are cards from one note: every cloze deletion in a paragraph, every
region of one occluded diagram. Seeing them back-to-back is both wasted
repetitions and false confidence — the second one is answered from the first,
not from memory. This app leans hard on image occlusion, so it matters more
here than in a plain text deck.

**Shipped.** `siblings.ts` derives what a card was cut from — the regions of one
personal occlusion image share a key prefix, content occlusion cards share an
image id within a chapter — and returns null for anything else rather than
inventing a group, because guessing would bury unrelated cards. Grading now
drops the siblings from the rest of the sitting and says so once.

Scope, honestly: this buries for the **rest of the session**, where Anki buries
until the next day. That is deliberate — `.claude/rules/flashcards.md` forbids
changing a persisted schedule to achieve a queue behaviour, and a day-scoped
bury needs its own stored state. The harm being fixed (siblings back-to-back in
one sitting) is fully addressed; day-scoped burying is a follow-up that needs a
`buriedUntil` field, not a due-date rewrite.

Both `burySiblings` and `leechThreshold` are now actually reachable in Settings;
they shipped in the defaults and were exposed nowhere. 16 tests.

### ✅ Batch 10 — Custom study: cram before an exam · care: HIGH
Anki's filtered decks, scoped to what a medical student actually needs the
night before a paper: study a tag or chapter ahead of schedule, redo today's
failures, or take an extra N cards beyond the daily cap. The hard requirement
is that a cram session must NOT corrupt real scheduling — previewing a card
ahead of time cannot silently reset its interval.

**Shipped.** A Cram session takes a whole deck ignoring due dates and the daily
cap, and writes **nothing** — no scheduling row, no daily ledger, no review log.
`cramGrade` only decides whether a card comes round again inside the sitting
(Again ~1 min, Hard ~5 min, Good/Easy retired), which is a queue decision and
the only kind this mode is allowed to make. The screen says so plainly, and Undo
is disabled because there is nothing to undo. Five tests pin the promise,
including one asserting the scheduler is never called and one asserting a normal
session still does write — a silent leak here would quietly reset months of
scheduling.

Not yet done from this batch: study-by-tag, study-ahead-by-N-days, and
"redo today's failures" as separate entry points.

### 🔜 Batch 11 — Statistics that tell the truth · care: STANDARD
True retention (what proportion you actually recall when due) against desired
retention, a forecast of the coming workload, and the answer-button spread.
This is how a student knows whether the system is working, and it is the
evidence needed before touching FSRS parameters.

### ⬜ Batch 12 — Per-card operations · care: STANDARD
Card info (full review history), set due date, forget/reset, and reposition a
new card. Each is one card at a time and by explicit request — never a mass
reschedule (see `.claude/rules/data-safety.md`).

### ⬜ Batch 13 — Browse: search syntax and flags · care: STANDARD
Browse filters by plain substring. Anki's `deck:`, `tag:`, `is:due`,
`is:new`, `is:suspended`, `flag:` make a large library navigable. Flags are
currently one boolean; Anki has several colours, which students use for
"ask a tutor" / "revisit" / "exam-critical".

---

## Working discipline (repeat every session)

1. Read `CLAUDE.md` and `.claude/rules/*`.
2. Reconcile this plan with the repository; find the earliest incomplete batch.
3. Implement exactly that batch. Keep changes minimal and in-style.
4. Prove it: gate green + a test of the specific behaviour.
5. Update this file (mark the batch done, note what shipped).
6. Commit, push, and **stop** with a short report. Do not start the next batch.
