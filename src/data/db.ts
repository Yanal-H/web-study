// The card engine's storage layer.
//
// Everything that can grow without bound lives here in IndexedDB, never in
// localStorage and never in a resident array: cards, questions, per-card
// scheduling, diagrams and the review log. The one query that decides whether
// this scales is the due queue, and it is an indexed range scan over
// [deck, due] — O(log n + batch) whether the bank holds two thousand cards or
// two million.
//
// Scheduling is a separate store from card content on purpose: a review writes
// one small row and never rewrites the card it belongs to.

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface Scheduling {
  cardId: string;
  deck: string;
  state: CardState;
  /** FSRS stability, in days */
  S: number;
  /** FSRS difficulty, 1–10 */
  D: number;
  reps: number;
  lapses: number;
  stepIndex: number;
  /** epoch ms; 0 means brand new and first in the new queue */
  due: number;
  lastReviewed: number | null;
  suspended?: 0 | 1;
}

export interface StoredCard {
  id: string;
  chapterId: string;
  subject: string;
  deck: string;
  sectionId?: string;
  type: 'basic' | 'reversed' | 'cloze' | 'type' | 'image' | 'occlusion';
  front?: string;
  back?: string;
  cloze?: string;
  extra?: string;
  hint?: string;
  difficulty?: number;
  tags?: string[];
  image?: string | { src?: string; alt?: string };
  masks?: Array<{ id: string; x: number; y: number; w: number; h: number; label?: string }>;
  target?: string;
  occMode?: 'hideAll' | 'hideOne';
  label?: string;
}

export interface ReviewLog {
  id?: number;
  cardId: string;
  deck: string;
  rating: 1 | 2 | 3 | 4;
  ts: number;
  /** milliseconds spent on the card */
  ms?: number;
}

export const DB_NAME = 'foundation';
export const DB_VERSION = 1;

export const CHAPTERS = 'chapters';
export const CARDS = 'cards';
export const MCQS = 'mcqs';
export const SCHEDULING = 'scheduling';
export const MEDIA = 'media';
export const REVIEWS = 'reviews';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHAPTERS)) {
        const s = db.createObjectStore(CHAPTERS, { keyPath: 'id' });
        s.createIndex('subject', 'subject');
      }
      if (!db.objectStoreNames.contains(CARDS)) {
        const s = db.createObjectStore(CARDS, { keyPath: 'id' });
        s.createIndex('chapterId', 'chapterId');
        s.createIndex('deck', 'deck');
        s.createIndex('subject', 'subject');
      }
      if (!db.objectStoreNames.contains(MCQS)) {
        const s = db.createObjectStore(MCQS, { keyPath: 'id' });
        s.createIndex('chapterId', 'chapterId');
        s.createIndex('sectionId', 'sectionId');
        s.createIndex('subject', 'subject');
      }
      if (!db.objectStoreNames.contains(SCHEDULING)) {
        const s = db.createObjectStore(SCHEDULING, { keyPath: 'cardId' });
        s.createIndex('due', 'due');
        s.createIndex('state', 'state');
        // the due-queue index: range [deck, 0] … [deck, now]
        s.createIndex('deck_due', ['deck', 'due']);
        s.createIndex('deck_state', ['deck', 'state']);
      }
      if (!db.objectStoreNames.contains(MEDIA)) {
        db.createObjectStore(MEDIA, { keyPath: 'imageId' });
      }
      if (!db.objectStoreNames.contains(REVIEWS)) {
        const s = db.createObjectStore(REVIEWS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('cardId', 'cardId');
        s.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Test hook: forget the cached connection. */
export function resetConnection() {
  dbPromise = null;
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/* ------------------------------------------------------------ due queue */

/**
 * The next batch of cards due for a deck and everything beneath it.
 *
 * A deck path is a prefix, so "Anatomy" covers "Anatomy::Upper limb::Bones".
 * IndexedDB cannot express "prefix AND due <= now" in one range, so an exact
 * deck uses the compound index directly, and a subtree walks the small set of
 * matching deck keys — which is bounded by the number of decks, not cards.
 */
export async function nextDueBatch(
  deck: string,
  now: number,
  limit: number
): Promise<Scheduling[]> {
  const decks = deck ? await decksUnder(deck) : await allDeckKeys();
  const db = await openDB();
  const t = db.transaction([SCHEDULING], 'readonly');
  const idx = t.objectStore(SCHEDULING).index('deck_due');
  const out: Scheduling[] = [];
  for (const d of decks) {
    if (out.length >= limit) break;
    const range = IDBKeyRange.bound([d, 1], [d, now]); // due 0 is a new card
    await new Promise<void>((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = () => {
        const c = cur.result;
        if (c && out.length < limit) {
          const row = c.value as Scheduling;
          if (!row.suspended) out.push(row);
          c.continue();
        } else resolve();
      };
      cur.onerror = () => reject(cur.error);
    });
  }
  return out;
}

/** New (never-seen) cards for a deck subtree, up to a limit. */
export async function nextNewBatch(deck: string, limit: number): Promise<Scheduling[]> {
  const decks = deck ? await decksUnder(deck) : await allDeckKeys();
  const db = await openDB();
  const t = db.transaction([SCHEDULING], 'readonly');
  const idx = t.objectStore(SCHEDULING).index('deck_state');
  const out: Scheduling[] = [];
  for (const d of decks) {
    if (out.length >= limit) break;
    await new Promise<void>((resolve, reject) => {
      const cur = idx.openCursor(IDBKeyRange.only([d, 'new']));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c && out.length < limit) {
          const row = c.value as Scheduling;
          if (!row.suspended) out.push(row);
          c.continue();
        } else resolve();
      };
      cur.onerror = () => reject(cur.error);
    });
  }
  return out;
}

/** Count due cards for a deck subtree without loading a single card. */
export async function dueCount(deck: string, now: number): Promise<number> {
  const decks = deck ? await decksUnder(deck) : await allDeckKeys();
  const db = await openDB();
  const t = db.transaction([SCHEDULING], 'readonly');
  const idx = t.objectStore(SCHEDULING).index('deck_due');
  let total = 0;
  for (const d of decks) total += await req(idx.count(IDBKeyRange.bound([d, 1], [d, now])));
  return total;
}

export async function newCount(deck: string): Promise<number> {
  const decks = deck ? await decksUnder(deck) : await allDeckKeys();
  const db = await openDB();
  const t = db.transaction([SCHEDULING], 'readonly');
  const idx = t.objectStore(SCHEDULING).index('deck_state');
  let total = 0;
  for (const d of decks) total += await req(idx.count(IDBKeyRange.only([d, 'new'])));
  return total;
}

/* --------------------------------------------------------------- decks */

/** Every distinct deck path, read from the index keys — never from card rows. */
export async function allDeckKeys(): Promise<string[]> {
  const db = await openDB();
  const t = db.transaction([CARDS], 'readonly');
  const idx = t.objectStore(CARDS).index('deck');
  const keys = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const cur = idx.openKeyCursor(null, 'nextunique');
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        keys.add(c.key as string);
        c.continue();
      } else resolve();
    };
    cur.onerror = () => reject(cur.error);
  });
  return [...keys];
}

/** A deck path and every path nested beneath it. */
export async function decksUnder(deck: string): Promise<string[]> {
  const all = await allDeckKeys();
  const prefix = `${deck}::`;
  return all.filter((d) => d === deck || d.startsWith(prefix));
}

/** Card counts per deck path, aggregated from index keys. */
export async function deckCounts(): Promise<Record<string, number>> {
  const db = await openDB();
  const t = db.transaction([CARDS], 'readonly');
  const idx = t.objectStore(CARDS).index('deck');
  const counts: Record<string, number> = {};
  await new Promise<void>((resolve, reject) => {
    const cur = idx.openKeyCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        const k = c.key as string;
        counts[k] = (counts[k] || 0) + 1;
        c.continue();
      } else resolve();
    };
    cur.onerror = () => reject(cur.error);
  });
  return counts;
}

/* --------------------------------------------------------------- reads */

export async function getCard(id: string): Promise<StoredCard | undefined> {
  const db = await openDB();
  return req(db.transaction([CARDS], 'readonly').objectStore(CARDS).get(id));
}

export async function getCards(ids: string[]): Promise<StoredCard[]> {
  if (ids.length === 0) return [];
  const db = await openDB();
  const store = db.transaction([CARDS], 'readonly').objectStore(CARDS);
  return Promise.all(ids.map((id) => req<StoredCard>(store.get(id)))).then((rows) =>
    rows.filter(Boolean)
  );
}

export async function getScheduling(cardId: string): Promise<Scheduling | undefined> {
  const db = await openDB();
  return req(db.transaction([SCHEDULING], 'readonly').objectStore(SCHEDULING).get(cardId));
}

export async function getMedia(imageId: string): Promise<{ imageId: string; src: string } | undefined> {
  const db = await openDB();
  return req(db.transaction([MEDIA], 'readonly').objectStore(MEDIA).get(imageId));
}

export async function getChapterMeta<T = unknown>(id: string): Promise<T | undefined> {
  const db = await openDB();
  return req(db.transaction([CHAPTERS], 'readonly').objectStore(CHAPTERS).get(id));
}

export async function listChapterMeta<T = unknown>(): Promise<T[]> {
  const db = await openDB();
  return req(db.transaction([CHAPTERS], 'readonly').objectStore(CHAPTERS).getAll());
}

export async function countStore(store: string): Promise<number> {
  const db = await openDB();
  return req(db.transaction([store], 'readonly').objectStore(store).count());
}

/** MCQ ids for a chapter, without loading the questions. */
export async function mcqIdsForChapter(chapterId: string): Promise<string[]> {
  const db = await openDB();
  const idx = db.transaction([MCQS], 'readonly').objectStore(MCQS).index('chapterId');
  return req(idx.getAllKeys(IDBKeyRange.only(chapterId))) as Promise<string[]>;
}

export async function getMcqs<T = unknown>(chapterId?: string): Promise<T[]> {
  const db = await openDB();
  const store = db.transaction([MCQS], 'readonly').objectStore(MCQS);
  if (!chapterId) return req(store.getAll());
  return req(store.index('chapterId').getAll(IDBKeyRange.only(chapterId)));
}

/* -------------------------------------------------------------- writes */

/** Persist a graded card: one small scheduling row plus a review-log entry. */
export async function putScheduling(s: Scheduling, review?: Omit<ReviewLog, 'id'>): Promise<void> {
  const db = await openDB();
  const stores = review ? [SCHEDULING, REVIEWS] : [SCHEDULING];
  const t = db.transaction(stores, 'readwrite');
  t.objectStore(SCHEDULING).put(s);
  if (review) t.objectStore(REVIEWS).add(review);
  await done(t);
}

/** Write many rows in one transaction. Callers chunk to keep transactions short. */
export async function bulkPut(store: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDB();
  const t = db.transaction([store], 'readwrite');
  const os = t.objectStore(store);
  for (const row of rows) os.put(row);
  await done(t);
}

/** Reviews logged since a timestamp — used for streaks and the heatmap. */
export async function reviewsSince(ts: number): Promise<ReviewLog[]> {
  const db = await openDB();
  const idx = db.transaction([REVIEWS], 'readonly').objectStore(REVIEWS).index('ts');
  return req(idx.getAll(IDBKeyRange.lowerBound(ts)));
}

/** Wipe every store. Used by tests and by a deliberate "rebuild library". */
export async function clearAll(): Promise<void> {
  const db = await openDB();
  const stores = [CHAPTERS, CARDS, MCQS, SCHEDULING, MEDIA, REVIEWS];
  const t = db.transaction(stores, 'readwrite');
  for (const s of stores) t.objectStore(s).clear();
  await done(t);
}
