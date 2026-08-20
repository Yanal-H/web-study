// Import a chapter pack into the card engine.
//
// Writes are idempotent puts keyed by id, so re-importing an updated pack
// overwrites in place and never duplicates. Cards go in chunked transactions
// with a yield between chunks, so importing a very large bank leaves the tab
// responsive and can drive a progress bar.

import {
  CARDS,
  CHAPTERS,
  MCQS,
  MEDIA,
  SCHEDULING,
  bulkPut,
  deleteKeys,
  openDB,
  req,
  type Scheduling,
  type StoredCard,
} from './db';
import { chapterRows } from './contentStore';
import { newScheduling } from './fsrs';
import type { Chapter } from '../content/schema';
// From ./deck, not ./loader: loader eagerly globs every chapter JSON, and this
// module runs inside the import worker, which must not carry the whole corpus.
import { cardDeckPath, deckRoot } from '../content/deck';

const CHUNK = 500;

export interface ImportProgress {
  chapterId: string;
  title: string;
  /** rows written so far for this pack */
  written: number;
  total: number;
}

const idle = () => new Promise<void>((r) => setTimeout(r, 0));

export interface ReplacementPlan {
  cards: string[];
  mcqs: string[];
  media: string[];
}

/**
 * A pack revision is authoritative for that chapter only. Updated rows retain
 * their IDs and personal scheduling; rows removed by the author are deleted so
 * they cannot remain as ghost cards/questions in a live student session.
 */
export function replacementPlan(
  chapterId: string,
  expected: { cardIds: Set<string>; mcqIds: Set<string>; mediaIds: Set<string> },
  stored: {
    cards: Array<{ id: string; chapterId: string }>;
    mcqs: Array<{ id: string; chapterId: string }>;
    media: Array<{ imageId: string }>;
  }
): ReplacementPlan {
  return {
    cards: stored.cards.filter((row) => row.chapterId === chapterId && !expected.cardIds.has(row.id)).map((row) => row.id),
    mcqs: stored.mcqs.filter((row) => row.chapterId === chapterId && !expected.mcqIds.has(row.id)).map((row) => row.id),
    media: stored.media
      .filter((row) => row.imageId.startsWith(`${chapterId}:`) && !expected.mediaIds.has(row.imageId))
      .map((row) => row.imageId),
  };
}

/**
 * Chapter metadata — the reader's half of a pack, plus the authored pack itself.
 *
 * `pack` is kept because chapters no longer ship inside the JS bundle: this row is
 * now the device's only copy of the authored chapter, and it is what the reader
 * hydrates from when the student is offline. The card and MCQ *stores* remain the
 * query path for the due queue and deck counts — those never read this field.
 */
export function chapterMeta(pack: Chapter) {
  const { cards, mcqs, images, ...meta } = pack as Chapter & { images?: unknown };
  void cards;
  void mcqs;
  void images;
  return {
    ...meta,
    deck: deckRoot(pack),
    counts: {
      cards: pack.cards.length,
      mcqs: pack.mcqs.length,
      emqs: pack.emqs.length,
      sections: pack.sections.length,
    },
    pack,
  };
}

/** Flatten a pack's cards into storable rows with their full deck paths. */
export function packCards(pack: Chapter): StoredCard[] {
  return pack.cards.map((c, i) => ({
    id: c.id || `${pack.id}-card-${String(i + 1).padStart(3, '0')}`,
    chapterId: pack.id,
    subject: pack.subject,
    deck: cardDeckPath(pack, c),
    sectionId: c.sectionId || c.tag,
    type: c.type,
    front: c.front,
    back: c.back,
    cloze: c.cloze,
    extra: c.extra,
    hint: c.hint,
    difficulty: c.difficulty,
    tags: c.tags,
    image: c.image,
    masks: c.masks,
    target: c.target,
    occMode: c.occMode,
    label: c.label,
  }));
}

/**
 * Write one pack into the engine. Returns how many cards were new (i.e. gained
 * a fresh scheduling row) so the caller can report what a re-import changed.
 */
export async function importPack(
  pack: Chapter,
  onProgress?: (p: ImportProgress) => void
): Promise<{ cards: number; mcqs: number; seeded: number }> {
  const cards = packCards(pack);
  const mcqs = pack.mcqs.map((q, i) => ({
    ...q,
    id: q.id || `${pack.id}-mcq-${String(i + 1).padStart(3, '0')}`,
    chapterId: pack.id,
    subject: pack.subject,
    sectionId: q.sectionId || q.sectionTag,
  }));
  const images = Object.entries((pack as Chapter & { images?: Record<string, { src: string }> }).images || {});
  const total = cards.length + mcqs.length + images.length;
  let written = 0;
  const report = () =>
    onProgress?.({ chapterId: pack.id, title: pack.title, written, total });

  await bulkPut(CHAPTERS, [chapterMeta(pack)]);

  for (let i = 0; i < cards.length; i += CHUNK) {
    await bulkPut(CARDS, cards.slice(i, i + CHUNK));
    written += Math.min(CHUNK, cards.length - i);
    report();
    await idle();
  }

  for (let i = 0; i < mcqs.length; i += CHUNK) {
    await bulkPut(MCQS, mcqs.slice(i, i + CHUNK));
    written += Math.min(CHUNK, mcqs.length - i);
    report();
    await idle();
  }

  if (images.length) {
    await bulkPut(
      MEDIA,
      images.map(([imageId, img]) => ({ imageId: `${pack.id}:${imageId}`, ...img }))
    );
    written += images.length;
    report();
  }

  const seeded = await seedScheduling(cards);
  const owned = chapterRows(pack.id);
  const removed = replacementPlan(
    pack.id,
    {
      cardIds: new Set(cards.map((card) => card.id)),
      mcqIds: new Set(mcqs.map((question) => question.id)),
      mediaIds: new Set(images.map(([id]) => `${pack.id}:${id}`)),
    },
    {
      cards: owned.cards as Array<{ id: string; chapterId: string }>,
      mcqs: owned.mcqs as Array<{ id: string; chapterId: string }>,
      media: owned.media as Array<{ imageId: string }>,
    }
  );
  await Promise.all([
    deleteKeys(CARDS, removed.cards),
    deleteKeys(SCHEDULING, removed.cards),
    deleteKeys(MCQS, removed.mcqs),
    deleteKeys(MEDIA, removed.media),
  ]);
  return { cards: cards.length, mcqs: mcqs.length, seeded };
}

/**
 * Give every card without one a scheduling row, so it enters the new queue.
 * Existing rows are left exactly as they are — re-importing a pack must never
 * reset a student's progress.
 */
export async function seedScheduling(cards: StoredCard[]): Promise<number> {
  const db = await openDB();
  let seeded = 0;
  for (let i = 0; i < cards.length; i += CHUNK) {
    const slice = cards.slice(i, i + CHUNK);
    const read = db.transaction([SCHEDULING], 'readonly').objectStore(SCHEDULING);
    const existing = await Promise.all(
      slice.map((c) => req<Scheduling | undefined>(read.get(c.id)))
    );
    const fresh: Scheduling[] = [];
    slice.forEach((c, j) => {
      const prev = existing[j];
      if (!prev) {
        fresh.push(newScheduling(c.id, c.deck));
      } else if (prev.deck !== c.deck) {
        // the pack moved this card to a different deck — keep its history
        fresh.push({ ...prev, deck: c.deck });
      }
    });
    if (fresh.length) {
      await bulkPut(SCHEDULING, fresh);
      seeded += fresh.filter((f) => f.state === 'new' && f.reps === 0).length;
    }
    await idle();
  }
  return seeded;
}
