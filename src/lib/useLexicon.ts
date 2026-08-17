import { useMemo } from 'react';
import { allGlossary } from '../content/loader';
import { useUserContentVersion, getUserVersion } from '../content/userContent';
import { buildIndex, type LexIndex } from './lexicon';
import type { GlossaryEntry } from '../content/schema';

let cache: { v: number; idx: LexIndex } | null = null;

/**
 * The app-wide index, for render helpers that sit outside a component.
 * Rebuilt only when imported content changes.
 */
export function globalIndex(): LexIndex {
  const v = getUserVersion();
  if (!cache || cache.v !== v) cache = { v, idx: buildIndex(allGlossary()) };
  return cache.idx;
}

/**
 * The colour lexicon for the whole app: every chapter's authored glossary merged
 * over the built-in medical lexicon. Pass a chapter's own glossary to give its
 * definitions the last word while reading it.
 */
export function useLexicon(local: GlossaryEntry[] = []): LexIndex {
  const uv = useUserContentVersion();
  return useMemo(
    () => buildIndex([...allGlossary(), ...local]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uv, local]
  );
}
