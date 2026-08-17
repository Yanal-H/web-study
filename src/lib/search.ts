// Global search index spanning shipped/imported content (chapters, sections,
// cards, MCQs), the user's notes, and navigation. Feeds the ⌘K palette.
import { listChapters, chapterCards, chapterMcqs } from '../content/loader';
import type { AppState } from '../state/types';

export interface SearchDoc {
  id: string;
  kind: 'chapter' | 'section' | 'card' | 'mcq' | 'note';
  title: string;
  text: string;
  chapterId?: string;
  route: string; // hash route to navigate to
}

/** Build the searchable document set from content + notes. */
export function buildSearchDocs(state: AppState): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const ch of listChapters()) {
    const route = `/study/${encodeURIComponent(ch.id)}`;
    docs.push({ id: `ch:${ch.id}`, kind: 'chapter', title: ch.title, text: ch.subject, chapterId: ch.id, route });
    for (const s of ch.sections) {
      docs.push({
        id: `sec:${ch.id}:${s.id}`,
        kind: 'section',
        title: s.title,
        text: s.digest + ' ' + s.highYield.join(' '),
        chapterId: ch.id,
        route: `${route}#sec-${s.id}`,
      });
    }
    for (const c of chapterCards(ch)) {
      docs.push({
        id: `card:${c.id}`,
        kind: 'card',
        title: c.type === 'cloze' ? (c.cloze || '') : (c.front || ''),
        text: c.back || '',
        chapterId: ch.id,
        route,
      });
    }
    for (const q of chapterMcqs(ch)) {
      docs.push({
        id: `mcq:${q.id}`,
        kind: 'mcq',
        title: q.stem,
        text: q.options.map((o) => o.text).join(' '),
        chapterId: ch.id,
        route,
      });
    }
  }
  for (const key in state.notes) {
    const n = state.notes[key];
    if (!n) continue;
    const title = (typeof n === 'object' ? n.title : key) || key;
    const body = typeof n === 'string' ? n : n.body || '';
    docs.push({ id: `note:${key}`, kind: 'note', title, text: body, route: '/notes' });
  }
  return docs;
}

/** Rank docs against a query (substring + word-prefix scoring). */
export function searchDocs(docs: SearchDoc[], query: string, limit = 20): SearchDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored: Array<{ d: SearchDoc; s: number }> = [];
  for (const d of docs) {
    const title = d.title.toLowerCase();
    const text = d.text.toLowerCase();
    let s = 0;
    let all = true;
    for (const t of terms) {
      const inTitle = title.includes(t);
      const inText = text.includes(t);
      if (!inTitle && !inText) {
        all = false;
        break;
      }
      if (title.startsWith(t)) s += 10;
      else if (inTitle) s += 6;
      else s += 2;
    }
    if (all) scored.push({ d, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.d);
}

export const KIND_LABEL: Record<SearchDoc['kind'], string> = {
  chapter: 'Chapter',
  section: 'Section',
  card: 'Card',
  mcq: 'Question',
  note: 'Note',
};
