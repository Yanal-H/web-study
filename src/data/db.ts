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
  /**
   * The card's state BEFORE this review. Added later and therefore optional:
   * rows written before it exists simply lack it, and the statistics say so
   * rather than quietly mixing them in.
   *
   * Without this a learning step and a real review are indistinguishable in the
   * log, and true retention — which is only meaningful for cards that were
   * actually due — cannot be computed at all.
   */
  prevState?: CardState;
}

export const DB_NAME = 'foundation';
export const DB_VERSION = 1;

export const CHAPTERS = 'chapters';
export const CARDS = 'cards';
export const MCQS = 'mcqs';
export const SCHEDULING = 'scheduling';
export const MEDIA = 'media';
export const REVIEWS = 'reviews';

import * as mem from './contentStore';
import {
  catalogDeckCounts,
  catalogDeckKeys,
  catalogDecksUnder,
  isAuthorizedCard,
  isCatalogInitialized,
} from '../content/catalog';
import { scopedDatabaseName } from '../lib/storageScope';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB.'));
      return;
    }
    const req = indexedDB.open(scopedDatabaseName(DB_NAME), DB_VERSION);
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
  void dbPromise?.then((db) => db.close(), () => {});
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

/**
 * Every active card in a deck subtree. This is intentionally used only by
 * “Study all”, where the student explicitly asks to ignore the due schedule.
 */
export async function allActiveBatch(deck: string, limit: number): Promise<Scheduling[]> {
  const decks = new Set(deck ? await decksUnder(deck) : await allDeckKeys());
  if (!decks.size || limit <= 0) return [];

  const db = await openDB();
  const t = db.transaction([SCHEDULING], 'readonly');
  const store = t.objectStore(SCHEDULING);
  const out: Scheduling[] = [];
  await new Promise<void>((resolve, reject) => {
    const cur = store.openCursor();
    cur.onsuccess = () => {
      const cursor = cur.result;
      if (!cursor || out.length >= limit) return resolve();
      const row = cursor.value as Scheduling;
      if (decks.has(row.deck) && !row.suspended) out.push(row);
      cursor.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
  return out;
}

/* --------------------------------------------------------------- decks

   Deck queries read the in-memory content store. They used to walk the CARDS
   `deck` index in IndexedDB; the cards are no longer written to disk, so the
   same aggregation now happens over the session's card list. The deck tree is
   small even for a large bank, so this stays cheap. */

/** Every distinct deck path that has at least one card. */
export async function allDeckKeys(): Promise<string[]> {
  return isCatalogInitialized() ? catalogDeckKeys() : mem.allDeckKeys();
}

/** A deck path and every path nested beneath it. */
export async function decksUnder(deck: string): Promise<string[]> {
  return isCatalogInitialized() ? catalogDecksUnder(deck) : mem.decksUnder(deck);
}

/** Card counts per deck path. */
export async function deckCounts(): Promise<Record<string, number>> {
  return isCatalogInitialized() ? catalogDeckCounts() : mem.deckCounts();
}

/* --------------------------------------------------------------- reads */

export async function getCard(id: string): Promise<StoredCard | undefined> {
  return mem.cards.get(id) as StoredCard | undefined;
}

export async function getCards(ids: string[]): Promise<StoredCard[]> {
  if (ids.length === 0) return [];
  return ids.map((id) => mem.cards.get(id)).filter(Boolean) as unknown as StoredCard[];
}

/** Scheduling is PERSONAL PROGRESS — it stays on disk and survives the session. */
export async function getScheduling(cardId: string): Promise<Scheduling | undefined> {
  const db = await openDB();
  return req(db.transaction([SCHEDULING], 'readonly').objectStore(SCHEDULING).get(cardId));
}

export async function getMedia(imageId: string): Promise<{ imageId: string; src: string } | undefined> {
  return mem.media.get(imageId) as { imageId: string; src: string } | undefined;
}

export async function getChapterMeta<T = unknown>(id: string): Promise<T | undefined> {
  return mem.chapters.get(id) as T | undefined;
}

export async function listChapterMeta<T = unknown>(): Promise<T[]> {
  return mem.chapters.all() as T[];
}

export async function countStore(store: string): Promise<number> {
  const table = mem.memTable(store);
  if (table) return table.size;
  const db = await openDB();
  return req(db.transaction([store], 'readonly').objectStore(store).count());
}

/** Every row in a store. Used by reconciliation to find obsolete rows. */
export async function getAllRows<T = unknown>(store: string): Promise<T[]> {
  const table = mem.memTable(store);
  if (table) return table.all() as T[];
  const db = await openDB();
  return req(db.transaction([store], 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
}

/** Delete a set of keys from a store. No-op on an empty list. */
export async function deleteKeys(store: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const table = mem.memTable(store);
  if (table) {
    for (const k of keys) table.delete(k);
    return;
  }
  const db = await openDB();
  const t = db.transaction([store], 'readwrite');
  const os = t.objectStore(store);
  for (const k of keys) os.delete(k);
  await done(t);
}

/** MCQ ids for a chapter, without loading the questions. */
export async function mcqIdsForChapter(chapterId: string): Promise<string[]> {
  return mem.mcqIdsForChapter(chapterId);
}

export async function getMcqs<T = unknown>(chapterId?: string): Promise<T[]> {
  const all = mem.mcqs.all();
  if (!chapterId) return all as T[];
  return all.filter((q) => q.chapterId === chapterId) as T[];
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

/**
 * Write many rows. Content goes to memory for the session; personal data goes to
 * disk in one transaction (callers chunk to keep transactions short).
 */
export async function bulkPut(store: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  const table = mem.memTable(store);
  if (table) {
    for (const row of rows) table.put(row as mem.MemRow);
    return;
  }
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
  mem.clearContent();
  const db = await openDB();
  const stores = [CHAPTERS, CARDS, MCQS, SCHEDULING, MEDIA, REVIEWS];
  const t = db.transaction(stores, 'readwrite');
  for (const s of stores) t.objectStore(s).clear();
  await done(t);
}

/**
 * Delete any authored content left on disk by an older build.
 *
 * Content is no longer written to IndexedDB, but a device that ran a previous
 * version still has the whole library sitting in it — which is exactly what this
 * design is meant to prevent. Run once at boot so upgrading actually removes it
 * rather than leaving a copy behind forever.
 *
 * Scheduling and review history are NOT touched: that is the student's own work.
 */
export async function purgePersistedContent(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  const db = await openDB();
  const stores = [CHAPTERS, CARDS, MCQS, MEDIA];
  let removed = 0;
  for (const s of stores) {
    const n = await req(db.transaction([s], 'readonly').objectStore(s).count()).catch(() => 0);
    removed += n;
  }
  if (removed === 0) return 0;
  const t = db.transaction(stores, 'readwrite');
  for (const s of stores) t.objectStore(s).clear();
  await done(t);
  return removed;
}

/**
 * Clear content-card scheduling and the review log, leaving the chapters, cards
 * and MCQs themselves in place. Used by "reset study progress" so content cards
 * become new again without having to re-import the whole library.
 */
export async function resetEngineProgress(): Promise<void> {
  const db = await openDB();
  const stores = [SCHEDULING, REVIEWS];
  const t = db.transaction(stores, 'readwrite');
  for (const s of stores) t.objectStore(s).clear();
  await done(t);
}

/** Remove durable schedules whose authorised card bodies no longer exist. */
export async function purgeOrphanScheduling(): Promise<number> {
  if (!isCatalogInitialized()) return 0;
  const db = await openDB();
  const t = db.transaction([SCHEDULING], 'readwrite');
  const store = t.objectStore(SCHEDULING);
  let removed = 0;
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve();
      const row = cursor.value as Scheduling;
      if (!isAuthorizedCard(row.cardId)) { cursor.delete(); removed++; }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  await done(t);
  return removed;
}
