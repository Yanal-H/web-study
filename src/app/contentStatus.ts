import type { SyncReport } from '../data/remoteContent';

export type ContentStatus = 'loading' | 'ready' | 'offline' | 'empty';

/**
 * Translate the latest authenticated catalog result into the one global banner
 * state. Keeping this pure prevents the publisher and the shell drifting apart.
 */
export function contentStatusAfterSync(
  report: Pick<SyncReport, 'skipped'> | null,
  chapterCount: number
): ContentStatus {
  if (!report || report.skipped === 'offline' || report.skipped === 'unreachable') {
    return chapterCount > 0 ? 'ready' : 'offline';
  }
  return chapterCount > 0 ? 'ready' : 'empty';
}

/** A same-session administrator publish has already updated the in-memory catalog. */
export function contentStatusForKnownCatalog(chapterCount: number): ContentStatus {
  return chapterCount > 0 ? 'ready' : 'empty';
}
