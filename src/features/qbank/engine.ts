// MCQ/EMQ engine: pool building for every mode and a persisted session that
// survives a refresh. Operates on STABLE question ids from the content loader and
// the mcqPerf store. Source question data is never mutated.
import { state, commit } from '../../state/store';
import { allMcqs } from '../../content/loader';
import type { Mcq } from '../../content/schema';
import { isWeak, isFlagged, wasWrong, isDue } from './perf';

export type QMode = 'study' | 'practice' | 'exam' | 'cram';
export type Special = 'all' | 'weak' | 'flagged' | 'wrong' | 'due';

export interface PoolFilter {
  subjects?: string[];
  chapters?: string[];
  difficulties?: number[];
  special?: Special;
  shuffle?: boolean;
  limit?: number;
}

export interface AnswerRecord {
  chosen: string[]; // option ids
  correct: boolean;
  confidence?: number | null;
  timeMs?: number;
}

export interface McqSession {
  id: string;
  mode: QMode;
  ids: string[];
  index: number;
  answers: Record<string, AnswerRecord>;
  startedAt: number;
  timedEndsAt?: number; // whole-set timer (exam)
  perQSeconds?: number;
  /** Set before performance is committed, so re-opening results cannot double-count answers. */
  resultsCommittedAt?: number;
}

export type BankQuestion = Mcq & { chapterId: string; subject: string };

export function bank(): BankQuestion[] {
  return allMcqs() as BankQuestion[];
}

export function bankById(): Map<string, BankQuestion> {
  const m = new Map<string, BankQuestion>();
  for (const q of bank()) m.set(q.id, q);
  return m;
}

function shuffleInPlace<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Build an ordered list of question ids for the given filter. */
export function buildPool(filter: PoolFilter): string[] {
  let qs = bank();
  if (filter.subjects?.length) qs = qs.filter((q) => filter.subjects!.includes(q.subject));
  if (filter.chapters?.length) qs = qs.filter((q) => filter.chapters!.includes(q.chapterId));
  if (filter.difficulties?.length) qs = qs.filter((q) => filter.difficulties!.includes(q.difficulty));
  switch (filter.special) {
    case 'weak':
      qs = qs.filter((q) => isWeak(q.id));
      break;
    case 'flagged':
      qs = qs.filter((q) => isFlagged(q.id));
      break;
    case 'wrong':
      qs = qs.filter((q) => wasWrong(q.id));
      break;
    case 'due':
      qs = qs.filter((q) => isDue(q.id));
      break;
  }
  let ids = qs.map((q) => q.id);
  if (filter.shuffle) ids = shuffleInPlace(ids.slice());
  if (filter.limit && filter.limit > 0) ids = ids.slice(0, filter.limit);
  return ids;
}

export function poolCount(filter: PoolFilter): number {
  return buildPool({ ...filter, shuffle: false, limit: undefined }).length;
}

/* ---- SESSION (persisted in state.study.mcqSession; resumes after refresh) ---- */

export function startSession(mode: QMode, ids: string[], opts?: { perQSeconds?: number; totalSeconds?: number }): McqSession {
  const s: McqSession = {
    id: 'ses-' + Date.now().toString(36),
    mode,
    ids,
    index: 0,
    answers: {},
    startedAt: Date.now(),
    perQSeconds: opts?.perQSeconds,
    timedEndsAt: opts?.totalSeconds ? Date.now() + opts.totalSeconds * 1000 : undefined,
  };
  state.study.mcqSession = s;
  commit();
  return s;
}

export function getSession(): McqSession | null {
  return (state.study.mcqSession as McqSession) || null;
}

export function saveSession(s: McqSession) {
  state.study.mcqSession = s;
  commit();
}

export function endSession() {
  state.study.mcqSession = null;
  commit();
}

/** Is a chosen answer set correct for a question (order-insensitive, multi-safe)? */
export function isAnswerCorrect(q: Mcq, chosen: string[]): boolean {
  const correctIds = new Set(
    q.options.filter((o) => o.correct).map((o, i) => o.id || 'abcdefgh'[i]!)
  );
  const chosenSet = new Set(chosen);
  if (chosenSet.size !== correctIds.size) return false;
  for (const id of chosenSet) if (!correctIds.has(id)) return false;
  return true;
}

export interface SessionSummary {
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  byTag: Record<string, { correct: number; total: number }>;
  bySubject: Record<string, { correct: number; total: number }>;
  byChapter: Record<string, { correct: number; total: number }>;
  byDifficulty: Record<number, { correct: number; total: number }>;
  timeMs: number;
  /** mean time per answered question, ms */
  avgMs: number;
  /** slowest answered question and its time */
  slowest: { id: string; ms: number } | null;
  /** the ids the student got wrong, in session order */
  incorrectIds: string[];
}

export function summarise(s: McqSession): SessionSummary {
  const byId = bankById();
  let correct = 0;
  const byTag: SessionSummary['byTag'] = {};
  const bySubject: SessionSummary['bySubject'] = {};
  const byChapter: SessionSummary['byChapter'] = {};
  const byDifficulty: SessionSummary['byDifficulty'] = {};
  let timeMs = 0;
  let slowest: { id: string; ms: number } | null = null;
  const incorrectIds: string[] = [];
  const answered = Object.keys(s.answers);
  for (const qid of answered) {
    const a = s.answers[qid]!;
    const q = byId.get(qid);
    if (a.correct) correct++;
    else incorrectIds.push(qid);
    timeMs += a.timeMs || 0;
    if ((a.timeMs || 0) > (slowest?.ms ?? 0)) slowest = { id: qid, ms: a.timeMs || 0 };
    if (q) {
      const sub = q.subject || 'Other';
      bySubject[sub] = bySubject[sub] || { correct: 0, total: 0 };
      bySubject[sub].total++;
      if (a.correct) bySubject[sub].correct++;

      const ch = q.chapterId || 'Other';
      byChapter[ch] = byChapter[ch] || { correct: 0, total: 0 };
      byChapter[ch].total++;
      if (a.correct) byChapter[ch].correct++;

      const diff = q.difficulty || 1;
      byDifficulty[diff] = byDifficulty[diff] || { correct: 0, total: 0 };
      byDifficulty[diff].total++;
      if (a.correct) byDifficulty[diff].correct++;

      for (const t of q.tags || []) {
        byTag[t] = byTag[t] || { correct: 0, total: 0 };
        byTag[t].total++;
        if (a.correct) byTag[t].correct++;
      }
    }
  }
  // preserve session order for the incorrect list
  incorrectIds.sort((x, y) => s.ids.indexOf(x) - s.ids.indexOf(y));
  return {
    total: s.ids.length,
    answered: answered.length,
    correct,
    accuracy: answered.length ? correct / answered.length : 0,
    byTag,
    bySubject,
    byChapter,
    byDifficulty,
    timeMs,
    avgMs: answered.length ? timeMs / answered.length : 0,
    slowest,
    incorrectIds,
  };
}
