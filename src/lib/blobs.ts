// Offline file store: books, PDFs, slides and audio live in IndexedDB, never in
// localStorage (which holds the study state and is far too small for a textbook).
// Metadata and payload sit in separate object stores so listing a library of
// 500 MB of PDFs does not read a single byte of file data.

const DB_NAME = 'foundation_files_v1';
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
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

/** Guess a kind from the MIME type and file name. */
export function kindOf(name: string, type: string): FileKind {
  const n = name.toLowerCase();
  if (type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/.test(n)) return 'audio';
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
