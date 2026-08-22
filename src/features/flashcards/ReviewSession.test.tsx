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
  state: { settings: { scheduler: { learningSteps: [1, 10], relearnSteps: [10] } }, study: { cardSched: {} } },
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
