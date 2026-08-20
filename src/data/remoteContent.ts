// Chapter content, downloaded fresh for a signed-in student each session.
//
// Chapters used to be compiled into the JavaScript bundle, so anyone who opened
// the URL held the whole library whether or not they got past the passphrase.
// They now live in a Supabase table behind row-level security: an
// unauthenticated request returns nothing.
//
// The app is ONLINE-ONLY by choice. Downloaded chapters go into memory (see
// contentStore.ts) and are gone when the tab closes, so no device keeps a copy
// of the material. The cost is a connection on every visit; the gain is that a
// borrowed, lost or resold phone carries nothing, and revoking an account is not
// undone by a stale offline copy.
//
// Personal data is untouched by any of this — scheduling, review history, notes
// and personal cards stay in IndexedDB and survive.
//
// Rules this module keeps:
//   - Never throw at the student. A failed sync leaves the session as it was.
//   - Never delete rows on a partial failure — see reconcile.ts for the sweep.

import type { Chapter } from '../content/schema';
import { ChapterSchema } from '../content/schema';
import { importPackIntoSession } from './importClient';
import { supabase } from '../lib/supabase';
import { clearContent } from './contentStore';

// Which chapters this SESSION has already downloaded. Deliberately a plain
// variable rather than localStorage: content lives in memory only, so a new page
// load starts with nothing and must download again. Persisting this would make
// the app think it holds chapters it no longer has.
let sessionManifest: Record<string, string> = {};
let syncInFlight: Promise<SyncReport> | null = null;
let lastSyncReport: SyncReport | null = null;

export interface RemoteItem {
  id: string;
  revision: string;
  updatedAt: number;
}

export interface SyncReport {
  /** false when this deployment has no Supabase project configured. */
  configured: boolean;
  imported: string[];
  removed: string[];
  failed: string[];
  /** Set when the sync could not run (offline, signed out). Not an error to show. */
  skipped?: string;
}


/**
 * Chapter ids this session has downloaded. Reconciliation sweeps rows that are
 * not in the current set, so without this it would treat every fetched chapter as
 * removed and delete material the student is revising from.
 */
export function publishedIds(): Set<string> {
  return new Set(Object.keys(sessionManifest));
}

/** True when this deployment has a content store at all. */
export function isSharedStoreConfigured(): boolean {
  return supabase !== null;
}

/**
 * Forget which revisions we hold, so the next sync re-downloads every chapter.
 * Used by "Re-import chapters". Card and scheduling rows are untouched — importing
 * overwrites content by id and never resets a student's progress.
 */
export function resetContentSync(): void {
  sessionManifest = {};
  lastSyncReport = null;
}

/** Drop every chapter from memory. Called on sign-out. */
export function forgetContent(): void {
  sessionManifest = {};
  lastSyncReport = null;
  clearContent();
}

/**
 * Download the chapters this session needs.
 *
 * The manifest query is tiny (ids and revisions). Packs whose revision this
 * session already holds are skipped, so a reload inside a live session costs
 * almost nothing — but a NEW session starts with empty memory and downloads
 * everything again, which is the deliberate trade for keeping nothing on disk.
 *
 * Content is validated on the way in as well as on publish: unvalidated material
 * reaching a student is a content-integrity problem, and it is worth the few
 * milliseconds to check twice.
 */
async function runPublishedContentSync(): Promise<SyncReport> {
  const report: SyncReport = { configured: false, imported: [], removed: [], failed: [] };
  if (!supabase) return { ...report, skipped: 'not-configured' };

  // Signed out: RLS would return nothing anyway, so do not even ask.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ...report, skipped: 'signed-out' };

  // Manifest first — id and revision only, never the pack bodies.
  const { data: rows, error } = await supabase
    .from('chapters')
    .select('id, revision, updated_at');

  if (error || !rows) return { ...report, skipped: 'unreachable' };

  report.configured = true;
  const manifest = sessionManifest;
  const seen = new Set<string>();

  for (const row of rows as Array<{ id: string; revision: string }>) {
    if (!row || typeof row.id !== 'string' || typeof row.revision !== 'string') continue;
    seen.add(row.id);
    if (manifest[row.id] === row.revision) continue; // already have this revision

    try {
      const { data: full, error: e2 } = await supabase
        .from('chapters')
        .select('pack')
        .eq('id', row.id)
        .single();
      if (e2 || !full) throw new Error('fetch failed');

      const parsed = ChapterSchema.safeParse((full as { pack: unknown }).pack);
      if (!parsed.success) throw new Error('pack failed validation');

      await importPackIntoSession(parsed.data as Chapter);
      manifest[row.id] = row.revision;
      report.imported.push(row.id);
    } catch {
      report.failed.push(row.id);
    }
  }

  // Chapters the server no longer carries.
  for (const id of Object.keys(manifest)) {
    if (!seen.has(id)) {
      delete manifest[id];
      report.removed.push(id);
    }
  }

  if (report.removed.length) {
    // Delete their rows too, so an unpublished chapter stops appearing in decks
    // and the due queue instead of lingering as ghost rows.
    //
    // Guarded on a CLEAN sync: if any chapter failed to download, the manifest is
    // an incomplete picture of what the server holds, and reconciling against it
    // would delete material that is still published. Better a ghost row until the
    // next sync than deleting a student's chapter by mistake.
    if (report.failed.length === 0) {
      try {
        const { reconcileShipped } = await import('./reconcile');
        const { rehydrateChapters } = await import('./bootstrap');
        await rehydrateChapters();
        const { listChapters } = await import('../content/loader');
        await reconcileShipped(listChapters() as Chapter[]);
      } catch {
        // Cleanup is housekeeping, never a correctness requirement.
      }
    }
  }

  if (report.failed.length === 0 && seen.size > 0) {
    const { purgeOrphanScheduling } = await import('./db');
    await purgeOrphanScheduling().catch(() => 0);
  }
  return report;
}

/** One shared sync at a time; every study surface waits on the same promise. */
export function syncPublishedContent(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runPublishedContentSync()
    .then((report) => {
      lastSyncReport = report;
      return report;
    })
    .finally(() => { syncInFlight = null; });
  return syncInFlight;
}

/** Resolve when this session's cards are actually present in page memory. */
export function whenPublishedContentReady(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight;
  if (lastSyncReport) return Promise.resolve(lastSyncReport);
  return syncPublishedContent();
}

/**
 * Run the sync in the background, after boot. Deliberately returns void and
 * swallows everything: a student mid-revision must never see a failure here.
 */
export function syncPublishedInBackground(onDone?: (r: SyncReport) => void): void {
  const run = () => {
    void syncPublishedContent()
      .then(async (r) => {
        if (r.imported.length || r.removed.length) {
          // New material changes deck counts and the due queue.
          const { invalidateDeckTree } = await import('./session');
          invalidateDeckTree();
        }
        onDone?.(r);
      })
      .catch(() => {});
  };
  const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
  if (win.requestIdleCallback) win.requestIdleCallback(run);
  else setTimeout(run, 1200);
}
