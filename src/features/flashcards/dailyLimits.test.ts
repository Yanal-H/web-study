import { describe, it, expect } from 'vitest';
import {
  rollover,
  remainingToday,
  spends,
  recordGrade,
  budgetAfter,
  budgetSpent,
  servable,
  type DailyLedger,
} from './dailyLimits';

const CAPS = { newPerDay: 20, reviewsPerDay: 200 };
const TODAY = '2026-08-22';
const YESTERDAY = '2026-08-21';

const led = (date: string, newDone: number, revDone: number): DailyLedger => ({ date, newDone, revDone });

describe('rollover — a new day restores the allowance', () => {
  it('keeps today’s ledger as it is', () => {
    const l = led(TODAY, 5, 30);
    expect(rollover(l, TODAY)).toEqual(l);
  });

  it('resets a ledger left over from yesterday', () => {
    expect(rollover(led(YESTERDAY, 20, 200), TODAY)).toEqual(led(TODAY, 0, 0));
  });

  it('resets a ledger dated in the future, rather than locking the student out', () => {
    // A device with a wrong clock, later corrected. Without this the student gets
    // no new cards until the bogus date arrives.
    expect(rollover(led('2027-01-01', 20, 200), TODAY)).toEqual(led(TODAY, 0, 0));
  });

  it('treats a missing or malformed ledger as an empty day', () => {
    expect(rollover(undefined, TODAY)).toEqual(led(TODAY, 0, 0));
    expect(rollover({} as DailyLedger, TODAY)).toEqual(led(TODAY, 0, 0));
    expect(rollover({ date: TODAY, newDone: NaN } as never, TODAY)).toEqual(led(TODAY, 0, 0));
  });
});

describe('remainingToday — the limit is per day, not per session', () => {
  // The defect this batch fixes. Each "Start review" used to hand out the full
  // allowance again, so three sessions introduced three times the cap.
  it('gives the full allowance on a fresh day', () => {
    expect(remainingToday(led(TODAY, 0, 0), CAPS, TODAY)).toEqual({ newLeft: 20, reviewLeft: 200 });
  });

  it('gives only what a first session left behind', () => {
    expect(remainingToday(led(TODAY, 12, 40), CAPS, TODAY)).toEqual({ newLeft: 8, reviewLeft: 160 });
  });

  it('gives nothing once the day is spent, and never a negative', () => {
    expect(remainingToday(led(TODAY, 25, 500), CAPS, TODAY)).toEqual({ newLeft: 0, reviewLeft: 0 });
  });

  it('restores the full allowance after midnight', () => {
    expect(remainingToday(led(YESTERDAY, 20, 200), CAPS, TODAY)).toEqual({ newLeft: 20, reviewLeft: 200 });
  });

  it('treats a zero or nonsense cap as no allowance, not as unlimited', () => {
    expect(remainingToday(led(TODAY, 0, 0), { newPerDay: 0, reviewsPerDay: 0 }, TODAY)).toEqual({
      newLeft: 0,
      reviewLeft: 0,
    });
    expect(
      remainingToday(led(TODAY, 0, 0), { newPerDay: -5, reviewsPerDay: NaN as never }, TODAY)
    ).toEqual({ newLeft: 0, reviewLeft: 0 });
  });
});

describe('spends — what a grade actually costs', () => {
  it('charges a brand-new card to the new allowance', () => {
    expect(spends('new')).toBe('new');
    expect(spends(undefined)).toBe('new'); // never-seen card has no row yet
  });

  it('charges a due review to the review allowance', () => {
    expect(spends('review')).toBe('review');
  });

  // This is the guard that makes Batch 1's live queue safe: a card graded Again
  // returns within the same session, and must NOT spend a second slot.
  it('charges nothing for a learning or relearning re-show', () => {
    expect(spends('learning')).toBeNull();
    expect(spends('relearning')).toBeNull();
  });
});

describe('recordGrade — counting a session against the day', () => {
  it('counts a new card once, and its re-show not at all', () => {
    let l = led(TODAY, 0, 0);
    l = recordGrade(l, 'new', TODAY); // first sight — Again
    expect(l).toEqual(led(TODAY, 1, 0));
    l = recordGrade(l, 'learning', TODAY); // comes back a minute later
    expect(l).toEqual(led(TODAY, 1, 0));
    l = recordGrade(l, 'learning', TODAY); // and again
    expect(l).toEqual(led(TODAY, 1, 0));
  });

  it('counts a due review once, and its relearning re-show not at all', () => {
    let l = led(TODAY, 0, 0);
    l = recordGrade(l, 'review', TODAY); // lapsed
    expect(l).toEqual(led(TODAY, 0, 1));
    l = recordGrade(l, 'relearning', TODAY);
    expect(l).toEqual(led(TODAY, 0, 1));
  });

  it('rolls the day over before counting', () => {
    expect(recordGrade(led(YESTERDAY, 20, 200), 'new', TODAY)).toEqual(led(TODAY, 1, 0));
  });

  it('does not mutate the ledger it was given', () => {
    const before = led(TODAY, 3, 3);
    recordGrade(before, 'new', TODAY);
    expect(before).toEqual(led(TODAY, 3, 3));
  });
});

describe('budgetAfter — two pools share one allowance', () => {
  // Engine cards and personal cards are queued separately and each used to get
  // the FULL limit, so newPerDay:20 could introduce 40 in one sitting.
  it('gives the second pool only what the first left', () => {
    expect(budgetAfter({ newLeft: 20, reviewLeft: 200 }, { neu: 15, due: 60 })).toEqual({
      newLeft: 5,
      reviewLeft: 140,
    });
  });

  it('leaves nothing when the first pool used it all, and never goes negative', () => {
    expect(budgetAfter({ newLeft: 20, reviewLeft: 200 }, { neu: 40, due: 400 })).toEqual({
      newLeft: 0,
      reviewLeft: 0,
    });
  });

  it('ignores a nonsense negative take', () => {
    expect(budgetAfter({ newLeft: 10, reviewLeft: 10 }, { neu: -5, due: -5 })).toEqual({
      newLeft: 10,
      reviewLeft: 10,
    });
  });
});

describe('budgetSpent', () => {
  it('is true only when both allowances are gone', () => {
    expect(budgetSpent({ newLeft: 0, reviewLeft: 0 })).toBe(true);
    expect(budgetSpent({ newLeft: 0, reviewLeft: 3 })).toBe(false);
    expect(budgetSpent({ newLeft: 3, reviewLeft: 0 })).toBe(false);
  });
});

describe('the defect, end to end: three sessions in one day', () => {
  it('introduces the cap once across the day, not once per session', () => {
    let l = led(TODAY, 0, 0);
    const caps = { newPerDay: 10, reviewsPerDay: 100 };
    let introduced = 0;

    for (let session = 0; session < 3; session++) {
      const budget = remainingToday(l, caps, TODAY);
      // A session studies exactly what it is allowed to introduce.
      for (let i = 0; i < budget.newLeft; i++) {
        l = recordGrade(l, 'new', TODAY);
        introduced++;
      }
    }

    expect(introduced).toBe(10); // not 30
    expect(remainingToday(l, caps, TODAY).newLeft).toBe(0);
  });
});

describe('servable — the count on the button matches what the session hands over', () => {
  it('shows the backlog when the allowance is bigger than it', () => {
    expect(servable({ due: 12, neu: 5 }, { newLeft: 20, reviewLeft: 200 })).toBe(17);
  });

  it('shows the allowance when the backlog is bigger', () => {
    // The defect: 500 due with a 200 review cap used to advertise 500.
    expect(servable({ due: 500, neu: 100 }, { newLeft: 20, reviewLeft: 200 })).toBe(220);
  });

  it('caps each kind against its own allowance', () => {
    // Plenty of review budget left but no new budget: the new cards do not count.
    expect(servable({ due: 3, neu: 40 }, { newLeft: 0, reviewLeft: 200 })).toBe(3);
  });

  it('is zero once the day is spent', () => {
    expect(servable({ due: 500, neu: 100 }, { newLeft: 0, reviewLeft: 0 })).toBe(0);
  });

  it('never reports a negative from odd counts', () => {
    expect(servable({ due: -3, neu: -1 }, { newLeft: 20, reviewLeft: 200 })).toBe(0);
  });
});
