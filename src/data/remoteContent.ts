// Authenticated shared-content delivery. Sign-in downloads compact identities;
// full chapter bodies stay in Supabase until a study feature needs them.

import type { Chapter } from '../content/schema';
import { ChapterSchema } from '../content/schema';
import { setLoadedChapters } from '../content/loader';
import {
  catalogChapterIdsForDeck, catalogFromChapter, catalogMatchesChapter, clearContentCatalog,
  getCatalogChapter, isCatalogInitialized, listCatalogChapters, parseCatalogRows, setContentCatalog,
} from '../content/catalog';
import { importPackIntoSession } from './importClient';
import { seedScheduling } from './importPack';
import { supabase } from '../lib/supabase';
import { clearContent, chapters as memoryChapters, removeChapter } from './contentStore';
import { rehydrateChapters } from './bootstrap';
import { planContentSync, type ManifestRow } from './remoteContentPlan';
import { notify } from '../state/store';

let loadedManifest: Record<string, string> = {};
let syncInFlight: Promise<SyncReport> | null = null;
let bodySyncInFlight: Promise<BodyLoadReport> | null = null;
let lastSyncReport: SyncReport | null = null;
const PACK_BATCH_SIZE = 25;

export interface SyncReport {
  configured: boolean;
  catalogued: string[];
  imported: string[];
  removed: string[];
  failed: string[];
  skipped?: string;
  fallback?: boolean;
}

export interface BodyLoadReport { imported: string[]; failed: string[] }

const emptyReport = (): SyncReport => ({
  configured: false, catalogued: [], imported: [], removed: [], failed: [],
});

/** Published identities, whether or not their bodies have been opened yet. */
export function publishedIds(): Set<string> {
  const catalog = listCatalogChapters();
  return new Set(isCatalogInitialized() ? catalog.map((chapter) => chapter.id) : Object.keys(loadedManifest));
}

export function isSharedStoreConfigured(): boolean { return supabase !== null; }

export function resetContentSync(): void {
  loadedManifest = {};
  lastSyncReport = null;
  clearContentCatalog();
  clearContent();
  setLoadedChapters([]);
}

export function forgetContent(): void {
  loadedManifest = {};
  lastSyncReport = null;
  clearContentCatalog();
  clearContent();
  setLoadedChapters([]);
}

async function authenticated(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

/** Preferred path: one compact RPC, with no authored prose or answers. */
async function runCatalogSync(): Promise<SyncReport | null> {
  if (!supabase) return { ...emptyReport(), skipped: 'not-configured' };
  if (!(await authenticated())) return { ...emptyReport(), skipped: 'signed-out' };
  const { data, error } = await supabase.rpc('published_chapter_catalog');
  // Frontend-first deployments remain usable until the SQL migration lands.
  if (error || !Array.isArray(data)) return null;
  const entries = parseCatalogRows(data);
  if (entries.length !== data.length) return null;

  const previousEntries = listCatalogChapters();
  const previousById = new Map(previousEntries.map((chapter) => [chapter.id, chapter]));
  const previous = new Set(previousById.keys());
  const next = new Set(entries.map((chapter) => chapter.id));
  const removed = [...previous].filter((id) => !next.has(id));
  const changed = entries.filter((chapter) => previousById.get(chapter.id)?.revision !== chapter.revision);
  const nextById = new Map(entries.map((chapter) => [chapter.id, chapter]));
  for (const [id, revision] of Object.entries(loadedManifest)) {
    const entry = nextById.get(id);
    if (!entry || entry.revision !== revision) {
      removeChapter(id);
      delete loadedManifest[id];
    }
  }

  setContentCatalog(entries);
  if (changed.length || removed.length) {
    await seedScheduling(changed.flatMap((chapter) => chapter.cards));
    const { purgeOrphanScheduling } = await import('./db');
    await purgeOrphanScheduling().catch(() => 0);
    await rehydrateChapters();
    const { invalidateDeckTree } = await import('./session');
    invalidateDeckTree();
    notify();
  }
  return {
    configured: true, catalogued: entries.map((chapter) => chapter.id),
    imported: [], removed, failed: [],
  };
}

/** Compatibility path used when the catalog SQL has not been deployed. */
async function runLegacySync(): Promise<SyncReport> {
  const report = { ...emptyReport(), fallback: true };
  if (!supabase) return { ...report, skipped: 'not-configured' };
  if (!(await authenticated())) return { ...report, skipped: 'signed-out' };
  const { data: rows, error } = await supabase.from('chapters')
    .select('id, revision, updated_at').eq('status', 'published');
  if (error || !rows) return { ...report, skipped: 'unreachable' };
  report.configured = true;

  const manifestRows = rows as ManifestRow[];
  const plan = planContentSync(manifestRows, loadedManifest, PACK_BATCH_SIZE);
  const revisionById = new Map(manifestRows.map((row) => [row.id, row.revision]));
  for (const ids of plan.batches) {
    const { data: fullRows, error: packError } = await supabase.from('chapters')
      .select('id, revision, pack').in('id', ids).eq('status', 'published')
      .returns<Array<{ id: string; revision: string; pack: unknown }>>();
    if (packError || !fullRows) { report.failed.push(...ids); continue; }
    const returned = new Set(fullRows.map((row) => row.id));
    report.failed.push(...ids.filter((id) => !returned.has(id)));
    for (const full of fullRows) {
      try {
        const parsed = ChapterSchema.safeParse(full.pack);
        if (full.revision !== revisionById.get(full.id) || !parsed.success || parsed.data.id !== full.id) {
          throw new Error('invalid or changed pack');
        }
        await importPackIntoSession(parsed.data as Chapter);
        loadedManifest[full.id] = full.revision;
        report.imported.push(full.id);
      } catch { report.failed.push(full.id); }
    }
  }
  for (const id of plan.removed) {
    removeChapter(id);
    delete loadedManifest[id];
    report.removed.push(id);
  }

  const entries = memoryChapters.all().flatMap((row) => {
    const parsed = ChapterSchema.safeParse(row.pack);
    return parsed.success ? [catalogFromChapter(parsed.data, loadedManifest[parsed.data.id])] : [];
  });
  setContentCatalog(entries);
  report.catalogued = entries.map((chapter) => chapter.id);
  const { purgeOrphanScheduling } = await import('./db');
  await purgeOrphanScheduling().catch(() => 0);
  await rehydrateChapters();
  notify();
  return report;
}

async function runPublishedContentSync(): Promise<SyncReport> {
  try { return (await runCatalogSync()) ?? (await runLegacySync()); }
  catch { return { ...emptyReport(), skipped: 'unreachable' }; }
}

export function syncPublishedContent(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runPublishedContentSync().then((report) => {
    lastSyncReport = report;
    return report;
  }).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

/** Catalog readiness only; chapter bodies remain lazy. */
export function whenPublishedContentReady(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight;
  if (lastSyncReport) return Promise.resolve(lastSyncReport);
  return syncPublishedContent();
}

async function runBodyLoad(ids: string[]): Promise<BodyLoadReport> {
  const report: BodyLoadReport = { imported: [], failed: [] };
  if (!supabase || !(await authenticated())) return { ...report, failed: ids };
  const needed = [...new Set(ids)].filter((id) => {
    const entry = getCatalogChapter(id);
    return entry && loadedManifest[id] !== entry.revision;
  });
  for (let offset = 0; offset < needed.length; offset += PACK_BATCH_SIZE) {
    const batch = needed.slice(offset, offset + PACK_BATCH_SIZE);
    const { data, error } = await supabase.from('chapters')
      .select('id, revision, pack').in('id', batch).eq('status', 'published')
      .returns<Array<{ id: string; revision: string; pack: unknown }>>();
    if (error || !data) { report.failed.push(...batch); continue; }
    const returned = new Set(data.map((row) => row.id));
    report.failed.push(...batch.filter((id) => !returned.has(id)));
    for (const row of data) {
      try {
        const entry = getCatalogChapter(row.id);
        const parsed = ChapterSchema.safeParse(row.pack);
        if (!entry || row.revision !== entry.revision || !parsed.success
          || parsed.data.id !== row.id || !catalogMatchesChapter(entry, parsed.data)) {
          throw new Error('invalid or changed pack');
        }
        await importPackIntoSession(parsed.data);
        loadedManifest[row.id] = row.revision;
        report.imported.push(row.id);
      } catch { report.failed.push(row.id); }
    }
  }
  if (report.imported.length) {
    await rehydrateChapters();
    const { invalidateDeckTree } = await import('./session');
    invalidateDeckTree();
    notify();
  }
  return report;
}

/** Load requested bodies, serialising concurrent feature requests. */
export async function ensureChapterBodies(ids: string[]): Promise<BodyLoadReport> {
  await whenPublishedContentReady();
  if (bodySyncInFlight) {
    await bodySyncInFlight;
    return ensureChapterBodies(ids);
  }
  bodySyncInFlight = runBodyLoad(ids).finally(() => { bodySyncInFlight = null; });
  return bodySyncInFlight;
}

export function ensureChapterBody(id: string): Promise<BodyLoadReport> {
  return ensureChapterBodies([id]);
}

export async function ensureDeckContent(deck: string): Promise<BodyLoadReport> {
  await whenPublishedContentReady();
  return ensureChapterBodies(catalogChapterIdsForDeck(deck));
}

export type ContentKind = 'cards' | 'questions' | 'mnemonics' | 'all';

export async function ensureContentKind(kind: ContentKind): Promise<BodyLoadReport> {
  await whenPublishedContentReady();
  const ids = listCatalogChapters().filter((chapter) => kind === 'all'
    || (kind === 'cards' && chapter.counts.cards > 0)
    || (kind === 'questions' && chapter.counts.mcqs + chapter.counts.emqs > 0)
    || (kind === 'mnemonics' && chapter.counts.mnemonics > 0))
    .map((chapter) => chapter.id);
  return ensureChapterBodies(ids);
}

export function syncPublishedInBackground(onDone?: (report: SyncReport) => void): void {
  const run = () => void syncPublishedContent().then(onDone).catch(() => {});
  const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
  if (win.requestIdleCallback) win.requestIdleCallback(run);
  else setTimeout(run, 1200);
}
