// Windowed rendering for a long, uniform-height list.
//
// CardBrowser used to cap itself at 400 rows so a large card bank stayed
// scrollable — which meant any card past the cap was simply unreachable in
// Browse, with no way to find it except by guessing a search term that
// happened to narrow the list below the cap. For a shared cohort library that
// can hold thousands of cards, that is not a performance shortcut, it is cards
// nobody can open.
//
// This module is the pure arithmetic: given where the viewport is scrolled to,
// which slice of the list needs to actually exist in the DOM. It knows nothing
// about React or the DOM, so the windowing math is unit-tested directly rather
// than through a rendered component.

export interface ListWindow {
  /** first index to render (inclusive) */
  start: number;
  /** last index to render (exclusive) */
  end: number;
  /** empty space, in px, to reserve above the rendered slice */
  topPad: number;
  /** empty space, in px, to reserve below the rendered slice */
  bottomPad: number;
}

/**
 * Which slice of `count` uniform-height rows intersects the current
 * scroll position, padded by `overscan` rows on each side so a fast scroll or
 * a focus jump doesn't flash empty space before the next frame renders.
 */
export function windowFor(
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  count: number,
  overscan = 6
): ListWindow {
  if (count <= 0 || itemHeight <= 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 };

  const firstVisible = Math.floor(Math.max(0, scrollTop) / itemHeight);
  const visibleRows = Math.ceil(Math.max(0, viewportHeight) / itemHeight);

  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, firstVisible + visibleRows + overscan);

  return {
    start,
    end,
    topPad: start * itemHeight,
    bottomPad: Math.max(0, (count - end) * itemHeight),
  };
}
