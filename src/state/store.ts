// Foundation · Med School Toolkit — persistence, migrations, and the live state.
//
// PORTED VERBATIM (behaviour-for-behaviour) from the shipped single-file app's
// state layer. Every migration branch v1→v5 is carried over untouched so existing
// buyer data loads with zero loss. Phase 0 adds ONE additive, reserved v6 step
// (a no-op) and bumps SCHEMA_VERSION to 6. No data semantics changed.

import type { AppState, AppSettings, McqPerf, Mastery } from './types';
import { LS_KEY, THEME_KEY, SCHEMA_VERSION, SETTINGS_DEFAULTS, COLORS, SEED_SUBJECTS } from './constants';

/* ---- STORAGE WRAPPER (namespaced, quota-safe) ---- */
export const Store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): boolean {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch (e) {
      console.warn('storage write failed (quota?)', e);
      return false;
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const todayStr = (d: Date | number | string = new Date()): string => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};

const prefersLight = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: light)').matches;

/* ---- MASTERY (referenced by migrations and the MCQ engine) ---- */
export function deriveMastery(p: { attempts?: number; consecutiveCorrect?: number } | null): Mastery {
  if (!p || !p.attempts) return 'new';
  const cc = p.consecutiveCorrect || 0;
  if (cc >= 5) return 'mastered';
  if (cc >= 3) return 'strong';
  if (cc >= 1) return 'familiar';
  return 'learning'; // has been attempted but the last answer was wrong
}

export function defaultState(): AppState {
  const prefLight = prefersLight();
  return {
    schemaVersion: SCHEMA_VERSION,
    theme: prefLight ? 'paper' : 'midnight',
    subjects: SEED_SUBJECTS.map((name, i) => ({
      id: uid(),
      name,
      color: COLORS[i % COLORS.length]!,
      topics: [],
    })),
    tasks: [],
    planner: { blocks: ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night'], cells: {} },
    exams: [],
    qbank: [],
    flashcards: [], // {id, subjectId, front, back, cloze, ef, interval, reps, due, lastGrade}
    pomodoro: {
      sessions: [],
      focus: 25,
      short: 5,
      long: 15,
      preset: 'classic',
      ambient: 'off',
      autoStart: false,
      notify: false,
    },
    streak: { freezes: 2, frozenDays: {} }, // streak-freeze safety valve tokens
    notes: {},
    mnemonics: [],
    resources: [],
    activity: {}, // dateStr -> count (intensity)
    // v3 Study Engine: progress[moduleId] = { sections:{s1:true,…}, mcqScore:{correct,total}, drilledCards:[cardId], lastOpened:'YYYY-MM-DD' }
    // drills = session log: { moduleId, when, correct, total }
    // v4: study.daily = per-day cap counters; progress[mid].mcqs = per-MCQ leitner state (legacy)
    // v5: mcqPerf[qid] = unified per-question performance; mcqNotes[qid]; mcqSession = active MCQ session
    study: {
      progress: {},
      drills: [],
      daily: { date: todayStr(), newDone: 0, revDone: 0 },
      savedFilters: [],
      mcqPerf: {},
      mcqNotes: {},
      mcqSession: null,
      cardSched: {},
      focus: { totalMin: 0, sessions: 0, byDay: {} },
    },
    // v4 settings — every tunable (scheduler / session / mcq / appearance / goals)
    settings: JSON.parse(JSON.stringify(SETTINGS_DEFAULTS)) as AppSettings,
  };
}

/* ---- ADDITIVE, MIGRATION-SAFE LOAD ---- */
export function runMigrations(s: any): AppState {
  const def = defaultState() as any;
  for (const k in def) {
    if (!(k in s)) s[k] = def[k];
  } // add any missing top-level keys
  s.pomodoro = Object.assign({}, def.pomodoro, s.pomodoro || {}); // deep-ensure config objects
  s.planner = Object.assign({}, def.planner, s.planner || {});
  s.streak = Object.assign({}, def.streak, s.streak || {});
  if (!Array.isArray(s.flashcards)) s.flashcards = [];
  // migrate v1 activity (boolean flags) -> v2 (integer counts)
  const act: Record<string, number> = {};
  for (const d in s.activity || {}) {
    const v = s.activity[d];
    act[d] = typeof v === 'number' ? v : v ? 1 : 0;
  }
  s.activity = act;
  // v2 -> v3: additive Study Engine store. Never remove keys; default anything missing.
  s.study = Object.assign({ progress: {}, drills: [] }, s.study || {});
  if (!s.study.progress || typeof s.study.progress !== 'object') s.study.progress = {};
  if (!Array.isArray(s.study.drills)) s.study.drills = [];
  // v3 -> v4: settings (deep-merged), per-day caps, per-MCQ leitner, richer card fields.
  if (!s.study.daily || typeof s.study.daily !== 'object')
    s.study.daily = { date: todayStr(), newDone: 0, revDone: 0 };
  if (!Array.isArray(s.study.savedFilters)) s.study.savedFilters = [];
  for (const mid in s.study.progress) {
    const p = s.study.progress[mid];
    if (p && !p.mcqs) p.mcqs = {};
  }
  s.settings = deepMergeSettings(SETTINGS_DEFAULTS as any, s.settings || {});
  // upgrade every card to v2 scheduling fields WITHOUT touching existing ef/interval/reps/due
  (s.flashcards || []).forEach((c: any) => {
    if (c.ef == null) c.ef = s.settings.scheduler.easeStart;
    if (c.interval == null) c.interval = 0;
    if (c.reps == null) c.reps = 0;
    if (c.lapses == null) c.lapses = 0;
    if (c.state == null) c.state = c.reps > 0 ? 'review' : 'new';
    if (c.step == null) c.step = 0;
    if (!Array.isArray(c.history)) c.history = [];
    if (c.schema == null) c.schema = 'foundation.card/v2';
    if (!Array.isArray(c.tags)) c.tags = [];
  });
  // v4 -> v5: unified MCQ performance + notes + active session. Migrate legacy per-module
  // leitner (progress[mid].mcqs), flags (mcqFlags) and notes (mcqNotes); never destroy them.
  if (!s.study.mcqPerf || typeof s.study.mcqPerf !== 'object') s.study.mcqPerf = {};
  if (!s.study.mcqNotes || typeof s.study.mcqNotes !== 'object') s.study.mcqNotes = {};
  if (!('mcqSession' in s.study)) s.study.mcqSession = null;
  const blankPerf = (): McqPerf => ({
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
  });
  for (const mid in s.study.progress) {
    const p = s.study.progress[mid];
    if (!p) continue;
    if (p.mcqs)
      for (const qid in p.mcqs) {
        const o = p.mcqs[qid] || {};
        const np = s.study.mcqPerf[qid] || blankPerf();
        np.seen = Math.max(np.seen, o.seen || 0);
        np.attempts = Math.max(np.attempts, o.seen || 0);
        np.correct = Math.max(np.correct, o.correct || 0);
        np.incorrect = Math.max(np.incorrect, (o.seen || 0) - (o.correct || 0));
        if (o.lastResult != null) np.lastResult = o.lastResult;
        if (o.nextDue) np.nextDue = o.nextDue;
        np.consecutiveCorrect = Math.max(np.consecutiveCorrect || 0, o.box || 0);
        s.study.mcqPerf[qid] = np;
      }
    if (p.mcqFlags)
      for (const qid in p.mcqFlags) {
        if (p.mcqFlags[qid]) {
          const np = s.study.mcqPerf[qid] || blankPerf();
          np.flagged = true;
          s.study.mcqPerf[qid] = np;
        }
      }
    if (p.mcqNotes)
      for (const qid in p.mcqNotes) {
        if (!s.study.mcqNotes[qid] && p.mcqNotes[qid]) s.study.mcqNotes[qid] = p.mcqNotes[qid];
      }
  }
  for (const qid in s.study.mcqPerf) {
    const p = s.study.mcqPerf[qid];
    p.mastery = deriveMastery(p);
  }
  // v5 -> v6: RESERVED slot (Phase 0). No-op — carried forward unchanged.
  // v6 -> v7: per-card scheduling for shipped/imported content cards (Phase 3).
  //   Additive: shipped content cards are scheduled by id here, WITHOUT touching
  //   the user's own s.flashcards (their ef/interval/reps/due stay exactly as-is).
  if (!s.study.cardSched || typeof s.study.cardSched !== 'object') s.study.cardSched = {};

  // v7 -> v8: focus-timer totals. Additive only — no existing field is read or
  // rewritten, so a v7 blob loads unchanged and simply gains an empty tally.
  if (!s.study.focus || typeof s.study.focus !== 'object')
    s.study.focus = { totalMin: 0, sessions: 0, byDay: {} };
  if (typeof s.study.focus.totalMin !== 'number') s.study.focus.totalMin = 0;
  if (typeof s.study.focus.sessions !== 'number') s.study.focus.sessions = 0;
  if (!s.study.focus.byDay || typeof s.study.focus.byDay !== 'object') s.study.focus.byDay = {};
  s.schemaVersion = SCHEMA_VERSION;
  return s as AppState;
}

/* deep-merge settings: fill any missing key from defaults, keep user values, recurse one level */
export function deepMergeSettings(def: any, cur: any): any {
  const out: any = {};
  for (const k in def) {
    if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) {
      out[k] = deepMergeSettings(def[k], (cur && cur[k]) || {});
    } else {
      out[k] = cur && k in cur ? cur[k] : Array.isArray(def[k]) ? def[k].slice() : def[k];
    }
  }
  // preserve any extra user keys not in defaults
  for (const k in cur || {}) {
    if (!(k in out)) out[k] = cur[k];
  }
  return out;
}

export function load(): AppState {
  const raw = Store.get(LS_KEY);
  if (raw) {
    try {
      return runMigrations(JSON.parse(raw));
    } catch (e) {
      // Corrupted or unreadable data — never silently reset. Keep the raw bytes in a
      // timestamped backup so nothing is destroyed, then start fresh.
      console.warn('Could not load saved data; backing it up before falling back', e);
      try {
        Store.set(LS_KEY + '__corrupt_' + Date.now(), raw);
      } catch {
        /* ignore */
      }
    }
  }
  return defaultState();
}

/** The live, in-memory app state. Mutated in place, persisted via save(). */
export let state: AppState = load();

/**
 * A failed localStorage write (quota exceeded, private-mode blocks) must never be
 * treated as a successful save. Store.set returns false in that case; we broadcast
 * an event the shell listens for so the student is warned to free space or export,
 * instead of losing data silently.
 */
function notifyStorageError() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('foundation:storage-error'));
  } catch {
    /* no-op */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = Store.set(LS_KEY, JSON.stringify(state));
    Store.set(THEME_KEY, state.theme);
    if (!ok) notifyStorageError();
  }, 150);
}

/** Persist synchronously (no debounce) — useful for tests and beforeunload. */
export function saveNow() {
  if (saveTimer) clearTimeout(saveTimer);
  const ok = Store.set(LS_KEY, JSON.stringify(state));
  Store.set(THEME_KEY, state.theme);
  if (!ok) notifyStorageError();
}

export function markActivity() {
  const d = todayStr();
  state.activity[d] = (state.activity[d] || 0) + 1;
}

/** Re-read from storage into the live state (used by tests). */
export function reloadState(): AppState {
  state = load();
  return state;
}

/* ---- REACTIVE LAYER (React subscription over the mutable state) ----
   Pages mutate `state` directly, then call commit() to persist and notify.
   A monotonic version number is the external-store snapshot. */
const listeners = new Set<() => void>();
let version = 0;

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getVersion(): number {
  return version;
}

/** Bump the version and notify subscribers WITHOUT persisting (transient UI state). */
export function notify() {
  version++;
  listeners.forEach((l) => l());
}

/** Persist (debounced) AND notify subscribers. The normal "I changed data" call. */
export function commit() {
  save();
  notify();
}

/** Convenience: mutate then commit in one call. */
export function update(fn: (s: AppState) => void) {
  fn(state);
  commit();
}
