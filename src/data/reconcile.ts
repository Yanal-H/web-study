// Reconcile the card engine against the authoritative content set.
//
// Re-importing a pack overwrites known ids but never removes rows that no longer
// exist — so a removed chapter, a deleted card or a card that left the pack become
// "ghost rows" that keep surfacing in decks and the due queue. This pass deletes
// exactly those obsolete rows and nothing else. Personal *editable* cards live in
// the store (state.flashcards), not the engine, so they are structurally out of
// reach here; the engine only mirrors chapter content, which is regenerable.
//
// The dangerous part — deciding what to delete — is the pure reconcilePlan below,
// which is unit-tested. The IndexedDB glue only executes that plan.

import { CARDS, MCQS, CHAPTERS, SCHEDULING, MEDIA, getAllRows, deleteKeys } from './db';
import { packCards } from './importPack';
import type { Chapter } from '../content/schema';

export interface CurrentPack {
  id: string;
  cardIds: Set<string>;
  mcqIds: Set<string>;
}

/** The authoritative id sets for the current content, computed exactly as importPack assigns ids. */
export function currentPacks(chapters: Chapter[]): CurrentPack[] {
  return chapters.map((pack) => ({
    id: pack.id,
    cardIds: new Set(packCards(pack).map((c) => c.id)),
    mcqIds: new Set(
      pack.mcqs.map((q, i) => q.id || `${pack.id}-mcq-${String(i + 1).padStart(3, '0')}`)
    ),
  }));
}

export interface ReconcilePlan {
  cards: string[];
  mcqs: string[];
  chapters: string[];
}

/**
 * Pure: which stored rows are no longer backed by the current content set. A row
 * is obsolete when its chapter is gone, or when its id is no longer part of that
 * chapter. Everything still present is kept, untouched.
 */
export function reconcilePlan(
  current: CurrentPack[],
  stored: {
    cards: Array<{ id: string; chapterId: string }>;
    mcqs: Array<{ id: string; chapterId: string }>;
    chapters: Array<{ id: string }>;
  }
): ReconcilePlan {
  const byId = new Map(current.map((c) => [c.id, c]));
  const cards = stored.cards
    .filter((r) => {
      const p = byId.get(r.chapterId);
      return !p || !p.cardIds.has(r.id);
    })
    .map((r) => r.id);
  const mcqs = stored.mcqs
    .filter((r) => {
      const p = byId.get(r.chapterId);
      return !p || !p.mcqIds.has(r.id);
    })
    .map((r) => r.id);
  const chapters = stored.chapters.filter((c) => !byId.has(c.id)).map((c) => c.id);
  return { cards, mcqs, chapters };
}

/** Read the engine, compute the plan, and delete obsolete rows plus their scheduling/media. */
export async function reconcileShipped(chapters: Chapter[]): Promise<ReconcilePlan> {
  const [cards, mcqs, chapMeta, media] = await Promise.all([
    getAllRows<{ id: string; chapterId: string }>(CARDS),
    getAllRows<{ id: string; chapterId: string }>(MCQS),
    getAllRows<{ id: string }>(CHAPTERS),
    getAllRows<{ imageId: string }>(MEDIA),
  ]);

  const plan = reconcilePlan(currentPacks(chapters), { cards, mcqs, chapters: chapMeta });

  if (plan.cards.length) {
    await deleteKeys(CARDS, plan.cards);
    await deleteKeys(SCHEDULING, plan.cards); // scheduling is keyed by card id
  }
  if (plan.mcqs.length) await deleteKeys(MCQS, plan.mcqs);
  if (plan.chapters.length) {
    await deleteKeys(CHAPTERS, plan.chapters);
    const gone = new Set(plan.chapters);
    const deadMedia = media.filter((m) => gone.has(m.imageId.split(':')[0]!)).map((m) => m.imageId);
    await deleteKeys(MEDIA, deadMedia);
  }
  return plan;
}
