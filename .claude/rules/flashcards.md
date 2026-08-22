# Rule: the flashcard review loop

The review session is the app's core. It has one behaviour that must never break
again: **a card graded "Again" (or any short learning/relearning step) comes back
within the same active session, automatically, without leaving and re-entering.**

## The defect this guards against

The old `ReviewSession` was a frozen snapshot — a fixed `queue` array walked by an
`idx` that only moved forward. A card graded "Again" was rescheduled correctly for
~1 minute later, but the session never looked at that new due time, so the card
never returned. `idx` reached the end and the session "completed" with cards still
owed. That is the bug. Do not reintroduce a monotonic index over a frozen array.

## The shape of the fix

`src/features/flashcards/liveQueue.ts` is a **pure, clock-injected** module:

- `LiveState = { ready: ReviewItem[]; waiting: WaitingEntry[] }`.
- `placeGraded` re-queues a card as *waiting* only when it is in a
  `learning`/`relearning` state AND its next due time is within
  `SESSION_HORIZON_MS` (20 min) and still in the future. Anything that has
  graduated to days is done for this session.
- `promoteDue` moves waiting cards whose time has come into `ready`.
- `ReviewSession.tsx` holds one `setTimeout` for the earliest waiting card,
  guarded by a generation counter so a stale timer can't fire, plus focus/
  visibilitychange revalidation for backgrounded tabs.

Rules for anyone touching this:

- Keep `liveQueue.ts` pure and clock-injected. All timing decisions take a `now`
  argument so they can be tested with a fake clock. Never call `Date.now()` inside
  the pure functions.
- Persist **before** advancing. `deck.ts#gradeItemLive` awaits the scheduler and
  writes the grade before the card leaves the screen, so a crash mid-grade cannot
  lose a rating. The `busy` ref in `ReviewSession` guards against double grades.
- Undo must put the exact card back where it was (`reinsertForUndo`).
- Do **not** change the scheduler maths, the persisted schedule, or storage
  formats to fix a queue behaviour. The live queue only decides which
  already-scheduled cards re-appear during the active session.

## Proof required

Every change here ships with fake-clock unit tests in `liveQueue.test.ts`. The
canonical one: *grade "Again" at 08:00 → card leaves `ready` → card is back in
`ready` at ~08:01, with no duplicate.* If you can't express your change as a
clock-injected test, the design is wrong.
