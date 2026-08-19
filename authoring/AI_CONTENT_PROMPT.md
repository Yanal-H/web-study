# Prompt: generate a Foundation study guide + MCQs as valid JSON

Copy everything inside the block below into another AI, fill in the four input
lines at the end, and save its response as a `.json` file. The AI must return
only JSON; the administrator can then publish it in **Settings → Admin**.

```text
You are a medical-education author for Foundation. Create one complete study
guide and its question bank as one VALID JSON object for the Foundation website.

Return only the JSON object. Do not use Markdown fences, comments, prose before
or after the JSON, trailing commas, citations you cannot verify, or keys not
defined below. Use British English and no emoji.

The exact top-level shape is:
{
  "schema": "foundation.study-module/v1",
  "id": "<lowercase-subject>-ch<N>-<lowercase-topic-slug>",
  "subject": "<Subject>",
  "title": "<Title>",
  "source": { "book": "<optional>", "chapter": "<optional>", "title": "<optional>", "pages": "<optional>" },
  "brand": "by Yanal · Cairo 2026",
  "estMinutes": 30,
  "deck": "<Subject>::<Title>",
  "tags": ["..."],
  "objectives": ["Classify …", "Explain …"],
  "outline": ["1.1 …"],
  "sections": [ ... ],
  "glossary": [ ... ],
  "mnemonics": [ ... ],
  "cards": [ ... ],
  "mcqs": [ ... ],
  "emqs": [ ... ],
  "summary": "..."
}

The id must match ^[a-z0-9]+-ch\d+-[a-z0-9-]+$. Write 6–12 sections. Every
section must have: { "id": "s1", "n": "1.1", "title": "…", "deck": "…",
"digest": "…", "highYield": ["…"], "tables": [], "pitfalls": [],
"figures": [] }. Use Markdown only inside text values. Convert comparisons of
three or more things into tables: { "title": "…", "columns": ["…"],
"rows": [["…"]] }. A described figure is
{ "kind": "described", "alt": "accessible description", "described": "…" }.

Optional bilingual/Chinese enrichment belongs inside a section as:
"extraKnowledge": [
  {
    "title": "Chinese terminology",
    "body": "中文术语（English term）— short, source-grounded explanation.",
    "language": "zh",
    "source": "optional trustworthy source"
  }
]
Use it only when the request asks for Chinese or bilingual support. Never invent
medical facts, translations, references, guidelines or numbers.

Make 20–40 active-recall cards. Each has
"schema": "foundation.card/v2", a unique id such as
"<chapter-id>-card-001", a real sectionId, a deck path, and difficulty 1, 2 or
3. Basic/reversed/type cards need front and back. Cloze cards need a cloze value
containing {{c1::answer}} and no front/back.

Make 20–35 MCQs. Each has
"schema": "foundation.mcq/v2", a unique id such as "<chapter-id>-mcq-001",
"type": "single", a real sectionId, difficulty 1/2/3, a clear stem, 4–5
plausible homogeneous options, explanation, keyFacts and teachingPoint. Every
option must have id a/b/c/d/e, text, correct and why. A single-answer MCQ has
EXACTLY ONE option with "correct": true. Do not use “all/none of the above”.

Optionally add 1–3 EMQ sets. Each has "schema": "foundation.emq/v1",
"type": "emq", theme, instruction, real sectionId, options with unique ids,
and stems whose answer exactly matches one option id.

Before returning, silently check: valid JSON; all sectionId values exist; unique
chapter/card/MCQ ids; every figure has alt text; all MCQ and EMQ answers are
valid; no unsupported keys; all explanations and Chinese terms are accurate.

TOPIC / CHAPTER: <FILL THIS IN>
SUBJECT: <FILL THIS IN>
SOURCE MATERIAL: <PASTE TRUSTWORTHY MATERIAL OR SAY "ESTABLISHED KNOWLEDGE">
LANGUAGE SUPPORT: <English only | Chinese terms | bilingual>
```
