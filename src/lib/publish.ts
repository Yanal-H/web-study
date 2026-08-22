// Administrator content lifecycle. The browser validates every candidate first,
// while Supabase RLS and RPCs remain the real authorisation/atomicity boundary.

import type { Chapter } from '../content/schema';
import { normaliseContentDocument } from '../content/importFormats';
import { batchSemanticIssues } from '../content/validation';
import { supabase } from './supabase';

export type ContentStatus = 'draft' | 'published' | 'archived';

export interface ContentItem {
  id: string;
  revision: string;
  subject: string;
  title: string;
  status: ContentStatus;
  updatedAt: number;
}

export interface PublishResult {
  ok: boolean;
  message: string;
  issues?: string[];
  /** A successful publish is read back from the live table before confirmation. */
  verified?: boolean;
}

export interface RawPack {
  name: string;
  text: string;
}

/**
 * Give every card and question a permanent id before the chapter is stored.
 *
 * This is the most important thing this module does for a student's progress.
 * Card ids are optional when authoring, and an unlabelled card falls back to an
 * id built from its POSITION in the array (`chapter-card-004`). Insert one card
 * at the top of a chapter, re-publish, and every card below it shifts a slot —
 * so every id changes, every scheduling row is orphaned, and the whole chapter
 * comes back as brand new. A student loses months of progress and nothing
 * anywhere says so.
 *
 * Stamping at this boundary fixes the ids into the stored pack, so the next
 * edit — insert, delete, reorder — leaves every existing card's id untouched.
 *
 * The numbering deliberately reproduces the historical positional scheme for a
 * pack that carries no ids at all, so chapters already on students' devices keep
 * matching their existing scheduling rows. Cards added later take the first
 * unused slot rather than colliding with a stamped one.
 */
export function stampIds(pack: Chapter): Chapter {
  const stamp = <T extends { id?: string }>(rows: T[], kind: string): T[] => {
    const used = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
    let n = 0;
    return rows.map((r) => {
      if (r.id) return r;
      let id: string;
      do {
        n++;
        id = `${pack.id}-${kind}-${String(n).padStart(3, '0')}`;
      } while (used.has(id));
      used.add(id);
      return { ...r, id };
    });
  };
  return {
    ...pack,
    cards: stamp(pack.cards, 'card'),
    mcqs: stamp(pack.mcqs, 'mcq'),
    emqs: stamp(pack.emqs, 'emq'),
  };
}

function revisionOf(pack: Chapter): string {
  const s = JSON.stringify(pack);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function describeError(message: string): string {
  if (/row-level security|permission|policy|administrator access/i.test(message)) {
    return 'Your account is not an administrator. Check admin_emails() in Supabase, then sign out and back in.';
  }
  if (/jwt|expired|not authenticated/i.test(message)) {
    return 'Your session expired. Sign out and back in, then try again.';
  }
  if (/chapter_drafts|publish_chapter_drafts|archive_chapter|restore_chapter|column .*status/i.test(message)) {
    return 'Run the Batch 4 content-lifecycle SQL migration in Supabase, then try again.';
  }
  if (/relation .* does not exist/i.test(message)) {
    return 'The content tables do not exist yet. Run supabase/setup.sql and the migrations in order.';
  }
  return message;
}

function validateRawPacks(rawPacks: RawPack[]): { packs?: Chapter[]; issues?: string[] } {
  const packs: Chapter[] = [];
  const issues: string[] = [];
  for (const raw of rawPacks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.text);
    } catch {
      issues.push(`${raw.name}: not valid JSON.`);
      continue;
    }
    const check = normaliseContentDocument(parsed);
    if (!check.ok) {
      issues.push(...check.issues.map((issue) => `${raw.name}: ${issue}`));
      continue;
    }
    // Stamp before anything hashes or stores the pack, so the revision, the
    // stored row and every device's import all describe the SAME ids.
    packs.push(stampIds(check.chapter));
  }
  issues.push(...batchSemanticIssues(packs));
  return issues.length ? { issues } : { packs };
}

/** List draft, published, and archived records for the administrator. */
export async function listContent(): Promise<{ configured: boolean; ready: boolean; items: ContentItem[] }> {
  if (!supabase) return { configured: false, ready: false, items: [] };
  const [live, drafts] = await Promise.all([
    supabase.from('chapters').select('id,revision,subject,title,status,updated_at').order('id'),
    supabase.from('chapter_drafts').select('id,revision,subject,title,updated_at').order('id'),
  ]);
  if (live.error || drafts.error || !live.data || !drafts.data) return { configured: true, ready: false, items: [] };
  const fromRow = (row: { id: string; revision: string; subject: string | null; title: string | null; status?: string; updated_at: string }, status: ContentStatus): ContentItem => ({
    id: row.id,
    revision: row.revision,
    subject: row.subject || 'Uncategorised',
    title: row.title || row.id,
    status,
    updatedAt: Date.parse(row.updated_at) || 0,
  });
  return {
    configured: true,
    ready: true,
    items: [
      ...((drafts.data as Array<{ id: string; revision: string; subject: string | null; title: string | null; updated_at: string }>).map((row) => fromRow(row, 'draft'))),
      ...((live.data as Array<{ id: string; revision: string; subject: string | null; title: string | null; status: string; updated_at: string }>).map((row) => fromRow(row, row.status === 'archived' ? 'archived' : 'published'))),
    ].sort((a, b) => a.id.localeCompare(b.id) || a.status.localeCompare(b.status)),
  };
}

/** Validate the whole selection before one batch upsert into the private draft area. */
export async function stagePacks(rawPacks: RawPack[]): Promise<PublishResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  if (!rawPacks.length) return { ok: false, message: 'Choose at least one JSON pack.' };
  const checked = validateRawPacks(rawPacks);
  if (!checked.packs) return { ok: false, message: 'Nothing was saved: every selected pack must pass validation.', issues: checked.issues };
  const rows = checked.packs.map((pack) => ({
    id: pack.id, revision: revisionOf(pack), subject: pack.subject, title: pack.title, pack,
  }));
  const { error } = await supabase.from('chapter_drafts').upsert(rows);
  if (error) return { ok: false, message: describeError(error.message) };
  return { ok: true, message: `Saved ${rows.length} validated draft${rows.length === 1 ? '' : 's'}. Review and publish when ready.` };
}

/** Compatibility entry point for callers/tests that stage one pasted pack. */
export function publishPack(rawJson: string): Promise<PublishResult> {
  return stagePacks([{ name: 'Pasted chapter', text: rawJson }]);
}

export interface PublicationVerification {
  verified: boolean;
  missing: string[];
  unavailable: boolean;
}

/** Confirm selected ids are now visible in the published table for this admin. */
export async function verifyPublishedChapters(ids: string[]): Promise<PublicationVerification> {
  if (!supabase) return { verified: false, missing: ids, unavailable: true };
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { verified: true, missing: [], unavailable: false };
  const { data, error } = await supabase.from('chapters')
    .select('id')
    .in('id', unique)
    .eq('status', 'published');
  if (error || !data) return { verified: false, missing: unique, unavailable: true };
  const found = new Set((data as Array<{ id: string }>).map((row) => row.id));
  const missing = unique.filter((id) => !found.has(id));
  return { verified: missing.length === 0, missing, unavailable: false };
}

/** Publish selected drafts in one server transaction. */
export async function publishDrafts(ids: string[]): Promise<PublishResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { ok: false, message: 'Select at least one draft to publish.' };
  const { data, error } = await supabase.rpc('publish_chapter_drafts', { p_ids: unique });
  if (error) return { ok: false, message: describeError(error.message) };
  const rawCount = Number(data);
  const count = Number.isFinite(rawCount) && rawCount >= 0 ? Math.floor(rawCount) : 0;
  const verification = await verifyPublishedChapters(unique);
  if (verification.verified) {
    const transactionNote = count === unique.length ? '' : ` The transaction updated ${count}; all ${unique.length} selected chapters are live.`;
    return {
      ok: true,
      verified: true,
      message: `Published and verified ${unique.length} chapter${unique.length === 1 ? '' : 's'} for students.${transactionNote}`,
    };
  }
  if (verification.unavailable) {
    return {
      ok: true,
      verified: false,
      message: `The publish transaction updated ${count} chapter${count === 1 ? '' : 's'}, but the confirmation read was unavailable. Refresh the control centre before publishing again.`,
    };
  }
  return {
    ok: true,
    verified: false,
    message: `Publishing completed, but ${verification.missing.length} selected chapter${verification.missing.length === 1 ? '' : 's'} did not appear live. Do not republish; refresh and inspect delivery health.`,
  };
}

export async function archiveChapter(id: string): Promise<PublishResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  const { data, error } = await supabase.rpc('archive_chapter', { p_id: id });
  if (error) return { ok: false, message: describeError(error.message) };
  return data ? { ok: true, message: `Archived ${id}. Students will no longer receive it.` } : { ok: false, message: `${id} is already archived or unavailable.` };
}

export async function restoreChapter(id: string): Promise<PublishResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  const { data, error } = await supabase.rpc('restore_chapter', { p_id: id });
  if (error) return { ok: false, message: describeError(error.message) };
  return data ? { ok: true, message: `Restored ${id}. It is live for students again.` } : { ok: false, message: `${id} is already published or unavailable.` };
}
