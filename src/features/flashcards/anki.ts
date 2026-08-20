// Anki-style TSV/CSV round-trip for the user's own cards. Supported fields:
// front, back, tags, type (basic/cloze) and deck. Lossless for those fields.
// Deck paths use Anki's own "::" convention, so decks, sub-decks and sub-sub-decks
// survive a round trip in either direction.
import { state, commit, uid } from '../../state/store';
import type { Flashcard } from '../../state/types';

function esc(v: string): string {
  const s = String(v ?? '');
  return /["\t\n,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Export user cards to TSV (Anki's default). Header row included. */
export function exportTSV(cards: Flashcard[]): string {
  const rows = [['front', 'back', 'tags', 'type', 'deck']];
  for (const c of cards) {
    const anyC = c as any;
    if (anyC.type === 'occlusion') continue; // image occlusion is not TSV-representable
    rows.push([
      anyC.type === 'cloze' ? c.cloze || '' : c.front || '',
      anyC.type === 'cloze' ? '' : c.back || '',
      (c.tags || []).join(' '),
      anyC.type || 'basic',
      anyC.deck || '',
    ]);
  }
  return rows.map((r) => r.map(esc).join('\t')).join('\n');
}

/** Parse a delimited line respecting simple quoting. */
function parseLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface ParsedCard {
  type: 'basic' | 'cloze';
  front?: string;
  back?: string;
  cloze?: string;
  tags: string[];
  /** "::"-separated deck path, as Anki writes it */
  deck?: string;
}

/** A chapter pack belongs in the administrator publisher, never the card TSV importer. */
export function isChapterPackJson(text: string): boolean {
  try {
    const value = JSON.parse(text) as { schema?: unknown; sections?: unknown; mcqs?: unknown };
    return (
      value?.schema === 'foundation.study-module/v1' ||
      (Array.isArray(value?.sections) && Array.isArray(value?.mcqs))
    );
  } catch {
    return false;
  }
}

/** Parse TSV or CSV text into cards. Auto-detects delimiter and an optional header. */
export function parseDelimited(text: string): ParsedCard[] {
  // Anki exports may start with metadata rows such as `#separator:tab`.
  // They are instructions for Anki, never cards.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.trimStart().startsWith('#'));
  if (lines.length === 0) return [];
  const delim = lines[0]!.includes('\t') ? '\t' : ',';
  let start = 0;
  const first = parseLine(lines[0]!, delim).map((s) => s.toLowerCase().trim());
  if (first[0] === 'front' || first.includes('front')) start = 1; // skip header
  const cards: ParsedCard[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = parseLine(lines[i]!, delim);
    const front = (cols[0] || '').trim();
    const back = (cols[1] || '').trim();
    const tags = (cols[2] || '').trim().split(/\s+/).filter(Boolean);
    const typeCol = (cols[3] || '').trim().toLowerCase();
    const deck = (cols[4] || '').trim() || undefined;
    const isCloze = typeCol === 'cloze' || /\{\{c\d+::/.test(front);
    if (!front) continue;
    if (isCloze) cards.push({ type: 'cloze', cloze: front, tags, deck });
    // A basic card without an answer cannot be reviewed meaningfully and was a
    // common source of apparently "broken" imported cards. Leave it out rather
    // than storing a row that later surprises the learner.
    else if (back) cards.push({ type: 'basic', front, back, tags, deck });
  }
  return cards;
}

/** Import parsed cards into the user's deck (new cards; scheduler picks them up). */
export function importCards(parsed: ParsedCard[]): number {
  const now = Date.now();
  for (const p of parsed) {
    const card: Flashcard = {
      id: uid(),
      schema: 'foundation.card/v2',
      type: p.type,
      front: p.front,
      back: p.back,
      cloze: p.cloze,
      tags: p.tags,
      deck: typeof p.deck === 'string' && p.deck.trim() ? p.deck.trim() : undefined,
      ef: state.settings.scheduler.easeStart,
      interval: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
      step: 0,
      due: now,
      history: [],
    } as Flashcard;
    state.flashcards.push(card);
  }
  commit();
  return parsed.length;
}
