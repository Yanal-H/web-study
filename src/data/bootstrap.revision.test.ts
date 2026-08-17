import { describe, it, expect } from 'vitest';
import { chapterRevision } from './bootstrap';

const base = {
  title: 'Wound Healing',
  subject: 'Surgery',
  summary: 'A recap.',
  sections: [{ id: 's1', title: 'Phases', digest: 'Inflammation then proliferation.', highYield: ['a'], pitfalls: ['b'] }],
  cards: [{ type: 'basic', front: 'Q', back: 'A' }],
  mcqs: [
    {
      stem: 'Which cell drives contraction?',
      difficulty: 2,
      options: [
        { text: 'Myofibroblast', correct: true, why: 'α-SMA' },
        { text: 'Neutrophil', correct: false, why: 'inflammatory' },
      ],
    },
  ],
};

const clone = () => JSON.parse(JSON.stringify(base));

describe('chapterRevision (H1 — detect count-preserving edits)', () => {
  it('is stable for identical content', () => {
    expect(chapterRevision(clone())).toBe(chapterRevision(clone()));
  });

  it('changes when a rationale changes but counts do not', () => {
    const edited = clone();
    edited.mcqs[0].options[0].why = 'contains alpha smooth muscle actin';
    expect(chapterRevision(edited)).not.toBe(chapterRevision(base));
  });

  it('changes when a section is renamed', () => {
    const edited = clone();
    edited.sections[0].title = 'Phases of healing';
    expect(chapterRevision(edited)).not.toBe(chapterRevision(base));
  });

  it('changes when options are re-ordered', () => {
    const edited = clone();
    edited.mcqs[0].options.reverse();
    expect(chapterRevision(edited)).not.toBe(chapterRevision(base));
  });

  it('changes when a card front changes', () => {
    const edited = clone();
    edited.cards[0].front = 'Different question';
    expect(chapterRevision(edited)).not.toBe(chapterRevision(base));
  });

  it('returns a short base36 string', () => {
    expect(chapterRevision(base)).toMatch(/^[0-9a-z]+$/);
  });
});
