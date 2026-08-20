import { describe, it, expect, beforeEach } from 'vitest';
import * as mem from './contentStore';

beforeEach(() => mem.clearContent());

const card = (id: string, deck: string, chapterId = 'ana-ch1') => ({
  id,
  chapterId,
  deck,
  subject: 'Anatomy',
  type: 'basic',
});

describe('contentStore — which stores are memory and which are disk', () => {
  // The whole online-only design rests on this split. If a content store ever
  // starts returning null here, that content silently begins persisting to the
  // student's device again.
  it('treats every authored-content store as memory', () => {
    for (const s of ['chapters', 'cards', 'mcqs', 'media']) {
      expect(mem.isContentStore(s)).toBe(true);
      expect(mem.memTable(s)).not.toBeNull();
    }
  });

  it('never treats personal data as memory', () => {
    // Scheduling and reviews are the student's own work and must stay on disk,
    // or months of spaced repetition would vanish when the tab closes.
    for (const s of ['scheduling', 'reviews']) {
      expect(mem.isContentStore(s)).toBe(false);
      expect(mem.memTable(s)).toBeNull();
    }
  });
});

describe('contentStore — tables', () => {
  it('stores and reads a row by its key', () => {
    mem.cards.put(card('c1', 'Anatomy::Upper limb'));
    expect(mem.cards.get('c1')).toMatchObject({ id: 'c1' });
    expect(mem.cards.get('nope')).toBeUndefined();
    expect(mem.hasCard('c1')).toBe(true);
    expect(mem.hasCard('nope')).toBe(false);
  });

  it('overwrites by id rather than duplicating, so re-import is idempotent', () => {
    mem.cards.put(card('c1', 'A'));
    mem.cards.put({ ...card('c1', 'B'), front: 'updated' });
    expect(mem.cards.size).toBe(1);
    expect(mem.cards.get('c1')).toMatchObject({ deck: 'B', front: 'updated' });
  });

  it('keys media by imageId, not id', () => {
    mem.media.put({ imageId: 'ana-ch1:scapula', src: 'data:image/svg+xml,x' });
    expect(mem.media.get('ana-ch1:scapula')).toMatchObject({ src: 'data:image/svg+xml,x' });
  });

  it('clearContent empties every table — this is what sign-out relies on', () => {
    mem.cards.put(card('c1', 'A'));
    mem.mcqs.put({ id: 'q1', chapterId: 'ana-ch1' });
    mem.chapters.put({ id: 'ana-ch1' });
    mem.media.put({ imageId: 'i1', src: 'x' });

    mem.clearContent();

    expect(mem.cards.size).toBe(0);
    expect(mem.mcqs.size).toBe(0);
    expect(mem.chapters.size).toBe(0);
    expect(mem.media.size).toBe(0);
  });

  it('indexes rows by chapter and keeps the index correct on overwrite', () => {
    mem.cards.put(card('c1', 'A', 'ana-ch1'));
    mem.cards.put(card('c2', 'B', 'sur-ch1'));
    mem.cards.put(card('c1', 'C', 'sur-ch1'));

    expect(mem.chapterRows('ana-ch1').cards).toHaveLength(0);
    expect(mem.chapterRows('sur-ch1').cards.map((row) => row.id).sort()).toEqual(['c1', 'c2']);
  });

  it('removes exactly one chapter and returns its card ids', () => {
    mem.chapters.put({ id: 'ana-ch1' });
    mem.chapters.put({ id: 'sur-ch1' });
    mem.cards.put(card('c1', 'A', 'ana-ch1'));
    mem.cards.put(card('c2', 'B', 'sur-ch1'));
    mem.mcqs.put({ id: 'q1', chapterId: 'ana-ch1' });
    mem.media.put({ imageId: 'ana-ch1:figure', src: 'x' });

    expect(mem.removeChapter('ana-ch1')).toEqual(['c1']);
    expect(mem.cards.get('c1')).toBeUndefined();
    expect(mem.mcqs.get('q1')).toBeUndefined();
    expect(mem.media.get('ana-ch1:figure')).toBeUndefined();
    expect(mem.chapters.get('ana-ch1')).toBeUndefined();
    expect(mem.cards.get('c2')).toBeDefined();
    expect(mem.chapters.get('sur-ch1')).toBeDefined();
  });
});

describe('contentStore — deck queries', () => {
  beforeEach(() => {
    mem.cards.put(card('c1', 'Anatomy::Upper limb::Bones'));
    mem.cards.put(card('c2', 'Anatomy::Upper limb::Bones'));
    mem.cards.put(card('c3', 'Anatomy::Upper limb::Muscles'));
    mem.cards.put(card('c4', 'Surgery::Wounds', 'sur-ch1'));
  });

  it('lists each distinct deck once', () => {
    expect(mem.allDeckKeys().sort()).toEqual([
      'Anatomy::Upper limb::Bones',
      'Anatomy::Upper limb::Muscles',
      'Surgery::Wounds',
    ]);
  });

  it('treats a deck path as a prefix over its subtree', () => {
    expect(mem.decksUnder('Anatomy').sort()).toEqual([
      'Anatomy::Upper limb::Bones',
      'Anatomy::Upper limb::Muscles',
    ]);
    expect(mem.decksUnder('Anatomy::Upper limb::Bones')).toEqual(['Anatomy::Upper limb::Bones']);
  });

  it('does not match a deck whose name merely starts with the same letters', () => {
    mem.cards.put(card('c5', 'Anatomyx::Trap'));
    expect(mem.decksUnder('Anatomy')).not.toContain('Anatomyx::Trap');
  });

  it('empty prefix means every deck', () => {
    expect(mem.decksUnder('').length).toBe(3);
  });

  it('counts cards per exact deck path', () => {
    expect(mem.deckCounts()).toEqual({
      'Anatomy::Upper limb::Bones': 2,
      'Anatomy::Upper limb::Muscles': 1,
      'Surgery::Wounds': 1,
    });
  });
});

describe('contentStore — mcqs by chapter', () => {
  it('returns only the ids for that chapter', () => {
    mem.mcqs.put({ id: 'q1', chapterId: 'ana-ch1' });
    mem.mcqs.put({ id: 'q2', chapterId: 'ana-ch1' });
    mem.mcqs.put({ id: 'q3', chapterId: 'sur-ch1' });
    expect(mem.mcqIdsForChapter('ana-ch1').sort()).toEqual(['q1', 'q2']);
    expect(mem.mcqIdsForChapter('nope')).toEqual([]);
  });
});
