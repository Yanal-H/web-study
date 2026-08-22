// Does the review SESSION actually bring the card back?
//
// liveQueue.test.ts proves the pure queue logic, and liveQueue.integration.test.ts
// proves the scheduler and the queue agree about due times. Neither proves the
// thing a student actually experiences: that ReviewSession WIRES them together —
// that grading fires the timer, the timer promotes the card, and the card is on
// screen again a minute later without leaving the session.
//
// That gap is why this file exists. It drives the real component with a fake
// clock and asserts on rendered text.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ReviewItem } from './deck';

const MIN = 60_000;

// Scheduler stand-in: "again" puts the card a minute out in learning, anything
// else graduates it to days away. Matches what FSRS really returns (pinned by
// liveQueue.integration.test.ts) without needing IndexedDB here.
const gradeItemLive = vi.hoisted(() =>
  vi.fn(async (item: { key: string }, g: string) =>
    g === 'again'
      ? { undo: { item, grade: g }, due: Date.now() + MIN, cardState: 'learning' }
      : { undo: { item, grade: g }, due: Date.now() + 4 * 86_400_000, cardState: 'review' }
  )
);

vi.mock('./deck', () => ({
  gradeItemLive,
  undoGrade: vi.fn(async () => {}),
  gradePreview: () => '1 min',
  itemState: () => 'new',
  toggleSuspend: vi.fn(async () => true),
  // The real one: Again/Hard come back shortly, Good/Easy retire for the session.
  cramGrade: (g: string, now = Date.now()) =>
    g === 'again' || g === 'hard'
      ? { due: now + (g === 'again' ? 60_000 : 300_000), cardState: 'learning' }
      : { due: now + 365 * 86_400_000, cardState: 'review' },
}));

// Everything below is chrome this test does not exercise.
vi.mock('../../design/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../lib/sound', () => ({ sfx: { grade: vi.fn(), combo: vi.fn() } }));
vi.mock('../../lib/ai', () => ({ hintCardPrompt: () => ({ user: '' }), explainCardPrompt: () => ({ user: '' }) }));
vi.mock('../ai/AiTutor', () => ({ default: () => null }));
vi.mock('../tts/ListenButton', () => ({ default: () => null }));
vi.mock('./Occlusion', () => ({ OcclusionView: () => null, MaskedFigure: () => null }));
vi.mock('../../content/loader', () => ({ chapterImage: () => undefined }));
vi.mock('../../lib/lexicon', () => ({ renderRich: (s: string) => s, renderInline: (s: string) => s }));
vi.mock('../../lib/useLexicon', () => ({ globalIndex: () => ({}) }));
vi.mock('../../state/store', () => ({
  state: { settings: { scheduler: { learningSteps: [1, 10], relearnSteps: [10], burySiblings: true } }, study: { cardSched: {} } },
  commit: vi.fn(),
}));

const { default: ReviewSession } = await import('./ReviewSession');

const card = (key: string, front: string): ReviewItem =>
  ({ key, source: 'engine', deck: 'D', card: { type: 'basic', front, back: 'answer' } }) as ReviewItem;

/** Reveal the answer, then press a grade button. */
async function gradeCard(label: string) {
  await act(async () => {
    screen.getByRole('button', { name: /Show answer/i }).click();
  });
  await act(async () => {
    screen.getByText(label).click();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-22T08:00:00Z'));
  gradeItemLive.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the one-minute card comes back inside the session', () => {
  it('Again on the only card → breather → the SAME card is on screen a minute later', async () => {
    render(<ReviewSession queue={[card('c1', 'What is haemostasis?')]} onExit={() => {}} />);
    expect(screen.getByText('What is haemostasis?')).toBeTruthy();

    await gradeCard('Again');

    // It has left the deck and the session must NOT declare itself finished.
    expect(screen.queryByText('What is haemostasis?')).toBeNull();
    expect(screen.queryByText('Session complete')).toBeNull();
    expect(screen.getByText(/quick breather/i)).toBeTruthy();

    // A minute passes. Nobody leaves, nobody re-enters.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61 * 1000);
    });

    expect(screen.getByText('What is haemostasis?')).toBeTruthy();
    expect(screen.queryByText(/quick breather/i)).toBeNull();
  });

  it('does not bring it back early', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A')]} onExit={() => {}} />);
    await gradeCard('Again');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 1000);
    });
    expect(screen.queryByText('Front A')).toBeNull();
    expect(screen.getByText(/quick breather/i)).toBeTruthy();
  });

  it('a graduated card does NOT come back, and the session completes', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A')]} onExit={() => {}} />);
    await gradeCard('Easy');

    expect(screen.getByText('Session complete')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * MIN);
    });
    expect(screen.queryByText('Front A')).toBeNull();
    expect(screen.getByText('Session complete')).toBeTruthy();
  });

  it('with other cards queued, the Again card returns after them — not lost', async () => {
    render(
      <ReviewSession queue={[card('c1', 'First card'), card('c2', 'Second card')]} onExit={() => {}} />
    );

    await gradeCard('Again'); // c1 owed in a minute
    expect(screen.getByText('Second card')).toBeTruthy(); // straight on to c2

    await gradeCard('Easy'); // c2 done for good

    // c1 is still owed, so this is a breather, not a finished session.
    expect(screen.queryByText('Session complete')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61 * 1000);
    });
    expect(screen.getByText('First card')).toBeTruthy();
  });

  it('grading it again re-queues it again — the loop does not run out', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A')]} onExit={() => {}} />);

    await gradeCard('Again');
    await act(async () => { await vi.advanceTimersByTimeAsync(61 * 1000); });
    expect(screen.getByText('Front A')).toBeTruthy();

    await gradeCard('Again'); // forgot it a second time
    expect(screen.queryByText('Front A')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(61 * 1000); });
    expect(screen.getByText('Front A')).toBeTruthy();
  });
});

describe('a due learning card is shown promptly, not parked behind the whole deck', () => {
  // The defect a student actually hits. Grade Again on card 1 of a real deck,
  // keep studying, and a minute later card 1 is due — but it used to sit in
  // `waiting` untouched, because the promotion timer only ran once the deck was
  // EMPTY, and even then the card was appended to the BACK. With 40 cards left
  // that is indistinguishable from "the card never came back".
  it('returns a minute later even though other cards are still queued', async () => {
    const deck = Array.from({ length: 6 }, (_, i) => card(`c${i}`, `Card ${i}`));
    render(<ReviewSession queue={deck} onExit={() => {}} />);

    expect(screen.getByText('Card 0')).toBeTruthy();
    await gradeCard('Again'); // Card 0 owed in a minute
    expect(screen.getByText('Card 1')).toBeTruthy();

    // The student keeps working. A minute passes while cards remain in the deck.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61 * 1000);
    });

    // Card 1 is still the one on screen — a timer must never swap the card the
    // student is currently looking at.
    expect(screen.getByText('Card 1')).toBeTruthy();

    // ...but the moment they answer it, the card they forgot is what comes next,
    // rather than waiting for the other four to be cleared first.
    await gradeCard('Easy');
    expect(screen.getByText('Card 0')).toBeTruthy();
  });
});

describe('suspending the card on screen', () => {
  it('takes it out of the session and moves on', async () => {
    render(<ReviewSession queue={[card('c1', 'Bad card'), card('c2', 'Good card')]} onExit={() => {}} />);
    expect(screen.getByText('Bad card')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: /Suspend/i }).click();
    });

    expect(screen.queryByText('Bad card')).toBeNull();
    expect(screen.getByText('Good card')).toBeTruthy();
  });

  it('does not come back on a timer — a suspended card is not a waiting one', async () => {
    render(<ReviewSession queue={[card('c1', 'Bad card')]} onExit={() => {}} />);
    await act(async () => {
      screen.getByRole('button', { name: /Suspend/i }).click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * MIN);
    });
    expect(screen.queryByText('Bad card')).toBeNull();
    expect(screen.getByText('Session complete')).toBeTruthy();
  });
});

describe('sibling cards are held back', () => {
  // One occluded diagram becomes many cards. Answering the second straight
  // after the first is copying, not recall — and it teaches the scheduler the
  // card is known when it is not.
  const region = (n: number): ReviewItem =>
    ({
      key: `user:heart#${n}`,
      source: 'user',
      deck: 'D',
      card: { type: 'occlusion', front: `Region ${n}`, back: 'answer' },
    }) as ReviewItem;

  it('the other regions of the same diagram do not come up this session', async () => {
    render(
      <ReviewSession queue={[region(0), region(1), region(2), card('other', 'Unrelated card')]} onExit={() => {}} />
    );
    expect(screen.getByText('Region 0')).toBeTruthy();

    await gradeCard('Good');

    // Regions 1 and 2 are held back; the unrelated card is untouched.
    expect(screen.queryByText('Region 1')).toBeNull();
    expect(screen.getByText('Unrelated card')).toBeTruthy();
  });

  it('leaves ordinary cards completely alone', async () => {
    render(<ReviewSession queue={[card('a', 'Card A'), card('b', 'Card B')]} onExit={() => {}} />);
    await gradeCard('Good');
    expect(screen.getByText('Card B')).toBeTruthy();
  });
});

describe('cram mode writes nothing', () => {
  // The whole promise of cram is that a student can go through a chapter the
  // night before an exam and their real schedule is untouched. If that promise
  // is broken it is broken silently — months of scheduling quietly reset.
  it('never calls the scheduler at all', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A'), card('c2', 'Front B')]} cram onExit={() => {}} />);

    await gradeCard('Good');
    await gradeCard('Again');

    expect(gradeItemLive).not.toHaveBeenCalled();
  });

  it('says plainly that it does not count', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A')]} cram onExit={() => {}} />);
    expect(screen.getByText(/Nothing you answer here changes your real schedule/i)).toBeTruthy();
  });

  it('still re-shows a card you got wrong — practice, not a slideshow', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A')]} cram onExit={() => {}} />);
    await gradeCard('Again');
    expect(screen.queryByText('Front A')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61 * 1000);
    });
    expect(screen.getByText('Front A')).toBeTruthy();
  });

  it('retires a card answered well, and finishes', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A')]} cram onExit={() => {}} />);
    await gradeCard('Easy');
    expect(screen.getByText('Cram complete')).toBeTruthy();
    expect(screen.getByText(/schedule is exactly as you left it/i)).toBeTruthy();
  });

  it('a normal session still DOES write — cram must not leak into it', async () => {
    render(<ReviewSession queue={[card('c1', 'Front A')]} onExit={() => {}} />);
    await gradeCard('Good');
    expect(gradeItemLive).toHaveBeenCalledTimes(1);
  });
});
