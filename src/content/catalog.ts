import type { Chapter } from './schema';
import { cardDeckPath, deckRoot } from './deck';

export interface CatalogSection {
  id: string;
  title: string;
}

export interface CatalogCard {
  id: string;
  chapterId: string;
  subject: string;
  deck: string;
}

export interface CatalogMcq {
  id: string;
  chapterId: string;
  subject: string;
  difficulty?: number;
}

export interface ChapterCatalogEntry {
  id: string;
  revision: string;
  subject: string;
  title: string;
  updatedAt: number;
  deck: string;
  estMinutes?: number;
  sections: CatalogSection[];
  cards: CatalogCard[];
  mcqs: CatalogMcq[];
  counts: { sections: number; cards: number; mcqs: number; emqs: number; mnemonics: number };
}

let chapters = new Map<string, ChapterCatalogEntry>();
let cards = new Map<string, CatalogCard>();
let initialized = false;

export function setContentCatalog(entries: ChapterCatalogEntry[]): void {
  initialized = true;
  chapters = new Map(entries.map((entry) => [entry.id, entry]));
  cards = new Map(entries.flatMap((entry) => entry.cards).map((card) => [card.id, card]));
}

export function clearContentCatalog(): void {
  initialized = false;
  chapters.clear();
  cards.clear();
}

export function listCatalogChapters(): ChapterCatalogEntry[] {
  return [...chapters.values()].sort((a, b) =>
    a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title)
  );
}

export function getCatalogChapter(id: string): ChapterCatalogEntry | undefined {
  return chapters.get(id);
}

export function catalogChapterCount(): number {
  return chapters.size;
}

export function catalogCardCount(): number {
  return cards.size;
}

export function hasCatalog(): boolean {
  return chapters.size > 0;
}

export function isCatalogInitialized(): boolean {
  return initialized;
}

export function isAuthorizedCard(id: string): boolean {
  return cards.has(id);
}

export function allCatalogCardIds(): Set<string> {
  return new Set(cards.keys());
}

export function catalogDeckKeys(): string[] {
  return [...new Set([...cards.values()].map((card) => card.deck).filter(Boolean))];
}

export function catalogDecksUnder(deck: string): string[] {
  const keys = catalogDeckKeys();
  return deck ? keys.filter((key) => key === deck || key.startsWith(`${deck}::`)) : keys;
}

export function catalogDeckCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const card of cards.values()) out[card.deck] = (out[card.deck] || 0) + 1;
  return out;
}

export function catalogChapterIdsForDeck(deck: string): string[] {
  if (!deck) return [...chapters.keys()];
  const ids = new Set<string>();
  for (const card of cards.values()) {
    if (card.deck === deck || card.deck.startsWith(`${deck}::`)) ids.add(card.chapterId);
  }
  return [...ids];
}

export function catalogFromChapter(pack: Chapter, revision = 'session'): ChapterCatalogEntry {
  return {
    id: pack.id,
    revision,
    subject: pack.subject,
    title: pack.title,
    updatedAt: 0,
    deck: deckRoot(pack),
    estMinutes: pack.estMinutes,
    sections: pack.sections.map((section) => ({ id: section.id, title: section.title })),
    cards: pack.cards.map((card, index) => ({
      id: card.id || `${pack.id}-card-${index + 1}`,
      chapterId: pack.id,
      subject: pack.subject,
      deck: cardDeckPath(pack, card),
    })),
    mcqs: pack.mcqs.map((question, index) => ({
      id: question.id || `${pack.id}-mcq-${index + 1}`,
      chapterId: pack.id,
      subject: pack.subject,
      difficulty: question.difficulty,
    })),
    counts: {
      sections: pack.sections.length,
      cards: pack.cards.length,
      mcqs: pack.mcqs.length,
      emqs: pack.emqs.length,
      mnemonics: pack.mnemonics.length,
    },
  };
}

type CatalogRow = Record<string, unknown>;

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const integer = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function parseCatalogRows(rows: unknown[]): ChapterCatalogEntry[] {
  return rows.flatMap((raw) => {
    const row = raw as CatalogRow;
    const id = text(row.id);
    const subject = text(row.subject);
    const title = text(row.title);
    if (!id || !subject || !title) return [];
    const sectionIndex = Array.isArray(row.section_index) ? row.section_index : [];
    const cardIndex = Array.isArray(row.card_index) ? row.card_index : [];
    const mcqIndex = Array.isArray(row.mcq_index) ? row.mcq_index : [];
    const entry: ChapterCatalogEntry = {
      id,
      revision: text(row.revision),
      subject,
      title,
      updatedAt: Date.parse(text(row.updated_at)) || 0,
      deck: text(row.deck),
      estMinutes: integer(row.est_minutes) || undefined,
      sections: sectionIndex.flatMap((value) => {
        const item = value as CatalogRow;
        return text(item.id) ? [{ id: text(item.id), title: text(item.title) }] : [];
      }),
      cards: cardIndex.flatMap((value) => {
        const item = value as CatalogRow;
        return text(item.id) && text(item.deck)
          ? [{ id: text(item.id), chapterId: id, subject, deck: text(item.deck) }]
          : [];
      }),
      mcqs: mcqIndex.flatMap((value) => {
        const item = value as CatalogRow;
        return text(item.id)
          ? [{ id: text(item.id), chapterId: id, subject, difficulty: integer(item.difficulty) || undefined }]
          : [];
      }),
      counts: {
        sections: integer(row.section_count),
        cards: integer(row.card_count),
        mcqs: integer(row.mcq_count),
        emqs: integer(row.emq_count),
        mnemonics: integer(row.mnemonic_count),
      },
    };
    return [entry];
  });
}
