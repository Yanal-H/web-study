// Publishing chapters to the cohort — the owner's side of the content store.
//
// Nothing in this file is a security boundary. Whether a write is allowed is
// decided by the row-level security policy in the database, against the caller's
// real signed-in identity. This module exists to give a clear interface and to
// report exactly what the server said, including refusals.

import { ChapterSchema, formatZodError, type Chapter } from '../content/schema';
import { supabase } from './supabase';
import type { RemoteItem } from '../data/remoteContent';

export interface PublishResult {
  ok: boolean;
  message: string;
  /** Validation problems, when a pack was rejected for being malformed. */
  issues?: string[];
}

/**
 * Revision of a pack — students compare this to decide whether to re-download,
 * so it must change whenever the content does. FNV-1a over the canonical JSON.
 */
function revisionOf(pack: Chapter): string {
  const s = JSON.stringify(pack);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Turn a database error into something the owner can act on. */
function describeError(message: string): string {
  if (/row-level security|permission|policy/i.test(message)) {
    return 'Your account is not an administrator. Add your email to admin_emails() in the SQL setup.';
  }
  if (/jwt|expired|not authenticated/i.test(message)) {
    return 'Your session expired. Sign out and back in, then try again.';
  }
  if (/relation .* does not exist/i.test(message)) {
    return 'The chapters table does not exist yet. Run supabase/setup.sql first.';
  }
  return message;
}

/** What is published right now. Any signed-in student may read this. */
export async function listPublished(): Promise<{ configured: boolean; items: RemoteItem[] }> {
  if (!supabase) return { configured: false, items: [] };
  const { data, error } = await supabase
    .from('chapters')
    .select('id, revision, updated_at')
    .order('id');
  if (error || !data) return { configured: false, items: [] };
  return {
    configured: true,
    items: (data as Array<{ id: string; revision: string; updated_at: string }>).map((r) => ({
      id: r.id,
      revision: r.revision,
      updatedAt: Date.parse(r.updated_at) || 0,
    })),
  };
}

/**
 * Publish one chapter pack.
 *
 * Validated here so a broken file is reported instantly with line-level detail.
 * The database still decides whether this account may write at all.
 */
export async function publishPack(rawJson: string): Promise<PublishResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };

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

  const pack = check.data;
  const { error } = await supabase.from('chapters').upsert({
    id: pack.id,
    revision: revisionOf(pack),
    subject: pack.subject,
    title: pack.title,
    pack,
  });

  if (error) return { ok: false, message: describeError(error.message) };
  return {
    ok: true,
    message: `Published “${pack.title}”. Students receive it on their next load.`,
  };
}

/** Stop publishing a pack. Students keep what they already downloaded until they sync. */
export async function unpublishPack(id: string): Promise<PublishResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  const { error } = await supabase.from('chapters').delete().eq('id', id);
  if (error) return { ok: false, message: describeError(error.message) };
  return { ok: true, message: `Unpublished ${id}.` };
}
