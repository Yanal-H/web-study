// Per-card operations: forget, set due date, and the card's own history.
//
// These are the only things in the app that change a schedule WITHOUT a grade,
// so they are deliberately narrow. Every one of them acts on exactly one card,
// as the direct result of one explicit request, and says plainly what it did.
// See .claude/rules/data-safety.md: no operation here may ever be applied
// across a set of cards, however convenient that would be to offer.
//
// A card's review LOG is never touched by any of this. Forgetting a card resets
// what the scheduler believes about it; it does not erase the fact that the
// student sat and answered it eleven times, which is theirs.

import type { Scheduling, ReviewLog } from '../../data/db';

export const DAY = 86_400_000;

/**
 * Put a card back to never-seen.
 *
 * Anki calls this Forget. It is what a student wants when a card has been
 * mis-scheduled into the far future, or when the material changed under it and
 * the old interval is a lie.
 *
 * `lapses` and `reps` are kept on purpose. They are the card's biography — how
 * hard it has actually been — and a leech that is forgotten should not come back
 * with a clean record and start eating the queue again unnoticed. Anki offers
 * this as a choice; keeping the count is the safer default for a shared medical
 * deck, and `resetCounts` allows the other behaviour explicitly.
 */
export function forgetCard(
  sched: Scheduling,
  opts: { resetCounts?: boolean } = {}
): Scheduling {
  return {
    ...sched,
    state: 'new',
    due: 0, // 0 is the new queue, matching newScheduling
    S: 0,
    D: 0,
    stepIndex: 0,
    lastReviewed: null,
    reps: opts.resetCounts ? 0 : sched.reps,
    lapses: opts.resetCounts ? 0 : sched.lapses,
  };
}

/**
 * Show a card again in `days` days, whatever the scheduler thought.
 *
 * Day 0 means today. The card is treated as a review from then on, because a
 * student setting a date is asserting they know it well enough to wait — but
 * its stability is left alone, so the NEXT interval after that is still computed
 * from what the scheduler actually learned rather than from a number typed once.
 */
export function setDueInDays(sched: Scheduling, days: number, now: number): Scheduling {
  const safe = Math.max(0, Math.floor(Number.isFinite(days) ? days : 0));
  const startOfToday = Math.floor(now / DAY) * DAY;
  return {
    ...sched,
    // Always a review from here: a student setting a date is asserting they
    // know it well enough to wait. Suspension is a separate flag and is left
    // exactly as it was — setting a date must not quietly un-suspend a card.
    state: 'review',
    due: startOfToday + safe * DAY,
    // A card given a date is no longer part-way through a learning step.
    stepIndex: 0,
  };
}

/* ------------------------------------------------------------ card info */

export interface CardHistory {
  reviews: number;
  lapses: number;
  again: number;
  /** recalled / reviewed over reviews that were genuinely due, or null */
  retention: number | null;
  first: number | null;
  last: number | null;
  /** median seconds, or null when nothing was timed */
  medianSeconds: number | null;
}

/**
 * One card's own record, from its review log. Pure.
 *
 * This is what a student needs when deciding whether a card is worth keeping:
 * not the deck's averages, but "I have failed this eleven times".
 */
export function cardHistory(logs: ReviewLog[]): CardHistory {
  if (logs.length === 0) {
    return { reviews: 0, lapses: 0, again: 0, retention: null, first: null, last: null, medianSeconds: null };
  }
  const sorted = [...logs].sort((a, b) => a.ts - b.ts);
  let again = 0;
  let dueReviews = 0;
  let dueRecalled = 0;
  for (const l of sorted) {
    if (l.rating === 1) again++;
    if (l.prevState === 'review') {
      dueReviews++;
      if (l.rating > 1) dueRecalled++;
    }
  }
  const times = sorted
    .map((l) => l.ms)
    .filter((ms): ms is number => typeof ms === 'number' && ms > 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianMs = times.length === 0 ? null : times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2;

  return {
    reviews: sorted.length,
    // Lapses are failures of a card that was genuinely due; failing a learning
    // step is part of learning it, not a lapse.
    lapses: sorted.filter((l) => l.rating === 1 && l.prevState === 'review').length,
    again,
    retention: dueReviews > 0 ? dueRecalled / dueReviews : null,
    first: sorted[0]!.ts,
    last: sorted[sorted.length - 1]!.ts,
    medianSeconds: medianMs === null ? null : Math.round(medianMs / 100) / 10,
  };
}
