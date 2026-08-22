// The live queue against the REAL scheduler.
//
// liveQueue.test.ts proves the queue's own logic with hand-written due times.
// This file closes the gap that unit tests cannot: it feeds the actual FSRS
// scheduler's output into placeGraded, so the two modules must agree on the
// vocabulary they exchange — the `state` strings and the units of `due`.
//
// That agreement is exactly the kind of thing that breaks silently. If FSRS ever
// returned a numeric state, or a due time in seconds, every unit test here would
// still pass while the student's one-minute card quietly stopped coming back.

import { describe, it, expect } from 'vitest';
import { schedule, newScheduling } from '../../data/fsrs';
import { placeGraded, promoteDue, isDueSoon, isComplete, initLive } from './liveQueue';
import type { ReviewItem } from './deck';

const T0 = 1_000_000_000_000;
const card = (key: string): ReviewItem => ({ key, source: 'engine', card: {} as never, deck: 'D' });

describe('the real scheduler and the live queue agree', () => {
  it('Again on a new card produces a state and due the queue will re-show', () => {
    const fresh = newScheduling('c1', 'D');
    const next = schedule(fresh, 1, T0); // 1 = Again

    // What the scheduler actually says.
    expect(next.state).toBe('learning');
    expect(next.due).toBe(T0 + 60_000); // first learning step, in ms

    // What the queue does with it — the whole point.
    const waiting = placeGraded([], card('c1'), { due: next.due, state: next.state }, T0);
    expect(waiting).toHaveLength(1);
  });

  it('the student’s exact complaint: Again, wait a minute, card is back — no leaving required', () => {
    let live = initLive([card('c1')]);
    const sched = newScheduling('c1', 'D');

    // 08:00 — sees the card, forgets it, presses Again.
    const next = schedule(sched, 1, T0);
    live = {
      ready: live.ready.slice(1),
      waiting: placeGraded(live.waiting, card('c1'), { due: next.due, state: next.state }, T0),
    };
    expect(isComplete(live)).toBe(false); // the session must NOT declare itself done
    expect(isDueSoon(live)).toBe(true); // it is waiting, not finished

    // 08:00:30 — still waiting.
    expect(promoteDue(live, T0 + 30_000).ready).toHaveLength(0);

    // 08:01 — back on screen, in the same session.
    live = promoteDue(live, T0 + 61_000);
    expect(live.ready.map((i) => i.key)).toEqual(['c1']);
    expect(live.waiting).toHaveLength(0);
  });

  it('Again on a lapsed review card comes back inside the session too', () => {
    // A graduated card that is forgotten drops to relearning on a 10-minute step,
    // which is still inside the session horizon.
    const reviewed = { ...newScheduling('c2', 'D'), state: 'review' as const, S: 30, D: 5, reps: 8, lastReviewed: T0 - 86_400_000 };
    const next = schedule(reviewed, 1, T0);

    expect(next.state).toBe('relearning');
    expect(placeGraded([], card('c2'), { due: next.due, state: next.state }, T0)).toHaveLength(1);
  });

  it('a card answered Good all the way out of learning does NOT come back today', () => {
    // Good twice graduates it (steps are 1 and 10 minutes), landing it days away.
    let s = newScheduling('c3', 'D');
    s = schedule(s, 3, T0); // Good — advance to the 10-minute step
    s = schedule(s, 3, T0 + 600_000); // Good again — graduates
    expect(s.state).toBe('review');

    const waiting = placeGraded([], card('c3'), { due: s.due, state: s.state }, T0 + 600_000);
    expect(waiting).toHaveLength(0); // finished for today, as it should be
  });

  it('Easy graduates immediately and is not re-shown', () => {
    const s = schedule(newScheduling('c4', 'D'), 4, T0); // Easy
    expect(s.state).toBe('review');
    expect(placeGraded([], card('c4'), { due: s.due, state: s.state }, T0)).toHaveLength(0);
  });
});
