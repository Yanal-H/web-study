// Import worker — writes chapter packs into IndexedDB off the main thread.
//
// Importing a large bank means thousands of IndexedDB writes plus the FSRS
// seeding pass behind them. On the main thread that competes with rendering and
// input handling, and on a phone it is the difference between a smooth import
// and a tab that stops responding to taps. Workers get their own thread and
// their own IndexedDB access, so the work lands in the same database with none
// of the contention.
//
// Scheduling SEMANTICS are unchanged — this runs exactly the same importPack and
// seedScheduling code the main thread ran. Only where it executes moved.
//
// This module must stay light: it deliberately imports ../content/deck rather
// than ../content/loader, because loader eagerly globs every chapter JSON and
// would duplicate the entire corpus into the worker bundle.

import { importPack, type ImportProgress } from './importPack';
import type { Chapter } from '../content/schema';

export interface ImportRequest {
  type: 'import';
  /** Correlates replies with the caller's request. */
  jobId: number;
  pack: Chapter;
}

export type ImportReply =
  | { type: 'progress'; jobId: number; progress: ImportProgress }
  | { type: 'done'; jobId: number; result: { cards: number; mcqs: number; seeded: number } }
  | { type: 'failed'; jobId: number; message: string };

const g = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (m: ImportReply) => void;
};

g.onmessage = (e: MessageEvent) => {
  const msg = e.data as ImportRequest | undefined;
  if (!msg || msg.type !== 'import') return;
  const { jobId, pack } = msg;

  void importPack(pack, (progress) => g.postMessage({ type: 'progress', jobId, progress }))
    .then((result) => g.postMessage({ type: 'done', jobId, result }))
    .catch((err: unknown) => {
      // Report rather than throw: the caller falls back to a main-thread import,
      // so a worker failure must never mean the pack simply does not arrive.
      g.postMessage({
        type: 'failed',
        jobId,
        message: err instanceof Error ? err.message : String(err),
      });
    });
};
