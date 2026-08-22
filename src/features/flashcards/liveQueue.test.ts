import { describe, it, expect } from 'vitest';
import {
  initLive,
  placeGraded,
  promoteDue,
  nextDueAt,
  isDueSoon,
  isComplete,
  reinsertForUndo,
  aheadCounts,
  SESSION_HORIZON_MS,
  type LiveState,
} from './liveQueue';
import type { ReviewItem } from './deck';

// Minimal ReviewItem stand-ins — the live queue only ever reads `key`.
const item = (key: string): ReviewItem => ({ key, source: 'content', card: {} as never, deck: 'D' });

const T0 = 1_000_000_000_000; // fixed fake "now"

describe('placeGraded — a short step returns, a graduation does not', () => {
  it('re-queues an Again card due in one minute', () => {
    const w = placeGraded([], item('a'), { due: T0 + 60_000, state: 'learning' }, T0);
    expect(w).toHaveLength(1);
    expect(w[0]!.due).toBe(T0 + 60_000);
  });

  it('re-queues a relearning (lapsed) card in its short step', () => {
    const w = placeGraded([], item('a'), { due: T0 + 10 * 60_000, state: 'relearning' }, T0);
    expect(w).toHaveLength(1);
  });

  it('does NOT re-queue a card that graduated to days', () => {
    const w = placeGraded([], item('a'), { due: T0 + 4 * 24 * 3600_000, state: 'review' }, T0);
    expect(w).toHaveLength(0);
  });

  it('does NOT re-queue a learning card whose step is beyond the session horizon', () => {
    const w = placeGraded([], item('a'), { due: T0 + SESSION_HORIZON_MS + 60_000, state: 'learning' }, T0);
    expect(w).toHaveLength(0);
  });

  it('keeps the waiting list ordered by due time', () => {
    let w = placeGraded([], item('late'), { due: T0 + 600_000, state: 'learning' }, T0);
    w = placeGraded(w, item('soon'), { due: T0 + 60_000, state: 'learning' }, T0);
    expect(w.map((e) => e.item.key)).toEqual(['soon', 'late']);
  });
});

describe('promoteDue — the one-minute card comes back on time', () => {
  it('leaves a not-yet-due card waiting', () => {
    const s: LiveState = { ready: [], waiting: [{ item: item('a'), due: T0 + 60_000 }] };
    const after = promoteDue(s, T0 + 30_000); // 30s later — not yet
    expect(after.ready).toHaveLength(0);
    expect(after.waiting).toHaveLength(1);
  });

  it('moves the card to ready once its due time passes', () => {
    const s: LiveState = { ready: [], waiting: [{ item: item('a'), due: T0 + 60_000 }] };
    const after = promoteDue(s, T0 + 61_000); // just past a minute
    expect(after.ready.map((i) => i.key)).toEqual(['a']);
    expect(after.waiting).toHaveLength(0);
  });

  it('promotes several due cards at once and keeps the rest waiting', () => {
    const s: LiveState = {
      ready: [item('x')],
      waiting: [
        { item: item('a'), due: T0 + 60_000 },
        { item: item('b'), due: T0 + 120_000 },
        { item: item('c'), due: T0 + 900_000 },
      ],
    };
    const after = promoteDue(s, T0 + 130_000);
    expect(after.ready.map((i) => i.key)).toEqual(['x', 'a', 'b']);
    expect(after.waiting.map((e) => e.item.key)).toEqual(['c']);
  });

  it('is a no-op when nothing is due (returns the same reference)', () => {
    const s: LiveState = { ready: [], waiting: [{ item: item('a'), due: T0 + 60_000 }] };
    expect(promoteDue(s, T0)).toBe(s);
  });
});

describe('session lifecycle states', () => {
  it('due-soon when nothing is ready but a card waits', () => {
    expect(isDueSoon({ ready: [], waiting: [{ item: item('a'), due: T0 + 60_000 }] })).toBe(true);
    expect(isDueSoon({ ready: [item('a')], waiting: [] })).toBe(false);
  });

  it('complete only when both are empty', () => {
    expect(isComplete({ ready: [], waiting: [] })).toBe(true);
    expect(isComplete({ ready: [], waiting: [{ item: item('a'), due: T0 }] })).toBe(false);
  });

  it('nextDueAt reports the earliest waiting due', () => {
    expect(
      nextDueAt([
        { item: item('a'), due: T0 + 600_000 },
        { item: item('b'), due: T0 + 60_000 },
      ])
    ).toBe(T0 + 60_000);
    expect(nextDueAt([])).toBeNull();
  });
});

describe('the full one-minute journey with a fake clock', () => {
  it('Again at 08:00 → gone from ready → back in ready at ~08:01, no duplicate', () => {
    // One card, graded Again with a 1-minute learning step.
    let s = initLive([item('card1')]);
    expect(s.ready.map((i) => i.key)).toEqual(['card1']);

    // grade Again at T0: remove from ready, place into waiting for T0+60s
    s = { ready: s.ready.slice(1), waiting: placeGraded(s.waiting, item('card1'), { due: T0 + 60_000, state: 'learning' }, T0) };
    expect(isDueSoon(s)).toBe(true);
    expect(nextDueAt(s.waiting)).toBe(T0 + 60_000);

    // 30s later: still waiting
    s = promoteDue(s, T0 + 30_000);
    expect(isDueSoon(s)).toBe(true);

    // 61s later: back to ready, exactly once
    s = promoteDue(s, T0 + 61_000);
    expect(s.ready.map((i) => i.key)).toEqual(['card1']);
    expect(s.waiting).toHaveLength(0);
    expect(isComplete(s)).toBe(false);
  });
});

describe('reinsertForUndo', () => {
  it('brings a graded card back to the front and out of waiting', () => {
    const s: LiveState = { ready: [item('b')], waiting: [{ item: item('a'), due: T0 + 60_000 }] };
    const after = reinsertForUndo(s, item('a'));
    expect(after.ready.map((i) => i.key)).toEqual(['a', 'b']);
    expect(after.waiting).toHaveLength(0);
  });
});

describe('aheadCounts', () => {
  it('counts ready by state and every waiting card as learning', () => {
    const s: LiveState = {
      ready: [item('n'), item('r')],
      waiting: [{ item: item('w'), due: T0 + 60_000 }],
    };
    const stateOf = (i: ReviewItem) => ({ n: 'new', r: 'review', w: 'learning' } as Record<string, string>)[i.key];
    expect(aheadCounts(s, stateOf)).toEqual({ neu: 1, learn: 1, due: 1 });
  });
});
