import { beforeEach, describe, expect, it } from 'vitest';
import { LS_KEY, THEME_KEY, SCHEMA_VERSION } from './constants';
import { runMigrations, load, saveNow, reloadState, Store, deriveMastery } from './store';

beforeEach(() => {
  localStorage.clear();
});

/**
 * A realistic pre-v5 payload: legacy boolean activity, cards missing v2 scheduling
 * fields, per-module MCQ leitner state, flags and notes, and no top-level settings.
 * The migration must preserve every user datum and additively fill the rest.
 */
function legacyV3Payload() {
  return {
    schemaVersion: 3,
    theme: 'paper',
    subjects: [{ id: 'subj1', name: 'Surgery', color: '#fff', topics: [{ id: 't1', name: 'Wounds' }] }],
    tasks: [{ id: 'task1', title: 'Revise wound healing', done: false }],
    flashcards: [
      // one legacy card with real review progress — must not be reset
      { id: 'c1', subjectId: 'subj1', front: 'Q', back: 'A', ef: 2.7, interval: 12, reps: 4, due: 20240101 },
      // one brand-new card missing every v2 field
      { id: 'c2', subjectId: 'subj1', front: 'Q2', back: 'A2' },
    ],
    notes: { note1: { title: 'Note', body: '# hi' } },
    mnemonics: [{ id: 'm1', text: 'SOAP' }],
    activity: { '2024-01-01': true, '2024-01-02': false, '2024-01-03': 5 },
    study: {
      progress: {
        'sur-ch1': {
          sections: { s1: true },
          mcqScore: { correct: 3, total: 5 },
          mcqs: { q1: { seen: 4, correct: 3, box: 2, lastResult: true, nextDue: 999 } },
          mcqFlags: { q2: true },
          mcqNotes: { q1: 'tricky' },
        },
      },
      drills: [{ moduleId: 'sur-ch1', when: 1, correct: 3, total: 5 }],
    },
    settings: { scheduler: { newPerDay: 42 }, mcq: { tutorMode: false } },
  };
}

describe('runMigrations — lossless v3→v8 upgrade', () => {
  it('preserves all existing user data and fills additive fields', () => {
    const s = runMigrations(legacyV3Payload());

    // version bumped to current
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(8);
    // v7 additive: content-card scheduling map exists, user cards untouched
    expect(s.study.cardSched).toEqual({});
    // v8 additive: focus tally exists and starts empty
    expect(s.study.focus).toEqual({ totalMin: 0, sessions: 0, byDay: {} });
    expect(s.flashcards.find((c) => c.id === 'c1')!.interval).toBe(12);

    // untouched user content survives verbatim
    expect(s.subjects[0]!.name).toBe('Surgery');
    expect(s.tasks[0]!.title).toBe('Revise wound healing');
    expect(s.notes.note1.body).toBe('# hi');
    expect(s.mnemonics[0].text).toBe('SOAP');

    // legacy card scheduling numbers are NOT reset
    const c1 = s.flashcards.find((c) => c.id === 'c1')!;
    expect(c1.ef).toBe(2.7);
    expect(c1.interval).toBe(12);
    expect(c1.reps).toBe(4);
    // but additive v2 fields are now present
    expect(c1.schema).toBe('foundation.card/v2');
    expect(Array.isArray(c1.history)).toBe(true);
    expect(c1.state).toBe('review'); // reps>0

    // new card gets full v2 defaults
    const c2 = s.flashcards.find((c) => c.id === 'c2')!;
    expect(c2.ef).toBe(s.settings.scheduler.easeStart);
    expect(c2.interval).toBe(0);
    expect(c2.state).toBe('new');

    // activity booleans → integer counts, numbers preserved
    expect(s.activity['2024-01-01']).toBe(1);
    expect(s.activity['2024-01-02']).toBe(0);
    expect(s.activity['2024-01-03']).toBe(5);

    // user settings kept, missing settings defaulted (deep merge)
    expect(s.settings.scheduler.newPerDay).toBe(42);
    expect(s.settings.mcq.tutorMode).toBe(false);
    expect(s.settings.goals.dailyGoal).toBe(50); // default filled
    expect(s.settings.session.showTimer).toBe(true); // default filled

    // legacy per-module MCQ leitner migrated into unified mcqPerf
    expect(s.study.mcqPerf.q1).toBeTruthy();
    expect(s.study.mcqPerf.q1!.correct).toBe(3);
    expect(s.study.mcqPerf.q1!.seen).toBe(4);
    expect(s.study.mcqPerf.q1!.nextDue).toBe(999);
    // flags migrated
    expect(s.study.mcqPerf.q2!.flagged).toBe(true);
    // notes migrated
    expect(s.study.mcqNotes.q1).toBe('tricky');
    // original per-module store is NOT destroyed
    expect(s.study.progress['sur-ch1'].mcqs.q1.seen).toBe(4);

    // v5 session slot exists (reserved v6 no-op leaves it null)
    expect(s.study.mcqSession).toBeNull();
  });

  it('is idempotent — re-running changes nothing material', () => {
    const once = runMigrations(legacyV3Payload());
    const snapshot = JSON.stringify(once);
    const twice = runMigrations(JSON.parse(snapshot));
    expect(JSON.stringify(twice)).toBe(snapshot);
  });

  it('carries a fresh default state straight to v6', () => {
    const s = runMigrations({});
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Array.isArray(s.subjects)).toBe(true);
    expect(s.study.mcqPerf).toEqual({});
  });
});

describe('load/save round-trip and corruption safety', () => {
  it('round-trips existing data through localStorage with no loss', () => {
    localStorage.setItem(LS_KEY, JSON.stringify(legacyV3Payload()));
    const loaded = load();
    expect(loaded.subjects[0]!.name).toBe('Surgery');
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);

    // persist and reload — identical
    reloadState(); // sets module state = load()
    saveNow();
    const raw = localStorage.getItem(LS_KEY)!;
    const again = runMigrations(JSON.parse(raw));
    expect(again.subjects[0]!.name).toBe('Surgery');
    expect(again.study.mcqPerf.q1!.correct).toBe(3);
  });

  it('backs up corrupt data instead of destroying it', () => {
    localStorage.setItem(LS_KEY, '{not valid json');
    const s = load();
    // fell back to a fresh default…
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    // …but kept the raw bytes under a timestamped backup key
    const backupKey = Object.keys(localStorage).find((k) => k.startsWith(LS_KEY + '__corrupt_'));
    expect(backupKey).toBeTruthy();
    expect(localStorage.getItem(backupKey!)).toBe('{not valid json');
  });

  it('preserves unknown/extra user keys through the settings deep-merge', () => {
    const payload = legacyV3Payload() as any;
    payload.settings.experimental = { customFlag: true };
    const s = runMigrations(payload);
    expect((s.settings as any).experimental.customFlag).toBe(true);
  });

  it('mirrors the theme into the theme key on save', () => {
    localStorage.setItem(LS_KEY, JSON.stringify(legacyV3Payload()));
    reloadState();
    saveNow();
    expect(localStorage.getItem(THEME_KEY)).toBe('paper');
  });
});

describe('deriveMastery', () => {
  it('maps consecutive-correct streaks to mastery bands', () => {
    expect(deriveMastery(null)).toBe('new');
    expect(deriveMastery({ attempts: 0 })).toBe('new');
    expect(deriveMastery({ attempts: 2, consecutiveCorrect: 0 })).toBe('learning');
    expect(deriveMastery({ attempts: 2, consecutiveCorrect: 1 })).toBe('familiar');
    expect(deriveMastery({ attempts: 4, consecutiveCorrect: 3 })).toBe('strong');
    expect(deriveMastery({ attempts: 6, consecutiveCorrect: 5 })).toBe('mastered');
  });
});

describe('Store wrapper', () => {
  it('reads and writes, and never throws', () => {
    expect(Store.set('k', 'v')).toBe(true);
    expect(Store.get('k')).toBe('v');
    Store.del('k');
    expect(Store.get('k')).toBeNull();
  });
});
