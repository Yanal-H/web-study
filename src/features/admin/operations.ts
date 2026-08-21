// The Admin Control Centre receives only aggregate operational counts. Student
// emails, notes, progress and other personal data never leave their own views.

import { supabase } from '../../lib/supabase';

export interface OperationalSnapshot {
  generatedAt: string;
  content: { published: number; drafts: number; archived: number; versions: number };
  community: { roster: number; claimed: number; waiting: number; openReports: number; activeDepartments: number; activeChannels: number };
}

export interface ContentDeliveryHealth {
  generatedAt: string;
  publishedChapters: number;
  sections: number;
  cards: number;
  mcqs: number;
  emqs: number;
  mnemonics: number;
  invalidChapters: number;
  duplicateCardIds: number;
  duplicateQuestionIds: number;
  latestPublishedAt: string | null;
  catalogFingerprint: string;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function parseSnapshot(value: unknown): OperationalSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const content = source.content as Record<string, unknown> | undefined;
  const community = source.community as Record<string, unknown> | undefined;
  if (!content || !community || typeof source.generatedAt !== 'string') return null;
  return {
    generatedAt: source.generatedAt,
    content: { published: count(content.published), drafts: count(content.drafts), archived: count(content.archived), versions: count(content.versions) },
    community: {
      roster: count(community.roster), claimed: count(community.claimed), waiting: count(community.waiting),
      openReports: count(community.openReports), activeDepartments: count(community.activeDepartments), activeChannels: count(community.activeChannels),
    },
  };
}

export function parseContentDeliveryHealth(value: unknown): ContentDeliveryHealth | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (typeof source.generatedAt !== 'string' || typeof source.catalogFingerprint !== 'string') return null;
  return {
    generatedAt: source.generatedAt,
    publishedChapters: count(source.publishedChapters),
    sections: count(source.sections),
    cards: count(source.cards),
    mcqs: count(source.mcqs),
    emqs: count(source.emqs),
    mnemonics: count(source.mnemonics),
    invalidChapters: count(source.invalidChapters),
    duplicateCardIds: count(source.duplicateCardIds),
    duplicateQuestionIds: count(source.duplicateQuestionIds),
    latestPublishedAt: typeof source.latestPublishedAt === 'string' ? source.latestPublishedAt : null,
    catalogFingerprint: source.catalogFingerprint,
  };
}

export async function getOperationalSnapshot(): Promise<{ ok: boolean; snapshot?: OperationalSnapshot; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured on this deployment.' };
  const { data, error } = await supabase.rpc('admin_operational_snapshot');
  if (error) {
    if (/admin_operational_snapshot|does not exist/i.test(error.message)) {
      return { ok: false, message: 'Run the Batch 6 Admin Control Centre SQL migration, then refresh.' };
    }
    return { ok: false, message: 'The operational snapshot could not be loaded. Check your session and Supabase configuration.' };
  }
  const snapshot = parseSnapshot(data);
  return snapshot ? { ok: true, snapshot } : { ok: false, message: 'The server returned an invalid operational snapshot.' };
}

export async function getContentDeliveryHealth(): Promise<{ ok: boolean; health?: ContentDeliveryHealth; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured on this deployment.' };
  const { data, error } = await supabase.rpc('admin_content_delivery_health');
  if (error) {
    if (/admin_content_delivery_health|does not exist/i.test(error.message)) {
      return { ok: false, message: 'Run the Batch 9 Content Delivery Health SQL migration, then refresh.' };
    }
    return { ok: false, message: 'Content delivery health could not be loaded. Check your administrator session.' };
  }
  const health = parseContentDeliveryHealth(data);
  return health ? { ok: true, health } : { ok: false, message: 'The server returned invalid content-delivery health data.' };
}
