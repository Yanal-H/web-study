// Card search — Anki's query syntax, as much of it as is useful here.
//
// Browse filtered by plain substring, which stops being navigation the moment a
// library holds a few thousand cards: "artery" matches four hundred of them and
// there is no way to say which four hundred you meant. Anki's answer is a small
// query language, and students who have used Anki already know it.
//
// Supported:
//   deck:anatomy       cards filed under a deck (prefix match, "::" aware)
//   tag:high-yield     a tag on the card
//   is:due  is:new  is:learning  is:suspended
//   flag:1             a flagged card (flag:0 means unflagged)
//   -tag:leech         any term may be negated with a leading minus
//   "exact phrase"     quoted text is matched as one phrase
//   anything else      plain text, matched against the front and back
//
// Terms are ANDed, which is what people expect and what Anki does.
//
// Pure: it parses text into a predicate. It knows nothing about React or the
// database, so every rule below is tested directly.

export interface SearchableCard {
  front: string;
  back: string;
  deck?: string;
  tags?: string[];
  state?: string;
  due?: number;
  suspended?: boolean;
  flag?: number;
}

export interface Term {
  negated: boolean;
  kind: 'text' | 'deck' | 'tag' | 'is' | 'flag';
  value: string;
}

/**
 * Split a query into terms, respecting quotes.
 *
 * Quoting matters more than it looks: a medical library is full of phrases
 * ("posterior cruciate"), and without quotes those become two unrelated
 * requirements that happen to match far too much.
 */
export function parseQuery(query: string): Term[] {
  const terms: Term[] = [];
  const re = /(-?)(?:(deck|tag|is|flag):)?(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const [, minus, field, quoted, bare] = m;
    const value = (quoted ?? bare ?? '').trim();
    if (!value) continue;
    terms.push({
      negated: minus === '-',
      kind: (field as Term['kind']) ?? 'text',
      value: value.toLowerCase(),
    });
  }
  return terms;
}

/** Does a deck path match a `deck:` term? "anatomy" matches "Anatomy::Upper limb". */
function deckMatches(deck: string | undefined, want: string): boolean {
  if (!deck) return false;
  const haystack = deck.toLowerCase();
  return haystack === want || haystack.startsWith(`${want}::`) || haystack.includes(want);
}

function isMatches(card: SearchableCard, want: string, now: number): boolean {
  switch (want) {
    case 'due':
      // Suspended cards are never due, however their date reads — the queue
      // skips them, so search must agree or the count means nothing.
      return !card.suspended && card.state !== 'new' && (card.due ?? 0) <= now;
    case 'new':
      return card.state === 'new';
    case 'learning':
      return card.state === 'learning' || card.state === 'relearning';
    case 'review':
      return card.state === 'review';
    case 'suspended':
      return !!card.suspended;
    default:
      return false;
  }
}

function termMatches(card: SearchableCard, term: Term, now: number): boolean {
  switch (term.kind) {
    case 'deck':
      return deckMatches(card.deck, term.value);
    case 'tag':
      return (card.tags ?? []).some((t) => t.toLowerCase() === term.value);
    case 'is':
      return isMatches(card, term.value, now);
    case 'flag': {
      const want = Number(term.value);
      if (!Number.isFinite(want)) return false;
      return (card.flag ?? 0) === want;
    }
    default:
      return `${card.front} ${card.back}`.toLowerCase().includes(term.value);
  }
}

/**
 * Build a predicate from a query. Terms are ANDed; a negated term must not match.
 *
 * An empty query matches everything rather than nothing — an empty search box
 * means "show me the library", not "show me nothing".
 */
export function buildMatcher(query: string, now: number = Date.now()): (card: SearchableCard) => boolean {
  const terms = parseQuery(query);
  if (terms.length === 0) return () => true;
  return (card: SearchableCard) =>
    terms.every((t) => (termMatches(card, t, now) ? !t.negated : t.negated));
}
