// Offline file store: books, PDFs, slides and audio live in IndexedDB, never in
// localStorage (which holds the study state and is far too small for a textbook).
// Metadata and payload sit in separate object stores so listing a library of
// 500 MB of PDFs does not read a single byte of file data.

import { scopedDatabaseName } from './storageScope';

export const FILE_DB_NAME = 'foundation_files_v1';
const DB_VERSION = 1;
const META = 'meta';
const DATA = 'data';

export type FileKind = 'book' | 'audio' | 'image' | 'other';

export interface FileMeta {
  id: string;
  name: string;
  /** MIME type as reported by the browser */
  type: string;
  size: number;
  kind: FileKind;
  added: number;
  note?: string;
  /** optional subject/tag grouping */
  tag?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so large files cannot be stored.'));
      return;
    }
    const req = indexedDB.open(scopedDatabaseName(FILE_DB_NAME), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) {
        const store = db.createObjectStore(META, { keyPath: 'id' });
        store.createIndex('kind', 'kind');
        store.createIndex('added', 'added');
      }
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Close the current account's file database before an account switch. */
export function resetFileConnection(): void {
  void dbPromise?.then((db) => db.close(), () => {});
  dbPromise = null;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const req = run(t);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.onabort = () => reject(t.error);
      })
  );
}

/** Containers a browser will decode audio from, including video containers. */
export const AUDIO_EXT =
  /\.(mp3|m4a|m4b|mp4|aac|adts|ogg|oga|opus|wav|wave|flac|weba|webm|mkv|mov|3gp|amr|wma|aiff?|caf)$/i;

/** Guess a kind from the MIME type and file name. */
export function kindOf(name: string, type: string): FileKind {
  const n = name.toLowerCase();
  if (type.startsWith('audio/') || AUDIO_EXT.test(n)) return 'audio';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(n)) return 'image';
  if (type === 'application/pdf' || /\.(pdf|epub|docx?|pptx?|txt|md)$/.test(n)) return 'book';
  return 'other';
}

let counter = 0;
function newId(): string {
  counter = (counter + 1) % 1e6;
  return `f${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Store a file. Returns its metadata record. */
export async function putFile(file: File, extra: Partial<FileMeta> = {}): Promise<FileMeta> {
  const meta: FileMeta = {
    id: extra.id || newId(),
    name: extra.name || file.name,
    type: file.type || '',
    size: file.size,
    kind: extra.kind || kindOf(file.name, file.type || ''),
    added: Date.now(),
    note: extra.note,
    tag: extra.tag,
  };
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([META, DATA], 'readwrite');
    t.objectStore(DATA).put(file, meta.id);
    t.objectStore(META).put(meta);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return meta;
}

/** Every stored file's metadata, newest first. */
export async function listFiles(kind?: FileKind): Promise<FileMeta[]> {
  const all = await tx<FileMeta[]>([META], 'readonly', (t) => t.objectStore(META).getAll() as IDBRequest<FileMeta[]>);
  const rows = kind ? all.filter((m) => m.kind === kind) : all;
  return rows.sort((a, b) => b.added - a.added);
}

export function getFileMeta(id: string): Promise<FileMeta | undefined> {
  return tx<FileMeta | undefined>([META], 'readonly', (t) => t.objectStore(META).get(id));
}

/** The stored payload, as a Blob. */
export function getBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>([DATA], 'readonly', (t) => t.objectStore(DATA).get(id));
}

export async function updateMeta(id: string, patch: Partial<FileMeta>): Promise<void> {
  const current = await getFileMeta(id);
  if (!current) return;
  await tx([META], 'readwrite', (t) => t.objectStore(META).put({ ...current, ...patch, id }));
}

export async function deleteFile(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([META, DATA], 'readwrite');
    t.objectStore(META).delete(id);
    t.objectStore(DATA).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Browser storage usage for this origin, when the browser reports it. */
export async function usage(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage ?? 0, quota: e.quota ?? 0 };
}

/** Ask the browser to keep this data even under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Hand a stored file to the browser as a download. */
export async function download(id: string, filename?: string): Promise<void> {
  const [meta, blob] = await Promise.all([getFileMeta(id), getBlob(id)]);
  if (!blob) throw new Error('That file is no longer stored on this device.');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || meta?.name || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}


/** MIME types worth asking the browser about, keyed by extension. */
const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
  m4b: 'audio/mp4',
  mp4: 'audio/mp4; codecs="mp4a.40.2"',
  aac: 'audio/aac',
  ogg: 'audio/ogg; codecs="vorbis"',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs="opus"',
  wav: 'audio/wav',
  flac: 'audio/flac',
  weba: 'audio/webm',
  webm: 'audio/webm; codecs="opus"',
  wma: 'audio/x-ms-wma',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
};

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1]! : '';
}

/**
 * Can this browser decode the file? Returns 'probably', 'maybe' or '' exactly as
 * canPlayType does — m4a and mp4 are AAC, which Chrome and Safari decode but a
 * codec-free Chromium build does not, and it is far better to say so up front
 * than to fail silently on play.
 */
export function canPlay(name: string, type: string): string {
  if (typeof document === 'undefined') return 'maybe';
  const el = document.createElement('audio');
  const guesses = [type, MIME_BY_EXT[extOf(name)]].filter(Boolean) as string[];
  for (const g of guesses) {
    const verdict = el.canPlayType(g);
    if (verdict) return verdict;
  }
  return '';
}

/**
 * Re-file anything whose name says audio but whose stored kind says otherwise.
 * Tracks added before the format list grew are sitting in the library invisible
 * to the player; this puts them back where they belong. Returns how many moved.
 */
export async function repairAudioKinds(): Promise<number> {
  const all = await listFiles();
  let moved = 0;
  for (const f of all) {
    if (f.kind !== 'audio' && (AUDIO_EXT.test(f.name) || f.type.startsWith('audio/'))) {
      await updateMeta(f.id, { kind: 'audio' });
      moved++;
    }
  }
  return moved;
}
