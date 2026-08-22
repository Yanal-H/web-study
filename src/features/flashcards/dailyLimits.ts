// Daily study limits.
//
// `newPerDay` and `reviewsPerDay` are named per DAY, but they were being applied
// per SESSION: every "Start review" handed out a fresh allowance, so three
// sessions gave three times the cap. The ledger meant to prevent that
// (`study.daily`, added in the v4 migration) was created, reset — and never once
// incremented or read. This module wires it up.
//
// Everything here is PURE and takes the day and the ledger as arguments, so the
// rollover and the arithmetic are unit-tested without touching the clock or the
// store. It changes only how many cards a session is allowed to INTRODUCE; it
// never touches a schedule, a rating, or a card's history.

import type { CardState } from '../../lib/scheduler';

/** The per-day tally. Shape fixed by the v4 migration — do not rename fields. */
export interface DailyLedger {
  date: string;
  newDone: number;
  revDone: number;
  [k: string]: unknown;
}

export interface DailyCaps {
  newPerDay: number;
  reviewsPerDay: number;
}

/** How much of today's allowance is left. Never negative. */
export interface Budget {
  newLeft: number;
  reviewLeft: number;
}

/** Treat a missing or malformed ledger as an empty day rather than throwing. */
function safe(daily: Partial<DailyLedger> | null | undefined, today: string): DailyLedger {
  return {
    date: typeof daily?.date === 'string' ? daily.date : today,
    newDone: Number.isFinite(daily?.newDone) ? Number(daily!.newDone) : 0,
    revDone: Number.isFinite(daily?.revDone) ? Number(daily!.revDone) : 0,
  };
}

/**
 * The ledger for `today`, reset if it belongs to an earlier day.
 *
 * Returns the SAME object when nothing changed, so a caller can cheaply tell
 * whether it needs to write. A ledger dated in the future (a device whose clock
 * was wrong, then corrected) also resets — otherwise the student is locked out of
 * new cards until that date arrives.
 */
export function rollover(daily: Partial<DailyLedger> | null | undefined, today: string): DailyLedger {
  const s = safe(daily, today);
  if (s.date === today) return s;
  return { date: today, newDone: 0, revDone: 0 };
}

/** What is left of today's allowance, after rolling the ledger over. */
export function remainingToday(
  daily: Partial<DailyLedger> | null | undefined,
  caps: DailyCaps,
  today: string
): Budget {
  const led = rollover(daily, today);
  const cap = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return {
    newLeft: Math.max(0, cap(caps.newPerDay) - led.newDone),
    reviewLeft: Math.max(0, cap(caps.reviewsPerDay) - led.revDone),
  };
}

/**
 * Which allowance a grade spends, judged by the card's state BEFORE it was
 * graded.
 *
 * This is what keeps the live queue (see liveQueue.ts) from charging a student
 * twice: a card graded "Again" comes back inside the same session, but by then it
 * is `learning`, not `new`, so the second grade spends nothing. A card is counted
 * once, when it is first introduced or first cleared.
 */
export function spends(prevState: CardState | undefined): 'new' | 'review' | null {
  if (!prevState || prevState === 'new') return 'new';
  if (prevState === 'review') return 'review';
  return null; // learning / relearning re-show, or suspended — already counted
}

/** The ledger after grading a card that was in `prevState`. Pure. */
export function recordGrade(
  daily: Partial<DailyLedger> | null | undefined,
  prevState: CardState | undefined,
  today: string
): DailyLedger {
  const led = rollover(daily, today);
  const kind = spends(prevState);
  if (kind === null) return led;
  return kind === 'new'
    ? { ...led, newDone: led.newDone + 1 }
    : { ...led, revDone: led.revDone + 1 };
}

/**
 * Give back what a grade spent, when the student undoes it.
 *
 * Without this, Undo quietly costs an allowance: grade a new card, undo, grade
 * it again, and the day's new-card count has gone up twice for one card. A
 * student who leans on Undo would run out of new cards having seen half of them.
 *
 * Clamped at zero, which also covers undoing across midnight: the ledger has
 * rolled over by then and there is nothing of yesterday's to refund. Losing one
 * count in that rare case is much better than a negative tally.
 */
export function refundGrade(
  daily: Partial<DailyLedger> | null | undefined,
  prevState: CardState | undefined,
  today: string
): DailyLedger {
  const led = rollover(daily, today);
  const kind = spends(prevState);
  if (kind === null) return led;
  return kind === 'new'
    ? { ...led, newDone: Math.max(0, led.newDone - 1) }
    : { ...led, revDone: Math.max(0, led.revDone - 1) };
}

/**
 * Split one day's remaining allowance across the two card pools.
 *
 * Engine cards and personal cards are queued separately, and each pool used to be
 * given the FULL limit — so `newPerDay: 20` could introduce 20 of each, 40 in a
 * sitting. The second pool gets only what the first left behind.
 */
export function budgetAfter(budget: Budget, taken: { neu: number; due: number }): Budget {
  return {
    newLeft: Math.max(0, budget.newLeft - Math.max(0, taken.neu)),
    reviewLeft: Math.max(0, budget.reviewLeft - Math.max(0, taken.due)),
  };
}

/** True when today's allowance is entirely spent — nothing more to introduce. */
export function budgetSpent(b: Budget): boolean {
  return b.newLeft <= 0 && b.reviewLeft <= 0;
}

/**
 * How many cards a session would ACTUALLY serve, given what is left today.
 *
 * The "Due (N)" button used to show the whole backlog. With a daily cap that is
 * a promise the session does not keep: a student with 500 due and a 200 review
 * limit was told 500 and handed 200. Counting what will really be served is the
 * difference between a limit that reads as considered and one that reads as a
 * bug. Pure.
 */
export function servable(counts: { due: number; neu: number }, budget: Budget): number {
  return (
    Math.min(Math.max(0, counts.due), budget.reviewLeft) +
    Math.min(Math.max(0, counts.neu), budget.newLeft)
  );
}
