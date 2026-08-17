// Build the search index from the card engine rather than from the content glob.
//
// The obvious way to index the corpus is to iterate the packs imported by
// content/loader — but that module eagerly globs every chapter JSON, so anything
// importing it carries the whole library. Doing that inside the search worker
// meant every student downloaded and parsed the entire corpus TWICE: once for the
// app, once again for the worker.
//
// IndexedDB already holds every chapter, card and MCQ after bootstrap, so the
// index can be built from there instead. The worker then needs only the thin
// database helpers, and the corpus exists once per device rather than once per
// thread. This is the "make search deliberately scoped rather than accidentally
// forcing the whole corpus into memory" rule from the engineering brief.

import { CARDS, CHAPTERS, MCQS, getAllRows } from '../data/db';
import type { SearchDoc } from './search';

interface StoredChapter {
  id: string;
  title: string;
  subject: string;
  sections?: Array<{ id: string; title: string; digest?: string; highYield?: string[] }>;
}

interface StoredCardRow {
  id: string;
  chapterId: string;
  type: string;
  front?: string;
  back?: string;
  cloze?: string;
}

interface StoredMcqRow {
  id: string;
  chapterId: string;
  stem: string;
  options?: Array<{ text: string }>;
}

/**
 * Documents for every chapter, section, card and MCQ currently in the engine.
 *
 * Returns an empty array when the engine has not been populated yet (a first load
 * still mid-bootstrap); the caller treats that as "not ready" and falls back, so
 * search is never silently missing half the library.
 */
export async function buildDocsFromEngine(): Promise<SearchDoc[]> {
  const [chapters, cards, mcqs] = await Promise.all([
    getAllRows<StoredChapter>(CHAPTERS),
    getAllRows<StoredCardRow>(CARDS),
    getAllRows<StoredMcqRow>(MCQS),
  ]);

  if (chapters.length === 0) return [];

  const docs: SearchDoc[] = [];
  const routeOf = (chapterId: string) => `/study/${encodeURIComponent(chapterId)}`;

  for (const ch of chapters) {
    const route = routeOf(ch.id);
    docs.push({
      id: `ch:${ch.id}`,
      kind: 'chapter',
      title: ch.title,
      text: ch.subject,
      chapterId: ch.id,
      route,
    });
    for (const s of ch.sections || []) {
      docs.push({
        id: `sec:${ch.id}:${s.id}`,
        kind: 'section',
        title: s.title,
        text: `${s.digest || ''} ${(s.highYield || []).join(' ')}`.trim(),
        chapterId: ch.id,
        route: `${route}#sec-${s.id}`,
      });
    }
  }

  for (const c of cards) {
    docs.push({
      id: `card:${c.id}`,
      kind: 'card',
      title: c.type === 'cloze' ? c.cloze || '' : c.front || '',
      text: c.back || '',
      chapterId: c.chapterId,
      route: routeOf(c.chapterId),
    });
  }

  for (const q of mcqs) {
    docs.push({
      id: `mcq:${q.id}`,
      kind: 'mcq',
      title: q.stem,
      text: (q.options || []).map((o) => o.text).join(' '),
      chapterId: q.chapterId,
      route: routeOf(q.chapterId),
    });
  }

  return docs;
}

/** Note documents. Cheap and state-derived, so they are built wherever the caller is. */
export function noteDocs(notes: Record<string, unknown>): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const key in notes) {
    const n = notes[key] as { title?: string; body?: string } | string | undefined;
    if (!n) continue;
    const title = (typeof n === 'object' ? n.title : key) || key;
    const body = typeof n === 'string' ? n : n.body || '';
    docs.push({ id: `note:${key}`, kind: 'note', title, text: body, route: '/notes' });
  }
  return docs;
}
