import { describe, expect, it } from 'vitest';
import { ChapterSchema } from './schema';
import { normaliseContentDocument } from './importFormats';
import flashcardTemplate from '../../content/_schema/flashcard-deck.template.json';
import mcqTemplate from '../../content/_schema/mcq-bank.template.json';
import studyTemplate from '../../content/_schema/study-material.template.json';

const base = {
  schema: 'foundation.study-module/v1' as const,
  id: 'test-ch1-formats',
  subject: 'Medicine',
  title: 'Format verification',
  sections: [{ id: 'overview', title: 'Overview', digest: 'A complete study-guide section.' }],
};

describe('administrator JSON formats', () => {
  it('accepts a study guide without cards or questions', () => {
    const parsed = ChapterSchema.parse(base);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.cards).toEqual([]);
    expect(parsed.mcqs).toEqual([]);
  });

  it('accepts flashcard material in the same pack', () => {
    const parsed = ChapterSchema.parse({
      ...base,
      cards: [{ id: 'test-ch1-formats-card-001', type: 'basic', sectionId: 'overview', front: 'What is preload?', back: 'Ventricular end-diastolic stretch.' }],
    });
    expect(parsed.cards).toHaveLength(1);
  });

  it('accepts MCQ material without requiring flashcards', () => {
    const parsed = ChapterSchema.parse({
      ...base,
      mcqs: [{
        id: 'test-ch1-formats-mcq-001', type: 'single', sectionId: 'overview', difficulty: 1,
        stem: 'Which option is correct?',
        options: [
          { id: 'a', text: 'Correct', correct: true, why: 'This is the intended answer.' },
          { id: 'b', text: 'Incorrect', correct: false, why: 'This does not answer the stem.' },
        ],
        explanation: ['The first option is correct.'],
      }],
    });
    expect(parsed.cards).toEqual([]);
    expect(parsed.mcqs).toHaveLength(1);
  });

  it.each([
    ['study material', studyTemplate, 'study-material', 0, 0],
    ['flashcard deck', flashcardTemplate, 'flashcard-deck', 2, 0],
    ['MCQ bank', mcqTemplate, 'mcq-bank', 0, 1],
  ] as const)('normalises the advertised %s template into a complete chapter', (_name, document, format, cards, mcqs) => {
    const result = normaliseContentDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe(format);
    expect(result.chapter.schema).toBe('foundation.study-module/v1');
    expect(result.chapter.sections.length).toBeGreaterThan(0);
    expect(result.chapter.cards).toHaveLength(cards);
    expect(result.chapter.mcqs).toHaveLength(mcqs);
  });

  it('rejects old fragments with a direct template migration instruction', () => {
    const result = normaliseContentDocument({ deckName: 'Surgery::Wounds', cards: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(' ')).toMatch(/old fragment.*current.*template/i);
  });
});
