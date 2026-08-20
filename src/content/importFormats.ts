import { z } from 'zod';
import {
  CardSchema,
  ChapterSchema,
  EmqSchema,
  McqSchema,
  formatZodError,
  type Chapter,
} from './schema';

export type ContentDocumentFormat = 'chapter' | 'study-material' | 'flashcard-deck' | 'mcq-bank';

export type NormaliseResult =
  | { ok: true; chapter: Chapter; format: ContentDocumentFormat }
  | { ok: false; issues: string[] };

const StandaloneBaseSchema = ChapterSchema.omit({
  schema: true,
  cards: true,
  mcqs: true,
  emqs: true,
});

export const StudyMaterialDocumentSchema = StandaloneBaseSchema.extend({
  schema: z.literal('foundation.study-material/v1'),
});

export const FlashcardDeckDocumentSchema = StandaloneBaseSchema.extend({
  schema: z.literal('foundation.flashcard-deck/v1'),
  cards: z.array(CardSchema).min(1),
});

export const McqBankDocumentSchema = StandaloneBaseSchema.extend({
  schema: z.literal('foundation.mcq-bank/v1'),
  questions: z.array(McqSchema).min(1),
  emqs: z.array(EmqSchema).default([]),
});

function finalise(candidate: unknown, format: ContentDocumentFormat): NormaliseResult {
  const checked = ChapterSchema.safeParse(candidate);
  return checked.success
    ? { ok: true, chapter: checked.data, format }
    : { ok: false, issues: formatZodError(checked.error) };
}

/** Convert every advertised JSON format into the one canonical chapter contract. */
export function normaliseContentDocument(input: unknown): NormaliseResult {
  const schema = (input as { schema?: unknown } | null)?.schema;

  if (schema === 'foundation.study-module/v1') {
    return finalise(input, 'chapter');
  }
  if (schema === 'foundation.study-material/v1') {
    const checked = StudyMaterialDocumentSchema.safeParse(input);
    if (!checked.success) return { ok: false, issues: formatZodError(checked.error) };
    return finalise({ ...checked.data, schema: 'foundation.study-module/v1', cards: [], mcqs: [], emqs: [] }, 'study-material');
  }
  if (schema === 'foundation.flashcard-deck/v1') {
    const checked = FlashcardDeckDocumentSchema.safeParse(input);
    if (!checked.success) return { ok: false, issues: formatZodError(checked.error) };
    return finalise({ ...checked.data, schema: 'foundation.study-module/v1', mcqs: [], emqs: [] }, 'flashcard-deck');
  }
  if (schema === 'foundation.mcq-bank/v1') {
    const checked = McqBankDocumentSchema.safeParse(input);
    if (!checked.success) return { ok: false, issues: formatZodError(checked.error) };
    const { questions, ...base } = checked.data;
    return finalise({ ...base, schema: 'foundation.study-module/v1', cards: [], mcqs: questions }, 'mcq-bank');
  }

  const legacyHint = input && typeof input === 'object' && (
    'deckName' in input || 'questions' in input || 'chapterId' in input
  );
  return {
    ok: false,
    issues: [legacyHint
      ? '(root): this is an old fragment template and lacks safe chapter metadata. Copy the current matching template from content/_schema.'
      : '(root): unsupported schema. Use foundation.study-module/v1, foundation.study-material/v1, foundation.flashcard-deck/v1, or foundation.mcq-bank/v1.'],
  };
}
