import { describe, it, expect } from 'vitest';
import { forgetCard, setDueInDays, cardHistory, DAY } from './cardOps';
import type { Scheduling, ReviewLog } from '../../data/db';

const NOW = Date.UTC(2026, 7, 22, 15, 30, 0);
const START_TODAY = Math.floor(NOW / DAY) * DAY;

const sched = (o: Partial<Scheduling> = {}): Scheduling =>
  ({
    cardId: 'c1', deck: 'D', state: 'review', S: 40, D: 6, reps: 12, lapses: 3,
    stepIndex: 2, due: NOW + 30 * DAY, lastReviewed: NOW - 10 * DAY, ...o,
  }) as Scheduling;

const log = (o: Partial<ReviewLog>): ReviewLog =>
  ({ cardId: 'c1', deck: 'D', rating: 3, ts: NOW, ...o }) as ReviewLog;

describe('forgetCard — back to never-seen', () => {
  it('resets what the scheduler believes', () => {
    const out = forgetCard(sched());
    expect(out.state).toBe('new');
    expect(out.due).toBe(0);
    expect(out.S).toBe(0);
    expect(out.stepIndex).toBe(0);
    expect(out.lastReviewed).toBeNull();
  });

  it('KEEPS the lapse and rep counts by default', () => {
    // A leech that is forgotten must not come back with a clean record and
    // start eating the queue again unnoticed. The counts are the card's
    // biography — how hard it has actually been.
    const out = forgetCard(sched({ reps: 12, lapses: 9 }));
    expect(out.reps).toBe(12);
    expect(out.lapses).toBe(9);
  });

  it('clears them only when asked explicitly', () => {
    const out = forgetCard(sched({ reps: 12, lapses: 9 }), { resetCounts: true });
    expect(out.reps).toBe(0);
    expect(out.lapses).toBe(0);
  });

  it('does not mutate the row it was given', () => {
    const before = sched();
    forgetCard(before);
    expect(before.state).toBe('review');
    expect(before.due).toBe(NOW + 30 * DAY);
  });

  it('leaves suspension alone — forgetting is not un-suspending', () => {
    expect(forgetCard(sched({ suspended: 1 })).suspended).toBe(1);
  });
});

describe('setDueInDays', () => {
  it('day 0 is today', () => {
    expect(setDueInDays(sched(), 0, NOW).due).toBe(START_TODAY);
  });

  it('puts the card the requested number of days out', () => {
    expect(setDueInDays(sched(), 5, NOW).due).toBe(START_TODAY + 5 * DAY);
  });

  it('treats the card as a review from then on', () => {
    expect(setDueInDays(sched({ state: 'new' }), 3, NOW).state).toBe('review');
    expect(setDueInDays(sched({ state: 'learning' }), 3, NOW).stepIndex).toBe(0);
  });

  it('leaves stability alone, so the NEXT interval is still earned', () => {
    // A date typed once should not overwrite what the scheduler actually
    // learned about this card.
    const out = setDueInDays(sched({ S: 40, D: 6 }), 5, NOW);
    expect(out.S).toBe(40);
    expect(out.D).toBe(6);
  });

  it('never accepts a negative or nonsense number of days', () => {
    expect(setDueInDays(sched(), -10, NOW).due).toBe(START_TODAY);
    expect(setDueInDays(sched(), NaN, NOW).due).toBe(START_TODAY);
  });

  it('does not quietly un-suspend a card', () => {
    expect(setDueInDays(sched({ suspended: 1 }), 5, NOW).suspended).toBe(1);
  });
});

describe('cardHistory — this card’s own record', () => {
  it('is empty and honest for a card never reviewed', () => {
    const h = cardHistory([]);
    expect(h.reviews).toBe(0);
    expect(h.retention).toBeNull();
    expect(h.first).toBeNull();
  });

  it('counts a lapse only when the card was genuinely due', () => {
    // Failing a one-minute learning step is part of learning the card, not a
    // lapse — counting it would make every new card look like a leech.
    const h = cardHistory([
      log({ rating: 1, prevState: 'learning' }),
      log({ rating: 1, prevState: 'review' }),
      log({ rating: 3, prevState: 'review' }),
    ]);
    expect(h.lapses).toBe(1);
    expect(h.again).toBe(2); // both Agains are still visible as Agains
  });

  it('computes retention over due reviews only', () => {
    const h = cardHistory([
      log({ rating: 3, prevState: 'review' }),
      log({ rating: 1, prevState: 'review' }),
      log({ rating: 3, prevState: 'learning' }),
    ]);
    expect(h.retention).toBe(0.5);
  });

  it('reports first and last from the earliest and latest, whatever order it is given', () => {
    const h = cardHistory([log({ ts: NOW }), log({ ts: NOW - 5 * DAY }), log({ ts: NOW - DAY })]);
    expect(h.first).toBe(NOW - 5 * DAY);
    expect(h.last).toBe(NOW);
  });

  it('uses a median time so one abandoned card does not distort it', () => {
    expect(cardHistory([log({ ms: 2000 }), log({ ms: 4000 }), log({ ms: 300_000 })]).medianSeconds).toBe(4);
  });
});
