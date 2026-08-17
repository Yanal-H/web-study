// Study analytics derived from the persisted state — pure functions, no side effects.
import type { AppState, Flashcard, McqPerf } from '../state/types';

export const DAY = 86400000;

export function dayKey(d: Date | number = new Date()): string {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

/** Consecutive-day streak ending today (or yesterday, so a fresh morning keeps it). */
export function computeStreak(activity: Record<string, number>): number {
  let streak = 0;
  const today = new Date();
  // allow the streak to survive until the user acts today: start from today, but if
  // today is empty, start counting from yesterday.
  let cursor = new Date(today);
  if (!activity[dayKey(cursor)]) cursor = new Date(today.getTime() - DAY);
  for (;;) {
    if (activity[dayKey(cursor)] && activity[dayKey(cursor)]! > 0) {
      streak++;
      cursor = new Date(cursor.getTime() - DAY);
    } else break;
  }
  return streak;
}

export interface HeatCell {
  key: string;
  count: number;
  date: Date;
}

/** Build a GitHub-style week grid (columns = weeks, rows = weekday), oldest→newest. */
export function heatmapWeeks(activity: Record<string, number>, weeks = 17): HeatCell[][] {
  const cells: HeatCell[] = [];
  const today = new Date();
  const end = new Date(today);
  // walk back to the start of the grid; align so the last column ends today
  const totalDays = weeks * 7;
  const start = new Date(end.getTime() - (totalDays - 1) * DAY);
  // shift start back to a Sunday for clean columns
  start.setDate(start.getDate() - start.getDay());
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY)) {
    const key = dayKey(d);
    cells.push({ key, count: activity[key] || 0, date: new Date(d) });
  }
  const cols: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
  return cols;
}

export function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 12) return 3;
  return 4;
}

/** Resolve a card's next-due moment to a Date, tolerating historical formats. */
export function cardDueDate(c: Flashcard): Date | null {
  const due = c.due as unknown;
  if (due == null) return null;
  if (typeof due === 'number') {
    if (due > 1e11) return new Date(due); // ms timestamp
    if (due > 1e8) return new Date(due * 1000); // s timestamp
    return new Date(Date.now() + due * DAY); // day-offset fallback
  }
  if (typeof due === 'string') {
    const t = Date.parse(due);
    return isNaN(t) ? null : new Date(t);
  }
  return null;
}

export function isDue(c: Flashcard, at: number = Date.now()): boolean {
  if ((c.state ?? 'new') === 'new') return true;
  const d = cardDueDate(c);
  return d ? d.getTime() <= at : true;
}

export function dueCounts(cards: Flashcard[]) {
  let due = 0;
  let neu = 0;
  let learning = 0;
  for (const c of cards) {
    const st = (c.state ?? 'new') as string;
    if (st === 'new') neu++;
    else if (isDue(c)) due++;
    if (st === 'learning' || st === 'relearn') learning++;
  }
  return { due, neu, learning, total: cards.length };
}

/** 14-day forecast of cards coming due (review cards only). */
export function forecast(cards: Flashcard[], days = 14): number[] {
  const out = new Array(days).fill(0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  for (const c of cards) {
    if ((c.state ?? 'new') === 'new') continue;
    const d = cardDueDate(c);
    if (!d) continue;
    const idx = Math.floor((d.getTime() - startOfToday.getTime()) / DAY);
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
}

export interface WeakItem {
  qid: string;
  attempts: number;
  accuracy: number;
}

/** Questions attempted ≥2× with <60% accuracy — the "weak spots". */
export function weakMcqs(perf: Record<string, McqPerf>, limit = 6): WeakItem[] {
  const items: WeakItem[] = [];
  for (const qid in perf) {
    const p = perf[qid]!;
    if (p.attempts >= 2 && p.correct / p.attempts < 0.6) {
      items.push({ qid, attempts: p.attempts, accuracy: p.correct / p.attempts });
    }
  }
  return items.sort((a, b) => a.accuracy - b.accuracy).slice(0, limit);
}

/** Today's progress toward the daily goal. */
export function todayProgress(state: AppState) {
  const key = dayKey();
  const done = state.activity[key] || 0;
  const goal = state.settings?.goals?.dailyGoal || 50;
  return { done, goal, ratio: Math.min(1, done / goal) };
}
