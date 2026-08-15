import { describe, expect, it, beforeEach } from 'vitest';
import { ChapterSchema, formatZodError } from './schema';
import woundHealing from '../../content/surgery/ch01-wound-healing.json';
import { importChapterJson, getUserChapters, removeUserChapter } from './userContent';

describe('content schema', () => {
  it('accepts the migrated Surgery chapter and preserves counts', () => {
    const parsed = ChapterSchema.safeParse(woundHealing);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('sur-ch1-wound-healing');
      expect(parsed.data.sections).toHaveLength(6);
      expect(parsed.data.cards).toHaveLength(95);
      expect(parsed.data.mcqs).toHaveLength(45);
      // difficulty spread preserved
      const diff = parsed.data.mcqs.reduce<Record<number, number>>((a, q) => {
        a[q.difficulty] = (a[q.difficulty] || 0) + 1;
        return a;
      }, {});
      expect(diff).toEqual({ 1: 17, 2: 20, 3: 8 });
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
            { text: 'a', correct: true },
            { text: 'b', correct: true },
          ],
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
});

describe('runtime import (all-or-nothing, namespaced)', () => {
  beforeEach(() => localStorage.clear());

  const valid = JSON.stringify({
    schema: 'foundation.study-module/v1',
    id: 'imported-ch1-demo',
    subject: 'Imported',
    title: 'Demo chapter',
    sections: [{ id: 's1', title: 'Intro', digest: 'Lead sentence.' }],
    cards: [{ type: 'basic', front: 'Q', back: 'A' }],
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
