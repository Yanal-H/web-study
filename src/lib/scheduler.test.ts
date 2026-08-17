import { describe, expect, it } from 'vitest';
import { SCHED_DEFAULTS } from '../state/constants';
import { scheduleCard, cardIsDue, DAY_MS, MIN_MS, type CardSched } from './scheduler';
import type { SchedulerSettings } from '../state/types';

// deterministic settings — fuzz off so intervals are exact
const S: SchedulerSettings = { ...SCHED_DEFAULTS, fuzz: false };
const T0 = 1_700_000_000_000;

describe('SM-2+ scheduler', () => {
  it('new → learning through the steps, then graduates on Good', () => {
    let c: CardSched = { state: 'new' };
    c = scheduleCard(S, c, 'good', T0); // step 0 → 1 (learn [1,10]), due +10min
    expect(c.state).toBe('learning');
    expect(c.due).toBe(T0 + 10 * MIN_MS);
    c = scheduleCard(S, c, 'good', T0); // step reaches end → graduate at graduatingInterval (1d)
    expect(c.state).toBe('review');
    expect(c.interval).toBe(1);
    expect(c.due).toBe(T0 + 1 * DAY_MS);
    expect(c.reps).toBe(1);
  });

  it('Again on a new card goes back to the first learning step', () => {
    const c = scheduleCard(S, { state: 'new' }, 'again', T0);
    expect(c.state).toBe('learning');
    expect(c.step).toBe(0);
    expect(c.due).toBe(T0 + 1 * MIN_MS);
  });

  it('Easy on a new card jumps straight to the easy interval', () => {
    const c = scheduleCard(S, { state: 'new' }, 'easy', T0);
    expect(c.state).toBe('review');
    expect(c.interval).toBe(S.easyInterval); // 4
  });

  it('review Good multiplies the interval by ease', () => {
    const c: CardSched = { state: 'review', interval: 10, ef: 2.5, reps: 3 };
    const n = scheduleCard(S, c, 'good', T0);
    expect(n.interval).toBe(25); // 10 * 2.5
    expect(n.due).toBe(T0 + 25 * DAY_MS);
    expect(n.reps).toBe(4);
  });

  it('review Hard uses the hard multiplier and lowers ease', () => {
    const c: CardSched = { state: 'review', interval: 10, ef: 2.5, reps: 3 };
    const n = scheduleCard(S, c, 'hard', T0);
    expect(n.interval).toBe(12); // 10 * 1.2
    expect(n.ef).toBeCloseTo(2.35, 2); // 2.5 - 0.15
  });

  it('review Again lapses into relearning and drops ease', () => {
    const c: CardSched = { state: 'review', interval: 20, ef: 2.5, reps: 5, lapses: 0 };
    const n = scheduleCard(S, c, 'again', T0);
    expect(n.state).toBe('relearning');
    expect(n.lapses).toBe(1);
    expect(n.ef).toBeCloseTo(2.3, 2); // 2.5 - 0.20
    expect(n.due).toBe(T0 + S.relearnSteps[0]! * MIN_MS);
  });

  it('relearning Good returns to review at the lapsed interval', () => {
    let c: CardSched = { state: 'review', interval: 20, ef: 2.5, reps: 5 };
    c = scheduleCard(S, c, 'again', T0); // → relearning, _lapsed = round(20*0.5)=10
    c = scheduleCard(S, c, 'good', T0); // single relearn step → back to review
    expect(c.state).toBe('review');
    expect(c.interval).toBe(10);
  });

  it('suspends a card once it reaches the leech threshold', () => {
    const leech: SchedulerSettings = { ...S, leechThreshold: 2, leechAction: 'suspend' };
    let c: CardSched = { state: 'review', interval: 20, ef: 2.0, reps: 5, lapses: 1 };
    c = scheduleCard(leech, c, 'again', T0); // lapses → 2 ≥ threshold
    expect(c.tags).toContain('leech');
    expect(c.state).toBe('suspended');
    expect(cardIsDue(c, T0 + 10 * DAY_MS)).toBe(false); // suspended cards are never due
  });

  it('never exceeds maxInterval', () => {
    const c: CardSched = { state: 'review', interval: 30000, ef: 2.5, reps: 20 };
    const n = scheduleCard(S, c, 'easy', T0);
    expect(n.interval).toBeLessThanOrEqual(S.maxInterval);
  });

  it('ease never falls below the floor', () => {
    let c: CardSched = { state: 'review', interval: 5, ef: 1.35, reps: 4, lapses: 0 };
    for (let i = 0; i < 6; i++) c = scheduleCard(S, c, 'again', T0);
    expect(c.ef).toBeGreaterThanOrEqual(S.easeFloor);
  });
});
