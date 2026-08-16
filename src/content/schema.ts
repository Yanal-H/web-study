import { z } from 'zod';

/*
 * Foundation · content-as-data contract (Phase 2).
 *
 * The canonical Zod schema for a chapter document and everything inside it. This
 * single source of truth is used three ways:
 *   1. build-time validation (scripts/validate-content.ts) — invalid JSON fails the build,
 *   2. JSON-Schema + template emission (scripts/make-schema.ts),
 *   3. runtime import validation in the browser (src/content/userContent.ts).
 *
 * It extends the existing tags — foundation.study-module/v1 (chapter),
 * foundation.card/v2, foundation.mcq/v2 — rather than reinventing them.
 */

/* ---- FIGURE ---- an image reference OR a described figure; alt text always required */
export const FigureSchema = z
  .object({
    id: z.string().optional(),
    kind: z.enum(['image', 'described']).default('described'),
    /** path under /content-images (build) or a data: URI (runtime import) */
    src: z.string().optional(),
    /** required accessible description */
    alt: z.string().min(1, 'figure alt text is required'),
    caption: z.string().optional(),
    /** prose fallback when there is no image asset */
    described: z.string().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.kind === 'image' && !f.src)
      ctx.addIssue({ code: 'custom', message: 'image figures require "src"', path: ['src'] });
    if (f.kind === 'described' && !f.described)
      ctx.addIssue({
        code: 'custom',
        message: 'described figures require "described" text',
        path: ['described'],
      });
  });
export type Figure = z.infer<typeof FigureSchema>;

/* ---- TABLE ---- every ≥3-item comparison becomes a table */
export const TableSchema = z.object({
  title: z.string().optional(),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
});
export type Table = z.infer<typeof TableSchema>;

/* ---- TERM KIND ---- the concept classes the reader colours consistently.
 * One colour per class, used identically in the reader, on cards and in questions,
 * so a drug always looks like a drug and a number always looks like a number. */
export const TERM_KINDS = [
  'drug',
  'organism',
  'cell',
  'mediator',
  'condition',
  'test',
  'procedure',
  'structure',
  'value',
  'warning',
] as const;
export const TermKindSchema = z.enum(TERM_KINDS);
export type TermKind = (typeof TERM_KINDS)[number];

/* ---- GLOSSARY ---- authored key terms. Doubles as the chapter's colour lexicon
 * and as the reader's glossary panel, so one authored list drives both. */
export const GlossaryEntrySchema = z.object({
  term: z.string().min(1),
  kind: TermKindSchema.optional(),
  /** short definition shown in the glossary and on hover */
  def: z.string().optional(),
  /** other spellings/abbreviations that mean the same thing */
  aliases: z.array(z.string()).default([]),
});
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

/* ---- SECTION ---- summarised digest + exam-facing extras */
export const SectionSchema = z.object({
  id: z.string().min(1),
  n: z.string().optional(),
  title: z.string().min(1),
  /** summarised digest (Markdown) — lead sentence then essential mechanism; never a transcription */
  digest: z.string().min(1),
  highYield: z.array(z.string()).default([]),
  tables: z.array(TableSchema).default([]),
  pitfalls: z.array(z.string()).default([]),
  figures: z.array(FigureSchema).default([]),
  /** deck label for this section's cards; defaults to the section title */
  deck: z.string().optional(),
});
export type Section = z.infer<typeof SectionSchema>;

/* ---- CARD (foundation.card/v2) ---- */
export const CardSchema = z
  .object({
    schema: z.literal('foundation.card/v2').optional(),
    id: z.string().optional(),
    type: z.enum(['basic', 'reversed', 'cloze', 'type', 'image', 'occlusion']),
    /** section id this card belongs to (legacy key: tag) */
    tag: z.string().optional(),
    sectionId: z.string().optional(),
    front: z.string().optional(),
    back: z.string().optional(),
    cloze: z.string().optional(),
    extra: z.string().optional(),
    hint: z.string().optional(),
    keyFacts: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    difficulty: z.number().int().min(1).max(3).optional(),
    image: FigureSchema.optional(),
    /**
     * Deck path for this card, relative to the chapter's deck root, using "::"
     * between levels — e.g. "Phases::Inflammatory". Combined with the chapter root
     * this yields Subject :: Chapter :: Section :: Sub-topic, i.e. decks,
     * sub-decks and sub-sub-decks. Omit and the card lands in its section's deck.
     */
    deck: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.type === 'cloze') {
      if (!c.cloze || !/\{\{c\d+::/.test(c.cloze))
        ctx.addIssue({ code: 'custom', message: 'cloze cards need a {{c1::…}} cloze string', path: ['cloze'] });
    } else if (c.type === 'image' || c.type === 'occlusion') {
      if (!c.image)
        ctx.addIssue({ code: 'custom', message: `${c.type} cards need an image`, path: ['image'] });
    } else {
      if (!c.front || !c.back)
        ctx.addIssue({ code: 'custom', message: `${c.type} cards need front and back`, path: ['front'] });
    }
  });
export type Card = z.infer<typeof CardSchema>;

/* ---- MCQ (foundation.mcq/v2) ---- */
export const OptionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
  correct: z.boolean(),
  /** why this option is right OR wrong */
  why: z.string().optional(),
});
export type Option = z.infer<typeof OptionSchema>;

export const McqSchema = z
  .object({
    schema: z.literal('foundation.mcq/v2').optional(),
    id: z.string().min(1),
    type: z.enum(['single', 'multi']).default('single'),
    moduleId: z.string().optional(),
    subject: z.string().optional(),
    sectionTag: z.string().optional(),
    sectionId: z.string().optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    highYield: z.boolean().optional(),
    stem: z.string().min(1),
    options: z.array(OptionSchema).min(2).max(6),
    explanation: z.array(z.string()).default([]),
    keyFacts: z.array(z.string()).default([]),
    teachingPoint: z.string().optional(),
    tags: z.array(z.string()).optional(),
    figure: FigureSchema.optional(),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.correct).length;
    if (correct < 1)
      ctx.addIssue({ code: 'custom', message: 'MCQ needs at least one correct option', path: ['options'] });
    if (q.type === 'single' && correct > 1)
      ctx.addIssue({
        code: 'custom',
        message: 'single-answer MCQ has more than one correct option',
        path: ['options'],
      });
  });
export type Mcq = z.infer<typeof McqSchema>;

/* ---- EMQ (foundation.emq/v1) — shared option bank, multiple stems ---- */
export const EmqOptionSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });
export const EmqStemSchema = z.object({
  id: z.string().optional(),
  stem: z.string().min(1),
  /** id of the correct option in the shared bank */
  answer: z.string().min(1),
  why: z.string().optional(),
});
export const EmqSchema = z
  .object({
    schema: z.literal('foundation.emq/v1').optional(),
    id: z.string().min(1),
    type: z.literal('emq').default('emq'),
    theme: z.string().min(1),
    instruction: z.string().optional(),
    sectionId: z.string().optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    options: z.array(EmqOptionSchema).min(2),
    stems: z.array(EmqStemSchema).min(1),
    keyFacts: z.array(z.string()).optional(),
  })
  .superRefine((e, ctx) => {
    const ids = new Set(e.options.map((o) => o.id));
    e.stems.forEach((s, i) => {
      if (!ids.has(s.answer))
        ctx.addIssue({
          code: 'custom',
          message: `stem ${i + 1} answer "${s.answer}" is not an option id`,
          path: ['stems', i, 'answer'],
        });
    });
  });
export type Emq = z.infer<typeof EmqSchema>;

/* ---- MNEMONIC ---- */
export const MnemonicSchema = z.object({
  cue: z.string().min(1),
  expansion: z.string().min(1),
  for: z.string().optional(),
});

/* ---- CHAPTER (foundation.study-module/v1) ---- */
export const ChapterSchema = z.object({
  schema: z.literal('foundation.study-module/v1'),
  id: z
    .string()
    .regex(/^[a-z0-9]+-ch\d+-[a-z0-9-]+$/, 'id must look like <subject>-ch<N>-<slug>'),
  subject: z.string().min(1),
  title: z.string().min(1),
  source: z
    .object({
      book: z.string().optional(),
      chapter: z.union([z.string(), z.number()]).optional(),
      title: z.string().optional(),
      pages: z.string().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  brand: z.string().optional(),
  estMinutes: z.number().positive().optional(),
  /**
   * Deck root for every card in this chapter, "::" between levels.
   * Defaults to "<subject>::<title>" when omitted.
   */
  deck: z.string().optional(),
  /** what a student should be able to do after this chapter */
  objectives: z.array(z.string()).default([]),
  /** one-paragraph recap shown at the end of the reader */
  summary: z.string().optional(),
  /** key terms — powers both the glossary panel and the colour lexicon */
  glossary: z.array(GlossaryEntrySchema).default([]),
  tags: z.array(z.string()).default([]),
  outline: z.array(z.string()).default([]),
  sections: z.array(SectionSchema).min(1),
  mnemonics: z.array(MnemonicSchema).default([]),
  cards: z.array(CardSchema).default([]),
  mcqs: z.array(McqSchema).default([]),
  emqs: z.array(EmqSchema).default([]),
});
export type Chapter = z.infer<typeof ChapterSchema>;

/** Format a ZodError into human-readable "path: message" lines. */
export function formatZodError(err: z.ZodError): string[] {
  return err.issues.map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)';
    return `${path}: ${i.message}`;
  });
}
