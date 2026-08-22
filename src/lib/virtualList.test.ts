import { describe, it, expect } from 'vitest';
import { windowFor } from './virtualList';

describe('windowFor — the slice that actually needs to exist in the DOM', () => {
  it('renders everything when the list fits inside the viewport', () => {
    const w = windowFor(0, 500, 50, 8, 6);
    expect(w).toEqual({ start: 0, end: 8, topPad: 0, bottomPad: 0 });
  });

  it('starts at the top with an empty list', () => {
    expect(windowFor(0, 500, 50, 0)).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 });
  });

  it('windows a long list to only the rows near the viewport, plus overscan', () => {
    // 10,000 rows of 40px, scrolled 4000px in, a 400px-tall viewport.
    const w = windowFor(4000, 400, 40, 10_000, 6);
    // first visible row is 100; 400/40 = 10 visible rows; overscan 6 each side.
    expect(w.start).toBe(94);
    expect(w.end).toBe(116);
    expect(w.topPad).toBe(94 * 40);
    expect(w.bottomPad).toBe((10_000 - 116) * 40);
  });

  it('clamps the start at the top of the list rather than going negative', () => {
    const w = windowFor(0, 400, 40, 10_000, 6);
    expect(w.start).toBe(0);
    expect(w.topPad).toBe(0);
  });

  it('clamps the end at the bottom of the list rather than overrunning it', () => {
    // Scrolled to the very end of a short-ish list: 260 rows of 40px is
    // 10,400px tall, and a 400px viewport can show the last 10 rows.
    const w = windowFor(10_400, 400, 40, 260, 6);
    expect(w.end).toBe(260);
    expect(w.bottomPad).toBe(0);
  });

  it('is the reason a browsable card list has no upper limit', () => {
    // The regression this guards against: CardBrowser used to hard-cap at 400
    // rows, so anything past it was unreachable. A window over 50,000 rows
    // must still render only a small slice, never the whole list.
    const w = windowFor(0, 600, 60, 50_000, 6);
    expect(w.end - w.start).toBeLessThan(30);
    expect(w.end).toBeLessThanOrEqual(50_000);
  });

  it('treats a nonsense itemHeight or count as nothing to render, not a crash', () => {
    expect(windowFor(0, 400, 0, 100)).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 });
    expect(windowFor(0, 400, 40, -5)).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 });
  });

  it('treats a negative scrollTop as the top of the list', () => {
    const w = windowFor(-200, 400, 40, 100, 6);
    expect(w.start).toBe(0);
  });
});
