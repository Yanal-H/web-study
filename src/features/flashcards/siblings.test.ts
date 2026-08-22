import { describe, it, expect } from 'vitest';
import { noteKeyOf, areSiblings, buryFrom, countSiblings } from './siblings';
import type { ReviewItem } from './deck';

const occ = (key: string, imageId?: string, chapterId = 'ch1'): ReviewItem =>
  ({
    key,
    source: key.startsWith('user:') ? 'user' : 'engine',
    deck: 'D',
    chapterId,
    card: { type: 'occlusion', image: imageId ? { imageId } : undefined, chapterId },
  }) as ReviewItem;

const basic = (key: string): ReviewItem =>
  ({ key, source: 'engine', deck: 'D', card: { type: 'basic', front: 'q', back: 'a' } }) as ReviewItem;

describe('noteKeyOf — what a card was cut from', () => {
  it('groups the regions of one personal occlusion image', () => {
    expect(noteKeyOf(occ('user:abc#0'))).toBe('user:abc');
    expect(noteKeyOf(occ('user:abc#7'))).toBe('user:abc');
  });

  it('groups content occlusion cards by their image within a chapter', () => {
    expect(noteKeyOf(occ('engine:c1', 'heart-diagram'))).toBe('occ:ch1:heart-diagram');
  });

  it('gives an ordinary card no group at all, rather than inventing one', () => {
    // Guessing here would bury unrelated cards, which is worse than not burying.
    expect(noteKeyOf(basic('engine:x'))).toBeNull();
  });

  it('does not group two occlusion cards from different chapters', () => {
    expect(noteKeyOf(occ('engine:a', 'diagram', 'ch1'))).not.toBe(
      noteKeyOf(occ('engine:b', 'diagram', 'ch2'))
    );
  });
});

describe('areSiblings', () => {
  it('is true for two regions of the same image', () => {
    expect(areSiblings(occ('user:abc#0'), occ('user:abc#1'))).toBe(true);
  });

  it('is false across different images', () => {
    expect(areSiblings(occ('user:abc#0'), occ('user:xyz#0'))).toBe(false);
  });

  it('is false for a card against itself', () => {
    expect(areSiblings(occ('user:abc#0'), occ('user:abc#0'))).toBe(false);
  });

  it('is false for ordinary cards, however similar', () => {
    expect(areSiblings(basic('engine:a'), basic('engine:b'))).toBe(false);
  });
});

describe('buryFrom — the rest of this sitting', () => {
  it('removes the other regions of the same diagram', () => {
    const queue = [occ('user:abc#0'), occ('user:abc#1'), occ('user:abc#2'), basic('engine:z')];
    const after = buryFrom(queue, occ('user:abc#0'));
    expect(after.map((i) => i.key)).toEqual(['user:abc#0', 'engine:z']);
  });

  it('leaves unrelated cards alone', () => {
    const queue = [occ('user:abc#1'), occ('user:xyz#0'), basic('engine:z')];
    const after = buryFrom(queue, occ('user:abc#0'));
    expect(after.map((i) => i.key)).toEqual(['user:xyz#0', 'engine:z']);
  });

  it('returns the same array when a card has no siblings, so callers can skip a re-render', () => {
    const queue = [basic('engine:a'), basic('engine:b')];
    expect(buryFrom(queue, basic('engine:a'))).toBe(queue);
  });

  it('returns the same array when the siblings are not queued anyway', () => {
    const queue = [basic('engine:z')];
    expect(buryFrom(queue, occ('user:abc#0'))).toBe(queue);
  });

  it('never buries the card that was just answered', () => {
    const queue = [occ('user:abc#0'), occ('user:abc#1')];
    expect(buryFrom(queue, occ('user:abc#0')).map((i) => i.key)).toContain('user:abc#0');
  });
});

describe('countSiblings', () => {
  it('counts what would be buried, for telling the student', () => {
    const queue = [occ('user:abc#0'), occ('user:abc#1'), occ('user:abc#2'), basic('engine:z')];
    expect(countSiblings(queue, occ('user:abc#0'))).toBe(2);
    expect(countSiblings(queue, basic('engine:z'))).toBe(0);
  });
});
