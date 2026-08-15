// SM-2+ spaced-repetition scheduler — ported verbatim (behaviour-for-behaviour)
// from the shipped app's engine, made pure: it takes the scheduler settings and a
// card's scheduling state and returns a NEW state. No globals, so it is unit-testable.
import type { SchedulerSettings } from '../state/types';

export const DAY_MS = 86400000;
export const MIN_MS = 60000;

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type CardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';

export interface CardSched {
  ef?: number;
  interval?: number;
  reps?: number;
  lapses?: number;
  state?: CardState;
  step?: number;
  due?: number;
  lastGrade?: number;
  lastReviewed?: number;
  history?: Array<{ t: number; g: Grade; interval: number; ef: number; state: CardState }>;
  _lapsed?: number;
  tags?: string[];
  [k: string]: unknown;
}

export function gradeName(q: Grade | number): Grade {
  if (q === 'again' || q === 'hard' || q === 'good' || q === 'easy') return q;
  const n = q as number;
  return n < 3 ? 'again' : n === 3 ? 'hard' : n === 4 ? 'good' : 'easy';
}
export function gradeQuality(g: Grade): number {
  return { again: 0, hard: 3, good: 4, easy: 5 }[g];
}

function clampInterval(S: SchedulerSettings, d: number): number {
  return Math.min(S.maxInterval, Math.max(S.minInterval, Math.round(d)));
}

function fuzzInterval(S: SchedulerSettings, d: number): number {
  if (!S.fuzz || d < 2) return d;
  const pct = d < 7 ? 0.25 : d < 30 ? 0.15 : 0.05;
  const delta = Math.max(1, Math.round(d * pct));
  const r = Math.floor(Math.random() * (2 * delta + 1)) - delta;
  return Math.max(1, d + r);
}

/** The engine: returns a NEW card scheduling object with updated state. */
export function scheduleCard(
  S: SchedulerSettings,
  card: CardSched,
  grade: Grade | number,
  now: number = Date.now()
): CardSched {
  const g = gradeName(grade);
  const c: CardSched = Object.assign({}, card);
  c.ef = c.ef == null ? S.easeStart : c.ef;
  c.interval = c.interval || 0;
  c.reps = c.reps || 0;
  c.lapses = c.lapses || 0;
  c.state = c.state || (c.reps > 0 ? 'review' : 'new');
  c.step = c.step || 0;
  if (!Array.isArray(c.history)) c.history = [];
  const learn = S.learningSteps.length ? S.learningSteps : [1, 10];
  const relearn = S.relearnSteps.length ? S.relearnSteps : [10];
  const prevInterval = c.interval;
  const graduate = (iv: number) => {
    c.state = 'review';
    c.interval = clampInterval(S, iv);
    c.reps = (c.reps || 0) + 1;
    c.due = now + fuzzInterval(S, c.interval) * DAY_MS;
  };

  if (c.state === 'new' || c.state === 'learning') {
    if (c.state === 'new') c.state = 'learning';
    if (g === 'again') {
      c.step = 0;
      c.due = now + learn[0]! * MIN_MS;
    } else if (g === 'hard') {
      c.due = now + learn[Math.min(c.step!, learn.length - 1)]! * MIN_MS;
    } else if (g === 'good') {
      c.step = (c.step || 0) + 1;
      if (c.step >= learn.length) graduate(S.graduatingInterval);
      else c.due = now + learn[c.step]! * MIN_MS;
    } else {
      graduate(S.easyInterval);
    }
  } else if (c.state === 'relearning') {
    if (g === 'again') {
      c.step = 0;
      c.due = now + relearn[0]! * MIN_MS;
    } else if (g === 'hard') {
      c.due = now + relearn[Math.min(c.step!, relearn.length - 1)]! * MIN_MS;
    } else if (g === 'good') {
      c.step = (c.step || 0) + 1;
      if (c.step >= relearn.length) {
        c.state = 'review';
        c.interval = clampInterval(
          S,
          (c._lapsed as number) || Math.max(S.minInterval, Math.round(prevInterval * S.lapseMult))
        );
        c.due = now + fuzzInterval(S, c.interval) * DAY_MS;
      } else c.due = now + relearn[c.step]! * MIN_MS;
    } else {
      c.state = 'review';
      c.interval = clampInterval(S, ((c._lapsed as number) || S.minInterval) + 1);
      c.due = now + fuzzInterval(S, c.interval) * DAY_MS;
    }
  } else {
    // review
    if (g === 'again') {
      c.lapses = (c.lapses || 0) + 1;
      c.ef = Math.max(S.easeFloor, c.ef! + S.againDelta);
      c._lapsed = Math.max(S.minInterval, Math.round(prevInterval * S.lapseMult));
      if (c.lapses >= S.leechThreshold) {
        if (!c.tags) c.tags = [];
        if (!c.tags.includes('leech')) c.tags.push('leech');
        if (S.leechAction === 'suspend') c.state = 'suspended';
      }
      if (c.state !== 'suspended') {
        c.state = 'relearning';
        c.step = 0;
        c.due = now + relearn[0]! * MIN_MS;
        c.interval = c._lapsed;
      }
    } else if (g === 'hard') {
      c.ef = Math.max(S.easeFloor, c.ef! + S.hardDelta);
      c.interval = clampInterval(S, Math.max(prevInterval + 1, prevInterval * S.hardMult * S.intervalModifier));
      c.reps = (c.reps || 0) + 1;
      c.due = now + fuzzInterval(S, c.interval) * DAY_MS;
    } else if (g === 'good') {
      c.interval = clampInterval(S, Math.max(prevInterval + 1, prevInterval * c.ef! * S.intervalModifier));
      c.reps = (c.reps || 0) + 1;
      c.due = now + fuzzInterval(S, c.interval) * DAY_MS;
    } else {
      c.ef = c.ef! + S.easyDelta;
      c.interval = clampInterval(S, Math.max(prevInterval + 1, prevInterval * c.ef! * S.easyBonus * S.intervalModifier));
      c.reps = (c.reps || 0) + 1;
      c.due = now + fuzzInterval(S, c.interval) * DAY_MS;
    }
  }
  c.ef = +Math.max(S.easeFloor, c.ef!).toFixed(2);
  c.lastGrade = gradeQuality(g);
  c.lastReviewed = now;
  c.history!.push({ t: now, g, interval: c.interval!, ef: c.ef, state: c.state! });
  if (c.history!.length > 40) c.history = c.history!.slice(-40);
  return c;
}

export function cardIsDue(c: CardSched, at: number = Date.now()): boolean {
  return c.state !== 'suspended' && (c.due || 0) <= at;
}

export function isNewCard(c: CardSched): boolean {
  return c.state === 'new' || (!c.reps && c.state !== 'review' && c.state !== 'relearning');
}

export function fmtInterval(days: number): string {
  return days < 1
    ? 'soon'
    : days === 1
      ? '1 day'
      : days < 30
        ? days + ' days'
        : days < 365
          ? Math.round(days / 30) + ' mo'
          : (days / 365).toFixed(1) + ' yr';
}

/** Human label for the delay a given grade would produce (min/h for sub-day, else days). */
export function gradeLabel(S: SchedulerSettings, card: CardSched, grade: Grade): string {
  const next = scheduleCard(S, card, grade);
  const ms = (next.due || 0) - Date.now();
  if (ms < DAY_MS) {
    const m = Math.max(1, Math.round(ms / MIN_MS));
    return m < 60 ? m + ' min' : Math.round(m / 60) + ' h';
  }
  return fmtInterval(Math.round(ms / DAY_MS));
}
