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

/**
 * Changes whenever the shipped set changes — a new pack, a dropped pack, or a
 * pack whose card count moved — which is what triggers a re-import.
 */
export function shippedStamp(): string {
  return listChapters()
    .map((c) => `${c.id}:${c.cards.length}:${c.mcqs.length}`)
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
export async function ensureContentLoaded(
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
      skipped.push(pack.id);
    }
  }

  localStorage.setItem(STAMP_KEY, stamp);
  const cards = await countStore(CARDS);
  onPhase?.({ phase: 'ready', cards });
  return { imported, cards, skipped };
}

/** Force the next boot to re-import every pack (used by "rebuild library"). */
export function invalidateContent() {
  localStorage.removeItem(STAMP_KEY);
}
