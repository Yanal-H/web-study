// Web Worker: builds the global search index off the main thread, so opening ⌘K
// never janks the UI — worst on mobile, where iterating the whole corpus on the
// main thread drops frames. It only builds the document set (the expensive part);
// the per-keystroke ranking runs synchronously on the main thread, which is cheap.
//
// The corpus is read from IndexedDB (see searchSource), NOT from content/loader.
// Importing loader here would inline every chapter JSON into the worker bundle and
// ship the entire library to each student a second time.

import { buildDocsFromEngine, noteDocs } from './searchSource';

const g = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (m: unknown) => void;
};

g.onmessage = (e: MessageEvent) => {
  if (!e.data || e.data.type !== 'build') return;
  const notes = (e.data.notes || {}) as Record<string, unknown>;

  void buildDocsFromEngine()
    .then((contentDocs) => {
      if (contentDocs.length === 0) {
        // The engine is empty — a first load still importing. Say so rather than
        // returning a half-empty index; the main thread rebuilds from the packs.
        g.postMessage({ type: 'empty' });
        return;
      }
      g.postMessage({ type: 'docs', docs: [...contentDocs, ...noteDocs(notes)] });
    })
    .catch(() => {
      // No IndexedDB, or a read failure: let the main thread fall back.
      g.postMessage({ type: 'empty' });
    });
};
