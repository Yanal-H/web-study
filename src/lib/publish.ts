// Publishing shared content — the owner's side of the shared-content store.
//
// Every call here is a request the SERVER re-authorises. Nothing in this file is
// a security boundary: it exists to give the owner a clear, honest interface and
// to report exactly what the server said, including refusals.

import { ChapterSchema, formatZodError } from '../content/schema';
import { adminToken, clearAdminToken } from './admin';
import type { RemoteItem } from '../data/remoteContent';

export interface PublishResult {
  ok: boolean;
  message: string;
  /** Validation problems, when the pack was rejected for being malformed. */
  issues?: string[];
}

function isJson(res: Response): boolean {
  return (res.headers.get('content-type') || '').includes('application/json');
}

/** Turn a server response into a message the owner can act on. */
async function describe(res: Response, okMessage: string): Promise<PublishResult> {
  if (!isJson(res)) {
    return { ok: false, message: 'The shared content store is not set up on this server yet.' };
  }
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; issues?: string[] }
    | null;

  if (res.ok && data?.ok) return { ok: true, message: okMessage };

  if (res.status === 401) {
    // The token expired or was rejected — make the owner unlock again rather than
    // leaving the UI claiming admin rights the server no longer honours.
    clearAdminToken();
    return { ok: false, message: 'Your admin session expired. Enter the admin key again.' };
  }
  if (res.status === 503) {
    return { ok: false, message: 'The shared content store is not set up on this server yet.' };
  }
  return {
    ok: false,
    message: data?.error || `The server refused that (${res.status}).`,
    issues: data?.issues,
  };
}

/** What is published right now. Public — no token needed. */
export async function listPublished(): Promise<{ configured: boolean; items: RemoteItem[] }> {
  try {
    const res = await fetch('/api/content');
    if (!isJson(res) || res.status === 503) return { configured: false, items: [] };
    const data = (await res.json()) as { ok?: boolean; items?: RemoteItem[] };
    return { configured: !!data.ok, items: data.items ?? [] };
  } catch {
    return { configured: false, items: [] };
  }
}

/**
 * Publish one chapter pack. Validated here first so an obviously broken file is
 * reported instantly with line-level detail, and validated again server-side so a
 * bad pack can never reach students even if this check is bypassed.
 */
export async function publishPack(rawJson: string): Promise<PublishResult> {
  const token = adminToken();
  if (!token) return { ok: false, message: 'Unlock admin with your key first.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, message: 'That file is not valid JSON.' };
  }

  const check = ChapterSchema.safeParse(parsed);
  if (!check.success) {
    return {
      ok: false,
      message: 'That pack did not pass validation, so it was not published.',
      issues: formatZodError(check.error),
    };
  }

  try {
    const res = await fetch('/api/content', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(check.data),
    });
    return await describe(res, `Published “${check.data.title}”. Students receive it on their next load.`);
  } catch {
    return { ok: false, message: 'Could not reach the server.' };
  }
}

/** Stop publishing a pack. Students keep what they already downloaded until they sync. */
export async function unpublishPack(id: string): Promise<PublishResult> {
  const token = adminToken();
  if (!token) return { ok: false, message: 'Unlock admin with your key first.' };
  try {
    const res = await fetch(`/api/content?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    return await describe(res, `Unpublished ${id}.`);
  } catch {
    return { ok: false, message: 'Could not reach the server.' };
  }
}
