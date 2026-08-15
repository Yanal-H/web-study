import { describe, expect, it, beforeEach } from 'vitest';
import { state } from '../../state/store';
import { collectItems } from './deck';

describe('deck — occlusion expansion', () => {
  beforeEach(() => {
    state.flashcards = [];
  });

  it('expands an N-region occlusion card into N individually-scheduled items', () => {
    state.flashcards.push({
      id: 'occ1',
      type: 'occlusion',
      image: { src: 'data:image/png;base64,AAAA', alt: 'diagram' },
      regions: [
        { x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'A' },
        { x: 0.4, y: 0.4, w: 0.2, h: 0.2, label: 'B' },
        { x: 0.7, y: 0.1, w: 0.2, h: 0.2, label: 'C' },
      ],
    } as any);

    const items = collectItems();
    const occItems = items.filter((i) => i.key.startsWith('user:occ1'));
    expect(occItems).toHaveLength(3);
    // each item tests exactly one region, keyed distinctly, and is schedulable
    expect(occItems.map((i) => i.card.regionIndex).sort()).toEqual([0, 1, 2]);
    expect(new Set(occItems.map((i) => i.key)).size).toBe(3);
    expect(occItems.every((i) => i.card.type === 'occlusion')).toBe(true);
    expect(occItems[0]!.card.back).toBe('A');
  });

  it('keeps a plain user card as a single item', () => {
    state.flashcards.push({ id: 'b1', type: 'basic', front: 'Q', back: 'A' } as any);
    const items = collectItems().filter((i) => i.key === 'user:b1');
    expect(items).toHaveLength(1);
  });
});
