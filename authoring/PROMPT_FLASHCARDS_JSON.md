# Prompt — flashcard pack JSON

```text
Create one VALID JSON object for the Foundation medical-study website. Return
ONLY raw JSON: no Markdown fences, comments or explanation. Use British English,
no emoji, and accurate established medical knowledge only.

Create a flashcard pack on TOPIC: <TOPIC> for SUBJECT: <SUBJECT>. Source
material: <PASTE SOURCE OR WRITE ESTABLISHED KNOWLEDGE>.

Use a valid Foundation chapter shell:
{
  "schema":"foundation.study-module/v1",
  "id":"<subject>-ch<N>-<topic-slug>",
  "subject":"<SUBJECT>",
  "title":"<TOPIC>",
  "deck":"<SUBJECT>::<TOPIC>",
  "sections":[{"id":"s1","n":"1.1","title":"Core facts","deck":"Core facts","digest":"Brief orientation.","highYield":[],"tables":[],"pitfalls":[],"figures":[]}],
  "glossary":[], "mnemonics":[], "cards":[...], "mcqs":[], "emqs":[]
}

Create 40–80 cards across the real subtopics. Every card must have a unique id
like <chapter-id>-card-001, schema "foundation.card/v2", a valid sectionId, a
two-level deck path such as "Core facts::Definitions", and difficulty 1, 2 or 3.
Use mostly basic and cloze cards. Basic cards require front and back. Cloze cards
require only cloze with {{c1::answer}}. One fact per card. Do not write a card
whose answer is empty. Internally validate JSON, unique ids, valid sectionIds and
valid cloze syntax before returning.
```

Publish the resulting file from **Settings → Admin → Publish a chapter**.
