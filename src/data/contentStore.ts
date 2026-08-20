// Chapter content held in memory for the session only.
//
// Foundation is online-only by choice: the chapters are downloaded for a
// signed-in student, kept in memory while they study, and gone the moment the
// tab closes. Nothing authored is written to disk.
//
// What this buys, honestly:
//   - A shared, borrowed, lost or resold device carries no library.
//   - The easy copy — open developer tools, export the local database — finds
//     nothing, because there is no local database of content to export.
//   - Revoking an account takes effect on the next load rather than leaving a
//     full offline copy behind forever.
//
// What it does NOT buy: a determined student can still read the content out of
// the network response or simply screenshot it. That is true of every website
// and is not solvable. The watermark is the answer to that, not this.
//
// PERSONAL DATA IS DELIBERATELY EXCLUDED. Scheduling, review history, notes and
// personal cards stay in IndexedDB exactly as before. A student's months of
// spaced repetition must survive closing the tab — only the authored material is
// ephemeral.

export interface MemRow {
  id?: string;
  imageId?: string;
  [k: string]: unknown;
}

/** One in-memory table, keyed the way its IndexedDB counterpart is. */
class Table {
  private rows = new Map<string, MemRow>();

  constructor(private keyPath: 'id' | 'imageId') {}

  key(row: MemRow): string {
    return String(row[this.keyPath]);
  }

  put(row: MemRow): void {
    this.rows.set(this.key(row), row);
  }

  get(key: string): MemRow | undefined {
    return this.rows.get(key);
  }

  delete(key: string): void {
    this.rows.delete(key);
  }

  all(): MemRow[] {
    return [...this.rows.values()];
  }

  get size(): number {
    return this.rows.size;
  }

  clear(): void {
    this.rows.clear();
  }
}

export const chapters = new Table('id');
export const cards = new Table('id');
export const mcqs = new Table('id');
export const media = new Table('imageId');

const TABLES: Record<string, Table> = {
  chapters,
  cards,
  mcqs,
  media,
};

/** The in-memory table for a store name, or null when that store lives on disk. */
export function memTable(store: string): Table | null {
  return TABLES[store] ?? null;
}

/** True when this store is content (memory) rather than personal data (disk). */
export function isContentStore(store: string): boolean {
  return store in TABLES;
}

/** Drop every chapter from memory — on sign-out, or before a fresh download. */
export function clearContent(): void {
  for (const t of Object.values(TABLES)) t.clear();
}

/* ------------------------------------------------------- deck queries

   These mirror the IndexedDB `deck` index on the cards store. The deck tree is
   small even when the card count is large, so scanning the card list to build it
   is cheap — and it is exactly what the IndexedDB version was doing through a
   cursor over the same data. */

/** Every distinct deck path that has at least one card. */
export function allDeckKeys(): string[] {
  const out = new Set<string>();
  for (const c of cards.all()) {
    const d = c.deck as string | undefined;
    if (d) out.add(d);
  }
  return [...out];
}

/** Deck paths at or beneath a prefix. "" means every deck. */
export function decksUnder(deck: string): string[] {
  if (!deck) return allDeckKeys();
  return allDeckKeys().filter((d) => d === deck || d.startsWith(deck + '::'));
}

/** Card count per exact deck path. */
export function deckCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards.all()) {
    const d = c.deck as string | undefined;
    if (d) out[d] = (out[d] || 0) + 1;
  }
  return out;
}

/** Whether an authorised card body is present in this page's session. */
export function hasCard(id: string): boolean {
  return cards.get(id) !== undefined;
}

/** Ids of the MCQs belonging to a chapter. */
export function mcqIdsForChapter(chapterId: string): string[] {
  return mcqs
    .all()
    .filter((q) => q.chapterId === chapterId)
    .map((q) => String(q.id));
}
