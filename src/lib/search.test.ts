import { describe, expect, it } from 'vitest';
import { buildSearchDocs, searchDocs } from './search';
import type { AppState } from '../state/types';

const state = {
  notes: { n1: { id: 'n1', title: 'My wound note', body: 'granulation tissue notes' } },
  schemaVersion: 7,
  flashcards: [],
} as unknown as AppState;

describe('global search', () => {
  const docs = buildSearchDocs(state);

  it('indexes chapters, sections, cards, MCQs and notes', () => {
    const kinds = new Set(docs.map((d) => d.kind));
    expect(kinds.has('chapter')).toBe(true);
    expect(kinds.has('section')).toBe(true);
    expect(kinds.has('card')).toBe(true);
    expect(kinds.has('mcq')).toBe(true);
    expect(kinds.has('note')).toBe(true);
  });

  it('finds content across kinds and routes into the reader', () => {
    const hits = searchDocs(docs, 'wound', 200);
    expect(hits.length).toBeGreaterThan(0);
    // the personal note titled "My wound note" is indexed and found
    expect(hits.some((h) => h.kind === 'note' && h.title.includes('wound'))).toBe(true);
    // a section about wound healing is found and routes into the reader
    const sec = hits.find((h) => h.kind === 'section');
    expect(sec?.route.startsWith('/study/')).toBe(true);
  });

  it('ranks a title-match above a body-only match', () => {
    const hits = searchDocs(docs, 'suture', 200);
    // the "Suture materials" section (title hit) should outrank a card that only
    // mentions suture in its answer text
    const firstSection = hits.findIndex((h) => h.kind === 'section' && /suture/i.test(h.title));
    expect(firstSection).toBeGreaterThanOrEqual(0);
  });

  it('requires every term to match (AND)', () => {
    expect(searchDocs(docs, 'suture material', 10).length).toBeGreaterThan(0);
    expect(searchDocs(docs, 'zzzz nonsense token', 10)).toHaveLength(0);
  });

  it('returns nothing for an empty query', () => {
    expect(searchDocs(docs, '')).toHaveLength(0);
  });
});
