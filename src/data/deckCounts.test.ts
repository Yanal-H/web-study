import { describe, it, expect } from 'vitest';
import { queueCountsFromTree, type EngineDeckNode } from './session';

// A tree shaped like the real one: counts roll UP, so a parent already includes
// everything beneath it (see deckTree).
const node = (
  path: string,
  due: number,
  neu: number,
  children: EngineDeckNode[] = []
): EngineDeckNode => ({
  name: path.split('::').pop()!,
  path,
  children,
  own: 0,
  total: due + neu,
  due,
  neu,
});

const tree: EngineDeckNode[] = [
  node('Anatomy', 12, 5, [
    node('Anatomy::Upper limb', 8, 3, [node('Anatomy::Upper limb::Bones', 5, 1)]),
    node('Anatomy::Thorax', 4, 2),
  ]),
  node('Surgery', 7, 9),
];

describe('queueCountsFromTree — one deck, one answer', () => {
  it('sums the roots when no deck is given', () => {
    // "Everything" is the roots added up, NOT a lookup for the empty path, which
    // would find nothing and report a confident zero.
    expect(queueCountsFromTree(tree, '')).toEqual({ due: 19, neu: 14 });
  });

  it('reads a top-level deck, already rolled up', () => {
    expect(queueCountsFromTree(tree, 'Anatomy')).toEqual({ due: 12, neu: 5 });
  });

  it('reads a sub-deck', () => {
    expect(queueCountsFromTree(tree, 'Anatomy::Upper limb')).toEqual({ due: 8, neu: 3 });
  });

  it('reads a sub-sub-deck', () => {
    expect(queueCountsFromTree(tree, 'Anatomy::Upper limb::Bones')).toEqual({ due: 5, neu: 1 });
  });

  it('reports zero for a deck that does not exist, rather than throwing', () => {
    expect(queueCountsFromTree(tree, 'Nope::Missing')).toEqual({ due: 0, neu: 0 });
  });

  it('does not confuse a deck with one whose name starts the same', () => {
    // "Anatomy" must not match "Anatomy::Thorax" by prefix, or a parent would
    // count its children twice on top of the roll-up.
    expect(queueCountsFromTree(tree, 'Anat')).toEqual({ due: 0, neu: 0 });
  });

  it('handles an empty tree', () => {
    expect(queueCountsFromTree([], '')).toEqual({ due: 0, neu: 0 });
    expect(queueCountsFromTree([], 'Anatomy')).toEqual({ due: 0, neu: 0 });
  });
});
