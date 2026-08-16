// Flashcard deck: unifies shipped/imported content cards and the user's own cards
// into one review queue under the SM-2+ scheduler. Content cards are scheduled by
// id in state.study.cardSched (additive, v7); user cards keep their own fields.
import { state, commit, markActivity } from '../../state/store';
import { allCards } from '../../content/loader';
import type { CardSched } from '../../lib/scheduler';
import { cardIsDue, isNewCard } from '../../lib/scheduler';

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
  image?: { src?: string; alt?: string };
  regions?: OcclusionRegion[];
  regionIndex?: number; // occlusion: which region this item tests
  tags?: string[];
}

export interface ReviewItem {
  key: string; // unique scheduling key
  source: 'content' | 'user';
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
        image: c.image ? { src: c.image.src, alt: c.image.alt } : undefined,
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
