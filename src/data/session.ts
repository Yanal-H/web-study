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
  putScheduling,
  dueCount,
  newCount,
  deckCounts,
  type Scheduling,
  type StoredCard,
} from './db';
import { schedule, newScheduling } from './fsrs';

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
  /** true pulls unseen cards even when nothing is due */
  includeNew?: boolean;
}

/** Due cards first, then unseen ones, capped by the daily limits. */
export async function buildQueue(deck: string, opts: QueueOptions): Promise<EngineItem[]> {
  const now = opts.now ?? Date.now();
  const due = await nextDueBatch(deck, now, opts.reviewLimit);
  const fresh = opts.includeNew === false ? [] : await nextNewBatch(deck, opts.newLimit);
  const rows = [...due, ...fresh];
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
