// Flashcard deck: unifies shipped/imported content cards and the user's own cards
// into one review queue under the SM-2+ scheduler. Content cards are scheduled by
// id in state.study.cardSched (additive, v7); user cards keep their own fields.
import { state, commit, markActivity, todayStr } from '../../state/store';
import { allCards } from '../../content/loader';
import type { CardSched, CardState, Grade } from '../../lib/scheduler';
import { recordGrade, refundGrade, type DailyLedger } from './dailyLimits';
import { cardIsDue, isNewCard, scheduleCard, gradeLabel } from '../../lib/scheduler';
import type { Scheduling } from '../../data/db';
import { previewIntervals as fsrsPreview, type Steps } from '../../data/fsrs';

export interface OcclusionRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface RenderCard {
  type: 'basic' | 'reversed' | 'cloze' | 'type' | 'image' | 'occlusion';
  front?: string;
  back?: string;
  cloze?: string;
  extra?: string;
  hint?: string;
  /** an inline figure, or an id into the owning pack's images map */
  image?: { src?: string; alt?: string; imageId?: string };
  regions?: OcclusionRegion[];
  regionIndex?: number; // occlusion: which region this item tests
  /** authored occlusion boxes (content packs) */
  masks?: Array<{ id: string; x: number; y: number; w: number; h: number; label?: string }>;
  target?: string;
  occMode?: 'hideAll' | 'hideOne';
  label?: string;
  chapterId?: string;
  tags?: string[];
}

export interface ReviewItem {
  key: string; // unique scheduling key
  source: 'content' | 'user' | 'engine';
  /** engine items carry their FSRS row; content/user items use state.study.cardSched */
  sched?: Scheduling;
  card: RenderCard;
  chapterId?: string;
  subject?: string;
  /** full deck path, "::" between levels — Subject::Chapter::Section::Sub-topic */
  deck: string;
}

/** Deck every personal card lands in unless it carries its own path. */
export const USER_DECK = 'My cards';

/** Old/manual imports can contain unexpected values; never let one crash review. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function deckName(value: unknown): string {
  const valueText = text(value)?.trim();
  return valueText || USER_DECK;
}

function userCardType(value: unknown): RenderCard['type'] {
  return value === 'cloze' || value === 'reversed' || value === 'type' || value === 'image' || value === 'occlusion'
    ? value
    : 'basic';
}

function schedFor(key: string): CardSched {
  return (state.study.cardSched[key] as CardSched) || { state: 'new' };
}

/** All reviewable items (content + user), each expanded (occlusion → one per region). */
export function collectItems(filter?: { subject?: string; chapterId?: string }): ReviewItem[] {
  const items: ReviewItem[] = [];

  // shipped/imported content cards
  for (const c of allCards()) {
    if (filter?.subject && c.subject !== filter.subject) continue;
    if (filter?.chapterId && c.chapterId !== filter.chapterId) continue;
    const id = c.id || `${c.chapterId}-card`;
    items.push({
      key: `content:${id}`,
      source: 'content',
      chapterId: c.chapterId,
      subject: c.subject,
      deck: c.deck || `${c.subject}::${c.chapterId}`,
      card: {
        type: c.type,
        front: c.front,
        back: c.back,
        cloze: c.cloze,
        extra: c.extra,
        hint: c.hint,
        // a figure carries its own src; occlusion cards name an entry in the
        // pack's images map, resolved at render time
        image:
          typeof c.image === 'string'
            ? { imageId: c.image }
            : c.image
              ? { src: c.image.src, alt: c.image.alt }
              : undefined,
        masks: c.masks,
        target: c.target,
        occMode: c.occMode,
        label: c.label,
        chapterId: c.chapterId,
        tags: c.tags,
      },
    });
  }

  // user's own cards (state.flashcards). Occlusion cards expand to one item / region.
  for (const c of state.flashcards) {
    const anyC = c as any;
    if (anyC.type === 'occlusion' && Array.isArray(anyC.regions)) {
      anyC.regions.forEach((r: OcclusionRegion, i: number) => {
        items.push({
          key: `user:${c.id}#${i}`,
          source: 'user',
          subject: anyC.subject,
          deck: deckName(anyC.deck),
          card: {
            type: 'occlusion',
            image: anyC.image,
            regions: anyC.regions,
            regionIndex: i,
            back: text(r.label),
            extra: text(anyC.extra),
          },
        });
      });
    } else {
      items.push({
        key: `user:${c.id}`,
        source: 'user',
        subject: anyC.subject,
        deck: deckName(anyC.deck),
        card: {
          type: userCardType(anyC.type),
          front: text(c.front),
          back: text(c.back),
          cloze: text(c.cloze),
          extra: text(anyC.extra),
          hint: text(anyC.hint),
          image: anyC.image,
          tags: Array.isArray(c.tags) ? c.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        },
      });
    }
  }
  return items;
}

/**
 * A card's scheduling state, whichever scheduler owns it: engine cards carry
 * their FSRS row, everything else is looked up in the store. Both use the same
 * vocabulary, so callers can treat them alike.
 */
export function itemState(item: ReviewItem): CardState | undefined {
  return (item.sched?.state as CardState | undefined) ?? schedFor(item.key).state;
}

/** How much of a day's allowance a built queue would spend. */
export function intakeOf(items: ReviewItem[]): { neu: number; due: number } {
  let neu = 0;
  let due = 0;
  for (const it of items) {
    const st = itemState(it);
    if (!st || st === 'new') neu++;
    else if (st === 'review') due++;
    // learning/relearning carry over from an earlier day; they are not charged again
  }
  return { neu, due };
}

export function itemSched(item: ReviewItem): CardSched {
  return schedFor(item.key);
}

/** Build a frozen review queue: due review items first, then new, capped per day. */
export function buildQueue(
  items: ReviewItem[],
  opts: { newLimit: number; reviewLimit: number; now?: number }
): ReviewItem[] {
  const now = opts.now ?? Date.now();
  const due: ReviewItem[] = [];
  const fresh: ReviewItem[] = [];
  for (const it of items) {
    const s = schedFor(it.key);
    if (isNewCard(s)) fresh.push(it);
    else if (cardIsDue(s, now)) due.push(it);
  }
  // stable order; new interleaved after due
  return [...due.slice(0, opts.reviewLimit), ...fresh.slice(0, opts.newLimit)];
}

/** Persist a graded card's new scheduling state and log activity. */
export function persistGrade(item: ReviewItem, next: CardSched) {
  if (item.source === 'content') {
    state.study.cardSched[item.key] = next;
  } else {
    // user card — write scheduling fields back onto the flashcard object
    const rawId = item.key.replace(/^user:/, '').split('#')[0];
    const card = state.flashcards.find((c) => c.id === rawId) as any;
    if (card) {
      if (item.card.type === 'occlusion') {
        // occlusion regions are scheduled individually in cardSched too
        state.study.cardSched[item.key] = next;
      } else {
        Object.assign(card, next);
      }
    }
  }
  markActivity();
  commit();
}

export function restoreSched(item: ReviewItem, prev: CardSched | undefined) {
  if (item.source === 'content' || item.card.type === 'occlusion') {
    if (prev) state.study.cardSched[item.key] = prev;
    else delete state.study.cardSched[item.key];
  } else {
    const rawId = item.key.replace(/^user:/, '');
    const card = state.flashcards.find((c) => c.id === rawId) as any;
    if (card && prev) Object.assign(card, prev);
  }
  commit();
}

export function queueStats(items: ReviewItem[], now = Date.now()) {
  let due = 0;
  let neu = 0;
  for (const it of items) {
    const s = schedFor(it.key);
    if (isNewCard(s)) neu++;
    else if (cardIsDue(s, now)) due++;
  }
  return { due, neu, total: items.length };
}

/* ------------------------------------------------------------------ decks */

export interface DeckNode {
  /** label at this level */
  name: string;
  /** full path from the root, "::" separated */
  path: string;
  children: DeckNode[];
  /** cards filed directly at this level */
  own: number;
  /** these totals include every descendant */
  total: number;
  due: number;
  neu: number;
}

function emptyNode(name: string, path: string): DeckNode {
  return { name, path, children: [], own: 0, total: 0, due: 0, neu: 0 };
}

/**
 * Group items into a deck / sub-deck / sub-sub-deck tree. Counts roll up, so a
 * parent shows everything beneath it and studying a parent studies the subtree.
 */
export function buildDeckTree(items: ReviewItem[], now = Date.now()): DeckNode[] {
  const roots: DeckNode[] = [];
  const index = new Map<string, DeckNode>();

  for (const it of items) {
    const parts = (it.deck || USER_DECK).split('::').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) parts.push(USER_DECK);
    const s = schedFor(it.key);
    const isNew = isNewCard(s);
    const isDue = !isNew && cardIsDue(s, now);

    let path = '';
    let siblings = roots;
    for (const part of parts) {
      path = path ? `${path}::${part}` : part;
      let node = index.get(path);
      if (!node) {
        node = emptyNode(part, path);
        index.set(path, node);
        siblings.push(node);
      }
      node.total++;
      if (isNew) node.neu++;
      else if (isDue) node.due++;
      siblings = node.children;
    }
    const leaf = index.get(path);
    if (leaf) leaf.own++;
  }

  const sortTree = (nodes: DeckNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);
  return roots;
}

/** Every item filed at a deck path or anywhere beneath it. */
export function itemsInDeck(items: ReviewItem[], path: string): ReviewItem[] {
  if (!path) return items;
  const prefix = `${path}::`;
  return items.filter((i) => i.deck === path || i.deck.startsWith(prefix));
}

/** Flatten a tree to its paths, depth-first (used by the deck picker). */
export function deckPaths(nodes: DeckNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: DeckNode[]) => {
    for (const n of ns) {
      out.push(n.path);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/* --------------------------------------------------- grading, either engine */

/** Anki's ratings, which is what FSRS takes. */
const RATING: Record<Grade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };

/**
 * The student's configured learning steps, in the shape the engine takes.
 * Settings has always offered these; the engine hard-coded its own, so the
 * setting silently applied to personal cards only.
 */
function stepsFrom(settings: Parameters<typeof scheduleCard>[0]): Steps {
  return { learn: settings.learningSteps, relearn: settings.relearnSteps };
}

/**
 * Charge a grade to today's allowance, judged by the card's state BEFORE it was
 * graded, so a live-queue re-show costs nothing — see dailyLimits.spends.
 */
function chargeDaily(prevState: CardState | undefined) {
  state.study.daily = recordGrade(
    state.study.daily as Partial<DailyLedger> | undefined,
    prevState,
    todayStr()
  );
}

export interface GradeUndo {
  item: ReviewItem;
  /** the SM-2 row, for content and personal cards */
  prev?: CardSched;
  /** the FSRS row, for engine cards */
  prevSched?: Scheduling;
  idx: number;
  grade: Grade;
  /** the state the card was in BEFORE grading — what the daily ledger charged */
  prevState?: CardState;
}

/**
 * Grade a card through whichever scheduler owns it.
 *
 * Engine cards go to FSRS in IndexedDB; cards still held in the local store keep
 * the SM-2+ path, so a session can mix both without the caller caring which.
 */
export async function gradeItem(
  item: ReviewItem,
  g: Grade,
  settings: Parameters<typeof scheduleCard>[0],
  idx: number
): Promise<GradeUndo> {
  return (await gradeItemLive(item, g, settings, idx)).undo;
}

/**
 * Grade a card and report WHERE IT LANDED — the new due time and state — so the
 * caller can decide whether it belongs back in this session (a short learning
 * step) or is finished for now. The live review queue needs that answer
 * synchronously; without it a card graded "Again" is rescheduled correctly for a
 * minute's time and then never looked at again.
 *
 * Persists before returning, so the rating is safe even if the UI advances the
 * instant this resolves.
 */
export async function gradeItemLive(
  item: ReviewItem,
  g: Grade,
  settings: Parameters<typeof scheduleCard>[0],
  idx = -1
): Promise<{ undo: GradeUndo; due: number; cardState: string }> {
  if (item.source === 'engine' && item.sched) {
    const prevSched = item.sched;
    const m = await import('../../data/session');
    const next = await m.rateCard(
      { cardId: item.key.replace(/^engine:/, ''), deck: item.deck, sched: prevSched, card: {} as never },
      RATING[g],
      undefined,
      stepsFrom(settings),
      { leechThreshold: settings.leechThreshold, leechAction: settings.leechAction }
    );
    item.sched = next;
    m.invalidateDeckTree();
    chargeDaily(prevSched.state);
    markActivity();
    commit();
    return {
      undo: { item, prevSched, idx, grade: g, prevState: prevSched.state },
      due: next.due || 0,
      cardState: next.state || 'review',
    };
  }
  const prev = state.study.cardSched[item.key] as CardSched | undefined;
  const before = itemSched(item).state;
  const next = scheduleCard(settings, itemSched(item), g);
  chargeDaily(before);
  persistGrade(item, next); // commits, so the ledger lands in the same write
  return {
    undo: { item, prev, idx, grade: g, prevState: before },
    due: next.due || 0,
    cardState: next.state || 'review',
  };
}

/**
 * Suspend the card on screen (or bring it back). Returns what happened so the
 * caller can tell the student, and undo it if they hit the wrong button.
 *
 * Only engine cards have a scheduling row to flag; a personal card is marked in
 * the store instead, which its own queue builder already honours.
 */
export async function toggleSuspend(item: ReviewItem): Promise<boolean> {
  if (item.source === 'engine' && item.sched) {
    const m = await import('../../data/session');
    const next = await m.setSuspended(item.sched, !item.sched.suspended);
    item.sched = next;
    m.invalidateDeckTree();
    commit();
    return !!next.suspended;
  }
  const cur = itemSched(item);
  const nowSuspended = cur.state !== 'suspended';
  persistGrade(item, {
    ...cur,
    // Remember what it was, so unsuspending resumes rather than restarts.
    state: nowSuspended ? 'suspended' : ((cur._prevState as CardState) ?? 'review'),
    _prevState: nowSuspended ? cur.state : undefined,
  });
  return nowSuspended;
}

/** Put a graded card back the way it was. */
export async function undoGrade(u: GradeUndo): Promise<void> {
  // Give the day's allowance back first. Without this, Undo silently costs a
  // new-card slot every time it is used: grade, undo, grade again, and two of
  // twenty new cards are gone for one card.
  state.study.daily = refundGrade(
    state.study.daily as Partial<DailyLedger> | undefined,
    u.prevState,
    todayStr()
  );

  if (u.item.source === 'engine' && u.prevSched) {
    const prevSched = u.prevSched;
    u.item.sched = prevSched;
    const m = await import('../../data/session');
    await m.restoreScheduling(prevSched);
    m.invalidateDeckTree();
    commit();
    return;
  }
  restoreSched(u.item, u.prev);
}

/** The interval each button would give, for the preview under the grade row. */
export function gradePreview(
  item: ReviewItem,
  settings: Parameters<typeof scheduleCard>[0],
  g: Grade
): string {
  if (item.source === 'engine' && item.sched) {
    return enginePreview(item.sched, stepsFrom(settings))[RATING[g]];
  }
  return gradeLabel(settings, itemSched(item), g);
}

/** Cached FSRS previews — recomputed only when the card changes. */
let previewFor: { cardId: string; at: number; out: Record<1 | 2 | 3 | 4, string> } | null = null;
function enginePreview(sched: Scheduling, steps: Steps): Record<1 | 2 | 3 | 4, string> {
  if (previewFor && previewFor.cardId === sched.cardId && previewFor.at === sched.due)
    return previewFor.out;
  const out = fsrsPreview(sched, Date.now(), steps);
  previewFor = { cardId: sched.cardId, at: sched.due, out };
  return out;
}
