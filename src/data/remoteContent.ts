// The shared-content overlay: chapters published after the build.
//
// Foundation ships its chapters inside the bundle, and that stays the base layer.
// This module adds an OPTIONAL overlay so the cohort can receive a new chapter
// without waiting for a redeploy. Everything here is written to be skippable:
//
//   - It never blocks boot. Bootstrap finishes on shipped content; this runs after.
//   - It never throws into the UI. Any failure leaves the app exactly as it was.
//   - It never deletes anything a student still needs. Packs already imported stay
//     until the server explicitly stops publishing them.
//   - Offline, it does nothing at all and the cached packs keep working, because
//     they were imported into IndexedDB the first time they arrived.
//
// The manifest of what we have imported lives in localStorage, so an offline boot
// still knows which chapters are "published" and must be protected from the
// shipped-set reconciliation (see reconcile.ts).

import type { Chapter } from '../content/schema';
import { ChapterSchema } from '../content/schema';
import { importPackOffThread } from './importClient';

const MANIFEST_KEY = 'foundation_published_v1';

/** What we have successfully imported: chapter id → revision published by the server. */
type LocalManifest = Record<string, string>;

export interface RemoteItem {
  id: string;
  revision: string;
  updatedAt: number;
}

export interface SyncReport {
  /** false when the server has no shared store configured — the normal, supported case. */
  configured: boolean;
  imported: string[];
  removed: string[];
  failed: string[];
  /** Set when the sync could not run at all (offline, server down). Not an error to show. */
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
 * Chapter ids that came from the shared store. Reconciliation must be told about
 * these or it will treat every published chapter as a removed shipped one and
 * delete it. Reads from localStorage so it is correct offline and synchronous.
 */
export function publishedIds(): Set<string> {
  return new Set(Object.keys(readManifest()));
}

/** True when this deployment has a shared store at all. Used to shape admin UI copy. */
export async function isSharedStoreConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/api/content', { method: 'GET' });
    if (!isJson(res)) return false;
    if (res.status === 503) return false;
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * A static host answers /api/content with index.html, not JSON. Treat anything
 * that is not JSON as "no backend here" rather than parsing HTML as a manifest.
 */
function isJson(res: Response): boolean {
  return (res.headers.get('content-type') || '').includes('application/json');
}

/**
 * Pull the published manifest and import anything new or changed.
 *
 * Only packs whose revision differs from what we already imported are fetched, so
 * a steady state costs one small request. Validation runs again client-side: the
 * server validates on publish, but a pack reaching IndexedDB unchecked would put
 * unvalidated material in front of a student, and content integrity is worth the
 * few milliseconds.
 */
export async function syncPublishedContent(): Promise<SyncReport> {
  const report: SyncReport = { configured: false, imported: [], removed: [], failed: [] };

  let items: RemoteItem[];
  try {
    const res = await fetch('/api/content', { method: 'GET' });
    if (!isJson(res) || res.status === 503) return { ...report, skipped: 'not-configured' };
    if (!res.ok) return { ...report, skipped: `http-${res.status}` };
    const data = (await res.json()) as { ok?: boolean; items?: RemoteItem[] };
    if (!data.ok || !Array.isArray(data.items)) return { ...report, skipped: 'bad-manifest' };
    items = data.items;
  } catch {
    // Offline or unreachable: keep whatever is already imported and say nothing.
    return { ...report, skipped: 'offline' };
  }

  report.configured = true;
  const manifest = readManifest();
  const seen = new Set<string>();

  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.revision !== 'string') continue;
    seen.add(item.id);
    if (manifest[item.id] === item.revision) continue; // already have this exact revision

    try {
      const res = await fetch(`/api/content?id=${encodeURIComponent(item.id)}`);
      if (!res.ok || !isJson(res)) throw new Error(`fetch failed (${res.status})`);
      const data = (await res.json()) as { ok?: boolean; pack?: unknown };
      if (!data.ok) throw new Error('server declined');

      const parsed = ChapterSchema.safeParse(data.pack);
      if (!parsed.success) throw new Error('pack failed validation');

      await importPackOffThread(parsed.data as Chapter);
      manifest[item.id] = item.revision;
      report.imported.push(item.id);
      // Record progress after each pack: a failure on pack 5 must not discard the
      // fact that packs 1-4 imported successfully.
      writeManifest(manifest);
    } catch {
      report.failed.push(item.id);
    }
  }

  // Packs the server no longer publishes: drop them from the manifest so the next
  // reconcile pass may clean their rows. Removal is deliberately manifest-only
  // here — deleting rows is reconcile.ts's job, and it runs against a fully
  // successful fetch, never a partial one.
  for (const id of Object.keys(manifest)) {
    if (!seen.has(id)) {
      delete manifest[id];
      report.removed.push(id);
    }
  }
  if (report.removed.length) writeManifest(manifest);

  return report;
}

/**
 * Run the sync in the background, after boot. Deliberately returns void and
 * swallows everything: a student mid-revision must never see a failure from an
 * optional overlay.
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
  else setTimeout(run, 2000);
}
