// Leeches — the cards that eat a student's time.
//
// A leech is a card that keeps being forgotten. Anki's rule: every time a
// REVIEW card is failed, a lapse counter increases; at the threshold the note
// is tagged and the card suspended, and it is flagged again every half-threshold
// after that if the student chose only to tag rather than suspend.
//
// Foundation implemented this only in the SM-2+ path, so a student's own cards
// could become leeches and the content cards — the overwhelming majority of a
// medical deck — never could. A handful of cards nobody can remember then sit
// in the daily queue forever, crowding out material that would actually stick.
//
// Pure: it decides, it does not write. The callers persist.

/** What a lapse should cause, given the settings and the new lapse count. */
export type LeechVerdict =
  | { kind: 'none' }
  | { kind: 'tag' }
  | { kind: 'suspend' };

export interface LeechSettings {
  /** lapses before a card is called a leech; 0 disables leech handling */
  leechThreshold: number;
  /** 'suspend' takes it out of the queue; anything else only tags it */
  leechAction: string;
}

/**
 * Judge a card that has just lapsed.
 *
 * `lapses` is the count AFTER this failure. The threshold fires exactly on the
 * threshold and then every half-threshold beyond it, which is Anki's behaviour:
 * a card that stays bad keeps announcing itself rather than going quiet after
 * one warning. Half a threshold of 8 is 4, so 8, 12, 16 … all report.
 */
export function judgeLapse(lapses: number, s: LeechSettings): LeechVerdict {
  const threshold = Math.floor(s.leechThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return { kind: 'none' };
  if (lapses < threshold) return { kind: 'none' };

  const half = Math.max(1, Math.floor(threshold / 2));
  const isReportingLapse = lapses === threshold || (lapses - threshold) % half === 0;
  if (!isReportingLapse) return { kind: 'none' };

  return s.leechAction === 'suspend' ? { kind: 'suspend' } : { kind: 'tag' };
}

/** True once a card has lapsed enough times to be called a leech at all. */
export function isLeech(lapses: number, s: LeechSettings): boolean {
  const threshold = Math.floor(s.leechThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return lapses >= threshold;
}
