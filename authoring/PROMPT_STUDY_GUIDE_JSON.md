# Prompt — study guide JSON

```text
Create one VALID JSON object for the Foundation medical-study website. Return
ONLY raw JSON: no Markdown fences, comments or explanation. Use British English,
no emoji, and accurate established medical knowledge only.

Create a study guide on TOPIC: <TOPIC> for SUBJECT: <SUBJECT>. Source material:
<PASTE SOURCE OR WRITE ESTABLISHED KNOWLEDGE>.

Use exactly this top-level structure:
{
  "schema":"foundation.study-module/v1",
  "id":"<subject>-ch<N>-<topic-slug>",
  "subject":"<SUBJECT>",
  "title":"<TOPIC>",
  "estMinutes":30,
  "deck":"<SUBJECT>::<TOPIC>",
  "objectives":["..."],
  "outline":["1.1 ..."],
  "sections":[...],
  "glossary":[...],
  "mnemonics":[],
  "cards":[],
  "mcqs":[],
  "emqs":[],
  "summary":"..."
}

The id must match ^[a-z0-9]+-ch\d+-[a-z0-9-]+$. Create 6–10 sections. Each
section must contain id, n, title, deck, digest, highYield, tables, pitfalls and
figures. Use {"kind":"described","alt":"...","described":"..."} for a
diagram. Give every section a concise, exam-facing digest and 3–6 high-yield
facts. Turn comparisons with three or more items into tables. Include 20–40
glossary entries. Validate internally that the response is JSON before returning.
```

Publish the resulting file from **Settings → Admin → Publish a chapter**.
