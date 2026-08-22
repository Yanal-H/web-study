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
  deckCounts,
  type Scheduling,
  type StoredCard,
} from './db';
import { schedule, newScheduling, type Steps } from './fsrs';
import type { LeechSettings } from '../features/flashcards/leech';
import { hasCard } from './contentStore';
import { isAuthorizedCard, isCatalogInitialized } from '../content/catalog';

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
  /** Safety bound for an explicit Study All session. */
  allLimit?: number;
}

/** Large enough for focused study, small enough for Windows/tablet memory and undo. */
export const MAX_STUDY_ALL_CARDS = 250;

/** Due cards first, then unseen ones, capped by the daily limits. */
export async function buildQueue(deck: string, opts: QueueOptions): Promise<EngineItem[]> {
  const now = opts.now ?? Date.now();
  const rows = opts.includeAll
    ? await allActiveBatch(deck, opts.allLimit ?? MAX_STUDY_ALL_CARDS)
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
  ms?: number,
  steps?: Steps,
  leech?: LeechSettings
): Promise<Scheduling> {
  const now = Date.now();
  const next = schedule(item.sched, rating, now, steps, leech);
  await putScheduling(next, { cardId: item.cardId, deck: item.deck, rating, ts: now, ms, prevState: item.sched.state });
  return next;
}

/**
 * Take a card out of the rotation, or put it back.
 *
 * Every queue query already skips suspended rows — this is the only thing that
 * ever SET the flag by hand. A student who keeps meeting a card that is wrong,
 * badly worded, or simply not on their exam had no way to stop seeing it short
 * of deleting content they do not own.
 *
 * Suspending changes only this flag: the card's interval, ease and history are
 * left exactly as they are, so unsuspending resumes where it left off rather
 * than starting the card over.
 */
export async function setSuspended(sched: Scheduling, suspended: boolean): Promise<Scheduling> {
  const next: Scheduling = { ...sched, suspended: suspended ? 1 : 0 };
  await putScheduling(next);
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
/**
 * How much a deck holds, and how much of it is actually studiable now.
 *
 * `due` and `neu` come from the SAME pass that builds the deck tree, because
 * they must agree with what a session will serve. They used to come from
 * dueCount/newCount, which count raw index entries and so counted SUSPENDED
 * cards — while nextDueBatch and the deck tree both skip them. The Dashboard
 * promised more due cards than the session ever handed over, and disagreed with
 * the Flashcards page about the same deck.
 *
 * `total` stays the library count: how many cards are filed here at all,
 * suspended or not. That is a different question from "what can I study".
 */
export async function deckStats(deck: string, now = Date.now()): Promise<DeckStats> {
  const counts = await deckCounts();
  const prefix = `${deck}::`;
  const total = deck
    ? Object.entries(counts).reduce(
        (n, [d, c]) => (d === deck || d.startsWith(prefix) ? n + c : n),
        0
      )
    : Object.values(counts).reduce((n, c) => n + c, 0);
  const { due, neu } = queueCountsFromTree(await deckTree(now), deck);
  return { due, neu, total };
}

/**
 * Sum a deck subtree's queue counts out of an already-built tree. Pure, so the
 * arithmetic is tested without IndexedDB. An empty deck path means "everything",
 * which is the roots summed — not a lookup that would find nothing.
 */
export function queueCountsFromTree(
  tree: EngineDeckNode[],
  deck: string
): { due: number; neu: number } {
  if (!deck) {
    return tree.reduce((a, n) => ({ due: a.due + n.due, neu: a.neu + n.neu }), { due: 0, neu: 0 });
  }
  const find = (ns: EngineDeckNode[]): EngineDeckNode | undefined => {
    for (const n of ns) {
      if (n.path === deck) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const node = find(tree);
  return node ? { due: node.due, neu: node.neu } : { due: 0, neu: 0 };
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
      if (!row.suspended && (isCatalogInitialized() ? isAuthorizedCard(row.cardId) : hasCard(row.cardId))) {
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
