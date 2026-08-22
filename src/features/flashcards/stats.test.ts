import { describe, it, expect } from 'vitest';
import { trueRetention, forecast, buttonSpread, reviewsPerDay, medianSeconds, DAY_MS } from './stats';
import type { ReviewLog, Scheduling } from '../../data/db';

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const START_TODAY = Math.floor(NOW / DAY_MS) * DAY_MS;

const log = (o: Partial<ReviewLog>): ReviewLog =>
  ({ cardId: 'c', deck: 'D', rating: 3, ts: NOW, ...o }) as ReviewLog;

const row = (o: Partial<Scheduling>): Scheduling =>
  ({ cardId: 'c', deck: 'D', state: 'review', S: 10, D: 5, reps: 3, lapses: 0, stepIndex: 0, due: NOW, lastReviewed: null, ...o }) as Scheduling;

describe('trueRetention — only cards that came back DUE count', () => {
  it('ignores learning steps, which are drilling and not recall', () => {
    // Counting the one-minute step inflates retention to uselessness — and that
    // is the number a student would use to decide their settings were fine.
    const r = trueRetention([
      log({ prevState: 'review', rating: 3 }),
      log({ prevState: 'review', rating: 1 }),
      log({ prevState: 'learning', rating: 3 }),
      log({ prevState: 'learning', rating: 3 }),
      log({ prevState: 'relearning', rating: 3 }),
      log({ prevState: 'new', rating: 3 }),
    ]);
    expect(r.reviewed).toBe(2);
    expect(r.recalled).toBe(1);
    expect(r.rate).toBe(0.5);
  });

  it('treats anything but Again as recalled', () => {
    const r = trueRetention([
      log({ prevState: 'review', rating: 2 }),
      log({ prevState: 'review', rating: 3 }),
      log({ prevState: 'review', rating: 4 }),
      log({ prevState: 'review', rating: 1 }),
    ]);
    expect(r.rate).toBe(0.75);
  });

  it('reports old rows as unjudgeable rather than guessing', () => {
    // Rows written before the log recorded prior state cannot be attributed.
    // Counting them either way would misstate the figure.
    const r = trueRetention([log({ rating: 3 }), log({ rating: 1 }), log({ prevState: 'review', rating: 3 })]);
    expect(r.unattributed).toBe(2);
    expect(r.reviewed).toBe(1);
    expect(r.rate).toBe(1);
  });

  it('returns null rather than 0 when there is nothing to judge', () => {
    // 0% would read as "you remember nothing", which is a very different claim
    // from "not enough data yet".
    expect(trueRetention([]).rate).toBeNull();
    expect(trueRetention([log({ prevState: 'learning' })]).rate).toBeNull();
  });
});

describe('forecast — what is coming', () => {
  it('counts cards onto the day they fall due', () => {
    const f = forecast(
      [row({ due: START_TODAY + 0.2 * DAY_MS }), row({ due: START_TODAY + DAY_MS }), row({ due: START_TODAY + 3 * DAY_MS })],
      7,
      NOW
    );
    expect(f[0]!.count).toBe(1);
    expect(f[1]!.count).toBe(1);
    expect(f[3]!.count).toBe(1);
  });

  it('puts a backlog on today, where the student actually meets it', () => {
    // Hiding overdue cards on a past date would be a comfortable lie about
    // tomorrow's workload.
    const f = forecast([row({ due: START_TODAY - 30 * DAY_MS }), row({ due: START_TODAY - DAY_MS })], 7, NOW);
    expect(f[0]!.count).toBe(2);
  });

  it('leaves out new and suspended cards, which are not owed on any date', () => {
    const f = forecast(
      [row({ state: 'new', due: 0 }), row({ due: START_TODAY, suspended: 1 }), row({ due: START_TODAY })],
      7,
      NOW
    );
    expect(f[0]!.count).toBe(1);
  });

  it('ignores anything beyond the window rather than piling it on the last day', () => {
    const f = forecast([row({ due: START_TODAY + 400 * DAY_MS })], 7, NOW);
    expect(f.reduce((n, d) => n + d.count, 0)).toBe(0);
  });

  it('handles a zero-length window', () => {
    expect(forecast([row({})], 0, NOW)).toEqual([]);
  });
});

describe('buttonSpread', () => {
  it('counts each button and the total', () => {
    const s = buttonSpread([log({ rating: 1 }), log({ rating: 3 }), log({ rating: 3 }), log({ rating: 4 })]);
    expect(s).toEqual({ again: 1, hard: 0, good: 2, easy: 1, total: 4 });
  });

  it('ignores a corrupt rating instead of counting it', () => {
    const s = buttonSpread([log({ rating: 9 as never }), log({ rating: 3 })]);
    expect(s.total).toBe(1);
  });
});

describe('reviewsPerDay', () => {
  it('buckets reviews by how many days ago they happened', () => {
    const d = reviewsPerDay(
      [log({ ts: NOW }), log({ ts: NOW - DAY_MS }), log({ ts: NOW - DAY_MS }), log({ ts: NOW - 5 * DAY_MS })],
      7,
      NOW
    );
    expect(d[0]!.count).toBe(1);
    expect(d[1]!.count).toBe(2);
    expect(d[5]!.count).toBe(1);
  });

  it('ignores anything outside the window', () => {
    const d = reviewsPerDay([log({ ts: NOW - 90 * DAY_MS })], 7, NOW);
    expect(d.reduce((n, x) => n + x.count, 0)).toBe(0);
  });
});

describe('medianSeconds', () => {
  it('is the median, so one interrupted card does not skew it', () => {
    // A mean would report ~25s here because of the card someone walked away from.
    expect(medianSeconds([log({ ms: 3000 }), log({ ms: 5000 }), log({ ms: 120_000 })])).toBe(5);
  });

  it('averages the middle two on an even count', () => {
    expect(medianSeconds([log({ ms: 2000 }), log({ ms: 4000 })])).toBe(3);
  });

  it('is null when nothing was timed', () => {
    expect(medianSeconds([log({}), log({ ms: 0 })])).toBeNull();
  });
});
