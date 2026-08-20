// Session-content import entry point.
//
// Authored cards and chapters intentionally live in page memory, not IndexedDB.
// A Web Worker has a different JavaScript memory realm, so importing there can
// report success while leaving the page with zero cards. Keep this operation on
// the page thread; importPack already chunks large inputs and yields between
// chunks so Windows and tablet browsers stay responsive.

import { importPack, type ImportProgress } from './importPack';
import type { Chapter } from '../content/schema';

export type { ImportProgress };

type Result = { cards: number; mcqs: number; seeded: number };

/** Kept for diagnostics and backwards-compatible tests. */
export function importRunsInWorker(): boolean {
  return false;
}

/**
 * Import one pack into this page's session memory and seed durable scheduling.
 */
export function importPackIntoSession(
  pack: Chapter,
  onProgress?: (p: ImportProgress) => void
): Promise<Result> {
  return importPack(pack, onProgress);
}
