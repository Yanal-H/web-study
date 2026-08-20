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
import { setLoadedChapters } from '../content/loader';
import { importPackIntoSession } from './importClient';
import { supabase } from '../lib/supabase';
import { clearContent, removeChapter } from './contentStore';
import { planContentSync, type ManifestRow } from './remoteContentPlan';

// Which chapters this SESSION has already downloaded. Deliberately a plain
// variable rather than localStorage: content lives in memory only, so a new page
// load starts with nothing and must download again. Persisting this would make
// the app think it holds chapters it no longer has.
let sessionManifest: Record<string, string> = {};
let syncInFlight: Promise<SyncReport> | null = null;
let lastSyncReport: SyncReport | null = null;
const PACK_BATCH_SIZE = 25;

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
  // The reader keeps a synchronous derived list; clear that too so a second
  // account on the same browser cannot see the previous session's titles/text.
  setLoadedChapters([]);
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
    .select('id, revision, updated_at')
    .eq('status', 'published');

  if (error || !rows) return { ...report, skipped: 'unreachable' };

  report.configured = true;
  const manifest = sessionManifest;
  const manifestRows = rows as ManifestRow[];
  const plan = planContentSync(manifestRows, manifest, PACK_BATCH_SIZE);
  const revisionById = new Map(manifestRows.map((row) => [row.id, row.revision]));

  // Fetch changed packs in bounded groups. The previous one-request-per-chapter
  // loop multiplied latency and Supabase request volume as the library grew.
  // Import remains sequential inside each group to cap transient mobile memory.
  for (const ids of plan.batches) {
    const { data: fullRows, error: packError } = await supabase
        .from('chapters')
        .select('id, revision, pack')
        .in('id', ids)
        .eq('status', 'published')
        .returns<Array<{ id: string; revision: string; pack: unknown }>>();

    if (packError || !fullRows) {
      report.failed.push(...ids);
      continue;
    }

    const returned = new Set(fullRows.map((row) => row.id));
    report.failed.push(...ids.filter((id) => !returned.has(id)));
    for (const full of fullRows) {
      try {
        const expectedRevision = revisionById.get(full.id);
        if (!expectedRevision || full.revision !== expectedRevision) throw new Error('revision changed during sync');
        const parsed = ChapterSchema.safeParse(full.pack);
        if (!parsed.success || parsed.data.id !== full.id) throw new Error('pack failed validation');
        await importPackIntoSession(parsed.data as Chapter);
        manifest[full.id] = full.revision;
        report.imported.push(full.id);
      } catch {
        report.failed.push(full.id);
      }
    }
  }

  // Chapters the server no longer carries.
  for (const id of plan.removed) {
    const cardIds = removeChapter(id);
    if (cardIds.length) {
      const { deleteKeys, SCHEDULING } = await import('./db');
      await deleteKeys(SCHEDULING, cardIds).catch(() => {});
    }
    delete manifest[id];
    report.removed.push(id);
  }

  if (report.failed.length === 0 && plan.seen.size > 0) {
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
