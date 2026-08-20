import type { Chapter } from '../content/schema';
import type { SearchDoc } from './search';

export interface SearchSource {
  chapters: Array<{
    id: string;
    title: string;
    subject: string;
    sections: Array<{ id: string; title: string; digest: string; highYield: string[] }>;
    cards: Array<{ id: string; type: string; front: string; back: string; cloze: string }>;
    mcqs: Array<{ id: string; stem: string; options: string[] }>;
  }>;
}

/** Create the smallest transferable snapshot the search worker needs. */
export function searchSource(chapters: Chapter[]): SearchSource {
  return {
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      subject: chapter.subject,
      sections: chapter.sections.map((section) => ({
        id: section.id,
        title: section.title,
        digest: section.digest,
        highYield: section.highYield,
      })),
      cards: chapter.cards.map((card) => ({
        id: card.id,
        type: card.type,
        front: card.front || '',
        back: card.back || '',
        cloze: card.cloze || '',
      })),
      mcqs: chapter.mcqs.map((question) => ({
        id: question.id,
        stem: question.stem,
        options: question.options.map((option) => option.text),
      })),
    })),
  };
}

/** Pure normalization shared by the worker and its synchronous fallback. */
export function contentDocs(source: SearchSource): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const chapter of source.chapters) {
    const route = `/study/${encodeURIComponent(chapter.id)}`;
    docs.push({ id: `ch:${chapter.id}`, kind: 'chapter', title: chapter.title, text: chapter.subject, chapterId: chapter.id, route });
    for (const section of chapter.sections) {
      docs.push({
        id: `sec:${chapter.id}:${section.id}`,
        kind: 'section',
        title: section.title,
        text: `${section.digest} ${section.highYield.join(' ')}`.trim(),
        chapterId: chapter.id,
        route: `${route}#sec-${section.id}`,
      });
    }
    for (const card of chapter.cards) {
      docs.push({
        id: `card:${card.id}`,
        kind: 'card',
        title: card.type === 'cloze' ? card.cloze : card.front,
        text: card.back,
        chapterId: chapter.id,
        route,
      });
    }
    for (const question of chapter.mcqs) {
      docs.push({
        id: `mcq:${question.id}`,
        kind: 'mcq',
        title: question.stem,
        text: question.options.join(' '),
        chapterId: chapter.id,
        route,
      });
    }
  }
  return docs;
}

export function noteDocs(notes: Record<string, unknown>): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const key in notes) {
    const note = notes[key] as { title?: string; body?: string } | string | undefined;
    if (!note) continue;
    const title = (typeof note === 'object' ? note.title : key) || key;
    const body = typeof note === 'string' ? note : note.body || '';
    docs.push({ id: `note:${key}`, kind: 'note', title, text: body, route: '/notes' });
  }
  return docs;
}
