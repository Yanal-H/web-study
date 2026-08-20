// Typed content loader for administrator-published content.
//
// Students can keep personal study data (progress, notes and review history),
// but chapter packs always come from the shared, administrator-controlled
// store. Legacy device-only imports are deliberately not merged here: a student
// must never be able to shadow or alter the curriculum seen in the app.
import {
  type Chapter,
  type Card,
  type Mcq,
  type Emq,
  type GlossaryEntry,
} from './schema';
import { cardDeckPath } from './deck';

export type ContentOrigin = 'shared';

export interface LoadedChapter extends Chapter {
  origin: ContentOrigin;
}

// Chapters are NOT bundled any more.
//
// This file used to hold `import.meta.glob('/content/**/*.json', { eager: true })`,
// which compiled every chapter into the JavaScript. That made the whole library a
// free download for anyone who opened the URL — no sign-in required — and it is
// exactly what the move to authenticated content was meant to stop.
//
// Chapters now arrive from the content store for a signed-in student, are written
// into IndexedDB, and are hydrated back into this in-memory list at boot. The list
// stays synchronous because the reader, study library and mnemonics all read it
// during render; only where it is FILLED FROM has changed.

let LOADED: LoadedChapter[] = [];

/**
 * Replace the in-memory chapter list. Called after hydrating from IndexedDB and
 * after new content is imported.
 */
export function setLoadedChapters(chapters: Chapter[]): void {
  LOADED = chapters.map((c) => ({ ...c, origin: 'shared' as const }));
}

/** How many chapters are currently loaded — used by boot to decide what to show. */
export function loadedCount(): number {
  return LOADED.length;
}

/** All chapters currently authorised by the shared content store. */
export function listChapters(): LoadedChapter[] {
  return LOADED;
}

export function getChapter(id: string): LoadedChapter | undefined {
  return listChapters().find((c) => c.id === id);
}

/* ---- normalised accessors (fill section ids, option ids, deck paths) ---- */

// Deck-path helpers live in ./deck (no content imports) so the import worker can
// use them without pulling this file's eager content glob. Re-exported here so
// every existing `from '../content/loader'` import keeps working.
export { deckRoot, joinDeck, cardDeckPath } from './deck';

export function chapterCards(ch: Chapter): Card[] {
  return ch.cards.map((c, i) => ({
    ...c,
    id: c.id || `${ch.id}-card-${i + 1}`,
    sectionId: c.sectionId || c.tag,
    deck: cardDeckPath(ch, c),
  }));
}

export function chapterMcqs(ch: Chapter): Mcq[] {
  const letters = 'abcdefgh';
  return ch.mcqs.map((q, i) => ({
    ...q,
    id: q.id || `${ch.id}-mcq-${i + 1}`,
    sectionId: q.sectionId || q.sectionTag,
    options: q.options.map((o, j) => ({ ...o, id: o.id || letters[j] })),
  }));
}

export function allCards(): Array<Card & { chapterId: string; subject: string }> {
  return listChapters().flatMap((ch) =>
    chapterCards(ch).map((c) => ({ ...c, chapterId: ch.id, subject: ch.subject }))
  );
}

export function allMcqs(): Array<Mcq & { chapterId: string; subject: string }> {
  return listChapters().flatMap((ch) =>
    chapterMcqs(ch).map((q) => ({ ...q, chapterId: ch.id, subject: ch.subject }))
  );
}

export function allEmqs(): Array<Emq & { chapterId: string; subject: string }> {
  return listChapters().flatMap((ch) =>
    ch.emqs.map((e) => ({ ...e, chapterId: ch.id, subject: ch.subject }))
  );
}

/** Every authored glossary entry across the shared curriculum. */
export function allGlossary(): Array<GlossaryEntry & { chapterId: string }> {
  return listChapters().flatMap((ch) =>
    ch.glossary.map((g) => ({ ...g, chapterId: ch.id }))
  );
}

export interface ChapterSummary {
  id: string;
  subject: string;
  title: string;
  origin: ContentOrigin;
  sections: number;
  cards: number;
  mcqs: number;
  emqs: number;
  estMinutes?: number;
}

export function chapterSummaries(): ChapterSummary[] {
  return listChapters().map((ch) => ({
    id: ch.id,
    subject: ch.subject,
    title: ch.title,
    origin: ch.origin,
    sections: ch.sections.length,
    cards: ch.cards.length,
    mcqs: ch.mcqs.length,
    emqs: ch.emqs.length,
    estMinutes: ch.estMinutes,
  }));
}

/** A diagram from a chapter's `images` map, resolved by the id occlusion cards use. */
export function chapterImage(chapterId: string, imageId: string) {
  const ch = getChapter(chapterId);
  return ch?.images?.[imageId];
}
