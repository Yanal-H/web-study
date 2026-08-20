// Administrator content lifecycle. The browser validates every candidate first,
// while Supabase RLS and RPCs remain the real authorisation/atomicity boundary.

import { ChapterSchema, formatZodError, type Chapter } from '../content/schema';
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
}

export interface RawPack {
  name: string;
  text: string;
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

function semanticIssues(pack: Chapter): string[] {
  const issues: string[] = [];
  const unique = (values: Array<string | undefined>, label: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (!value) { issues.push(`${label} needs a stable id.`); continue; }
      if (seen.has(value)) issues.push(`Duplicate ${label} id “${value}”.`);
      seen.add(value);
    }
  };
  const sectionIds = new Set(pack.sections.map((section) => section.id));
  unique(pack.sections.map((section) => section.id), 'section');
  unique(pack.cards.map((card) => card.id), 'flashcard');
  unique(pack.mcqs.map((question) => question.id), 'MCQ');
  unique(pack.emqs.map((question) => question.id), 'EMQ');
  for (const [index, card] of pack.cards.entries()) {
    if (card.sectionId && !sectionIds.has(card.sectionId)) issues.push(`cards.${index}.sectionId does not match a section.`);
  }
  for (const [index, question] of pack.mcqs.entries()) {
    if (question.sectionId && !sectionIds.has(question.sectionId)) issues.push(`mcqs.${index}.sectionId does not match a section.`);
    const optionIds = question.options.map((option) => option.id).filter(Boolean) as string[];
    if (new Set(optionIds).size !== optionIds.length) issues.push(`mcqs.${index} has duplicate option ids.`);
  }
  for (const [index, question] of pack.emqs.entries()) {
    if (question.sectionId && !sectionIds.has(question.sectionId)) issues.push(`emqs.${index}.sectionId does not match a section.`);
  }
  return issues;
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
    const check = ChapterSchema.safeParse(parsed);
    if (!check.success) {
      issues.push(...formatZodError(check.error).map((issue) => `${raw.name}: ${issue}`));
      continue;
    }
    issues.push(...semanticIssues(check.data).map((issue) => `${raw.name}: ${issue}`));
    packs.push(check.data);
  }
  const ids = new Set<string>();
  for (const pack of packs) {
    if (ids.has(pack.id)) issues.push(`The selected batch includes chapter “${pack.id}” more than once.`);
    ids.add(pack.id);
  }
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

/** Publish selected drafts in one server transaction. */
export async function publishDrafts(ids: string[]): Promise<PublishResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  const { data, error } = await supabase.rpc('publish_chapter_drafts', { p_ids: ids });
  if (error) return { ok: false, message: describeError(error.message) };
  return { ok: true, message: `Published ${Number(data) || ids.length} chapter${ids.length === 1 ? '' : 's'} for students.` };
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
