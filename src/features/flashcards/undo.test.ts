// Undo, across every transition the live queue can be in.
//
// Undo is where three things have to agree at once: the card's schedule, the
// session's queue, and the day's allowance. Batch 1 gave a card two more places
// it could be when Undo is pressed (waiting, or promoted back to ready by a
// timer), and Batch 2 gave every grade a cost. A wrong Undo is not loud — it
// leaves a card double-counted against a daily limit, or a rating unreachable.

import { describe, it, expect } from 'vitest';
import { refundGrade, recordGrade, remainingToday, type DailyLedger } from './dailyLimits';
import { placeGraded, promoteDue, reinsertForUndo, initLive, isComplete, type LiveState } from './liveQueue';
import type { ReviewItem } from './deck';

const T0 = 1_000_000_000_000;
const TODAY = '2026-08-22';
const item = (key: string): ReviewItem => ({ key, source: 'content', card: {} as never, deck: 'D' });
const led = (date: string, newDone: number, revDone: number): DailyLedger => ({ date, newDone, revDone });

describe('refundGrade — Undo gives the allowance back', () => {
  // The defect: grading charged the day, Undo did not refund it. Grade a new
  // card, undo, grade it again, and two of twenty new cards are gone for one
  // card. A student who leans on Undo runs out having seen half their cards.
  it('gives back a new-card slot', () => {
    expect(refundGrade(led(TODAY, 5, 0), 'new', TODAY)).toEqual(led(TODAY, 4, 0));
  });

  it('gives back a review slot', () => {
    expect(refundGrade(led(TODAY, 0, 30), 'review', TODAY)).toEqual(led(TODAY, 0, 29));
  });

  it('refunds nothing for a learning re-show, which cost nothing', () => {
    expect(refundGrade(led(TODAY, 5, 5), 'learning', TODAY)).toEqual(led(TODAY, 5, 5));
    expect(refundGrade(led(TODAY, 5, 5), 'relearning', TODAY)).toEqual(led(TODAY, 5, 5));
  });

  it('never goes negative', () => {
    expect(refundGrade(led(TODAY, 0, 0), 'new', TODAY)).toEqual(led(TODAY, 0, 0));
  });

  it('is exactly the inverse of recordGrade', () => {
    const start = led(TODAY, 7, 12);
    for (const st of ['new', 'review', 'learning', 'relearning'] as const) {
      expect(refundGrade(recordGrade(start, st, TODAY), st, TODAY)).toEqual(start);
    }
  });

  it('undoing across midnight cannot corrupt the new day', () => {
    // Graded at 23:59, undone at 00:01: the ledger has already rolled over and
    // there is nothing of yesterday's left to refund. Losing one count beats a
    // negative tally that would hand out a free extra card every day after.
    expect(refundGrade(led('2026-08-21', 20, 200), 'new', TODAY)).toEqual(led(TODAY, 0, 0));
  });

  it('grade → undo → grade again spends the allowance ONCE', () => {
    let l = led(TODAY, 0, 0);
    const caps = { newPerDay: 20, reviewsPerDay: 200 };
    l = recordGrade(l, 'new', TODAY); // saw it, pressed Again
    l = refundGrade(l, 'new', TODAY); // changed their mind
    l = recordGrade(l, 'new', TODAY); // answered properly
    expect(remainingToday(l, caps, TODAY).newLeft).toBe(19); // not 18
  });
});

describe('reinsertForUndo — the card comes back from wherever it went', () => {
  it('pulls a card back out of waiting', () => {
    // Graded Again, so it is sitting on a one-minute timer.
    const s: LiveState = { ready: [item('b')], waiting: [{ item: item('a'), due: T0 + 60_000 }] };
    const after = reinsertForUndo(s, item('a'));
    expect(after.ready.map((i) => i.key)).toEqual(['a', 'b']);
    expect(after.waiting).toHaveLength(0);
  });

  it('does not duplicate a card the timer already promoted back to ready', () => {
    // The race Batch 1 created: the minute elapsed and the card is in ready
    // again, THEN the student presses Undo. It must appear once, at the front.
    const s: LiveState = { ready: [item('a'), item('b')], waiting: [] };
    const after = reinsertForUndo(s, item('a'));
    expect(after.ready.map((i) => i.key)).toEqual(['a', 'b']);
    expect(after.ready.filter((i) => i.key === 'a')).toHaveLength(1);
  });

  it('revives a session that had already finished', () => {
    // Grading the last card empties the queue and shows the summary. Undo from
    // there must put the student back on that card, not leave them stranded.
    const s: LiveState = { ready: [], waiting: [] };
    expect(isComplete(s)).toBe(true);
    const after = reinsertForUndo(s, item('last'));
    expect(isComplete(after)).toBe(false);
    expect(after.ready.map((i) => i.key)).toEqual(['last']);
  });

  it('brings back a card that had graduated out of the session entirely', () => {
    // Answered Easy, so placeGraded never queued it. Undo still recovers it.
    const s = initLive([item('next')]);
    const waiting = placeGraded(s.waiting, item('gone'), { due: T0 + 5 * 86_400_000, state: 'review' }, T0);
    expect(waiting).toHaveLength(0);
    const after = reinsertForUndo({ ready: s.ready, waiting }, item('gone'));
    expect(after.ready.map((i) => i.key)).toEqual(['gone', 'next']);
  });
});

describe('the full journey: grade, wait, promote, undo', () => {
  it('survives every transition without duplicating or losing the card', () => {
    let live = initLive([item('a')]);

    // Grade Again at T0 — leaves ready, waits for a minute.
    live = {
      ready: live.ready.slice(1),
      waiting: placeGraded(live.waiting, item('a'), { due: T0 + 60_000, state: 'learning' }, T0),
    };
    expect(live.ready).toHaveLength(0);
    expect(live.waiting).toHaveLength(1);

    // The timer fires — back in ready.
    live = promoteDue(live, T0 + 61_000);
    expect(live.ready.map((i) => i.key)).toEqual(['a']);

    // NOW the student undoes. One copy, at the front, nothing left waiting.
    live = reinsertForUndo(live, item('a'));
    expect(live.ready.map((i) => i.key)).toEqual(['a']);
    expect(live.waiting).toHaveLength(0);
  });

  it('repeated undo of the same card never multiplies it', () => {
    let live: LiveState = { ready: [item('a')], waiting: [] };
    for (let i = 0; i < 5; i++) live = reinsertForUndo(live, item('a'));
    expect(live.ready).toHaveLength(1);
  });
});
