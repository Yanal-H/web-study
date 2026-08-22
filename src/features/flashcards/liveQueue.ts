// The live review queue.
//
// The old review session was a frozen snapshot: a fixed array walked by an index
// that only ever moved forward. A card graded "Again" was rescheduled correctly
// for ~1 minute later, but the session never looked at that new due time, so the
// card never came back — you had to leave and re-enter to see it. This module is
// the fix: a session holds READY cards (due now) and WAITING cards (a short
// learning/relearning step coming up soon), and a single timer promotes waiting
// cards to ready the moment they are due.
//
// Everything here is PURE and clock-injected, so the behaviour is unit-tested
// with a fake clock rather than by waiting real minutes. It changes only which
// already-scheduled cards re-appear during the active session — never the
// scheduler maths, the persisted schedule, or storage formats.

import type { ReviewItem } from './deck';

/**
 * How far ahead a learning step may be and still count as "this session".
 * The scheduler's learning/relearning steps are 1 and 10 minutes, so 20 minutes
 * comfortably re-shows them without dragging a card that has graduated to days.
 */
export const SESSION_HORIZON_MS = 20 * 60 * 1000;

export interface WaitingEntry {
  item: ReviewItem;
  /** epoch ms this card becomes reviewable again */
  due: number;
}

export interface LiveState {
  ready: ReviewItem[];
  waiting: WaitingEntry[];
}

/** A fresh session: every built item is due now, so it all starts ready. */
export function initLive(queue: ReviewItem[]): LiveState {
  return { ready: [...queue], waiting: [] };
}

/**
 * Where a just-graded card goes. It re-enters the session (as a waiting card)
 * only when it is still in a short learning/relearning step AND that step falls
 * inside the session horizon; otherwise it has graduated (or lapsed to a long
 * interval) and is done for now. Pure.
 */
export function placeGraded(
  waiting: WaitingEntry[],
  item: ReviewItem,
  next: { due: number; state?: string },
  now: number,
  horizonMs: number = SESSION_HORIZON_MS
): WaitingEntry[] {
  const isShortStep = next.state === 'learning' || next.state === 'relearning';
  const soon = next.due - now <= horizonMs && next.due > now;
  if (!isShortStep || !soon) return waiting;
  return [...waiting, { item, due: next.due }].sort((a, b) => a.due - b.due);
}

/** Move every waiting card that is now due into ready, keeping order. Pure. */
export function promoteDue(state: LiveState, now: number): LiveState {
  const dueNow = state.waiting.filter((e) => e.due <= now);
  if (dueNow.length === 0) return state;
  return {
    ready: [...state.ready, ...dueNow.map((e) => e.item)],
    waiting: state.waiting.filter((e) => e.due > now),
  };
}

/** The earliest time any waiting card becomes due, or null when none wait. */
export function nextDueAt(waiting: WaitingEntry[]): number | null {
  if (waiting.length === 0) return null;
  return waiting.reduce((min, e) => (e.due < min ? e.due : min), waiting[0]!.due);
}

/** True when nothing is ready but a learning card is coming up soon. */
export function isDueSoon(state: LiveState): boolean {
  return state.ready.length === 0 && state.waiting.length > 0;
}

/** True when the session has genuinely finished — nothing ready, nothing waiting. */
export function isComplete(state: LiveState): boolean {
  return state.ready.length === 0 && state.waiting.length === 0;
}

/**
 * Put an undone card back at the front of ready and out of waiting, so Undo
 * re-shows exactly the card that was just graded wherever it had gone.
 */
export function reinsertForUndo(state: LiveState, item: ReviewItem): LiveState {
  return {
    ready: [item, ...state.ready.filter((i) => i.key !== item.key)],
    waiting: state.waiting.filter((e) => e.item.key !== item.key),
  };
}

/** Cards still to come, split by kind, for the on-screen counts. Pure. */
export function aheadCounts(
  state: LiveState,
  stateOf: (item: ReviewItem) => string | undefined
): { neu: number; learn: number; due: number } {
  const out = { neu: 0, learn: 0, due: 0 };
  for (const it of state.ready) {
    const st = stateOf(it);
    if (!st || st === 'new') out.neu++;
    else if (st === 'learning' || st === 'relearning') out.learn++;
    else out.due++;
  }
  // Everything waiting is, by construction, a short learning/relearning step.
  out.learn += state.waiting.length;
  return out;
}
