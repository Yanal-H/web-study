// Card ids must be permanent, or editing a chapter destroys progress.
//
// An unlabelled card used to take an id from its POSITION in the array. Insert
// one card at the top of a published chapter and every id below it shifted, so
// every scheduling row was orphaned and the chapter came back as brand new —
// silently, for every student who had it.

import { describe, it, expect } from 'vitest';
import { stampIds } from './publish';
import type { Chapter } from '../content/schema';

const base = {
  id: 'surg-1',
  title: 'Wound healing',
  subject: 'Surgery',
  sections: [],
  emqs: [],
  mcqs: [],
  cards: [],
} as unknown as Chapter;

const card = (front: string, id?: string) =>
  ({ type: 'basic', front, back: 'x', ...(id ? { id } : {}) }) as never;

describe('stampIds', () => {
  it('reproduces the historical positional ids for a pack with none', () => {
    // The compatibility guarantee: chapters already on students' devices have
    // scheduling rows keyed by these exact ids.
    const out = stampIds({ ...base, cards: [card('a'), card('b'), card('c')] });
    expect(out.cards.map((c) => c.id)).toEqual([
      'surg-1-card-001',
      'surg-1-card-002',
      'surg-1-card-003',
    ]);
  });

  it('leaves ids the author wrote alone', () => {
    const out = stampIds({ ...base, cards: [card('a', 'my-own-id')] });
    expect(out.cards[0]!.id).toBe('my-own-id');
  });

  // The defect, in one test.
  it('keeps every existing id when a card is inserted at the front', () => {
    const first = stampIds({ ...base, cards: [card('a'), card('b')] });
    const edited = stampIds({ ...first, cards: [card('NEW'), ...first.cards] });

    expect(edited.cards.find((c) => c.front === 'a')!.id).toBe('surg-1-card-001');
    expect(edited.cards.find((c) => c.front === 'b')!.id).toBe('surg-1-card-002');
    expect(edited.cards.find((c) => c.front === 'NEW')!.id).toBe('surg-1-card-003');
    expect(new Set(edited.cards.map((c) => c.id)).size).toBe(3);
  });

  it('survives reordering and deletion without renaming anything', () => {
    const first = stampIds({ ...base, cards: [card('a'), card('b'), card('c')] });
    const shuffled = stampIds({ ...first, cards: [first.cards[2]!, first.cards[0]!] });
    expect(shuffled.cards.map((c) => c.id)).toEqual(['surg-1-card-003', 'surg-1-card-001']);
  });

  it('never issues a duplicate, even against a hand-written colliding id', () => {
    const out = stampIds({
      ...base,
      cards: [card('a', 'surg-1-card-001'), card('b'), card('c')],
    });
    expect(new Set(out.cards.map((c) => c.id)).size).toBe(3);
  });

  it('stamps questions on the same terms', () => {
    const out = stampIds({ ...base, mcqs: [{ stem: 'q', options: [], answer: 0 } as never] });
    expect(out.mcqs[0]!.id).toBe('surg-1-mcq-001');
  });

  it('is idempotent — stamping twice changes nothing', () => {
    const once = stampIds({ ...base, cards: [card('a'), card('b')] });
    expect(stampIds(once)).toEqual(once);
  });
});
