// Revision-aware search index builder. A minimal normalized content snapshot is
// transferred to a short-lived worker once per content revision; repeat palette
// opens reuse the result instead of rescanning the entire library.

import { contentVersion, listChapters } from '../content/loader';
import { contentDocs, noteDocs, searchSource } from './searchSource';
import type { SearchDoc } from './search';
import type { AppState } from '../state/types';

export { searchDocs, KIND_LABEL, type SearchDoc } from './search';

let cache: { version: number; notes: AppState['notes']; docs: SearchDoc[] } | null = null;
let inFlight: { version: number; notes: AppState['notes']; promise: Promise<SearchDoc[]> } | null = null;
let nextRequest = 0;

function buildInWorker(source: ReturnType<typeof searchSource>, notes: AppState['notes']): Promise<SearchDoc[]> {
  const fallback = () => [...contentDocs(source), ...noteDocs(notes)];
  if (typeof Worker === 'undefined') return Promise.resolve(fallback());

  return new Promise((resolve) => {
    let settled = false;
    let worker: Worker | null = null;
    const requestId = `search-${++nextRequest}`;
    const finish = (docs: SearchDoc[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker?.terminate();
      resolve(docs);
    };
    const timer = setTimeout(() => finish(fallback()), 3000);
    try {
      worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent) => {
        if (!event.data || event.data.requestId !== requestId) return;
        finish(event.data.type === 'docs' ? (event.data.docs as SearchDoc[]) : fallback());
      };
      worker.onerror = () => finish(fallback());
      worker.postMessage({ type: 'build', requestId, source, notes });
    } catch {
      finish(fallback());
    }
  });
}

/** Build once per content revision and notes object; concurrent callers share work. */
export function buildIndex(notes: AppState['notes']): Promise<SearchDoc[]> {
  const version = contentVersion();
  if (cache && cache.version === version && cache.notes === notes) return Promise.resolve(cache.docs);
  if (inFlight && inFlight.version === version && inFlight.notes === notes) return inFlight.promise;

  const source = searchSource(listChapters());
  const promise = buildInWorker(source, notes).then((docs) => {
    cache = { version, notes, docs };
    if (inFlight?.promise === promise) inFlight = null;
    return docs;
  });
  inFlight = { version, notes, promise };
  return promise;
}

export function clearSearchIndex(): void {
  cache = null;
  inFlight = null;
}
