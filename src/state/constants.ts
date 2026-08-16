// Foundation · Med School Toolkit — storage keys, schema version, seed constants.
//
// PORTED VERBATIM from the shipped single-file app. The localStorage keys and the
// existing migration semantics MUST NOT change — existing buyers already have data
// under these exact keys.

import type { AppSettings, SchedulerSettings } from './types';

/** localStorage key for the entire app state blob. Unchanged since v1. */
export const LS_KEY = 'foundation_med_study_v1';

/** localStorage key for the resolved theme (also mirrored inside state.theme). */
export const THEME_KEY = 'foundation_theme';

/**
 * Current schema version.
 *
 * v1→v5 shipped in the single-file app. Phase 0 bumps to 6 with a RESERVED,
 * no-op migration step (see runMigrations). Bumping the version does not change
 * any data semantics — it only reserves the slot for future additive work.
 */
export const SCHEMA_VERSION = 7;

/* ---- v8 default settings (additive; every tunable lives here) ---- */
export const SCHED_DEFAULTS: SchedulerSettings = {
  algorithm: 'sm2plus', // 'sm2plus' | 'fsrs'
  newPerDay: 20,
  reviewsPerDay: 200,
  learningSteps: [1, 10],
  relearnSteps: [10], // minutes
  easeStart: 2.5,
  easeFloor: 1.3,
  againDelta: -0.2,
  hardDelta: -0.15,
  easyDelta: 0.15,
  hardMult: 1.2,
  easyBonus: 1.3,
  intervalModifier: 1.0,
  maxInterval: 36500,
  lapseMult: 0.5,
  minInterval: 1,
  graduatingInterval: 1,
  easyInterval: 4,
  fuzz: true,
  leechThreshold: 8,
  leechAction: 'suspend',
  burySiblings: true,
};

export const SETTINGS_DEFAULTS: AppSettings = {
  scheduler: Object.assign({}, SCHED_DEFAULTS),
  session: {
    queueOrder: 'due-first',
    showIntervalPreview: true,
    autoReveal: 0,
    showTimer: true,
    keyboardShortcuts: true,
  },
  mcq: {
    shuffleOptions: false,
    feedbackMode: 'immediate',
    tutorMode: true,
    confidenceTracking: false,
    difficultyFilter: [1, 2, 3],
    instantAnswer: true,
    autoAdvance: 'correct',
    autoAdvanceMs: 1500,
    defaultSize: 'all',
    timer: 'off',
    rapidSeconds: 45,
    examMinPerQ: 1.5,
  },
  appearance: {
    theme: null,
    fontScale: 'M',
    density: 'comfortable',
    reducedMotion: false,
    haki: 'full',
    colourTerms: true,
  },
  goals: { dailyGoal: 50 },
};

export const COLORS = [
  '#8b9eff',
  '#ff9ec9',
  '#7be0d6',
  '#ffb454',
  '#56d4a0',
  '#c4a7ff',
  '#ff7a93',
  '#6db3ff',
  '#f2d06b',
  '#a3e635',
];

/* ---- SEED SUBJECTS ---- */
export const SEED_SUBJECTS = [
  'Anatomy',
  'Histology & Embryology',
  'Physiology',
  'Biochemistry & Genetics',
  'Immunology',
  'Microbiology',
  'Pathology',
  'Pharmacology',
  'Behavioral Science & Biostatistics',
  'Neuroscience',
  'Internal Medicine',
  'Surgery',
  'Pediatrics',
  'OB/GYN',
  'Psychiatry',
  'Emergency Medicine',
];

export const DAY_MS = 24 * 60 * 60 * 1000;
