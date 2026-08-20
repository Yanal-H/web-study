import { describe, expect, it } from 'vitest';
import { ChapterSchema } from './schema';

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
      cards: [{ type: 'basic', front: 'What is preload?', back: 'Ventricular end-diastolic stretch.' }],
    });
    expect(parsed.cards).toHaveLength(1);
  });

  it('accepts MCQ material without requiring flashcards', () => {
    const parsed = ChapterSchema.parse({
      ...base,
      mcqs: [{
        id: 'test-format-q1', type: 'single', difficulty: 1,
        stem: 'Which option is correct?',
        options: [{ text: 'Correct', correct: true }, { text: 'Incorrect', correct: false }],
        explanation: ['The first option is correct.'],
      }],
    });
    expect(parsed.cards).toEqual([]);
    expect(parsed.mcqs).toHaveLength(1);
  });
});

