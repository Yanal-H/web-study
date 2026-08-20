# Authoring guide

How a pack becomes the app. Read this once; then use the prompt that matches
your task: `PROMPT_STUDY_GUIDE_JSON.md`, `PROMPT_FLASHCARDS_JSON.md`,
`PROMPT_MCQS_JSON.md`, or the combined `AI_CONTENT_PROMPT.md`.

## The loop

1. Copy `AI_CONTENT_PROMPT.md` into any strong AI, fill in the four placeholders at the bottom.
2. Save the reply as `content/<subject>/ch<NN>-<slug>.json`.
3. Sign in with your administrator account and publish it under **Admin → Shared study content**
   (choose the JSON file or paste its contents). Students cannot import or alter
   shared chapters.
4. The build validates every file. A bad field fails the build with the exact path —
   `sections.2.digest: String must contain at least 1 character(s)` — so nothing broken
   ever reaches a student.

## Where each field lands

| Field | Where it shows up |
|---|---|
| `title`, `subject`, `source`, `estMinutes` | Study library card, reader header |
| `objectives` | Top of the reader — "what you should be able to do" |
| `outline` | Reader table of contents |
| `sections[].digest` | The reading body, with colour-coded terms |
| `sections[].highYield` | Must-know block after each section |
| `sections[].tables` | Rendered as real tables, scrollable on mobile |
| `sections[].pitfalls` | Warning block |
| `sections[].figures` | Figure block (described figures render as prose to draw) |
| `glossary` | Glossary panel **and** the colour lexicon for the whole app |
| `mnemonics` | Mnemonics tab, tap to reveal |
| `cards` | Flashcards, filed into the deck tree, scheduled by FSRS |
| `mcqs`, `emqs` | Question bank, all modes |
| `summary` | End of the reader |

## Deck paths

A card's full deck is the chapter root plus the card's own path:

```
chapter.deck            "Surgery::Wound Healing"
card.deck                          "Types of wounds::Bites"
full path               "Surgery::Wound Healing::Types of wounds::Bites"
                          deck   ::  sub-deck  ::   sub-sub  :: sub-sub-sub
```

- Separator is `::` with no spaces around it.
- Two levels in `card.deck` is the sweet spot. One level works; three gets fussy.
- Keep names short — they appear in a tree.
- If you omit `card.deck` the card lands in its section's deck automatically, so old
  files keep working.

## Term colours

`glossary[].kind` decides the colour a term gets everywhere it appears:

`drug` · `organism` · `cell` · `mediator` · `condition` · `test` · `procedure` ·
`structure` · `value` · `warning`

Numbers, doses, percentages and durations are coloured automatically — you do not need
to list them. Add `aliases` for plurals and abbreviations so every mention is caught.

## Images

Default to described figures — they need no files and work offline:

```json
{ "kind": "described", "alt": "Layers of a chronic ulcer.",
  "described": "A cross-section showing, from the surface down: slough, granulation…" }
```

If you do have an image, put the file in `public/content-images/` and reference it as
`"src": "/content-images/name.png"` with `"kind": "image"`. `alt` is always required.

## Updating a chapter that already exists

Download or copy the complete current chapter and give it to the AI together with
the approved additions. Require the AI to return the **complete updated chapter**,
preserve every existing stable ID, assign chapter-prefixed IDs only to new items,
and change only the fields you authorised. Partial fragments are rejected because
publishing one as a replacement could silently erase the rest of the chapter.

## Volume that actually covers a topic

| Item | Per chapter |
|---|---|
| Sections | 6–12 |
| Tables | 4+ |
| Glossary | 20–40 |
| Cards | 90–150 across 8–20 sub-topics |
| MCQs | 45–70 |
| EMQ sets | 3–6 |
| Mnemonics | 3–8 |

A chapter at these numbers is roughly a full week of revision for one student.

## Checking a file yourself

```bash
npm run validate:content
```

Prints one line per chapter with its counts, or the exact failing field.

The machine-readable contract lives in `content/_schema/chapter.schema.json`, and a
valid worked example in `content/_schema/template.json`.

## Supported import files

The administrator can upload or paste four validated JSON schemas:

| Purpose | Schema | Template |
|---|---|---|
| Complete mixed chapter | `foundation.study-module/v1` | `content/_schema/template.json` |
| Study guide only | `foundation.study-material/v1` | `content/_schema/study-material.template.json` |
| Flashcards only | `foundation.flashcard-deck/v1` | `content/_schema/flashcard-deck.template.json` |
| MCQs/EMQs only | `foundation.mcq-bank/v1` | `content/_schema/mcq-bank.template.json` |

Every file must still identify a complete student-visible chapter with `id`,
`subject`, `title`, and at least one section. Cards and questions require stable,
chapter-prefixed IDs and real section references. MCQ options require IDs and a
rationale, and every MCQ requires an explanation. These rules preserve student
review history when content is reordered or updated.

The three specialised schemas are normalised into the canonical chapter schema
before a draft reaches Supabase. Old fragments containing only `deckName`,
`questions`, or `chapterId` are deliberately rejected because they do not contain
enough metadata to create a safe chapter.
