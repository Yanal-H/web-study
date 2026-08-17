// First-run bootstrap: move the shipped packs into the card engine once, then
// never touch them again.
//
// Packs arrive through the content loader, are written into IndexedDB once, and
// from then on the engine answers every card query from the database — the due
// queue, deck counts and review batches never touch the pack objects again.

import type { Chapter } from '../content/schema';
import { listChapters } from '../content/loader';
import { importPack, type ImportProgress } from './importPack';
import { countStore, CARDS } from './db';

const STAMP_KEY = 'foundation_content_stamp_v1';

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
 * a changed tag or a swapped figure all change it, so a redeploy that preserves
 * counts still triggers a re-import. Computed once at bootstrap (the content is
 * already in memory), never per render. Exported so a future "what changed" diff
 * can reuse it.
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
  return fnv1a(parts.join(''));
}

/**
 * Changes whenever the shipped set changes — a new pack, a dropped pack, or a
 * pack whose *content* changed (via chapterRevision), which is what triggers a
 * re-import.
 */
export function shippedStamp(): string {
  return listChapters()
    .map((c) => `${c.id}:${chapterRevision(c)}`)
    .sort()
    .join('|');
}

export interface BootstrapReport {
  imported: number;
  cards: number;
  skipped: string[];
}

export type BootstrapPhase =
  | { phase: 'idle' }
  | { phase: 'importing'; done: number; of: number; current?: ImportProgress }
  | { phase: 'ready'; cards: number }
  | { phase: 'error'; message: string };

/**
 * Import every shipped pack that is not already in the engine. Safe to call on
 * every boot: it returns immediately once the stamp matches and the card store
 * is non-empty.
 */
let inFlight: Promise<BootstrapReport> | null = null;

/**
 * Resolves once the shipped packs are in the engine. Views awaiting this render
 * their first real numbers instead of an empty state that never refreshes.
 */
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

async function runBootstrap(
  onPhase?: (p: BootstrapPhase) => void
): Promise<BootstrapReport> {
  const packs = listChapters();
  const stamp = shippedStamp();
  const cardsPresent = await countStore(CARDS).catch(() => 0);

  if (cardsPresent > 0 && localStorage.getItem(STAMP_KEY) === stamp) {
    onPhase?.({ phase: 'ready', cards: cardsPresent });
    return { imported: 0, cards: cardsPresent, skipped: [] };
  }

  const skipped: string[] = [];
  let imported = 0;
  for (const pack of packs) {
    onPhase?.({ phase: 'importing', done: imported, of: packs.length });
    try {
      await importPack(pack as Chapter, (current) =>
        onPhase?.({ phase: 'importing', done: imported, of: packs.length, current })
      );
      imported++;
    } catch {
      // Preserve every pack that did import — never roll a sibling back — and
      // remember this one so the next boot retries it.
      skipped.push(pack.id);
    }
  }

  // Completion means EVERY pack imported. If any failed, leave the stamp unset so
  // the next boot re-runs and retries the missing packs (importPack is idempotent).
  if (skipped.length === 0) {
    // Only reconcile against a fully-imported set — otherwise a pack that failed to
    // import would look "removed" and its rows would be wrongly deleted.
    try {
      const { reconcileShipped } = await import('./reconcile');
      // Chapters published to the shared store are legitimately in the engine but
      // are not part of the shipped set — protect them, or reconciling would read
      // them as removed and delete a student's downloaded material.
      const { publishedIds } = await import('./remoteContent');
      await reconcileShipped(packs as Chapter[], publishedIds());
    } catch {
      // reconciliation is a cleanup, not a correctness requirement — never block boot
    }
    localStorage.setItem(STAMP_KEY, stamp);
  } else {
    localStorage.removeItem(STAMP_KEY);
  }
  const cards = await countStore(CARDS);
  const { invalidateDeckTree } = await import('./session');
  invalidateDeckTree();
  onPhase?.({ phase: 'ready', cards });
  return { imported, cards, skipped };
}

/** Force the next boot to re-import every pack (used by "rebuild library"). */
export function invalidateContent() {
  localStorage.removeItem(STAMP_KEY);
}
