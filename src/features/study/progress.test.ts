import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedChapter } from '../../content/loader';
import { deckStats } from '../../data/session';
import { state } from '../../state/store';
import { chapterCardDueCounts, chapterLearningProgress, chapterProgress } from './progress';

vi.mock('../../data/session', () => ({
  deckStats: vi.fn(),
}));

const previousProgress = state.study.progress;
const previousMcqPerf = state.study.mcqPerf;

afterEach(() => {
  state.study.progress = previousProgress;
  state.study.mcqPerf = previousMcqPerf;
  vi.clearAllMocks();
});

function chapter(id: string, deck: string): LoadedChapter {
  return {
    id,
    deck,
    subject: 'Surgery',
    title: id,
    origin: 'shared',
    sections: [
      { id: 's1', title: 'One', digest: 'A' },
      { id: 's2', title: 'Two', digest: 'B' },
    ],
    cards: [],
    mcqs: [
      { id: `${id}-q1`, options: [] },
      { id: `${id}-q2`, options: [] },
    ],
  } as unknown as LoadedChapter;
}

describe('chapter progress sources', () => {
  it('derives reading and MCQ progress from app state and accepts the FSRS count explicitly', () => {
    const ch = chapter('chapter-a', 'Surgery::A');
    state.study.progress = {
      'chapter-a': { sections: { s1: true }, lastOpened: '2026-08-20' },
    };
    state.study.mcqPerf = {
      'chapter-a-q1': { attempts: 4, correct: 3 },
    } as unknown as typeof state.study.mcqPerf;

    expect(chapterLearningProgress(ch)).toMatchObject({
      readPct: 0.5,
      sectionsRead: 1,
      sectionsTotal: 2,
      mcqAttempted: 1,
      mcqAccuracy: 0.75,
      lastOpened: '2026-08-20',
    });
    expect(chapterProgress(ch, 7).cardsDue).toBe(7);
  });

  it('loads due and new card counts from each chapter FSRS deck', async () => {
    const first = chapter('chapter-a', 'Surgery::A');
    const second = chapter('chapter-b', 'Surgery::B');
    vi.mocked(deckStats).mockImplementation(async (deck) =>
      deck === 'Surgery::A'
        ? { due: 3, neu: 4, total: 10 }
        : { due: 1, neu: 2, total: 8 }
    );

    await expect(chapterCardDueCounts([first, second])).resolves.toEqual({
      'chapter-a': 7,
      'chapter-b': 3,
    });
    expect(deckStats).toHaveBeenNthCalledWith(1, 'Surgery::A');
    expect(deckStats).toHaveBeenNthCalledWith(2, 'Surgery::B');
  });
});
