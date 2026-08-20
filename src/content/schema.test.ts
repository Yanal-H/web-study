import { describe, expect, it, beforeEach } from 'vitest';
import { ChapterSchema, formatZodError } from './schema';
import woundHealing from '../../content/surgery/sur-ch1-wound-healing.json';
import { importChapterJson, getUserChapters, removeUserChapter } from './userContent';

describe('content schema', () => {
  it('accepts the migrated Surgery chapter and preserves counts', () => {
    const parsed = ChapterSchema.safeParse(woundHealing);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('sur-ch1-wound-healing');
      expect(parsed.data.sections).toHaveLength(10);
      expect(parsed.data.cards).toHaveLength(96);
      expect(parsed.data.mcqs).toHaveLength(46);
      // difficulty spread preserved
      const diff = parsed.data.mcqs.reduce<Record<number, number>>((a, q) => {
        a[q.difficulty] = (a[q.difficulty] || 0) + 1;
        return a;
      }, {});
      expect(diff).toEqual({ 1: 24, 2: 21, 3: 1 });
      // every MCQ has exactly-one/at-least-one correct + per-option rationale
      for (const q of parsed.data.mcqs) {
        expect(q.options.some((o) => o.correct)).toBe(true);
        expect(q.options.every((o) => o.text.length > 0)).toBe(true);
      }
    }
  });

  it('rejects malformed content with path-specific errors', () => {
    const bad = {
      schema: 'foundation.study-module/v1',
      id: 'Bad_ID', // fails the id regex
      subject: 'Surgery',
      title: 'X',
      sections: [], // min 1
    };
    const parsed = ChapterSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const lines = formatZodError(parsed.error).join('\n');
      expect(lines).toMatch(/id:/);
      expect(lines).toMatch(/sections/);
    }
  });

  it('rejects a single-answer MCQ with two correct options', () => {
    const chapter = {
      schema: 'foundation.study-module/v1',
      id: 'test-ch1-demo',
      subject: 'Test',
      title: 'Demo',
      sections: [{ id: 's1', title: 'S', digest: 'd' }],
      mcqs: [
        {
          id: 'q1',
          type: 'single',
          difficulty: 1,
          stem: 'stem?',
          options: [
            { id: 'a', text: 'a', correct: true, why: 'First rationale.' },
            { id: 'b', text: 'b', correct: true, why: 'Second rationale.' },
          ],
          explanation: ['Only one option may be correct.'],
        },
      ],
    };
    const parsed = ChapterSchema.safeParse(chapter);
    expect(parsed.success).toBe(false);
  });

  it('requires alt text on figures', () => {
    const fig = { kind: 'described', described: 'x' }; // no alt
    const chapter = {
      schema: 'foundation.study-module/v1',
      id: 'test-ch1-fig',
      subject: 'Test',
      title: 'Demo',
      sections: [{ id: 's1', title: 'S', digest: 'd', figures: [fig] }],
    };
    expect(ChapterSchema.safeParse(chapter).success).toBe(false);
  });

  it('keeps an optional Chinese knowledge extension with the published section', () => {
    const chapter = {
      schema: 'foundation.study-module/v1',
      id: 'test-ch1-bilingual',
      subject: 'Test',
      title: 'Demo',
      sections: [
        {
          id: 's1',
          title: 'Intro',
          digest: 'Core explanation.',
          extraKnowledge: [
            {
              title: 'Chinese terminology',
              body: '心肌梗死（myocardial infarction）应与心绞痛区分。',
              language: 'zh',
            },
          ],
        },
      ],
    };
    const parsed = ChapterSchema.parse(chapter);
    expect(parsed.sections[0]!.extraKnowledge[0]!.language).toBe('zh');
  });
});

describe('runtime import (all-or-nothing, namespaced)', () => {
  beforeEach(() => localStorage.clear());

  const valid = JSON.stringify({
    schema: 'foundation.study-module/v1',
    id: 'imported-ch1-demo',
    subject: 'Imported',
    title: 'Demo chapter',
    sections: [{ id: 's1', title: 'Intro', digest: 'Lead sentence.' }],
    cards: [{ id: 'imported-ch1-demo-card-001', type: 'basic', sectionId: 's1', front: 'Q', back: 'A' }],
    mcqs: [],
  });

  it('stores a valid chapter under the user namespace, not the main store', () => {
    const res = importChapterJson(valid);
    expect(res.ok).toBe(true);
    expect(getUserChapters()).toHaveLength(1);
    expect(localStorage.getItem('foundation_user_content_v1')).toContain('imported-ch1-demo');
    // NOT written into the main app-state key
    expect(localStorage.getItem('foundation_med_study_v1')).toBeNull();
    removeUserChapter('imported-ch1-demo');
    expect(getUserChapters()).toHaveLength(0);
  });

  it('rejects invalid JSON/schema with no partial state', () => {
    expect(importChapterJson('{not json').ok).toBe(false);
    expect(getUserChapters()).toHaveLength(0);
    const badSchema = importChapterJson(JSON.stringify({ schema: 'foundation.study-module/v1', id: 'x' }));
    expect(badSchema.ok).toBe(false);
    expect(badSchema.errors && badSchema.errors.length).toBeGreaterThan(0);
    expect(getUserChapters()).toHaveLength(0);
  });
});
