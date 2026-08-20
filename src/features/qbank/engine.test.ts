import { describe, expect, it, beforeEach } from 'vitest';
import { state } from '../../state/store';
import { buildPool, poolCount, isAnswerCorrect, startSession, getSession, saveSession, endSession, bank } from './engine';
import { recordResult, toggleFlag } from './perf';
import type { Mcq } from '../../content/schema';
import { loadTestContent } from '../../test/content';

loadTestContent();

beforeEach(() => {
  localStorage.clear();
  state.study.mcqPerf = {};
  state.study.mcqSession = null;
});

describe('MCQ pool building', () => {
  it('pools the full shipped bank and filters by difficulty', () => {
    const all = poolCount({ special: 'all' });
    expect(all).toBeGreaterThanOrEqual(45);
    const easy = buildPool({ difficulties: [1] });
    const hard = buildPool({ difficulties: [3] });
    expect(easy.length).toBeGreaterThan(0);
    expect(hard.length).toBeGreaterThan(0);
    expect(easy.length + hard.length).toBeLessThan(all);
  });

  it('filters by subject and chapter', () => {
    const surgery = buildPool({ subjects: ['Surgery'] });
    expect(surgery.length).toBeGreaterThan(0);
    const none = buildPool({ subjects: ['Nonexistent'] });
    expect(none).toHaveLength(0);
  });

  it('builds weak / wrong / flagged / due pools from perf', () => {
    const ids = bank().map((q) => q.id);
    const q0 = ids[0]!;
    const q1 = ids[1]!;
    // q0: answered wrong twice → weak + wrong
    recordResult(q0, false);
    recordResult(q0, false);
    // q1: flagged
    toggleFlag(q1);
    expect(buildPool({ special: 'weak' })).toContain(q0);
    expect(buildPool({ special: 'wrong' })).toContain(q0);
    expect(buildPool({ special: 'flagged' })).toEqual([q1]);
    // due includes untouched questions
    expect(buildPool({ special: 'due' }).length).toBeGreaterThan(0);
  });

  it('does not count a restored results commit twice', () => {
    const qid = bank()[0]!.id;
    expect(recordResult(qid, true, null, 'session-1:' + qid)).toBe(true);
    expect(recordResult(qid, true, null, 'session-1:' + qid)).toBe(false);
    expect(state.study.mcqPerf[qid]!.attempts).toBe(1);
    expect(recordResult(qid, true, null, 'session-2:' + qid)).toBe(true);
    expect(state.study.mcqPerf[qid]!.attempts).toBe(2);
  });

  it('respects limit and shuffle keeps the same set', () => {
    const limited = buildPool({ limit: 5 });
    expect(limited).toHaveLength(5);
    const a = buildPool({ shuffle: false });
    const b = buildPool({ shuffle: true });
    expect(new Set(b)).toEqual(new Set(a)); // same members, possibly reordered
  });
});

describe('answer correctness (single + multi)', () => {
  const single: Mcq = {
    id: 'x',
    type: 'single',
    difficulty: 1,
    stem: 's',
    options: [
      { id: 'a', text: 'a', correct: true },
      { id: 'b', text: 'b', correct: false },
    ],
    explanation: [],
    keyFacts: [],
  };
  const multi: Mcq = {
    id: 'y',
    type: 'multi',
    difficulty: 2,
    stem: 's',
    options: [
      { id: 'a', text: 'a', correct: true },
      { id: 'b', text: 'b', correct: true },
      { id: 'c', text: 'c', correct: false },
    ],
    explanation: [],
    keyFacts: [],
  };
  it('single: exact match', () => {
    expect(isAnswerCorrect(single, ['a'])).toBe(true);
    expect(isAnswerCorrect(single, ['b'])).toBe(false);
  });
  it('multi: needs the full correct set, order-insensitive', () => {
    expect(isAnswerCorrect(multi, ['b', 'a'])).toBe(true);
    expect(isAnswerCorrect(multi, ['a'])).toBe(false); // partial
    expect(isAnswerCorrect(multi, ['a', 'b', 'c'])).toBe(false); // extra wrong
  });
});

describe('session persistence / resume', () => {
  it('persists a session and resumes it from storage', () => {
    const ids = buildPool({ limit: 3 });
    const s = startSession('study', ids);
    s.index = 2;
    s.answers[ids[0]!] = { chosen: ['a'], correct: true };
    saveSession(s);
    // simulate a fresh read
    const resumed = getSession();
    expect(resumed).toBeTruthy();
    expect(resumed!.index).toBe(2);
    expect(resumed!.ids).toEqual(ids);
    expect(resumed!.answers[ids[0]!]!.correct).toBe(true);
    endSession();
    expect(getSession()).toBeNull();
  });
});
