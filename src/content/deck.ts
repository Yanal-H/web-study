// Deck-path helpers — pure functions over a chapter, with no content imported.
//
// These live apart from loader.ts on purpose. loader.ts eagerly globs every
// chapter JSON in /content, so anything importing it pulls the entire corpus
// (>1MB) into its bundle. The import worker needs exactly these three functions
// and none of that content, so keeping them dependency-free is what lets the
// worker stay small instead of duplicating the whole library off-thread.
//
// loader.ts re-exports them, so existing imports are unaffected.

import type { Chapter, Card } from './schema';

/** Deck root for a chapter: authored `deck`, else "<subject>::<title>". */
export function deckRoot(ch: Chapter): string {
  return (ch.deck || `${ch.subject}::${ch.title}`).trim();
}

/** Join deck path parts, dropping empties and normalising the "::" separator. */
export function joinDeck(...parts: Array<string | undefined>): string {
  return parts
    .flatMap((p) => (p || '').split('::'))
    .map((p) => p.trim())
    .filter(Boolean)
    .join('::');
}

/**
 * Full deck path for a card: chapter root :: (card.deck ?? section.deck ?? section title).
 * That is Subject :: Chapter :: Section :: Sub-topic — decks, sub-decks, sub-sub-decks.
 */
export function cardDeckPath(ch: Chapter, c: Card): string {
  const section = ch.sections.find((s) => s.id === (c.sectionId || c.tag));
  const leaf = c.deck || section?.deck || section?.title;
  return joinDeck(deckRoot(ch), leaf);
}
