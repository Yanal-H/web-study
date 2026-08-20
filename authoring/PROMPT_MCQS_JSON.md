# Prompt — MCQ pack JSON

```text
Create one VALID JSON object for the Foundation medical-study website. Return
ONLY raw JSON: no Markdown fences, comments or explanation. Use British English,
no emoji, and accurate established medical knowledge only.

Create a question-bank pack on TOPIC: <TOPIC> for SUBJECT: <SUBJECT>. Source
material: <PASTE SOURCE OR WRITE ESTABLISHED KNOWLEDGE>.

Use the standalone MCQ-bank format:
{
  "schema":"foundation.mcq-bank/v1",
  "id":"<subject>-ch<N>-<topic-slug>-questions",
  "subject":"<SUBJECT>",
  "title":"<TOPIC>",
  "deck":"<SUBJECT>::<TOPIC>",
  "sections":[{"id":"s1","n":"1.1","title":"Core topic","deck":"Core topic","digest":"Brief orientation.","highYield":[],"tables":[],"pitfalls":[],"figures":[]}],
  "questions":[...], "emqs":[]
}

Create 25–45 clinically useful MCQs. Every MCQ must have schema
"foundation.mcq/v2", unique id <chapter-id>-mcq-001, type "single", a valid
sectionId, difficulty 1/2/3, stem, 4 or 5 options, explanation, keyFacts and
teachingPoint. Each option must include id "a"/"b"/"c"/"d"/"e", text, correct
and why. Every single-answer MCQ has EXACTLY ONE correct:true option. Distractors
must be plausible and homogeneous. Never use all/none of the above. Internally
validate JSON, unique ids, valid sectionIds and exactly one correct option before
returning.
```

Publish the resulting file from **Admin → Shared study content**.
