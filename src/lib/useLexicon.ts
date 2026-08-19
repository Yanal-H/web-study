import { useMemo } from 'react';
import { allGlossary } from '../content/loader';
import { useStoreVersion } from '../state/useStore';
import { buildIndex, type LexIndex } from './lexicon';
import type { GlossaryEntry } from '../content/schema';

let cache: { v: string; idx: LexIndex } | null = null;

/**
 * The app-wide index, for render helpers that sit outside a component.
 * Rebuilt only when imported content changes.
 */
export function globalIndex(): LexIndex {
  // A content refresh replaces the in-memory pack list. The glossary signature
  // prevents helpers outside React from holding an old vocabulary afterwards.
  const v = allGlossary()
    .map((entry) => `${entry.chapterId}:${entry.term}:${entry.def ?? ''}`)
    .join('|');
  if (!cache || cache.v !== v) cache = { v, idx: buildIndex(allGlossary()) };
  return cache.idx;
}

/**
 * The colour lexicon for the whole app: every chapter's authored glossary merged
 * over the built-in medical lexicon. Pass a chapter's own glossary to give its
 * definitions the last word while reading it.
 */
export function useLexicon(local: GlossaryEntry[] = []): LexIndex {
  const storeVersion = useStoreVersion();
  return useMemo(
    () => buildIndex([...allGlossary(), ...local]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeVersion, local]
  );
}
