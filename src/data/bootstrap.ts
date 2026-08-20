// Hydrate the reader from this signed-in session's in-memory content tables.
// Authored chapters never persist on the device; the first pass is empty, then
// remoteContent imports authenticated packs and calls this again. Keeping the
// bridge here lets the reader remain synchronous without weakening that rule.

import type { Chapter } from '../content/schema';
import { setLoadedChapters } from '../content/loader';
import { countStore, getAllRows, CARDS, CHAPTERS } from './db';

/** FNV-1a → base36. Cheap, deterministic, dependency-free. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * A short, deterministic revision id over a chapter's *meaningful authored fields*
 * — not just its counts. A fixed rationale, a renamed section, a re-ordered option,
 * a changed tag or a swapped figure all change it, so republishing content that
 * preserves counts still triggers a re-import.
 */
export function chapterRevision(c: {
  title: string;
  subject: string;
  summary?: string;
  sections: Array<{ id: string; title: string; digest: string; highYield?: string[]; pitfalls?: string[] }>;
  cards: Array<{ type: string; front?: string; back?: string; cloze?: string; deck?: string }>;
  mcqs: Array<{ stem: string; difficulty: number; options: Array<{ text: string; correct: boolean; why?: string }> }>;
}): string {
  const parts: string[] = [c.title, c.subject, c.summary || ''];
  for (const s of c.sections)
    parts.push(s.id, s.title, s.digest, (s.highYield || []).join('|'), (s.pitfalls || []).join('|'));
  for (const card of c.cards) parts.push(card.type, card.front || '', card.back || '', card.cloze || '', card.deck || '');
  for (const q of c.mcqs) {
    parts.push(q.stem, String(q.difficulty));
    for (const o of q.options) parts.push(o.text, String(o.correct), o.why || '');
  }
  return fnv1a(parts.join(''));
}

export interface BootstrapReport {
  /** Chapters hydrated into the reader from session memory. */
  chapters: number;
  cards: number;
}

export type BootstrapPhase =
  | { phase: 'idle' }
  | { phase: 'hydrating' }
  | { phase: 'ready'; cards: number }
  | { phase: 'error'; message: string };

let inFlight: Promise<BootstrapReport> | null = null;

/** Resolves once the session's current chapter tables are reflected in the reader. */
export function whenContentReady(): Promise<BootstrapReport> {
  return inFlight ?? ensureContentLoaded();
}

export function ensureContentLoaded(
  onPhase?: (p: BootstrapPhase) => void
): Promise<BootstrapReport> {
  if (inFlight) return inFlight;
  inFlight = runBootstrap(onPhase).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Row shape written by importPack.chapterMeta — `pack` is the authored chapter. */
interface StoredChapterRow {
  id: string;
  pack?: Chapter;
}

async function runBootstrap(onPhase?: (p: BootstrapPhase) => void): Promise<BootstrapReport> {
  onPhase?.({ phase: 'hydrating' });
  try {
    const rows = await getAllRows<StoredChapterRow>(CHAPTERS);
    // Rows written before `pack` existed have no authored copy; skip rather than
    // crash, and the next content sync will rewrite them complete.
    const packs = rows.map((r) => r.pack).filter((p): p is Chapter => !!p && Array.isArray(p.sections));
    setLoadedChapters(packs);

    const cards = await countStore(CARDS).catch(() => 0);
    onPhase?.({ phase: 'ready', cards });
    return { chapters: packs.length, cards };
  } catch (e) {
    // No IndexedDB (private mode, or a locked-down browser). The app still runs;
    // it simply has no chapters until storage works.
    setLoadedChapters([]);
    onPhase?.({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    return { chapters: 0, cards: 0 };
  }
}

/** Re-read the device's chapters into memory — after a content sync imports new packs. */
export async function rehydrateChapters(): Promise<number> {
  const rows = await getAllRows<StoredChapterRow>(CHAPTERS).catch(() => [] as StoredChapterRow[]);
  const packs = rows.map((r) => r.pack).filter((p): p is Chapter => !!p && Array.isArray(p.sections));
  setLoadedChapters(packs);
  return packs.length;
}
