// Chapter content, fetched for a signed-in student.
//
// This is where the security model actually bites. Chapters used to be compiled
// into the JavaScript bundle, which meant anyone who opened the URL had the whole
// library whether or not they got past the passphrase. Now they live in a
// Supabase table behind row-level security: an unauthenticated request returns
// nothing, so a visitor without an approved account gets an empty shell.
//
// Everything else about the app is unchanged. Once a pack has been fetched it is
// imported into IndexedDB, and from then on the reader, the due queue and search
// all work from the device with no network — so the app is still offline-first
// after the first signed-in load.
//
// Rules this module keeps:
//   - Never block the UI. Content arrives in the background.
//   - Never throw at the student. A failed sync leaves what they already have.
//   - Never delete rows on a partial failure — see reconcile.ts for the sweep.

import type { Chapter } from '../content/schema';
import { ChapterSchema } from '../content/schema';
import { importPackOffThread } from './importClient';
import { supabase } from '../lib/supabase';

const MANIFEST_KEY = 'foundation_published_v1';

/** What we have successfully imported: chapter id -> revision from the server. */
type LocalManifest = Record<string, string>;

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

function readManifest(): LocalManifest {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as LocalManifest) : {};
  } catch {
    return {};
  }
}

function writeManifest(m: LocalManifest): void {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(m));
  } catch {
    // A full quota must not break content that is already imported and working.
  }
}

/**
 * Chapter ids that came from the content store. Reconciliation sweeps rows that
 * are not in the *shipped* set, so without this it would treat every fetched
 * chapter as removed and delete material the student is revising from.
 * Reads localStorage so it is correct offline and synchronous.
 */
export function publishedIds(): Set<string> {
  return new Set(Object.keys(readManifest()));
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
  try {
    localStorage.removeItem(MANIFEST_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Fetch the manifest and import anything new or changed.
 *
 * Only packs whose revision differs from what we already hold are downloaded, so
 * a steady state costs one small query and no content transfer at all. That is
 * what keeps 1000 students inside a free tier.
 *
 * Content is validated client-side as well as on publish: a pack reaching
 * IndexedDB unchecked would put unvalidated material in front of a student, and
 * medical content integrity is worth the few milliseconds.
 */
export async function syncPublishedContent(): Promise<SyncReport> {
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
  const manifest = readManifest();
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

      await importPackOffThread(parsed.data as Chapter);
      manifest[row.id] = row.revision;
      report.imported.push(row.id);
      // Record after each pack: a failure on pack 5 must not discard the fact
      // that packs 1-4 imported successfully.
      writeManifest(manifest);
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
    writeManifest(manifest);
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

  return report;
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
