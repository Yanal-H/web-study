// Storage adapter for the shared-content store (Vercel Edge runtime).
//
// Foundation ships its chapters inside the build, and that stays the base layer:
// the app works fully offline with no server at all. This adapter backs the
// OPTIONAL overlay of content published after the build — so a chapter can be
// added without a redeploy.
//
// It deliberately supports more than one backing store and picks whichever the
// deployment actually has, because the alternative is forcing a particular paid
// add-on on a project that may never need one:
//
//   - Vercel Blob   — set BLOB_READ_WRITE_TOKEN
//   - Vercel KV / Upstash Redis — set KV_REST_API_URL + KV_REST_API_TOKEN
//   - neither       — "not configured": every call reports it, the API answers
//                     503, and the client quietly falls back to shipped content.
//
// "Not configured" is a SUPPORTED state, not an error to paper over. Nothing in
// the app may regress because no storage was provisioned.
//
// Both drivers are plain fetch against a documented REST endpoint, so this adds
// no npm dependency and no third-party code to the bundle.

export interface StoredEntry {
  id: string;
  /** Opaque revision of the pack body, used by clients to skip unchanged packs. */
  revision: string;
  updatedAt: number;
  /** The pack itself, as authored JSON. */
  body: unknown;
}

export interface StoreDriver {
  readonly name: 'blob' | 'kv';
  get(id: string): Promise<StoredEntry | null>;
  put(entry: StoredEntry): Promise<void>;
  del(id: string): Promise<void>;
  /** Manifest rows only — never loads pack bodies. */
  list(): Promise<Array<Omit<StoredEntry, 'body'>>>;
}

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

/** Key prefix so shared content can never collide with other data in the store. */
const PREFIX = 'foundation/content/';
const INDEX_KEY = 'foundation/content-index';

const key = (id: string) => PREFIX + encodeURIComponent(id);

/* ------------------------------------------------------------------ KV / Upstash */

// Upstash's REST API is also what Vercel KV exposes, so one driver serves both.
function kvDriver(url: string, token: string): StoreDriver {
  const call = async (command: unknown[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`KV request failed (${res.status})`);
    const data = (await res.json()) as { result?: unknown };
    return data.result ?? null;
  };

  const parse = (raw: unknown): StoredEntry | null => {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      return JSON.parse(raw) as StoredEntry;
    } catch {
      return null;
    }
  };

  return {
    name: 'kv',
    async get(id) {
      return parse(await call(['GET', key(id)]));
    },
    async put(entry) {
      await call(['SET', key(entry.id), JSON.stringify(entry)]);
      // The index carries manifest rows only, so listing never loads bodies.
      const row = { id: entry.id, revision: entry.revision, updatedAt: entry.updatedAt };
      await call(['HSET', INDEX_KEY, entry.id, JSON.stringify(row)]);
    },
    async del(id) {
      await call(['DEL', key(id)]);
      await call(['HDEL', INDEX_KEY, id]);
    },
    async list() {
      const raw = await call(['HGETALL', INDEX_KEY]);
      const rows: Array<Omit<StoredEntry, 'body'>> = [];
      // Upstash returns HGETALL as a flat [field, value, field, value, …] array.
      if (Array.isArray(raw)) {
        for (let i = 1; i < raw.length; i += 2) {
          try {
            rows.push(JSON.parse(String(raw[i])));
          } catch {
            /* skip an unreadable row rather than fail the whole manifest */
          }
        }
      } else if (raw && typeof raw === 'object') {
        for (const v of Object.values(raw as Record<string, string>)) {
          try {
            rows.push(JSON.parse(v));
          } catch {
            /* ditto */
          }
        }
      }
      return rows;
    },
  };
}

/* ---------------------------------------------------------------------- Blob */

function blobDriver(token: string): StoreDriver {
  const API = 'https://blob.vercel-storage.com';
  const auth = { authorization: `Bearer ${token}` };

  // Blob is content-addressed by pathname; we read back through the public URL
  // recorded in the listing rather than guessing it.
  const urlFor = async (path: string): Promise<string | null> => {
    const res = await fetch(`${API}?prefix=${encodeURIComponent(path)}&limit=1`, { headers: auth });
    if (!res.ok) return null;
    const data = (await res.json()) as { blobs?: Array<{ pathname: string; url: string }> };
    const hit = data.blobs?.find((b) => b.pathname === path);
    return hit?.url ?? null;
  };

  return {
    name: 'blob',
    async get(id) {
      const url = await urlFor(key(id));
      if (!url) return null;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      try {
        return (await res.json()) as StoredEntry;
      } catch {
        return null;
      }
    },
    async put(entry) {
      const res = await fetch(`${API}/${key(entry.id)}`, {
        method: 'PUT',
        headers: {
          ...auth,
          'content-type': 'application/json',
          'x-add-random-suffix': '0',
          'x-allow-overwrite': '1',
        },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error(`Blob write failed (${res.status})`);
    },
    async del(id) {
      const url = await urlFor(key(id));
      if (!url) return;
      const res = await fetch(`${API}/delete`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ urls: [url] }),
      });
      if (!res.ok) throw new Error(`Blob delete failed (${res.status})`);
    },
    async list() {
      const res = await fetch(`${API}?prefix=${encodeURIComponent(PREFIX)}&limit=1000`, { headers: auth });
      if (!res.ok) throw new Error(`Blob list failed (${res.status})`);
      const data = (await res.json()) as {
        blobs?: Array<{ pathname: string; url: string; uploadedAt?: string }>;
      };
      const blobs = data.blobs ?? [];
      // Blob has no metadata field we can list cheaply, so fetch the small entries
      // in parallel. Manifests are per-chapter, so this stays a modest number.
      const rows = await Promise.all(
        blobs.map(async (b) => {
          try {
            const r = await fetch(b.url, { cache: 'no-store' });
            if (!r.ok) return null;
            const e = (await r.json()) as StoredEntry;
            return { id: e.id, revision: e.revision, updatedAt: e.updatedAt };
          } catch {
            return null;
          }
        })
      );
      return rows.filter((r): r is Omit<StoredEntry, 'body'> => r !== null);
    },
  };
}

/* -------------------------------------------------------------------- select */

/**
 * The driver this deployment is configured for, or null when none is — in which
 * case callers must answer 503 rather than pretend a write succeeded.
 */
export function getStore(): StoreDriver | null {
  const kvUrl = env('KV_REST_API_URL');
  const kvToken = env('KV_REST_API_TOKEN');
  if (kvUrl && kvToken) return kvDriver(kvUrl, kvToken);

  const blobToken = env('BLOB_READ_WRITE_TOKEN');
  if (blobToken) return blobDriver(blobToken);

  return null;
}
