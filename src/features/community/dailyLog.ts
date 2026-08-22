// Daily study logs — what the cohort actually covered, collected.
//
// The chat channels are for conversation. A day's learning scattered through
// hundreds of messages cannot be turned into study material, which is exactly
// the problem this solves: one structured row per lecture, and a digest that
// reads a whole day back in one piece.
//
// The formatting below is pure so it can be tested without a network, and so
// the administrator's digest is reproducible rather than however the UI felt
// like rendering it that day.

import { supabase } from '../../lib/supabase';

export interface DailyLog {
  id: string;
  author_id: string;
  author_alias: string;
  log_date: string;
  academic_year: string | null;
  subject: string;
  topic: string;
  lecturer: string | null;
  body: string;
  created_at: string;
}

export interface NewDailyLog {
  subject: string;
  topic: string;
  lecturer?: string;
  body: string;
  logDate: string;
}

/** Today in the student's OWN timezone — a log filed at 1am is still today's. */
export function todayLocal(now: Date = new Date()): string {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

function describeError(message: string): string {
  if (/relation .* does not exist/i.test(message)) {
    return 'Daily logs are not set up yet. Ask the administrator to run supabase/community-daily-logs.sql.';
  }
  if (/row-level security|policy|permission/i.test(message)) {
    return 'You are not allowed to post that. Sign out and back in, then try again.';
  }
  return 'Could not save your log. Check your connection and try again.';
}

/** File one lecture. The server decides whether it is allowed; this only asks. */
export async function saveDailyLog(entry: NewDailyLog, alias: string, academicYear: string | null): Promise<SaveResult> {
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  const subject = entry.subject.trim();
  const topic = entry.topic.trim();
  const body = entry.body.trim();
  if (!subject || !topic || !body) {
    return { ok: false, message: 'Add the subject, the topic and what was covered.' };
  }

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { ok: false, message: 'You are signed out. Sign in and try again.' };

  const { error } = await supabase.from('community_daily_logs').insert({
    author_id: userId,
    author_alias: alias,
    log_date: entry.logDate,
    academic_year: academicYear,
    subject,
    topic,
    lecturer: entry.lecturer?.trim() || null,
    body,
  });
  if (error) return { ok: false, message: describeError(error.message) };
  return { ok: true, message: 'Logged. Thanks — this is what tomorrow’s material gets built from.' };
}

/** Every log filed for one day, newest first. */
export async function listDailyLogs(day: string): Promise<{ ok: boolean; logs: DailyLog[]; message?: string }> {
  if (!supabase) return { ok: false, logs: [], message: 'Sign-in is not set up on this deployment yet.' };
  const { data, error } = await supabase
    .from('community_daily_logs')
    .select('id,author_id,author_alias,log_date,academic_year,subject,topic,lecturer,body,created_at')
    .eq('log_date', day)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, logs: [], message: describeError(error.message) };
  return { ok: true, logs: (data ?? []) as DailyLog[] };
}

/* ------------------------------------------------------------ the digest */

export interface LogGroup {
  subject: string;
  topics: Array<{ topic: string; lecturer: string | null; entries: DailyLog[] }>;
}

/**
 * Group a day's logs by subject, then by topic. Pure.
 *
 * Several students report the same lecture, and their notes complement each
 * other — that is the value. Grouping puts every account of one topic together
 * instead of interleaving twelve subjects by whoever typed first.
 */
export function groupForDigest(logs: DailyLog[]): LogGroup[] {
  const bySubject = new Map<string, Map<string, { lecturer: string | null; entries: DailyLog[] }>>();
  for (const log of logs) {
    const subject = log.subject.trim() || 'Unfiled';
    const topic = log.topic.trim() || 'Untitled';
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const topics = bySubject.get(subject)!;
    if (!topics.has(topic)) topics.set(topic, { lecturer: log.lecturer, entries: [] });
    topics.get(topic)!.entries.push(log);
  }
  return [...bySubject.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subject, topics]) => ({
      subject,
      topics: [...topics.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([topic, v]) => ({ topic, lecturer: v.lecturer, entries: v.entries })),
    }));
}

/**
 * The whole day as one block of text, ready to paste into the chapter-authoring
 * prompt. This is the point of the feature: the administrator should not be
 * re-typing what the cohort already wrote.
 */
export function digestText(day: string, logs: DailyLog[]): string {
  if (logs.length === 0) return `No study logs were filed for ${day}.`;
  const groups = groupForDigest(logs);
  const lines: string[] = [
    `Study logs for ${day}`,
    `${logs.length} entr${logs.length === 1 ? 'y' : 'ies'} from ${new Set(logs.map((l) => l.author_id)).size} student(s)`,
    '',
  ];
  for (const group of groups) {
    lines.push(`## ${group.subject}`, '');
    for (const t of group.topics) {
      lines.push(`### ${t.topic}${t.lecturer ? ` — ${t.lecturer}` : ''}`);
      for (const e of t.entries) {
        lines.push(`- (${e.author_alias}) ${e.body.replace(/\s*\n\s*/g, ' ').trim()}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n').trim();
}
