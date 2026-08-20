import { describe, expect, it, beforeEach } from 'vitest';
import { state } from '../../state/store';
import {
  collectItems,
  buildDeckTree,
  itemsInDeck,
  USER_DECK,
  type ReviewItem,
} from './deck';

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

describe('deck tree', () => {
  const mk = (key: string, deck: string): ReviewItem => ({
    key,
    source: 'content',
    deck,
    card: { type: 'basic', front: 'q', back: 'a' },
  });

  it('nests decks, sub-decks and sub-sub-decks', () => {
    const tree = buildDeckTree([
      mk('a', 'Surgery::Wound Healing::Phases::Inflammatory'),
      mk('b', 'Surgery::Wound Healing::Phases::Proliferative'),
      mk('c', 'Surgery::Wound Healing::Sutures'),
      mk('d', 'Pathology::Inflammation'),
    ]);
    expect(tree.map((n) => n.name)).toEqual(['Pathology', 'Surgery']);
    const surgery = tree.find((n) => n.name === 'Surgery')!;
    expect(surgery.total).toBe(3);
    const wound = surgery.children[0]!;
    expect(wound.name).toBe('Wound Healing');
    const phases = wound.children.find((n) => n.name === 'Phases')!;
    expect(phases.total).toBe(2);
    expect(phases.children.map((n) => n.name)).toEqual(['Inflammatory', 'Proliferative']);
    expect(phases.children[0]!.own).toBe(1);
  });

  it('rolls counts up to every ancestor', () => {
    const tree = buildDeckTree([mk('a', 'A::B::C'), mk('b', 'A::B::D'), mk('c', 'A::E')]);
    expect(tree[0]!.total).toBe(3);
    expect(tree[0]!.children.find((n) => n.name === 'B')!.total).toBe(2);
  });

  it('files cards with no deck under the personal deck', () => {
    const tree = buildDeckTree([mk('a', '')]);
    expect(tree[0]!.name).toBe(USER_DECK);
  });

  it('itemsInDeck takes a node and its whole subtree', () => {
    const items = [mk('a', 'A::B::C'), mk('b', 'A::D'), mk('c', 'Z')];
    expect(itemsInDeck(items, 'A')).toHaveLength(2);
    expect(itemsInDeck(items, 'A::B')).toHaveLength(1);
    expect(itemsInDeck(items, '')).toHaveLength(3);
  });

  it('does not match a deck whose name merely starts the same', () => {
    const items = [mk('a', 'Anatomy'), mk('b', 'Anatomy Extra')];
    expect(itemsInDeck(items, 'Anatomy')).toHaveLength(1);
  });
});

describe('legacy import safety', () => {
  it('normalises a malformed user deck instead of crashing the review screen', () => {
    state.flashcards = [
      { id: 'bad', front: 'Question', back: 'Answer', deck: { unexpected: true } } as any,
    ];
    const item = collectItems().find((entry) => entry.key === 'user:bad');
    expect(item).toMatchObject({ deck: 'My cards', card: { type: 'basic', front: 'Question', back: 'Answer' } });
  });
});
