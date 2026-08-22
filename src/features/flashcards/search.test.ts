import { describe, it, expect } from 'vitest';
import { parseQuery, buildMatcher, type SearchableCard } from './search';

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const DAY = 86_400_000;

const card = (o: Partial<SearchableCard> = {}): SearchableCard => ({
  front: 'What supplies the deltoid?',
  back: 'Axillary nerve',
  deck: 'Anatomy::Upper limb',
  tags: ['high-yield'],
  state: 'review',
  due: NOW - DAY,
  ...o,
});

describe('parseQuery', () => {
  it('reads a bare word as text', () => {
    expect(parseQuery('deltoid')).toEqual([{ negated: false, kind: 'text', value: 'deltoid' }]);
  });

  it('reads field terms', () => {
    expect(parseQuery('deck:anatomy tag:high-yield is:due flag:2')).toEqual([
      { negated: false, kind: 'deck', value: 'anatomy' },
      { negated: false, kind: 'tag', value: 'high-yield' },
      { negated: false, kind: 'is', value: 'due' },
      { negated: false, kind: 'flag', value: '2' },
    ]);
  });

  it('keeps a quoted phrase together', () => {
    // Without this, a phrase becomes two unrelated requirements that match far
    // too much — and a medical library is mostly phrases.
    expect(parseQuery('"posterior cruciate"')).toEqual([
      { negated: false, kind: 'text', value: 'posterior cruciate' },
    ]);
  });

  it('reads a leading minus as negation, on any kind of term', () => {
    expect(parseQuery('-tag:leech -nerve')).toEqual([
      { negated: true, kind: 'tag', value: 'leech' },
      { negated: true, kind: 'text', value: 'nerve' },
    ]);
  });

  it('ignores empty input and stray whitespace', () => {
    expect(parseQuery('')).toEqual([]);
    expect(parseQuery('   ')).toEqual([]);
  });
});

describe('buildMatcher — an empty box means show me everything', () => {
  it('matches everything on an empty query', () => {
    // "Nothing" would be a strange default for an empty search box.
    expect(buildMatcher('', NOW)(card())).toBe(true);
  });
});

describe('buildMatcher — text', () => {
  it('matches across front and back', () => {
    expect(buildMatcher('deltoid', NOW)(card())).toBe(true);
    expect(buildMatcher('axillary', NOW)(card())).toBe(true);
    expect(buildMatcher('femur', NOW)(card())).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(buildMatcher('DELTOID', NOW)(card())).toBe(true);
  });

  it('ANDs several terms', () => {
    expect(buildMatcher('deltoid axillary', NOW)(card())).toBe(true);
    expect(buildMatcher('deltoid femur', NOW)(card())).toBe(false);
  });
});

describe('buildMatcher — deck', () => {
  it('matches a parent deck by prefix', () => {
    expect(buildMatcher('deck:anatomy', NOW)(card())).toBe(true);
  });

  it('matches the exact sub-deck', () => {
    expect(buildMatcher('deck:"anatomy::upper limb"', NOW)(card())).toBe(true);
  });

  it('does not match an unrelated deck', () => {
    expect(buildMatcher('deck:surgery', NOW)(card())).toBe(false);
  });
});

describe('buildMatcher — tags and flags', () => {
  it('matches a tag exactly, not as a substring', () => {
    // "high" must not match "high-yield": tags are labels, and a partial match
    // would quietly pull in cards the student did not ask for.
    expect(buildMatcher('tag:high-yield', NOW)(card())).toBe(true);
    expect(buildMatcher('tag:high', NOW)(card())).toBe(false);
  });

  it('excludes with a negated tag', () => {
    expect(buildMatcher('-tag:leech', NOW)(card({ tags: ['leech'] }))).toBe(false);
    expect(buildMatcher('-tag:leech', NOW)(card({ tags: ['high-yield'] }))).toBe(true);
  });

  it('matches flags, and treats no flag as flag:0', () => {
    expect(buildMatcher('flag:2', NOW)(card({ flag: 2 }))).toBe(true);
    expect(buildMatcher('flag:1', NOW)(card({ flag: 2 }))).toBe(false);
    expect(buildMatcher('flag:0', NOW)(card())).toBe(true);
  });
});

describe('buildMatcher — is:', () => {
  it('finds due cards', () => {
    expect(buildMatcher('is:due', NOW)(card({ due: NOW - DAY }))).toBe(true);
    expect(buildMatcher('is:due', NOW)(card({ due: NOW + DAY }))).toBe(false);
  });

  it('never calls a suspended card due, however its date reads', () => {
    // The queue skips suspended cards, so a search that counted them would
    // report a number no session will ever hand over.
    expect(buildMatcher('is:due', NOW)(card({ due: NOW - DAY, suspended: true }))).toBe(false);
  });

  it('never calls a new card due', () => {
    expect(buildMatcher('is:due', NOW)(card({ state: 'new', due: 0 }))).toBe(false);
  });

  it('finds new, learning and suspended cards', () => {
    expect(buildMatcher('is:new', NOW)(card({ state: 'new' }))).toBe(true);
    expect(buildMatcher('is:learning', NOW)(card({ state: 'relearning' }))).toBe(true);
    expect(buildMatcher('is:suspended', NOW)(card({ suspended: true }))).toBe(true);
  });

  it('ignores an unknown is: value rather than matching everything', () => {
    expect(buildMatcher('is:banana', NOW)(card())).toBe(false);
  });
});

describe('buildMatcher — the queries a student actually types', () => {
  it('"the high-yield anatomy I owe, minus the leeches"', () => {
    const match = buildMatcher('deck:anatomy tag:high-yield is:due -tag:leech', NOW);
    expect(match(card())).toBe(true);
    expect(match(card({ tags: ['high-yield', 'leech'] }))).toBe(false);
    expect(match(card({ due: NOW + DAY }))).toBe(false);
    expect(match(card({ deck: 'Surgery::Trauma' }))).toBe(false);
  });
});
