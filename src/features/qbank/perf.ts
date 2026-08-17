// MCQ performance store — ported from the shipped engine. Operates on the unified
// state.study.mcqPerf map keyed by STABLE question id, so existing data migrates
// with zero loss (schema v5 already established this shape).
import { state, commit } from '../../state/store';
import { deriveMastery } from '../../state/store';
import type { McqPerf } from '../../state/types';

const DAY_MS = 86400000;
const MCQ_BOX_DAYS = [0, 1, 3, 7, 16, 35];

export function blankPerf(): McqPerf {
  return {
    seen: 0,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    lastResult: null,
    lastAnswered: null,
    confidence: null,
    flagged: false,
    nextDue: 0,
    consecutiveCorrect: 0,
    mastery: 'new',
  };
}

export function getPerf(qid: string): McqPerf {
  return (state.study.mcqPerf[qid] as McqPerf) || blankPerf();
}

/** Record an attempt. Leitner-style spacing on the question; persists + notifies. */
export function recordResult(qid: string, ok: boolean, confidence?: number | null) {
  const p = state.study.mcqPerf[qid] || blankPerf();
  p.seen++;
  p.attempts++;
  if (ok) {
    p.correct++;
    p.consecutiveCorrect = (p.consecutiveCorrect || 0) + 1;
  } else {
    p.incorrect++;
    p.consecutiveCorrect = 0;
  }
  p.lastResult = ok;
  p.lastAnswered = Date.now();
  if (confidence != null) p.confidence = confidence;
  const box = Math.min(MCQ_BOX_DAYS.length - 1, p.consecutiveCorrect);
  p.nextDue = ok ? Date.now() + MCQ_BOX_DAYS[box]! * DAY_MS : Date.now() + 8 * 60 * 1000;
  p.mastery = deriveMastery(p);
  state.study.mcqPerf[qid] = p;
  commit();
}

export function toggleFlag(qid: string): boolean {
  const p = state.study.mcqPerf[qid] || blankPerf();
  p.flagged = !p.flagged;
  state.study.mcqPerf[qid] = p;
  commit();
  return p.flagged;
}
export function isFlagged(qid: string): boolean {
  return !!state.study.mcqPerf[qid]?.flagged;
}
export function isDue(qid: string): boolean {
  const p = state.study.mcqPerf[qid];
  return !p || !p.nextDue || p.nextDue <= Date.now();
}
export function isWeak(qid: string): boolean {
  const p = state.study.mcqPerf[qid];
  return !!(p && p.attempts >= 2 && p.correct / p.attempts < 0.6);
}
export function wasWrong(qid: string): boolean {
  const p = state.study.mcqPerf[qid];
  return !!(p && p.lastResult === false);
}
export function getNote(qid: string): string {
  return (state.study.mcqNotes || {})[qid] || '';
}
export function setNote(qid: string, text: string) {
  if (!state.study.mcqNotes) state.study.mcqNotes = {};
  state.study.mcqNotes[qid] = text;
  commit();
}
