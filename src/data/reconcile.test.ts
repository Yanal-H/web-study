import { describe, it, expect } from 'vitest';
import { reconcilePlan, type CurrentPack } from './reconcile';

const current: CurrentPack[] = [
  { id: 'ana-ch1', cardIds: new Set(['ana-ch1-card-001', 'ana-ch1-card-002']), mcqIds: new Set(['ana-ch1-mcq-001']) },
  { id: 'sur-ch1', cardIds: new Set(['sur-ch1-card-001']), mcqIds: new Set(['sur-ch1-mcq-001']) },
];

describe('reconcilePlan (H2 — obsolete rows only, never valid ones)', () => {
  it('keeps everything when the stored set matches the current set', () => {
    const plan = reconcilePlan(current, {
      cards: [
        { id: 'ana-ch1-card-001', chapterId: 'ana-ch1' },
        { id: 'ana-ch1-card-002', chapterId: 'ana-ch1' },
        { id: 'sur-ch1-card-001', chapterId: 'sur-ch1' },
      ],
      mcqs: [{ id: 'ana-ch1-mcq-001', chapterId: 'ana-ch1' }],
      chapters: [{ id: 'ana-ch1' }, { id: 'sur-ch1' }],
    });
    expect(plan).toEqual({ cards: [], mcqs: [], chapters: [] });
  });

  it('removes a chapter that is gone, and its cards/mcqs', () => {
    const plan = reconcilePlan(current, {
      cards: [
        { id: 'ana-ch1-card-001', chapterId: 'ana-ch1' },
        { id: 'old-ch9-card-001', chapterId: 'old-ch9' },
      ],
      mcqs: [{ id: 'old-ch9-mcq-001', chapterId: 'old-ch9' }],
      chapters: [{ id: 'ana-ch1' }, { id: 'old-ch9' }],
    });
    expect(plan.chapters).toEqual(['old-ch9']);
    expect(plan.cards).toEqual(['old-ch9-card-001']);
    expect(plan.mcqs).toEqual(['old-ch9-mcq-001']);
  });

  it('removes a single card that left a still-present chapter', () => {
    const plan = reconcilePlan(current, {
      cards: [
        { id: 'ana-ch1-card-001', chapterId: 'ana-ch1' },
        { id: 'ana-ch1-card-999', chapterId: 'ana-ch1' }, // removed from the pack
      ],
      mcqs: [],
      chapters: [{ id: 'ana-ch1' }, { id: 'sur-ch1' }],
    });
    expect(plan.cards).toEqual(['ana-ch1-card-999']);
    expect(plan.chapters).toEqual([]);
  });

  it('never deletes rows of a chapter that is still present (e.g. a personal chapter)', () => {
    const withPersonal = [
      ...current,
      { id: 'mine-ch1', cardIds: new Set(['mine-ch1-card-001']), mcqIds: new Set<string>() },
    ];
    const plan = reconcilePlan(withPersonal, {
      cards: [{ id: 'mine-ch1-card-001', chapterId: 'mine-ch1' }],
      mcqs: [],
      chapters: [{ id: 'mine-ch1' }],
    });
    expect(plan.cards).toEqual([]);
    expect(plan.chapters).toEqual([]);
  });
});

describe('reconcilePlan — published packs are protected from the shipped-set sweep', () => {
  // Reconciliation runs against the SHIPPED set. Chapters that arrived from the
  // shared content store are not in that set, so without protection every one of
  // them would look "removed" and be deleted — losing material a student has
  // already downloaded and may be revising offline.
  const stored = {
    cards: [
      { id: 'ana-ch1-card-001', chapterId: 'ana-ch1' },
      { id: 'pub-ch1-card-001', chapterId: 'pub-ch1' },
      { id: 'pub-ch1-card-002', chapterId: 'pub-ch1' },
    ],
    mcqs: [
      { id: 'ana-ch1-mcq-001', chapterId: 'ana-ch1' },
      { id: 'pub-ch1-mcq-001', chapterId: 'pub-ch1' },
    ],
    chapters: [{ id: 'ana-ch1' }, { id: 'sur-ch1' }, { id: 'pub-ch1' }],
  };

  it('deletes a published chapter when it is NOT protected (the hazard being guarded)', () => {
    const plan = reconcilePlan(current, stored);
    expect(plan.chapters).toEqual(['pub-ch1']);
    expect(plan.cards).toEqual(['pub-ch1-card-001', 'pub-ch1-card-002']);
    expect(plan.mcqs).toEqual(['pub-ch1-mcq-001']);
  });

  it('keeps every row of a protected published chapter', () => {
    const plan = reconcilePlan(current, stored, new Set(['pub-ch1']));
    expect(plan).toEqual({ cards: [], mcqs: [], chapters: [] });
  });

  it('still removes genuinely obsolete shipped rows while protecting published ones', () => {
    const plan = reconcilePlan(
      current,
      {
        cards: [
          { id: 'ana-ch1-card-999', chapterId: 'ana-ch1' }, // left the pack — obsolete
          { id: 'pub-ch1-card-001', chapterId: 'pub-ch1' }, // published — protected
          { id: 'old-ch9-card-001', chapterId: 'old-ch9' }, // chapter gone — obsolete
        ],
        mcqs: [],
        chapters: [{ id: 'old-ch9' }, { id: 'pub-ch1' }],
      },
      new Set(['pub-ch1'])
    );
    expect(plan.cards).toEqual(['ana-ch1-card-999', 'old-ch9-card-001']);
    expect(plan.chapters).toEqual(['old-ch9']);
  });

  it('protecting an id that is not stored changes nothing', () => {
    const plan = reconcilePlan(current, stored, new Set(['pub-ch1', 'never-seen']));
    expect(plan).toEqual({ cards: [], mcqs: [], chapters: [] });
  });
});
