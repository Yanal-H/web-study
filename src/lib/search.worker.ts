// Web Worker: builds the global search index off the main thread, so opening ⌘K
// never janks the UI — worst on mobile, where iterating the whole corpus on the
// main thread drops frames. It only builds the document set (the expensive part);
// the per-keystroke ranking runs synchronously on the main thread, which is cheap.

import { buildSearchDocs } from './search';
import type { AppState } from '../state/types';

const g = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (m: unknown) => void;
};

g.onmessage = (e: MessageEvent) => {
  if (e.data && e.data.type === 'build') {
    const docs = buildSearchDocs({ notes: e.data.notes } as AppState);
    g.postMessage({ type: 'docs', docs });
  }
};
