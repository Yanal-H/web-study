// "Make a card from this" — creates a user flashcard from arbitrary source (e.g. a
// missed MCQ in Phase 4). New cards enter the deck as `new` for the scheduler.
import { state, commit, uid } from '../../state/store';
import type { Flashcard } from '../../state/types';

export interface NewCardInput {
  type?: 'basic' | 'cloze';
  front?: string;
  back?: string;
  cloze?: string;
  extra?: string;
  hint?: string;
  subject?: string;
  tags?: string[];
}

export function makeUserCard(input: NewCardInput): string {
  const id = uid();
  const now = Date.now();
  const card: Flashcard = {
    id,
    schema: 'foundation.card/v2',
    type: input.type || (input.cloze ? 'cloze' : 'basic'),
    front: input.front,
    back: input.back,
    cloze: input.cloze,
    tags: input.tags || [],
    ef: state.settings.scheduler.easeStart,
    interval: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    step: 0,
    due: now,
    history: [],
  } as Flashcard;
  (card as any).extra = input.extra;
  (card as any).hint = input.hint;
  (card as any).subject = input.subject;
  state.flashcards.push(card);
  commit();
  return id;
}
