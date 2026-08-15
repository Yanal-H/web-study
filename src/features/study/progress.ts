// Per-chapter progress derived from real stored data (read %, cards due, MCQ
// accuracy). Nothing fabricated — every figure traces to state.
import { state } from '../../state/store';
import { chapterCards, chapterMcqs, type LoadedChapter } from '../../content/loader';
import { cardIsDue, isNewCard, type CardSched } from '../../lib/scheduler';

export interface ChapterProgress {
  readPct: number;
  sectionsRead: number;
  sectionsTotal: number;
  cardsDue: number;
  mcqAttempted: number;
  mcqAccuracy: number | null;
  lastOpened?: string;
}

export function chapterProgress(ch: LoadedChapter): ChapterProgress {
  const prog = state.study.progress[ch.id] || {};
  const readMap: Record<string, boolean> = prog.sections || {};
  const sectionsTotal = ch.sections.length;
  const sectionsRead = ch.sections.filter((s) => readMap[s.id]).length;

  let cardsDue = 0;
  for (const c of chapterCards(ch)) {
    const key = `content:${c.id}`;
    const s = (state.study.cardSched[key] as CardSched) || { state: 'new' };
    if (isNewCard(s) || cardIsDue(s)) cardsDue++;
  }

  let attempted = 0;
  let correct = 0;
  let total = 0;
  for (const q of chapterMcqs(ch)) {
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
    cardsDue,
    mcqAttempted: attempted,
    mcqAccuracy: total > 0 ? correct / total : null,
    lastOpened: prog.lastOpened,
  };
}
