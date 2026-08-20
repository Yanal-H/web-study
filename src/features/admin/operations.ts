// The Admin Control Centre receives only aggregate operational counts. Student
// emails, notes, progress and other personal data never leave their own views.

import { supabase } from '../../lib/supabase';

export interface OperationalSnapshot {
  generatedAt: string;
  content: { published: number; drafts: number; archived: number; versions: number };
  community: { roster: number; claimed: number; waiting: number; openReports: number; activeDepartments: number; activeChannels: number };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function parseSnapshot(value: unknown): OperationalSnapshot | null {
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
