// Main-thread wrapper around the import worker (H5).
//
// Runs each pack import in a worker so a large bank does not block rendering or
// input, and ALWAYS falls back to the main-thread import when the worker is
// unavailable, errors, or reports failure. Content arriving is not optional — a
// broken worker may cost smoothness, never the import itself.
//
// Mirrors the proven shape of lib/searchIndex.ts: one lazily created worker, a
// `workerBroken` latch so a failing environment is not retried on every pack,
// and a single settle path that can only resolve once.

import { importPack, type ImportProgress } from './importPack';
import type { Chapter } from '../content/schema';
import type { ImportReply } from './import.worker';

export type { ImportProgress };

type Result = { cards: number; mcqs: number; seeded: number };

let worker: Worker | null = null;
let workerBroken = false;
let nextJobId = 1;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Give up on the worker for the rest of the session and fall back from here on. */
function retireWorker() {
  workerBroken = true;
  try {
    worker?.terminate();
  } catch {
    /* already gone */
  }
  worker = null;
}

/** True when imports are currently running off the main thread. Used by tests/diagnostics. */
export function importRunsInWorker(): boolean {
  return !workerBroken;
}

/**
 * Import one pack, off the main thread when possible.
 *
 * The fallback runs the identical importPack on this thread, so the database
 * ends up in the same state either way — the only difference a student could
 * notice is that the tab is less smooth during a large import.
 */
export function importPackOffThread(
  pack: Chapter,
  onProgress?: (p: ImportProgress) => void
): Promise<Result> {
  const w = getWorker();
  if (!w) return importPack(pack, onProgress);

  return new Promise<Result>((resolve, reject) => {
    const jobId = nextJobId++;
    let settled = false;

    const cleanup = () => {
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr);
    };

    // Re-run on this thread. Used for every worker-side failure, so a pack can
    // never be lost to a worker problem.
    const fallback = () => {
      if (settled) return;
      settled = true;
      cleanup();
      importPack(pack, onProgress).then(resolve, reject);
    };

    const onMsg = (e: MessageEvent) => {
      const msg = e.data as ImportReply | undefined;
      if (!msg || msg.jobId !== jobId) return; // another pack's traffic
      if (msg.type === 'progress') {
        onProgress?.(msg.progress);
        return;
      }
      if (settled) return;
      if (msg.type === 'done') {
        settled = true;
        cleanup();
        resolve(msg.result);
        return;
      }
      // 'failed' — the worker reached the import and it threw. Retrying on the
      // main thread also surfaces the real error to the caller if it is genuine
      // (a full disk, a broken pack) rather than specific to the worker.
      retireWorker();
      fallback();
    };

    const onErr = () => {
      retireWorker();
      fallback();
    };

    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);

    try {
      w.postMessage({ type: 'import', jobId, pack } satisfies {
        type: 'import';
        jobId: number;
        pack: Chapter;
      });
    } catch {
      // Structured-clone failure, or a worker that died between checks.
      retireWorker();
      fallback();
    }
  });
}
