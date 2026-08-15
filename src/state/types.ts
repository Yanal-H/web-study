// Foundation · Med School Toolkit — state shape.
//
// These types describe the persisted app state stored under LS_KEY. The shape is
// intentionally permissive: the state layer is ported verbatim from the shipped
// single-file app and must load ANY historical payload losslessly. Index
// signatures and optional fields are deliberate — migrations fill gaps additively
// and never reject unknown user keys.

export type ThemeName = string;

export interface SchedulerSettings {
  algorithm: 'sm2plus' | 'fsrs';
  newPerDay: number;
  reviewsPerDay: number;
  learningSteps: number[];
  relearnSteps: number[];
  easeStart: number;
  easeFloor: number;
  againDelta: number;
  hardDelta: number;
  easyDelta: number;
  hardMult: number;
  easyBonus: number;
  intervalModifier: number;
  maxInterval: number;
  lapseMult: number;
  minInterval: number;
  graduatingInterval: number;
  easyInterval: number;
  fuzz: boolean;
  leechThreshold: number;
  leechAction: string;
  burySiblings: boolean;
  [k: string]: unknown;
}

export interface SessionSettings {
  queueOrder: string;
  showIntervalPreview: boolean;
  autoReveal: number;
  showTimer: boolean;
  keyboardShortcuts: boolean;
  [k: string]: unknown;
}

export interface McqSettings {
  shuffleOptions: boolean;
  feedbackMode: string;
  tutorMode: boolean;
  confidenceTracking: boolean;
  difficultyFilter: number[];
  defaultSize: string;
  timer: string;
  rapidSeconds: number;
  examMinPerQ: number;
  [k: string]: unknown;
}

export interface AppearanceSettings {
  theme: ThemeName | null;
  fontScale: string;
  density: string;
  reducedMotion: boolean;
  [k: string]: unknown;
}

export interface GoalsSettings {
  dailyGoal: number;
  [k: string]: unknown;
}

export interface AppSettings {
  scheduler: SchedulerSettings;
  session: SessionSettings;
  mcq: McqSettings;
  appearance: AppearanceSettings;
  goals: GoalsSettings;
  [k: string]: unknown;
}

export interface Flashcard {
  id: string;
  subjectId?: string;
  front?: string;
  back?: string;
  cloze?: string;
  ef?: number;
  interval?: number;
  reps?: number;
  lapses?: number;
  state?: 'new' | 'review' | 'learning' | 'relearn' | string;
  step?: number;
  due?: number | string;
  lastGrade?: unknown;
  history?: unknown[];
  schema?: string;
  tags?: string[];
  [k: string]: unknown;
}

export type Mastery = 'new' | 'learning' | 'familiar' | 'strong' | 'mastered';

export interface McqPerf {
  seen: number;
  attempts: number;
  correct: number;
  incorrect: number;
  lastResult: boolean | null;
  lastAnswered: number | null;
  confidence: number | null;
  flagged: boolean;
  nextDue: number;
  consecutiveCorrect: number;
  mastery: Mastery;
  [k: string]: unknown;
}

export interface StudyState {
  progress: Record<string, any>;
  drills: any[];
  daily: { date: string; newDone: number; revDone: number; [k: string]: unknown };
  savedFilters: any[];
  mcqPerf: Record<string, McqPerf>;
  mcqNotes: Record<string, string>;
  mcqSession: any | null;
  /** v7: per-card scheduling for shipped/imported content cards, keyed by card id */
  cardSched: Record<string, any>;
  [k: string]: unknown;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  topics: any[];
  [k: string]: unknown;
}

export interface AppState {
  schemaVersion: number;
  theme: ThemeName;
  subjects: Subject[];
  tasks: any[];
  planner: { blocks: string[]; cells: Record<string, any>; [k: string]: unknown };
  exams: any[];
  qbank: any[];
  flashcards: Flashcard[];
  pomodoro: Record<string, any>;
  streak: { freezes: number; frozenDays: Record<string, any>; [k: string]: unknown };
  notes: Record<string, any>;
  mnemonics: any[];
  resources: any[];
  activity: Record<string, number>;
  study: StudyState;
  settings: AppSettings;
  [k: string]: unknown;
}
