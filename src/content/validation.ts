import type { Chapter } from './schema';

/** Semantic checks shared by build-time validation and administrator publishing. */
export function chapterSemanticIssues(pack: Chapter): string[] {
  const issues: string[] = [];
  const sectionIds = new Set(pack.sections.map((section) => section.id));

  function unique(values: string[], path: string) {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) issues.push(`${path}.${index}: duplicate id “${value}”.`);
      seen.add(value);
    });
  }

  function requireChapterNamespace(id: string, path: string) {
    if (!id.startsWith(`${pack.id}-`)) {
      issues.push(`${path}: id “${id}” must start with “${pack.id}-” so progress cannot collide with another chapter.`);
    }
  }

  unique(pack.sections.map((section) => section.id), 'sections');
  unique(pack.cards.map((card) => card.id), 'cards');
  unique(pack.mcqs.map((question) => question.id), 'mcqs');
  unique(pack.emqs.map((question) => question.id), 'emqs');

  pack.cards.forEach((card, index) => {
    requireChapterNamespace(card.id, `cards.${index}.id`);
    const sectionId = card.sectionId || card.tag;
    if (!sectionId) issues.push(`cards.${index}.sectionId: a section reference is required.`);
    else if (!sectionIds.has(sectionId)) issues.push(`cards.${index}.sectionId: “${sectionId}” does not match a section.`);
    if (typeof card.image === 'string' && !(card.image in pack.images)) {
      issues.push(`cards.${index}.image: “${card.image}” is not present in the chapter images map.`);
    }
    if (card.masks) unique(card.masks.map((mask) => mask.id), `cards.${index}.masks`);
  });

  pack.mcqs.forEach((question, index) => {
    requireChapterNamespace(question.id, `mcqs.${index}.id`);
    const sectionId = question.sectionId || question.sectionTag;
    if (!sectionId) issues.push(`mcqs.${index}.sectionId: a section reference is required.`);
    else if (!sectionIds.has(sectionId)) issues.push(`mcqs.${index}.sectionId: “${sectionId}” does not match a section.`);
    unique(question.options.map((option) => option.id), `mcqs.${index}.options`);
    const optionText = new Set<string>();
    question.options.forEach((option, optionIndex) => {
      const key = option.text.trim().toLocaleLowerCase();
      if (optionText.has(key)) issues.push(`mcqs.${index}.options.${optionIndex}.text: duplicate option text.`);
      optionText.add(key);
    });
  });

  pack.emqs.forEach((question, index) => {
    requireChapterNamespace(question.id, `emqs.${index}.id`);
    if (!question.sectionId) issues.push(`emqs.${index}.sectionId: a section reference is required.`);
    else if (!sectionIds.has(question.sectionId)) issues.push(`emqs.${index}.sectionId: “${question.sectionId}” does not match a section.`);
    unique(question.options.map((option) => option.id), `emqs.${index}.options`);
    unique(question.stems.flatMap((stem) => stem.id ? [stem.id] : []), `emqs.${index}.stems`);
  });

  pack.mnemonics.forEach((mnemonic, index) => {
    if (mnemonic.for && !sectionIds.has(mnemonic.for)) {
      issues.push(`mnemonics.${index}.for: “${mnemonic.for}” does not match a section.`);
    }
  });

  const glossaryTerms = new Set<string>();
  pack.glossary.forEach((entry, index) => {
    const key = entry.term.trim().toLocaleLowerCase();
    if (glossaryTerms.has(key)) issues.push(`glossary.${index}.term: duplicate glossary term.`);
    glossaryTerms.add(key);
  });

  return issues;
}

/** Cross-file identities must be unique before an all-or-nothing batch is staged. */
export function batchSemanticIssues(packs: Chapter[]): string[] {
  const issues: string[] = [];
  const owners = {
    chapter: new Map<string, string>(),
    card: new Map<string, string>(),
    MCQ: new Map<string, string>(),
    EMQ: new Map<string, string>(),
  };

  function register(kind: keyof typeof owners, id: string, chapterId: string) {
    const previous = owners[kind].get(id);
    if (previous) issues.push(`${chapterId}: duplicate ${kind} id “${id}” also appears in ${previous}.`);
    else owners[kind].set(id, chapterId);
  }

  for (const pack of packs) {
    issues.push(...chapterSemanticIssues(pack).map((issue) => `${pack.id}: ${issue}`));
    register('chapter', pack.id, pack.id);
    pack.cards.forEach((item) => register('card', item.id, pack.id));
    pack.mcqs.forEach((item) => register('MCQ', item.id, pack.id));
    pack.emqs.forEach((item) => register('EMQ', item.id, pack.id));
  }
  return issues;
}
