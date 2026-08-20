// Review sessions, served from the card engine.
//
// A session never holds a deck — it holds a batch. `buildQueue` pulls at most
// `reviewLimit` due cards and `newLimit` unseen ones through indexed range
// scans, then fetches just those card rows. Rating a card writes one scheduling
// row and one log entry. Nothing else is read, so session cost is flat no
// matter how large the bank grows.

import {
  getCards,
  getScheduling,
  nextDueBatch,
  nextNewBatch,
  allActiveBatch,
  putScheduling,
  dueCount,
  newCount,
  deckCounts,
  type Scheduling,
  type StoredCard,
} from './db';
import { schedule, newScheduling } from './fsrs';
import { hasCard } from './contentStore';

export interface EngineItem {
  cardId: string;
  deck: string;
  sched: Scheduling;
  card: StoredCard;
}

export interface QueueOptions {
  newLimit: number;
  reviewLimit: number;
  now?: number;
  /** true ignores scheduling and returns every active card in the deck. */
  includeAll?: boolean;
}

/** Due cards first, then unseen ones, capped by the daily limits. */
export async function buildQueue(deck: string, opts: QueueOptions): Promise<EngineItem[]> {
  const now = opts.now ?? Date.now();
  const rows = opts.includeAll
    ? await allActiveBatch(deck, Number.MAX_SAFE_INTEGER)
    : [
        ...(await nextDueBatch(deck, now, opts.reviewLimit)),
        ...(await nextNewBatch(deck, opts.newLimit)),
      ];
  if (rows.length === 0) return [];

  const cards = await getCards(rows.map((r) => r.cardId));
  const byId = new Map(cards.map((c) => [c.id, c]));
  return rows
    .filter((r) => byId.has(r.cardId))
    .map((r) => ({ cardId: r.cardId, deck: r.deck, sched: r, card: byId.get(r.cardId)! }));
}

/** Apply a rating: new scheduling state, persisted with a review-log entry. */
export async function rateCard(
  item: EngineItem,
  rating: 1 | 2 | 3 | 4,
  ms?: number
): Promise<Scheduling> {
  const now = Date.now();
  const next = schedule(item.sched, rating, now);
  await putScheduling(next, { cardId: item.cardId, deck: item.deck, rating, ts: now, ms });
  return next;
}

/** Put a card's previous scheduling row back, for undo. */
export async function restoreScheduling(prev: Scheduling): Promise<void> {
  await putScheduling(prev);
}

export async function schedulingFor(cardId: string, deck: string): Promise<Scheduling> {
  return (await getScheduling(cardId)) ?? newScheduling(cardId, deck);
}

export interface DeckStats {
  due: number;
  neu: number;
  total: number;
}

/** Counts for a deck subtree, all from index ranges. */
export async function deckStats(deck: string, now = Date.now()): Promise<DeckStats> {
  const counts = await deckCounts();
  const prefix = `${deck}::`;
  const total = deck
    ? Object.entries(counts).reduce(
        (n, [d, c]) => (d === deck || d.startsWith(prefix) ? n + c : n),
        0
      )
    : Object.values(counts).reduce((n, c) => n + c, 0);
  const [due, neu] = await Promise.all([dueCount(deck, now), newCount(deck)]);
  return { due, neu, total };
}

/* ------------------------------------------------------- deck tree */

export interface EngineDeckNode {
  name: string;
  path: string;
  children: EngineDeckNode[];
  own: number;
  total: number;
  due: number;
  neu: number;
}

/**
 * Deck tree with rolled-up due/new/total counts.
 *
 * One cursor pass over the scheduling store tallies every deck at once, which
 * beats asking each of a few hundred decks for its own count. The result is
 * cached until the next rating, because the tree only changes when a card moves
 * between states.
 */
let treeCache: { at: number; tree: EngineDeckNode[] } | null = null;

export function invalidateDeckTree() {
  treeCache = null;
}

export async function deckTree(now = Date.now()): Promise<EngineDeckNode[]> {
  if (treeCache && now - treeCache.at < 30_000) return treeCache.tree;

  const { openDB, SCHEDULING } = await import('./db');
  const db = await openDB();
  const tally = new Map<string, { total: number; due: number; neu: number }>();
  await new Promise<void>((resolve, reject) => {
    const cur = db.transaction([SCHEDULING], 'readonly').objectStore(SCHEDULING).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve();
      const row = c.value as Scheduling;
      if (!row.suspended && hasCard(row.cardId)) {
        const t = tally.get(row.deck) || { total: 0, due: 0, neu: 0 };
        t.total++;
        if (row.state === 'new') t.neu++;
        else if (row.due <= now) t.due++;
        tally.set(row.deck, t);
      }
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });

  const roots: EngineDeckNode[] = [];
  const index = new Map<string, EngineDeckNode>();
  for (const [deck, t] of tally) {
    const parts = deck.split('::').map((p) => p.trim()).filter(Boolean);
    let path = '';
    let siblings = roots;
    for (const part of parts) {
      path = path ? `${path}::${part}` : part;
      let node = index.get(path);
      if (!node) {
        node = { name: part, path, children: [], own: 0, total: 0, due: 0, neu: 0 };
        index.set(path, node);
        siblings.push(node);
      }
      node.total += t.total;
      node.due += t.due;
      node.neu += t.neu;
      siblings = node.children;
    }
    const leaf = index.get(path);
    if (leaf) leaf.own += t.total;
  }

  const sortTree = (ns: EngineDeckNode[]) => {
    ns.sort((a, b) => a.name.localeCompare(b.name));
    ns.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);
  // An empty tally means the import has not finished yet — caching that would
  // leave the decks page blank until the cache expired.
  if (roots.length) treeCache = { at: now, tree: roots };
  return roots;
}
