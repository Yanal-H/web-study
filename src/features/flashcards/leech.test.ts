import { describe, it, expect } from 'vitest';
import { judgeLapse, isLeech } from './leech';

const S = { leechThreshold: 8, leechAction: 'suspend' };
const TAG_ONLY = { leechThreshold: 8, leechAction: 'tag' };

describe('judgeLapse — when a card has earned the name', () => {
  it('says nothing while the card is still under the threshold', () => {
    for (const n of [0, 1, 4, 7]) expect(judgeLapse(n, S)).toEqual({ kind: 'none' });
  });

  it('fires exactly on the threshold', () => {
    expect(judgeLapse(8, S)).toEqual({ kind: 'suspend' });
  });

  it('suspends or only tags, according to the setting', () => {
    expect(judgeLapse(8, S)).toEqual({ kind: 'suspend' });
    expect(judgeLapse(8, TAG_ONLY)).toEqual({ kind: 'tag' });
  });

  it('reports again every half-threshold, so a bad card keeps announcing itself', () => {
    // A card left tagged rather than suspended must not go quiet after one
    // warning: 8, then 12, 16, 20 …
    expect(judgeLapse(12, TAG_ONLY)).toEqual({ kind: 'tag' });
    expect(judgeLapse(16, TAG_ONLY)).toEqual({ kind: 'tag' });
    expect(judgeLapse(9, TAG_ONLY)).toEqual({ kind: 'none' });
    expect(judgeLapse(11, TAG_ONLY)).toEqual({ kind: 'none' });
  });

  it('treats a threshold of zero as leech handling turned off', () => {
    expect(judgeLapse(50, { leechThreshold: 0, leechAction: 'suspend' })).toEqual({ kind: 'none' });
  });

  it('never divides by zero on a threshold of one', () => {
    const one = { leechThreshold: 1, leechAction: 'tag' };
    expect(judgeLapse(1, one)).toEqual({ kind: 'tag' });
    expect(judgeLapse(2, one)).toEqual({ kind: 'tag' });
  });

  it('ignores a nonsense threshold rather than crashing', () => {
    expect(judgeLapse(10, { leechThreshold: NaN as never, leechAction: 'suspend' })).toEqual({ kind: 'none' });
    expect(judgeLapse(10, { leechThreshold: -3, leechAction: 'suspend' })).toEqual({ kind: 'none' });
  });
});

describe('isLeech', () => {
  it('is true from the threshold onwards', () => {
    expect(isLeech(7, S)).toBe(false);
    expect(isLeech(8, S)).toBe(true);
    expect(isLeech(30, S)).toBe(true);
  });

  it('is never true when leech handling is off', () => {
    expect(isLeech(99, { leechThreshold: 0, leechAction: 'suspend' })).toBe(false);
  });
});

describe('the engine finally honours leeches too', () => {
  // The defect: leech handling lived only in the SM-2+ scheduler, so a CONTENT
  // card — most of a medical deck — could be forgotten twenty times and still
  // come back every day forever, crowding out material that would actually
  // stick. Both schedulers now apply the same rule.
  const S8 = { leechThreshold: 8, leechAction: 'suspend' };

  it('FSRS suspends a review card once it crosses the threshold', async () => {
    const { schedule, newScheduling } = await import('../../data/fsrs');
    const T0 = 1_000_000_000_000;
    const nearLeech = {
      ...newScheduling('c1', 'D'),
      state: 'review' as const,
      S: 20,
      D: 7,
      reps: 30,
      lapses: 7, // one away
      due: T0,
      lastReviewed: T0 - 5 * 86_400_000,
    };
    const out = schedule(nearLeech, 1, T0, undefined, S8); // fail it again → 8
    expect(out.lapses).toBe(8);
    expect(out.suspended).toBe(1);
  });

  it('leaves a card alone while it is still under the threshold', async () => {
    const { schedule, newScheduling } = await import('../../data/fsrs');
    const T0 = 1_000_000_000_000;
    const ok = {
      ...newScheduling('c2', 'D'),
      state: 'review' as const,
      S: 20,
      D: 5,
      reps: 10,
      lapses: 2,
      due: T0,
      lastReviewed: T0 - 5 * 86_400_000,
    };
    const out = schedule(ok, 1, T0, undefined, S8);
    expect(out.lapses).toBe(3);
    expect(out.suspended).toBeUndefined();
  });

  it('does not suspend when the student chose tag-only', async () => {
    const { schedule, newScheduling } = await import('../../data/fsrs');
    const T0 = 1_000_000_000_000;
    const nearLeech = {
      ...newScheduling('c3', 'D'),
      state: 'review' as const,
      S: 20,
      D: 7,
      reps: 30,
      lapses: 7,
      due: T0,
      lastReviewed: T0 - 5 * 86_400_000,
    };
    const out = schedule(nearLeech, 1, T0, undefined, { leechThreshold: 8, leechAction: 'tag' });
    expect(out.suspended).toBeUndefined();
  });

  it('is inert when the caller passes no leech settings at all', async () => {
    // Back-compat: every existing call site that has not been updated must
    // behave exactly as before rather than start suspending cards.
    const { schedule, newScheduling } = await import('../../data/fsrs');
    const T0 = 1_000_000_000_000;
    const nearLeech = {
      ...newScheduling('c4', 'D'),
      state: 'review' as const,
      S: 20,
      D: 7,
      reps: 30,
      lapses: 99,
      due: T0,
      lastReviewed: T0 - 5 * 86_400_000,
    };
    expect(schedule(nearLeech, 1, T0).suspended).toBeUndefined();
  });
});
