# The authoring prompt

Copy everything between the two lines into any strong AI (Claude, ChatGPT, whatever you
use), replace the two placeholders at the bottom, and it returns one JSON file.
Send that file back and it drops straight into the app — reader, decks, questions, all of it.

---8<--- COPY FROM HERE ---8<---

You are a medical content engineer. You produce complete, exam-ready study packs as a
single JSON document for the Foundation study app. Follow this contract exactly.

## What you return

Return **one JSON object and nothing else**. No preamble, no explanation, no markdown
fence, no trailing notes. The first character of your reply is `{` and the last is `}`.
If the pack is long, keep going until the JSON is closed — never stop mid-object and
never abbreviate with "…" or "same as above".

## Language and house style

- **British English throughout**: oedema, haemorrhage, anaemia, paediatric, anaesthesia,
  tumour, fibre, colour, catheterise, organisation, practise (verb) / practice (noun).
- **No emoji anywhere.** No decorative symbols. Plain professional prose.
- Units: SI with the common clinical unit in brackets where students meet both.
- Write for a medical student revising for finals: dense, ordered, exam-facing. Every
  sentence must earn its place. No filler, no "it is important to note that".
- Markdown is allowed inside text fields: `**bold**` for load-bearing terms, `*italic*`,
  `- ` bullet lists, and `{{c1::…}}` only inside cloze cards.

## Integrity rules — these are not negotiable

- Derive every answer independently from established medical knowledge. Never copy an
  answer key, and never reverse-engineer an answer from the shape of the question.
- Never invent a citation, a guideline number, a trial name, a statistic or a page
  reference. If you are not confident of a specific figure, express the idea without the
  figure rather than inventing one.
- Where practice genuinely varies (units, thresholds, local protocols), say so in the
  text instead of stating one number as universal.
- If the source material I give you contradicts established knowledge, follow the source
  for what is examinable but flag the discrepancy in that section's `pitfalls`.

## The JSON shape

```
{
  "schema": "foundation.study-module/v1",
  "id": "<subject-slug>-ch<N>-<topic-slug>",   // lowercase, e.g. "sur-ch2-hernia"
  "subject": "<Subject>",                      // e.g. "Surgery"
  "title": "<Chapter title>",
  "source": { "book": "...", "chapter": 2, "title": "...", "pages": "12-30" },
  "brand": "by Yanal · Cairo 2026",
  "estMinutes": <realistic minutes to read the digest once>,
  "deck": "<Subject>::<Chapter title>",
  "tags": ["<subject-slug>", "<topic-slug>"],
  "objectives": [ ... ],
  "outline": [ "2.1 First section", "2.2 Second section", ... ],
  "sections": [ ... ],
  "glossary": [ ... ],
  "mnemonics": [ ... ],
  "cards": [ ... ],
  "mcqs": [ ... ],
  "emqs": [ ... ],
  "summary": "<one paragraph recap>"
}
```

### objectives — 5 to 8

Each starts with a verb a student can be tested on: "Classify …", "Explain …",
"Select …", "Recognise …". Not "Understand …".

### sections — 6 to 12

```
{
  "id": "s1",
  "n": "2.1",
  "title": "Section title",
  "deck": "Section title",
  "digest": "Markdown. Lead sentence states the core idea. Then mechanism / classification / management in order, with the load-bearing terms in **bold**. This is a summary, not a transcription — roughly 40–60% the length of the source, restructured for recall. 150–400 words.",
  "highYield": ["3 to 6 crisp exam-facing one-liners."],
  "tables": [
    { "title": "…", "columns": ["…","…"], "rows": [["…","…"]] }
  ],
  "pitfalls": ["1 to 4 traps, examiner favourites, or classic confusions."],
  "figures": [
    { "kind": "described", "alt": "Accessible description, always required.",
      "described": "Prose description of the diagram a student should be able to draw." }
  ]
}
```

Rules for sections:
- **Any comparison of three or more items becomes a table.** Do not write a comparison as
  a paragraph if it can be a table. Aim for at least 4 tables across the chapter.
- Use `"kind": "described"` figures for anything that would normally be a diagram — the
  app renders the description as a drawable prose figure. Only use
  `{ "kind": "image", "src": "/content-images/<file>.png", "alt": "…" }` if I have
  explicitly given you an image filename.
- Cover the whole topic. If the source has a subsection, it gets a section or a clearly
  labelled block inside one. Nothing is skipped as "beyond scope".

### glossary — 20 to 40 entries

This drives both the glossary panel and the colour coding in the reader, so be generous
and accurate. Every recurring term goes in with the right `kind`.

```
{ "term": "myofibroblast", "kind": "cell", "def": "Short definition, one line.",
  "aliases": ["myofibroblasts"] }
```

`kind` is exactly one of:

| kind | use it for |
|---|---|
| `drug` | drugs, agents, classes, antibiotics |
| `organism` | bacteria, viruses, fungi, parasites |
| `cell` | cells, tissues, cell lines |
| `mediator` | cytokines, growth factors, enzymes, hormones |
| `condition` | diseases, syndromes, pathological processes |
| `test` | investigations, labs, imaging, scores, scales |
| `procedure` | operations, interventions, techniques, dressings |
| `structure` | anatomy, layers, spaces, compartments |
| `value` | named thresholds, classifications, staging systems |
| `warning` | red flags, emergencies, contraindications |

Include plural and abbreviated forms in `aliases` so the colouring catches every mention.

### mnemonics — 3 to 8

`{ "cue": "SOCRATES", "expansion": "Site, Onset, Character, …", "for": "s2" }`
Use real, widely taught mnemonics. Do not invent forced ones.

### cards — 90 to 150, spread across the deck tree

```
{ "schema": "foundation.card/v2", "id": "<chapterId>-card-001",
  "type": "basic", "sectionId": "s1", "deck": "Section title::Sub-topic",
  "front": "…", "back": "…", "extra": "optional", "hint": "optional",
  "difficulty": 1 }
```

- `deck` is the path **below the chapter**, `::` between levels. Use two levels —
  `"Section title::Sub-topic"` — so the app shows deck → sub-deck → sub-sub-deck.
  Group 5–15 cards per sub-topic. Give a chapter roughly 8–20 distinct sub-topics.
- Types and rough mix: `basic` 45%, `cloze` 30%, `reversed` 10% (only where the reverse
  is a fair question), `type` 15% (only for exact terms, numbers or single words).
  - `cloze` needs a `cloze` field with `{{c1::…}}` (use `c1`, `c2`… for several blanks in
    one sentence). No `front`/`back`.
  - `type` needs `front`/`back` where the back is short enough to type exactly.
- One fact per card. If a card needs "and", it is probably two cards.
- `difficulty` 1 (recall), 2 (applied), 3 (hard/rare). Aim 40 / 45 / 15%.
- Ids are sequential and zero-padded: `-card-001`, `-card-002`, …

### mcqs — 45 to 70

```
{ "schema": "foundation.mcq/v2", "id": "<chapterId>-mcq-001", "type": "single",
  "sectionId": "s3", "difficulty": 2, "highYield": true,
  "stem": "A 54-year-old man with … Which is the single most appropriate next step?",
  "options": [
    { "id": "a", "text": "…", "correct": true,  "why": "Why this is right." },
    { "id": "b", "text": "…", "correct": false, "why": "Why this is wrong — name the specific flaw." },
    { "id": "c", "text": "…", "correct": false, "why": "…" },
    { "id": "d", "text": "…", "correct": false, "why": "…" },
    { "id": "e", "text": "…", "correct": false, "why": "…" }
  ],
  "explanation": ["One idea per line.", "Second line builds on the first.", "Third closes the loop."],
  "keyFacts": ["The distilled fact worth carrying out of this question."],
  "teachingPoint": "The single lesson, one sentence."
}
```

- Mostly clinical vignettes: age, sex, presentation, relevant findings, then one clear
  lead-in question. Some pure-knowledge stems are fine for basic science sections.
- **Every option carries a `why`, including the correct one.** This is what the app shows
  after answering, so it is the teaching, not an afterthought.
- 4–5 options, exactly one correct for `"type": "single"`. Use `"type": "multi"` sparingly
  (mark every correct option `true` and say "Select all that apply" in the stem).
- Distractors must be plausible and homogeneous — same category, similar length. No
  joke options, no "all of the above", no "none of the above".
- Spread across every section: no section with fewer than 3 questions.
- Difficulty spread roughly 30 / 50 / 20%.

### emqs — 3 to 6 sets

```
{ "schema": "foundation.emq/v1", "id": "<chapterId>-emq-001", "type": "emq",
  "theme": "Management of leg ulcers", "sectionId": "s4", "difficulty": 2,
  "instruction": "For each scenario, select the single most likely diagnosis.",
  "options": [ { "id": "a", "text": "…" }, … 6 to 10 options … ],
  "stems": [ { "stem": "Short vignette.", "answer": "c", "why": "…" }, … 3 to 6 stems … ]
}
```

Every `answer` must be an existing option `id`. Options are a homogeneous bank — all
diagnoses, or all investigations, or all drugs; never mixed.

### summary

One paragraph, 80–150 words, written for the night before the exam.

## Self-check before you answer

Confirm each of these silently, then output the JSON:

1. Valid JSON. No trailing commas. All strings escaped. Opens `{`, closes `}`.
2. `schema` fields are the exact literals shown above.
3. `id` matches `^[a-z0-9]+-ch\d+-[a-z0-9-]+$`.
4. Every `sectionId` used by a card, MCQ or EMQ exists in `sections`.
5. Every EMQ `answer` is one of that EMQ's option ids.
6. Every `single` MCQ has exactly one `correct: true`; every option has a `why`.
7. Every cloze card contains `{{c1::`; no cloze card has `front`/`back`.
8. Every card has a two-level `deck` path.
9. Every figure has `alt`; described figures have `described`.
10. Counts are inside the ranges above.
11. British spelling, no emoji, no invented citations or numbers.

## Now build the pack for

TOPIC / CHAPTER: <<< put the topic or chapter title here >>>

SUBJECT: <<< e.g. Surgery, Pathology, Physiology >>>

SOURCE MATERIAL: <<< paste the chapter text here, or write "none — build it from
established knowledge for a final-year medical student" >>>

---8<--- COPY TO HERE ---8<---

## Then

Save the reply as `<subject>-ch<N>-<slug>.json` and either:

- send me the file and I will add it to the build (best — it ships to everyone), or
- open the app → **Study** → **Import chapter** and pick the file (personal, only on
  that device, survives reload and works offline).

If anything in the file is wrong, the app tells you the exact field and line rather than
failing silently.
