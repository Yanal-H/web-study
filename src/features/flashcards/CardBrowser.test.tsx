import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// A large card bank, standing in for a full curriculum. Batch 6's regression:
// Browse used to hard-cap at 400 rows, so a card past that cut-off was simply
// unreachable — no search term could find it because it was never rendered.
const CARD_COUNT = 5000;
const cards = Array.from({ length: CARD_COUNT }, (_, i) => ({
  id: `c${i}`,
  chapterId: 'ch1',
  subject: 'Surgery',
  type: 'basic' as const,
  front: `Card ${String(i).padStart(4, '0')}`,
  back: 'Answer',
}));

vi.mock('../../content/loader', () => ({
  allCards: () => cards,
}));

vi.mock('../../state/useStore', () => ({
  useStore: () => ({ flashcards: [], study: { cardSched: {} } }),
  useStoreVersion: () => 0,
}));

vi.mock('../../state/store', () => ({ update: vi.fn() }));

const { default: CardBrowser } = await import('./CardBrowser');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CardBrowser — no cap, just a window', () => {
  it('does not render all 5000 rows at once', () => {
    const { container } = render(<CardBrowser onBack={() => {}} />);
    const rows = container.querySelectorAll('.list-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100); // a screenful plus overscan, not the whole bank
  });

  it('a card past the old 400-row cap is unreachable at first render, then appears on scroll', () => {
    const { container } = render(<CardBrowser onBack={() => {}} />);

    // Card 4990 sits well past where the old hard cap would have cut the list.
    expect(screen.queryByText('Card 4990')).toBeNull();

    const pane = container.querySelector('.list--virtual') as HTMLElement;
    expect(pane).toBeTruthy();

    // Scroll to where row 4990 would sit. jsdom doesn't lay out real scroll
    // metrics, so the windowing is driven entirely by the scrollTop the event
    // reports — exactly what a real scroll delivers to the onScroll handler.
    Object.defineProperty(pane, 'scrollTop', { value: 4990 * 72, writable: true });
    fireEvent.scroll(pane);

    expect(screen.getByText('Card 4990')).toBeTruthy();
  });

  it('the total count in the header reflects the whole bank, not a capped slice', () => {
    render(<CardBrowser onBack={() => {}} />);
    expect(screen.getByText(`${CARD_COUNT} cards across the library and your deck.`)).toBeTruthy();
  });

  it('search still narrows the (unwindowed) full set', () => {
    render(<CardBrowser onBack={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/^Search/), { target: { value: 'Card 0007' } });
    // Exactly one card's front contains this exact needle.
    expect(screen.getByText('Card 0007')).toBeTruthy();
  });
});
