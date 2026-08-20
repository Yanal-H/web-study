// Web Worker: builds the global search index off the main thread, so opening ⌘K
// never janks the UI — worst on mobile, where iterating the whole corpus on the
// main thread drops frames. It only builds the document set (the expensive part);
// the per-keystroke ranking runs synchronously on the main thread, which is cheap.
//
// The page sends a normalized, minimal snapshot. Session content lives in page
// memory and is not visible inside a Worker's separate JavaScript realm.

import { contentDocs, noteDocs, type SearchSource } from './searchSource';

const g = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (m: unknown) => void;
};

g.onmessage = (e: MessageEvent) => {
  if (!e.data || e.data.type !== 'build') return;
  const requestId = String(e.data.requestId || '');
  const source = e.data.source as SearchSource | undefined;
  const notes = (e.data.notes || {}) as Record<string, unknown>;
  if (!source) return g.postMessage({ type: 'empty', requestId });
  try {
    g.postMessage({ type: 'docs', requestId, docs: [...contentDocs(source), ...noteDocs(notes)] });
  } catch {
    g.postMessage({ type: 'empty', requestId });
  }
};
