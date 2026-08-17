import { describe, expect, it } from 'vitest';
import { schedule, newScheduling, intervalDays, retrievability, previewIntervals } from './fsrs';

const NOW = Date.UTC(2026, 0, 1);
const MIN = 60_000;
const DAY = 86_400_000;

describe('fsrs', () => {
  it('starts a new card in learning, one minute out, on Good', () => {
    const s = schedule(newScheduling('c1', 'A'), 3, NOW);
    expect(s.state).toBe('learning');
    expect(s.due - NOW).toBe(10 * MIN); // first step passed, now the 10-minute step
    expect(s.reps).toBe(1);
    expect(s.S).toBeGreaterThan(0);
  });

  it('sends a new card straight back to the first step on Again', () => {
    const s = schedule(newScheduling('c1', 'A'), 1, NOW);
    expect(s.state).toBe('learning');
    expect(s.due - NOW).toBe(1 * MIN);
    expect(s.stepIndex).toBe(0);
  });

  it('graduates a new card immediately on Easy', () => {
    const s = schedule(newScheduling('c1', 'A'), 4, NOW);
    expect(s.state).toBe('review');
    expect(s.due - NOW).toBeGreaterThanOrEqual(DAY);
  });

  it('graduates through the learning steps to review', () => {
    let s = schedule(newScheduling('c1', 'A'), 3, NOW);
    s = schedule(s, 3, NOW + 10 * MIN);
    expect(s.state).toBe('review');
    expect(s.due).toBeGreaterThan(NOW + DAY - 1);
  });

  it('grows the interval as a review card keeps being answered well', () => {
    let s = schedule(newScheduling('c1', 'A'), 4, NOW);
    const first = s.due - NOW;
    let t = s.due;
    s = schedule(s, 3, t);
    const second = s.due - t;
    t = s.due;
    s = schedule(s, 3, t);
    const third = s.due - t;
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('lapses a review card into relearning and counts the lapse', () => {
    let s = schedule(newScheduling('c1', 'A'), 4, NOW);
    s = schedule(s, 1, s.due);
    expect(s.state).toBe('relearning');
    expect(s.lapses).toBe(1);
    expect(s.due - s.lastReviewed!).toBe(10 * MIN);
  });

  it('keeps difficulty inside 1–10 however it is rated', () => {
    let s = newScheduling('c1', 'A');
    for (let i = 0; i < 40; i++) {
      s = schedule(s, ((i % 4) + 1) as 1 | 2 | 3 | 4, NOW + i * DAY);
      expect(s.D).toBeGreaterThanOrEqual(0);
      expect(s.D).toBeLessThanOrEqual(10);
    }
  });

  it('rates Easy longer than Good, and Good longer than Hard', () => {
    const base = schedule(newScheduling('c1', 'A'), 4, NOW);
    const at = base.due;
    const hard = schedule(base, 2, at).due;
    const good = schedule(base, 3, at).due;
    const easy = schedule(base, 4, at).due;
    expect(good).toBeGreaterThan(hard);
    expect(easy).toBeGreaterThan(good);
  });

  it('falls in retrievability as time passes', () => {
    expect(retrievability(0, 10)).toBeCloseTo(1, 5);
    expect(retrievability(10, 10)).toBeLessThan(1);
    expect(retrievability(100, 10)).toBeLessThan(retrievability(10, 10));
  });

  it('caps intervals at the maximum', () => {
    expect(intervalDays(10_000_000)).toBe(36_500);
    expect(intervalDays(0.01)).toBe(1);
  });

  it('previews an interval for every button', () => {
    const p = previewIntervals(newScheduling('c1', 'A'), NOW);
    expect(Object.keys(p)).toEqual(['1', '2', '3', '4']);
    expect(p[1]).toMatch(/min/);
    expect(p[4]).toMatch(/d|mo|y/);
  });

  it('never schedules a card in the past', () => {
    let s = newScheduling('c1', 'A');
    for (const g of [1, 2, 3, 4] as const) {
      s = schedule(s, g, NOW);
      expect(s.due).toBeGreaterThan(NOW);
    }
  });
});
