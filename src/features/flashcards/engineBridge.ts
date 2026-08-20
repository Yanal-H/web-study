// Bridge between the card engine and the review UI.
//
// The engine speaks in scheduling rows and stored cards; the session speaks in
// ReviewItems. This translates one to the other and merges the engine's deck
// tree with the tree built from the student's own cards, so both appear in one
// list and one session even though they are scheduled by different algorithms.

import { buildQueue as engineBuildQueue, deckStats, type EngineItem, type EngineDeckNode } from '../../data/session';
import { chapterImage } from '../../content/loader';
import type { ReviewItem, DeckNode } from './deck';
import type { StoredCard } from '../../data/db';

/** One engine row as something the review session can render. */
export function toReviewItem(e: EngineItem): ReviewItem {
  const c: StoredCard = e.card;
  return {
    key: `engine:${c.id}`,
    source: 'engine',
    sched: e.sched,
    deck: e.deck,
    chapterId: c.chapterId,
    subject: c.subject,
    card: {
      type: c.type,
      front: c.front,
      back: c.back,
      cloze: c.cloze,
      extra: c.extra,
      hint: c.hint,
      image:
        typeof c.image === 'string'
          ? { src: chapterImage(c.chapterId, c.image)?.src, imageId: c.image }
          : c.image,
      masks: c.masks,
      target: c.target,
      occMode: c.occMode,
      label: c.label,
      chapterId: c.chapterId,
      tags: c.tags,
    },
  };
}

export interface EngineQueueOptions {
  newLimit: number;
  reviewLimit: number;
  /** "study all" ignores the daily caps and takes unseen cards too */
  includeAll?: boolean;
}

/** A batch of engine cards for a deck subtree, ready to review. */
export async function engineQueue(deck: string, opts: EngineQueueOptions): Promise<ReviewItem[]> {
  const rows = await engineBuildQueue(deck, {
    newLimit: opts.newLimit,
    reviewLimit: opts.reviewLimit,
    includeAll: opts.includeAll,
  });
  return rows.map(toReviewItem);
}

export async function engineItems(deck: string) {
  return deckStats(deck);
}

/** Merge the engine tree with the personal-card tree into one sorted forest. */
export function mergeTrees(engine: EngineDeckNode[], user: DeckNode[]): DeckNode[] {
  const out = new Map<string, DeckNode>();
  const add = (nodes: Array<EngineDeckNode | DeckNode>) => {
    for (const n of nodes) {
      const existing = out.get(n.path);
      if (!existing) {
        out.set(n.path, { ...n, children: [] });
      } else {
        existing.total += n.total;
        existing.due += n.due;
        existing.neu += n.neu;
        existing.own += n.own;
      }
    }
  };
  // merge level by level so the shapes stay aligned
  const merge = (a: Array<EngineDeckNode | DeckNode>, b: Array<EngineDeckNode | DeckNode>): DeckNode[] => {
    out.clear();
    add(a);
    add(b);
    const roots = [...out.values()];
    for (const r of roots) {
      const ca = a.find((n) => n.path === r.path)?.children ?? [];
      const cb = b.find((n) => n.path === r.path)?.children ?? [];
      r.children = ca.length || cb.length ? merge(ca, cb) : [];
    }
    return roots.sort((x, y) => x.name.localeCompare(y.name));
  };
  return merge(engine, user);
}

/** Find a node anywhere in a tree by its full path. */
export function findNode(nodes: DeckNode[], path: string): DeckNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    const hit = findNode(n.children, path);
    if (hit) return hit;
  }
  return undefined;
}
