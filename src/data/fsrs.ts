// FSRS-4.5, dependency-free.
//
// Free Spaced Repetition Scheduler models a card as stability S (how many days
// until recall probability falls to the target retention) and difficulty D
// (1–10). A review updates both from the elapsed time and the rating, then the
// next interval is whatever keeps recall at REQUEST_RETENTION.
//
// Ratings are Anki's: 1 Again, 2 Hard, 3 Good, 4 Easy. New and lapsed cards run
// through fixed learning steps first so a card just met is not scheduled days
// away on its first sight.

import type { Scheduling, CardState } from './db';
import { judgeLapse, type LeechSettings } from '../features/flashcards/leech';

const DAY = 86_400_000;
const REQUEST_RETENTION = 0.9;
/**
 * The short steps a card runs through before it graduates, in minutes.
 *
 * These are the STUDENT'S setting, passed in by the caller. They used to be
 * fixed here, which meant Settings offered "learning steps" and quietly did
 * nothing for every content card — the majority of a deck — while personal
 * cards obeyed it. The defaults match the shipped settings, so anyone who never
 * touched the setting sees no change at all.
 */
export interface Steps {
  learn: number[];
  relearn: number[];
}

export const DEFAULT_STEPS: Steps = { learn: [1, 10], relearn: [10] };

/** Guard a setting saved as empty, which would graduate a new card on sight. */
function stepsOf(steps: Steps | undefined): Steps {
  return {
    learn: steps?.learn?.length ? steps.learn : DEFAULT_STEPS.learn,
    relearn: steps?.relearn?.length ? steps.relearn : DEFAULT_STEPS.relearn,
  };
}
const FACTOR = 19 / 81;
const DECAY = -0.5;

/** FSRS-4.5 default weights. */
export const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824,
  1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

export const MAX_INTERVAL_DAYS = 36_500;

const clampD = (d: number) => Math.min(Math.max(d, 1), 10);
const initD = (g: number) => clampD(W[4]! - Math.exp(W[5]! * (g - 1)) + 1);
const initS = (g: number) => Math.max(W[g - 1]!, 0.1);

function nextD(D: number, g: number): number {
  const dp = D - W[6]! * (g - 3);
  // mean reversion towards the difficulty a "Good" first answer would give
  return clampD(W[7]! * initD(3) + (1 - W[7]!) * dp);
}

/** Probability of recall after `elapsedDays` given stability S. */
export function retrievability(elapsedDays: number, S: number): number {
  return Math.pow(1 + FACTOR * (elapsedDays / Math.max(0.1, S)), DECAY);
}

function nextS(D: number, S: number, r: number, g: number): number {
  if (g === 1) {
    // lapse: stability collapses towards a floor set by difficulty
    return W[11]! * Math.pow(D, -W[12]!) * (Math.pow(S + 1, W[13]!) - 1) * Math.exp(W[14]! * (1 - r));
  }
  const hardPenalty = g === 2 ? W[15]! : 1;
  const easyBonus = g === 4 ? W[16]! : 1;
  return (
    S *
    (1 +
      Math.exp(W[8]!) *
        (11 - D) *
        Math.pow(S, -W[9]!) *
        (Math.exp(W[10]! * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

/** Days until recall probability reaches the requested retention. */
export function intervalDays(S: number): number {
  const i = (S / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(i)));
}

/** A fresh scheduling row for a card that has never been seen. */
export function newScheduling(cardId: string, deck: string): Scheduling {
  return {
    cardId,
    deck,
    state: 'new',
    S: 0,
    D: 0,
    reps: 0,
    lapses: 0,
    stepIndex: 0,
    due: 0,
    lastReviewed: null,
  };
}

/** Apply a rating and return the card's new scheduling state. */
export function schedule(
  s: Scheduling,
  rating: 1 | 2 | 3 | 4,
  now: number,
  stepSettings?: Steps,
  leech?: LeechSettings
): Scheduling {
  const out: Scheduling = { ...s, reps: s.reps + 1, lastReviewed: now };
  const S_STEPS = stepsOf(stepSettings);

  if (s.state === 'new' || s.state === 'learning' || s.state === 'relearning') {
    const steps = s.state === 'relearning' ? S_STEPS.relearn : S_STEPS.learn;

    if (rating === 1) {
      // Again — back to the first step
      out.state = s.state === 'relearning' ? 'relearning' : 'learning';
      out.stepIndex = 0;
      out.due = now + steps[0]! * 60_000;
      if (s.state === 'new') {
        out.S = initS(1);
        out.D = initD(1);
      }
      return out;
    }

    if (s.state === 'new') {
      out.S = initS(rating);
      out.D = initD(rating);
    }
    // Easy graduates immediately; Good advances a step; Hard repeats the step
    const nextStep = rating === 4 ? steps.length : s.stepIndex + (rating >= 3 ? 1 : 0);
    if (nextStep >= steps.length) {
      out.state = 'review';
      out.S = out.S || initS(rating);
      out.D = out.D || initD(rating);
      out.stepIndex = 0;
      out.due = now + intervalDays(out.S) * DAY;
      return out;
    }
    out.state = s.state === 'relearning' ? 'relearning' : 'learning';
    out.stepIndex = nextStep;
    out.due = now + steps[nextStep]! * 60_000;
    return out;
  }

  // review state — the full FSRS update
  const elapsedDays = s.lastReviewed ? Math.max(0, (now - s.lastReviewed) / DAY) : 0;
  const r = retrievability(elapsedDays, s.S || 1);
  const D2 = nextD(s.D || initD(3), rating);
  const S2 = Math.max(0.1, nextS(D2, s.S || 1, r, rating));

  out.D = D2;
  out.S = S2;
  if (rating === 1) {
    out.state = 'relearning';
    out.lapses = s.lapses + 1;
    out.stepIndex = 0;
    out.due = now + S_STEPS.relearn[0]! * 60_000;
    // Leech handling used to live only in the SM-2+ scheduler, so a content
    // card — most of a medical deck — could be forgotten any number of times
    // and never be taken out of the daily queue. Same rule for both engines now.
    if (leech && judgeLapse(out.lapses, leech).kind === 'suspend') out.suspended = 1;
  } else {
    out.state = 'review';
    out.due = now + intervalDays(S2) * DAY;
  }
  return out;
}

/** What each button would do, for the interval preview under the grade row. */
export function previewIntervals(
  s: Scheduling,
  now: number,
  stepSettings?: Steps
): Record<1 | 2 | 3 | 4, string> {
  const fmt = (ms: number) => {
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${Math.max(1, mins)} min`;
    const hours = mins / 60;
    if (hours < 24) return `${Math.round(hours)} h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} d`;
    const months = days / 30.44;
    if (months < 12) return `${months.toFixed(months < 3 ? 1 : 0)} mo`;
    return `${(days / 365.25).toFixed(1)} y`;
  };
  const out = {} as Record<1 | 2 | 3 | 4, string>;
  for (const g of [1, 2, 3, 4] as const) out[g] = fmt(schedule(s, g, now, stepSettings).due - now);
  return out;
}

export type { Scheduling, CardState };
