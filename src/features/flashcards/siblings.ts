// Sibling cards — the ones cut from the same source.
//
// `burySiblings` has shipped in the default settings since v4 and was wired to
// nothing at all. Siblings are the cards made from one piece of material: every
// region of one occluded diagram, every card cut from the same figure. Meeting
// them back to back is both wasted repetitions and, worse, false confidence —
// the second one is answered from the first rather than from memory, so the
// scheduler is told the card is known when it is not.
//
// This app leans hard on image occlusion, where one diagram becomes a dozen
// cards, so it matters more here than in a plain text deck.
//
// Burying is a QUEUE decision, not a scheduling one: nothing here rewrites a
// due date. Per .claude/rules/flashcards.md, the live queue only decides which
// already-scheduled cards re-appear during the active session, and burying is
// exactly that — the sibling keeps its schedule and simply is not shown again
// in this sitting.

import type { ReviewItem } from './deck';

/**
 * What a card was cut from, when that is knowable.
 *
 * Personal occlusion cards carry it in their key (`user:abc#3` — one region of
 * image `abc`). Content occlusion cards share an image id within a chapter.
 * Anything else is its own source and has no siblings, which is returned as
 * null rather than a made-up group: guessing here would bury unrelated cards.
 */
export function noteKeyOf(item: ReviewItem): string | null {
  const hash = item.key.indexOf('#');
  if (hash > 0) return item.key.slice(0, hash);

  const imageId = item.card.image?.imageId;
  if (item.card.type === 'occlusion' && imageId) {
    return `occ:${item.card.chapterId ?? item.chapterId ?? ''}:${imageId}`;
  }
  return null;
}

/** True when two cards came from the same source material. */
export function areSiblings(a: ReviewItem, b: ReviewItem): boolean {
  if (a.key === b.key) return false; // a card is not its own sibling
  const ka = noteKeyOf(a);
  return ka !== null && ka === noteKeyOf(b);
}

/**
 * Drop `item`'s siblings from a list of cards still to come. Pure.
 *
 * Returns the SAME array reference when nothing was buried, so a caller can
 * cheaply skip a state update.
 */
export function buryFrom<T extends ReviewItem>(items: T[], item: ReviewItem): T[] {
  const key = noteKeyOf(item);
  if (key === null) return items;
  const kept = items.filter((i) => noteKeyOf(i) !== key || i.key === item.key);
  return kept.length === items.length ? items : kept;
}

/** How many of a card's siblings are still queued — for telling the student. */
export function countSiblings(items: ReviewItem[], item: ReviewItem): number {
  const key = noteKeyOf(item);
  if (key === null) return 0;
  return items.filter((i) => i.key !== item.key && noteKeyOf(i) === key).length;
}
