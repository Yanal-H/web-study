// Main-thread wrapper around the search worker. Builds the index in the worker
// when possible, and ALWAYS falls back to a main-thread build if the worker fails
// or is unavailable — so ⌘K search can never regress. The per-query ranking stays
// synchronous (searchDocs), which the palette calls on every keystroke.

import { buildSearchDocs, type SearchDoc } from './search';
import type { AppState } from '../state/types';

export { searchDocs, KIND_LABEL, type SearchDoc } from './search';

let worker: Worker | null = null;
let workerBroken = false;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Build the document set, off the main thread when the worker is available. */
export function buildIndex(notes: AppState['notes']): Promise<SearchDoc[]> {
  const fallback = () => buildSearchDocs({ notes } as AppState);
  const w = getWorker();
  if (!w) return Promise.resolve(fallback());

  return new Promise((resolve) => {
    let settled = false;
    const finish = (docs: SearchDoc[]) => {
      if (settled) return;
      settled = true;
      w.removeEventListener('message', onMsg);
      resolve(docs);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === 'docs') finish(e.data.docs as SearchDoc[]);
    };
    w.addEventListener('message', onMsg);
    w.onerror = () => {
      workerBroken = true;
      try {
        w.terminate();
      } catch {
        /* ignore */
      }
      worker = null;
      finish(fallback());
    };
    try {
      w.postMessage({ type: 'build', notes });
    } catch {
      finish(fallback());
    }
    // Safety net: never leave the palette without an index.
    setTimeout(() => finish(fallback()), 3000);
  });
}
