// Shared content store (Vercel Edge Function).
//
// This is what lets one cohort share one version of the material without a
// redeploy for every chapter: the owner publishes a pack here, and every
// student's app picks it up as an overlay on top of the chapters baked into the
// build.
//
// Shape of the contract:
//   GET    /api/content          → manifest: [{ id, revision, updatedAt }]
//   GET    /api/content?id=…     → one published pack
//   POST   /api/content          → publish/replace a pack   (admin token)
//   DELETE /api/content?id=…     → unpublish a pack         (admin token)
//
// Two rules this file exists to enforce:
//
//  1. NOTHING IS PUBLISHED UNVALIDATED. Every pack is parsed against the same
//     Zod schema the build-time validator uses, server-side, before it is
//     stored. A malformed pack is rejected here rather than reaching a student
//     mid-revision — medical content integrity is not a client-side concern.
//
//  2. WRITES ARE SERVER-GATED. Reads are public (students need them, and the
//     material is not secret), but publishing requires a token this server
//     signed. Flipping an `admin` flag in localStorage changes the UI and
//     nothing else.
//
// With no storage provisioned the endpoint answers 503 and the client falls
// back to shipped content — a supported configuration, not a failure.

import { ChapterSchema, formatZodError } from '../src/content/schema';
import { adminSecret, bearer, json, sameOrigin, verifyToken } from './_auth';
import { getStore, type StoredEntry } from './_store';

export const config = { runtime: 'edge' };

/** Reject absurd payloads before parsing; a chapter pack is comfortably under this. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Revision of a pack body — clients compare this to decide whether to re-import,
 * so it must change whenever the content does. FNV-1a over the canonical JSON,
 * matching the client-side scheme used for shipped packs.
 */
function revisionOf(body: unknown): string {
  const s = JSON.stringify(body);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function requireAdmin(req: Request): Promise<Response | null> {
  const secret = adminSecret();
  if (!secret) return json({ ok: false, error: 'Admin is not configured on this server.' }, 503);
  if (!sameOrigin(req)) return json({ ok: false, error: 'Cross-origin request refused.' }, 403);
  if (!(await verifyToken(secret, bearer(req)))) {
    return json({ ok: false, error: 'Not authorised. Unlock admin in Settings, then try again.' }, 401);
  }
  return null;
}

export default async function handler(req: Request): Promise<Response> {
  const store = getStore();
  if (!store) {
    return json(
      { ok: false, configured: false, error: 'Shared content is not set up on this server.' },
      503
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  try {
    /* ------------------------------------------------------------------ read */
    if (req.method === 'GET') {
      if (id) {
        const entry = await store.get(id);
        if (!entry) return json({ ok: false, error: 'No such published pack.' }, 404);
        // Revalidate rather than cache hard: a republished chapter should reach
        // students on their next load, and the client keeps its own offline copy.
        return json(
          { ok: true, pack: entry.body, revision: entry.revision, updatedAt: entry.updatedAt },
          200,
          { 'cache-control': 'public, max-age=0, must-revalidate' }
        );
      }
      const items = await store.list();
      items.sort((a, b) => a.id.localeCompare(b.id));
      return json({ ok: true, configured: true, items }, 200, {
        'cache-control': 'public, max-age=0, must-revalidate',
      });
    }

    /* --------------------------------------------------------------- publish */
    if (req.method === 'POST') {
      const denied = await requireAdmin(req);
      if (denied) return denied;

      const raw = await req.text();
      if (raw.length > MAX_BYTES) return json({ ok: false, error: 'Pack is too large.' }, 413);

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json({ ok: false, error: 'That file is not valid JSON.' }, 400);
      }

      // The gate that matters: same schema as the build-time validator.
      const result = ChapterSchema.safeParse(parsed);
      if (!result.success) {
        return json(
          { ok: false, error: 'That pack did not pass validation.', issues: formatZodError(result.error) },
          422
        );
      }

      const pack = result.data;
      const entry: StoredEntry = {
        id: pack.id,
        revision: revisionOf(pack),
        updatedAt: Date.now(),
        body: pack,
      };
      await store.put(entry);
      return json({ ok: true, id: entry.id, revision: entry.revision, updatedAt: entry.updatedAt });
    }

    /* ------------------------------------------------------------- unpublish */
    if (req.method === 'DELETE') {
      const denied = await requireAdmin(req);
      if (denied) return denied;
      if (!id) return json({ ok: false, error: 'Which pack? Pass ?id=…' }, 400);
      await store.del(id);
      return json({ ok: true, id });
    }

    return json({ ok: false, error: 'Method not allowed.' }, 405);
  } catch (e) {
    // Never leak internals to students; the operator sees the real error in logs.
    console.error('content store failed', e);
    return json({ ok: false, error: 'The content store could not be reached.' }, 502);
  }
}
