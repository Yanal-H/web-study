// Learning steps that outlive a session.
//
// The live queue (Batch 1) brings a short step back inside the SAME sitting.
// Anything longer than its horizon — a 10-minute step the student walks away
// from, or any step when they simply close the tab — is owed to the NEXT
// session, and must resume where it left off.
//
// The failure this guards against is silent and expensive: a card that resets to
// step 0 every time the app is reopened can never graduate, so a student keeps
// re-learning the same card forever and their queue never shrinks. Nothing on
// screen would say anything is wrong.
//
// Both schedulers are covered, because a session mixes them: content cards go
// through FSRS, personal cards through SM-2+.

import { describe, it, expect } from 'vitest';
import { schedule, newScheduling } from '../../data/fsrs';
import { scheduleCard } from '../../lib/scheduler';
import { SCHED_DEFAULTS } from '../../state/constants';
import { placeGraded, SESSION_HORIZON_MS } from './liveQueue';
import type { ReviewItem } from './deck';

const T0 = 1_000_000_000_000;
const HOUR = 3_600_000;
const item = (key: string): ReviewItem => ({ key, source: 'engine', card: {} as never, deck: 'D' });

describe('FSRS: a learning step survives the gap between sessions', () => {
  it('resumes at the stored step instead of starting over', () => {
    // Session 1: a new card, answered Good — advances to the second step.
    let s = schedule(newScheduling('c1', 'D'), 3, T0);
    expect(s.state).toBe('learning');
    expect(s.stepIndex).toBe(1);
    expect(s.due).toBe(T0 + 10 * 60_000);

    // The student closes the app here. Hours pass. The row is what persisted.
    const persisted = { ...s };

    // Session 2: the card is overdue and answered Good again. It must GRADUATE,
    // not drop back to the one-minute step.
    s = schedule(persisted, 3, T0 + 6 * HOUR);
    expect(s.state).toBe('review');
    expect(s.due).toBeGreaterThan(T0 + 6 * HOUR + 12 * HOUR); // days away, not minutes
  });

  it('does not reset the step just because the card is very overdue', () => {
    const owed = { ...newScheduling('c2', 'D'), state: 'learning' as const, stepIndex: 1, due: T0 };
    const s = schedule(owed, 3, T0 + 30 * 24 * HOUR); // a month later
    expect(s.state).toBe('review'); // still graduates from step 1
  });

  it('Again in a later session restarts the steps deliberately, and says so', () => {
    // This reset is correct — the student forgot it — and must land on step 0
    // with a one-minute step, not somewhere in the middle.
    const owed = { ...newScheduling('c3', 'D'), state: 'learning' as const, stepIndex: 1, due: T0 };
    const s = schedule(owed, 1, T0 + 6 * HOUR);
    expect(s.state).toBe('learning');
    expect(s.stepIndex).toBe(0);
    expect(s.due).toBe(T0 + 6 * HOUR + 60_000);
  });

  it('a relearning card resumes and graduates rather than looping', () => {
    const lapsed = {
      ...newScheduling('c4', 'D'),
      state: 'relearning' as const,
      stepIndex: 0,
      S: 20,
      D: 6,
      lapses: 1,
      due: T0,
      lastReviewed: T0 - 24 * HOUR,
    };
    const s = schedule(lapsed, 3, T0 + 8 * HOUR);
    expect(s.state).toBe('review');
    expect(s.lapses).toBe(1); // the lapse is not counted a second time
  });

  it('a lapse resets the step so relearning starts at its first step', () => {
    // A card that graduated long ago keeps a stale stepIndex from its learning
    // days; entering relearning must clear it, or the next Good would skip the
    // relearning step entirely.
    const graduated = {
      ...newScheduling('c5', 'D'),
      state: 'review' as const,
      stepIndex: 3,
      S: 40,
      D: 5,
      reps: 9,
      due: T0,
      lastReviewed: T0 - 40 * 24 * HOUR,
    };
    const s = schedule(graduated, 1, T0);
    expect(s.state).toBe('relearning');
    expect(s.stepIndex).toBe(0);
  });
});

describe('SM-2+: the same guarantees for personal cards', () => {
  const S = SCHED_DEFAULTS;

  it('resumes at the stored step across sessions', () => {
    let c = scheduleCard(S, { state: 'new' }, 'good', T0);
    expect(c.state).toBe('learning');
    expect(c.step).toBe(1);

    const persisted = { ...c };
    c = scheduleCard(S, persisted, 'good', T0 + 6 * HOUR);
    expect(c.state).toBe('review'); // graduated, not restarted
  });

  it('Again restarts the steps, on purpose', () => {
    const c = scheduleCard(S, { state: 'learning', step: 1 }, 'again', T0);
    expect(c.step).toBe(0);
    expect(c.due).toBe(T0 + S.learningSteps[0]! * 60_000);
  });

  it('honours the learning steps the student configured', () => {
    const custom = { ...S, learningSteps: [2, 45] };
    const c = scheduleCard(custom, { state: 'new' }, 'good', T0);
    expect(c.due).toBe(T0 + 45 * 60_000);
  });
});

describe('the handover: what the live queue keeps versus what it owes', () => {
  it('keeps a step inside the horizon and owes one beyond it', () => {
    const soon = schedule(newScheduling('a', 'D'), 1, T0); // Again — 1 minute
    expect(placeGraded([], item('a'), { due: soon.due, state: soon.state }, T0)).toHaveLength(1);

    // A step past the horizon is not this session's problem; it must simply be
    // left correctly scheduled for the next one.
    const later = { due: T0 + SESSION_HORIZON_MS + 60_000, state: 'learning' };
    expect(placeGraded([], item('b'), later, T0)).toHaveLength(0);
  });

  it('a card the session never re-shows is still scheduled, not lost', () => {
    // The queue declining to re-show a card must never be confused with the
    // card being finished: its persisted row still carries the owed step.
    const s = schedule(newScheduling('c', 'D'), 3, T0); // Good — 10-minute step
    expect(s.state).toBe('learning');
    expect(s.stepIndex).toBe(1);
    expect(s.due).toBeGreaterThan(T0); // still owed, whatever the queue does
  });
});

describe('the learning steps a student configures reach BOTH schedulers', () => {
  // Settings has always offered "learning steps". The engine hard-coded [1, 10]
  // and ignored it, so the setting worked on personal cards and silently did
  // nothing for every content card — which is most of a student's deck.
  const custom = { learn: [5, 25], relearn: [3] };

  it('FSRS uses the configured first step for Again', () => {
    const s = schedule(newScheduling('x', 'D'), 1, T0, custom);
    expect(s.due).toBe(T0 + 5 * 60_000); // not the hard-coded 1 minute
  });

  it('FSRS uses the configured second step for Good', () => {
    const s = schedule(newScheduling('x', 'D'), 3, T0, custom);
    expect(s.due).toBe(T0 + 25 * 60_000);
  });

  it('FSRS uses the configured relearning step on a lapse', () => {
    const graduated = {
      ...newScheduling('x', 'D'),
      state: 'review' as const,
      S: 30,
      D: 5,
      reps: 5,
      due: T0,
      lastReviewed: T0 - 30 * 24 * HOUR,
    };
    const s = schedule(graduated, 1, T0, custom);
    expect(s.due).toBe(T0 + 3 * 60_000);
  });

  it('falls back to the shipped steps when the setting is empty', () => {
    // An empty array would otherwise graduate a brand-new card immediately.
    const s = schedule(newScheduling('x', 'D'), 3, T0, { learn: [], relearn: [] });
    expect(s.state).toBe('learning');
    expect(s.due).toBe(T0 + 10 * 60_000);
  });

  it('unchanged for anyone on the shipped defaults', () => {
    // The regression guard: this fix must be invisible to a student who never
    // touched the setting.
    const withSteps = schedule(newScheduling('x', 'D'), 3, T0, {
      learn: SCHED_DEFAULTS.learningSteps,
      relearn: SCHED_DEFAULTS.relearnSteps,
    });
    const without = schedule(newScheduling('x', 'D'), 3, T0);
    expect(withSteps).toEqual(without);
  });

  it('a longer configured step is owed to the next session, not dropped', () => {
    // 25 minutes is past the live queue's horizon, so the session correctly
    // declines to re-show it — but it must still be scheduled.
    const s = schedule(newScheduling('x', 'D'), 3, T0, custom);
    expect(placeGraded([], item('x'), { due: s.due, state: s.state }, T0)).toHaveLength(0);
    expect(s.due).toBe(T0 + 25 * 60_000);
    expect(s.state).toBe('learning');
  });
});
