// Study statistics — the evidence a student needs to trust the schedule.
//
// Every grade has always been written to a review log in IndexedDB, and until
// now nothing ever read it. A student had no way to answer the only questions
// that matter: am I actually remembering this, and how much is coming?
//
// All of it is pure — logs and scheduling rows in, numbers out — so the
// arithmetic is tested directly instead of through a chart.

import type { ReviewLog, Scheduling } from '../../data/db';

export const DAY_MS = 86_400_000;

/* ------------------------------------------------------- true retention */

export interface Retention {
  /** reviews counted (real reviews only, not learning steps) */
  reviewed: number;
  /** of those, how many were recalled (anything but Again) */
  recalled: number;
  /** recalled / reviewed, or null when there is nothing to judge from */
  rate: number | null;
  /** reviews that could not be judged because they predate state logging */
  unattributed: number;
}

/**
 * True retention: of the cards that came back **due**, how many were recalled.
 *
 * Learning steps are deliberately excluded. A card in its one-minute step is
 * being drilled, not recalled from long-term memory, and counting those inflates
 * the figure to the point of uselessness — which is the number a student would
 * then use to decide their settings were fine.
 *
 * Rows written before the log recorded a card's prior state cannot be judged and
 * are reported separately rather than guessed at in either direction.
 */
export function trueRetention(logs: ReviewLog[]): Retention {
  let reviewed = 0;
  let recalled = 0;
  let unattributed = 0;
  for (const log of logs) {
    if (log.prevState === undefined) {
      unattributed++;
      continue;
    }
    if (log.prevState !== 'review') continue; // a learning step is not a test of recall
    reviewed++;
    if (log.rating > 1) recalled++;
  }
  return { reviewed, recalled, rate: reviewed > 0 ? recalled / reviewed : null, unattributed };
}

/* ------------------------------------------------------------- forecast */

export interface ForecastDay {
  /** days from today: 0 is today */
  offset: number;
  count: number;
}

/**
 * How many cards fall due on each of the next `days` days.
 *
 * Everything already overdue is counted into day 0, because that is when the
 * student meets it. A forecast that hid a backlog on some earlier date would be
 * telling them a comfortable lie about tomorrow.
 */
export function forecast(rows: Scheduling[], days: number, now: number): ForecastDay[] {
  const out: ForecastDay[] = Array.from({ length: Math.max(0, days) }, (_, i) => ({ offset: i, count: 0 }));
  if (out.length === 0) return out;
  const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
  for (const row of rows) {
    if (row.suspended) continue;
    if (row.state === 'new') continue; // new cards are not owed on any date
    const offset = Math.floor((row.due - startOfToday) / DAY_MS);
    if (offset < 0) out[0]!.count++;
    else if (offset < out.length) out[offset]!.count++;
  }
  return out;
}

/* ------------------------------------------------------- answer buttons */

export interface ButtonSpread {
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

/** Which buttons a student actually presses — the shape of their week. */
export function buttonSpread(logs: ReviewLog[]): ButtonSpread {
  const out: ButtonSpread = { again: 0, hard: 0, good: 0, easy: 0, total: 0 };
  for (const log of logs) {
    if (log.rating === 1) out.again++;
    else if (log.rating === 2) out.hard++;
    else if (log.rating === 3) out.good++;
    else if (log.rating === 4) out.easy++;
    else continue;
    out.total++;
  }
  return out;
}

/* ---------------------------------------------------------- daily counts */

export interface DayCount {
  offset: number; // days ago; 0 is today
  count: number;
}

/** Reviews done on each of the last `days` days, for a workload history. */
export function reviewsPerDay(logs: ReviewLog[], days: number, now: number): DayCount[] {
  const out: DayCount[] = Array.from({ length: Math.max(0, days) }, (_, i) => ({ offset: i, count: 0 }));
  if (out.length === 0) return out;
  const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
  for (const log of logs) {
    const ago = Math.floor((startOfToday - Math.floor(log.ts / DAY_MS) * DAY_MS) / DAY_MS);
    if (ago >= 0 && ago < out.length) out[ago]!.count++;
  }
  return out;
}

/** Median seconds per card, which survives one interrupted card better than a mean. */
export function medianSeconds(logs: ReviewLog[]): number | null {
  const times = logs.map((l) => l.ms).filter((ms): ms is number => typeof ms === 'number' && ms > 0).sort((a, b) => a - b);
  if (times.length === 0) return null;
  const mid = Math.floor(times.length / 2);
  const ms = times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2;
  return Math.round(ms / 100) / 10;
}
