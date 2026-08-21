import { beforeEach, describe, expect, it } from 'vitest';
import {
  catalogChapterIdsForDeck,
  catalogMatchesChapter,
  catalogDeckCounts,
  clearContentCatalog,
  isAuthorizedCard,
  parseCatalogRows,
  setContentCatalog,
} from './catalog';
import { allDeckKeys, deckCounts } from '../data/db';

describe('authenticated content catalog', () => {
  beforeEach(clearContentCatalog);

  it('parses identities without chapter bodies and powers deck lookups', () => {
    const entries = parseCatalogRows([{
      id: 'anatomy-1', revision: 'r1', subject: 'Anatomy', title: 'Upper limb',
      deck: 'Anatomy::Upper limb', updated_at: '2026-08-20T00:00:00Z',
      section_index: [{ id: 'bones', title: 'Bones' }],
      card_index: [{ id: 'c1', deck: 'Anatomy::Upper limb::Bones' }],
      mcq_index: [{ id: 'q1', difficulty: 3 }],
      section_count: 1, card_count: 1, mcq_count: 1, emq_count: 0, mnemonic_count: 2,
    }]);
    setContentCatalog(entries);

    expect(isAuthorizedCard('c1')).toBe(true);
    expect(catalogDeckCounts()).toEqual({ 'Anatomy::Upper limb::Bones': 1 });
    expect(catalogChapterIdsForDeck('Anatomy')).toEqual(['anatomy-1']);
  });

  it('powers engine deck queries before any card body is downloaded', async () => {
    setContentCatalog(parseCatalogRows([{
      id: 'surgery-1', revision: 'r1', subject: 'Surgery', title: 'Wounds',
      deck: 'Surgery::Wounds', section_index: [], mcq_index: [],
      card_index: [
        { id: 'c1', deck: 'Surgery::Wounds::Healing' },
        { id: 'c2', deck: 'Surgery::Wounds::Healing' },
      ],
      section_count: 0, card_count: 2, mcq_count: 0, emq_count: 0, mnemonic_count: 0,
    }]));

    expect(await allDeckKeys()).toEqual(['Surgery::Wounds::Healing']);
    expect(await deckCounts()).toEqual({ 'Surgery::Wounds::Healing': 2 });
  });

  it('rejects a body that disagrees with its catalog identities', () => {
    const chapter = {
      schema: 'foundation.study-module/v1' as const,
      id: 'sur-ch1-test', subject: 'Surgery', title: 'Test',
      sections: [{ id: 's1', title: 'One', digest: 'Text', highYield: [], tables: [], pitfalls: [], figures: [], extraKnowledge: [] }],
      cards: [], mcqs: [], emqs: [], mnemonics: [], objectives: [], glossary: [], tags: [], outline: [], images: {},
    };
    const entry = {
      ...parseCatalogRows([{
        id: chapter.id, revision: 'r1', subject: chapter.subject, title: chapter.title,
        deck: 'Surgery::Test', section_index: [{ id: 'different', title: 'One' }],
        card_index: [], mcq_index: [], section_count: 1, card_count: 0, mcq_count: 0,
        emq_count: 0, mnemonic_count: 0,
      }])[0]!,
    };
    expect(catalogMatchesChapter(entry, chapter)).toBe(false);
  });
});
