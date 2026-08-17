// Flashcard deck: unifies shipped/imported content cards and the user's own cards
// into one review queue under the SM-2+ scheduler. Content cards are scheduled by
// id in state.study.cardSched (additive, v7); user cards keep their own fields.
import { state, commit, markActivity } from '../../state/store';
import { allCards } from '../../content/loader';
import type { CardSched, Grade } from '../../lib/scheduler';
import { cardIsDue, isNewCard, scheduleCard, gradeLabel } from '../../lib/scheduler';
import type { Scheduling } from '../../data/db';
import { previewIntervals as fsrsPreview } from '../../data/fsrs';

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
          deck: anyC.deck || USER_DECK,
          card: {
            type: 'occlusion',
            image: anyC.image,
            regions: anyC.regions,
            regionIndex: i,
            back: r.label,
            extra: anyC.extra,
          },
        });
      });
    } else {
      items.push({
        key: `user:${c.id}`,
        source: 'user',
        subject: anyC.subject,
        deck: anyC.deck || USER_DECK,
        card: {
          type: anyC.type || 'basic',
          front: c.front,
          back: c.back,
          cloze: c.cloze,
          extra: anyC.extra,
          hint: anyC.hint,
          image: anyC.image,
          tags: c.tags,
        },
      });
    }
  }
  return items;
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

export interface GradeUndo {
  item: ReviewItem;
  /** the SM-2 row, for content and personal cards */
  prev?: CardSched;
  /** the FSRS row, for engine cards */
  prevSched?: Scheduling;
  idx: number;
}

/**
 * Grade a card through whichever scheduler owns it.
 *
 * Engine cards go to FSRS in IndexedDB; cards still held in the local store keep
 * the SM-2+ path, so a session can mix both without the caller caring which.
 */
export function gradeItem(
  item: ReviewItem,
  g: Grade,
  settings: Parameters<typeof scheduleCard>[0],
  idx: number
): GradeUndo {
  if (item.source === 'engine' && item.sched) {
    const prevSched = item.sched;
    void import('../../data/session').then(async (m) => {
      const next = await m.rateCard(
        { cardId: item.key.replace(/^engine:/, ''), deck: item.deck, sched: prevSched, card: {} as never },
        RATING[g]
      );
      item.sched = next;
      m.invalidateDeckTree();
    });
    markActivity();
    commit();
    return { item, prevSched, idx };
  }
  const prev = state.study.cardSched[item.key] as CardSched | undefined;
  const next = scheduleCard(settings, itemSched(item), g);
  persistGrade(item, next);
  return { item, prev, idx };
}

/** Put a graded card back the way it was. */
export function undoGrade(u: GradeUndo) {
  if (u.item.source === 'engine' && u.prevSched) {
    const prevSched = u.prevSched;
    u.item.sched = prevSched;
    void import('../../data/session').then((m) => {
      void m.restoreScheduling(prevSched);
      m.invalidateDeckTree();
    });
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
    return enginePreview(item.sched)[RATING[g]];
  }
  return gradeLabel(settings, itemSched(item), g);
}

/** Cached FSRS previews — recomputed only when the card changes. */
let previewFor: { cardId: string; at: number; out: Record<1 | 2 | 3 | 4, string> } | null = null;
function enginePreview(sched: Scheduling): Record<1 | 2 | 3 | 4, string> {
  if (previewFor && previewFor.cardId === sched.cardId && previewFor.at === sched.due)
    return previewFor.out;
  const out = fsrsPreview(sched, Date.now());
  previewFor = { cardId: sched.cardId, at: sched.due, out };
  return out;
}
