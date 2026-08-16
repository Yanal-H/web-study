// Typed content loader. Build-time content is globbed and validated; personal
// (imported) content is merged on top. Shipped and personal content are kept
// clearly separated by `origin`.
import {
  ChapterSchema,
  type Chapter,
  type Card,
  type Mcq,
  type Emq,
  type GlossaryEntry,
} from './schema';
import { getUserChapters } from './userContent';

export type ContentOrigin = 'shipped' | 'personal';

export interface LoadedChapter extends Chapter {
  origin: ContentOrigin;
}

// Build-time glob of every chapter JSON under /content (project root). Eager so the
// data is inlined into the bundle — no runtime fetch, works offline.
const modules = import.meta.glob('/content/**/*.json', { eager: true, import: 'default' });

function buildShipped(): LoadedChapter[] {
  const out: LoadedChapter[] = [];
  for (const path in modules) {
    if (path.includes('/_schema/')) continue;
    const parsed = ChapterSchema.safeParse(modules[path]);
    if (parsed.success) out.push({ ...parsed.data, origin: 'shipped' });
    else console.error(`Shipped content failed schema at ${path}`, parsed.error.issues);
  }
  return out;
}

const SHIPPED: LoadedChapter[] = buildShipped();

/** All chapters: shipped first, then personal (personal id shadows a shipped id). */
export function listChapters(): LoadedChapter[] {
  const personal = getUserChapters().map((c) => ({ ...c, origin: 'personal' as const }));
  const personalIds = new Set(personal.map((c) => c.id));
  const shipped = SHIPPED.filter((c) => !personalIds.has(c.id));
  return [...shipped, ...personal];
}

export function getChapter(id: string): LoadedChapter | undefined {
  return listChapters().find((c) => c.id === id);
}

/* ---- normalised accessors (fill section ids, option ids, deck paths) ---- */

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

/** Every authored glossary entry across all chapters (personal shadows shipped). */
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
