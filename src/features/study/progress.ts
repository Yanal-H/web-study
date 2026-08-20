// Per-chapter progress derived from the two stores that own it:
// - reading and MCQ history live in the app state
// - shared-card scheduling lives in IndexedDB/FSRS
//
// Keeping the two calculations explicit prevents the retired SM-2 map from
// silently becoming a second source of truth for shared cards.
import { state } from '../../state/store';
import type { LoadedChapter } from '../../content/loader';
import type { ChapterCatalogEntry } from '../../content/catalog';
import { deckStats } from '../../data/session';

export interface ChapterProgress {
  readPct: number;
  sectionsRead: number;
  sectionsTotal: number;
  cardsDue: number;
  mcqAttempted: number;
  mcqAccuracy: number | null;
  lastOpened?: string;
}

export type ChapterLearningProgress = Omit<ChapterProgress, 'cardsDue'>;

/** Synchronous progress whose source is the user-scoped app state. */
type ProgressChapter = Pick<LoadedChapter, 'id' | 'sections' | 'mcqs' | 'deck' | 'subject' | 'title'>
  | ChapterCatalogEntry;

export function chapterLearningProgress(ch: ProgressChapter): ChapterLearningProgress {
  const prog = state.study.progress[ch.id] || {};
  const readMap: Record<string, boolean> = prog.sections || {};
  const sectionsTotal = ch.sections.length;
  const sectionsRead = ch.sections.filter((s) => readMap[s.id]).length;

  let attempted = 0;
  let correct = 0;
  let total = 0;
  for (const q of ch.mcqs) {
    const p = state.study.mcqPerf[q.id];
    if (p && p.attempts > 0) {
      attempted++;
      correct += p.correct;
      total += p.attempts;
    }
  }

  return {
    readPct: sectionsTotal ? sectionsRead / sectionsTotal : 0,
    sectionsRead,
    sectionsTotal,
    mcqAttempted: attempted,
    mcqAccuracy: total > 0 ? correct / total : null,
    lastOpened: prog.lastOpened,
  };
}

/** Combine app-state learning progress with an FSRS count already loaded by the view. */
export function chapterProgress(ch: ProgressChapter, cardsDue: number): ChapterProgress {
  return { ...chapterLearningProgress(ch), cardsDue };
}

/**
 * Load all chapter card counts together so the Study screen performs one
 * coordinated refresh rather than each chapter owning an independent effect.
 */
export async function chapterCardDueCounts(chapters: ProgressChapter[]): Promise<Record<string, number>> {
  const rows = await Promise.all(
    chapters.map(async (chapter) => {
      const stats = await deckStats(chapter.deck || `${chapter.subject}::${chapter.title}`);
      return [chapter.id, stats.due + stats.neu] as const;
    })
  );
  return Object.fromEntries(rows);
}
