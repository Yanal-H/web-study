import { describe, expect, it } from 'vitest';
import { ChapterSchema } from './schema';
import { chapterSemanticIssues } from './validation';

function chapter(overrides: Record<string, unknown> = {}) {
  return ChapterSchema.parse({
    schema: 'foundation.study-module/v1',
    id: 'test-ch1-identity',
    subject: 'Medicine',
    title: 'Identity checks',
    sections: [{ id: 'core', title: 'Core', digest: 'Orientation.' }],
    ...overrides,
  });
}

describe('shared-content semantic validation', () => {
  it('accepts stable, chapter-namespaced identities and valid references', () => {
    const pack = chapter({
      cards: [{ id: 'test-ch1-identity-card-001', type: 'basic', sectionId: 'core', front: 'Q', back: 'A' }],
      mcqs: [{
        id: 'test-ch1-identity-mcq-001', type: 'single', sectionId: 'core', difficulty: 1, stem: 'Question?',
        options: [
          { id: 'a', text: 'Right', correct: true, why: 'Correct rationale.' },
          { id: 'b', text: 'Wrong', correct: false, why: 'Incorrect rationale.' },
        ],
        explanation: ['Explanation.'],
      }],
    });
    expect(chapterSemanticIssues(pack)).toEqual([]);
  });

  it('rejects identities that could collide and broken section references', () => {
    const pack = chapter({
      cards: [
        { id: 'other-card-001', type: 'basic', sectionId: 'missing', front: 'Q', back: 'A' },
        { id: 'other-card-001', type: 'basic', sectionId: 'core', front: 'Q2', back: 'A2' },
      ],
    });
    const issues = chapterSemanticIssues(pack).join('\n');
    expect(issues).toMatch(/duplicate id/i);
    expect(issues).toMatch(/must start with/i);
    expect(issues).toMatch(/does not match a section/i);
  });

  it('rejects duplicate MCQ option wording even when option ids differ', () => {
    const pack = chapter({
      mcqs: [{
        id: 'test-ch1-identity-mcq-001', type: 'single', sectionId: 'core', difficulty: 1, stem: 'Question?',
        options: [
          { id: 'a', text: 'Same answer', correct: true, why: 'Correct rationale.' },
          { id: 'b', text: ' same answer ', correct: false, why: 'Incorrect rationale.' },
        ],
        explanation: ['Explanation.'],
      }],
    });
    expect(chapterSemanticIssues(pack).join(' ')).toMatch(/duplicate option text/i);
  });

  it('rejects table rows whose width does not match the headings', () => {
    expect(() => chapter({
      sections: [{
        id: 'core', title: 'Core', digest: 'Orientation.',
        tables: [{ columns: ['A', 'B'], rows: [['only one']] }],
      }],
    })).toThrow(/row has 1 cells/i);
  });
});
