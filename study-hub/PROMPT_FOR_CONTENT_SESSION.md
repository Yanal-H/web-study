# Prompt: populate Study Hub from a source PDF

Copy everything below the line into a **new** Claude session (Opus, max
effort/thinking). Attach your PDF to that same message. Do the setup steps
first — Opus needs a live server and credentials to actually write anything.

## Setup (you, before running this)

1. Get the app running somewhere reachable — locally (`cd study-hub && npm
   install && npm start`, default `http://localhost:3000`) or deployed
   (Render URL, etc.).
2. Open it in a browser and register the **first** account — it automatically
   becomes admin. Note the username/password.
3. Decide how Opus will authenticate:
   - Simplest: give Opus your own admin username/password in the prompt below.
   - Cleaner: from **Manage → Invites**, generate an invite code and give
     Opus that instead, so it registers its own "content-bot" account.
4. Fill in the four bracketed values at the top of the prompt (`SERVER_URL`,
   credentials, and the topic/subject name), then paste it plus the PDF.

---

```
You are populating a real, running study platform called Study Hub with
thorough, accurate content built from a source PDF I'm attaching, plus your
own research. This is not a demo or a mockup — you'll be making live HTTP
calls against a real server, and the content you create is what I'll
actually study from. Treat accuracy and completeness accordingly: I want to
stop needing other resources after this.

SERVER_URL: [e.g. http://localhost:3000]
LOGIN: username=[...] password=[...]   (or) INVITE_CODE=[...] for a new account
SUBJECT NAME: [what this PDF is about — e.g. "Acid-Base Physiology"]

## 0. Orient yourself

- Read the attached PDF closely, start to finish. Don't skim — this is the
  primary source and its structure (chapters, headings, figures, tables)
  should inform how you organize the content you create.
- Then research beyond it. Use web search to find current, authoritative
  supplementary sources for the same topic: standard textbooks, primary
  literature, professional-society guidelines, university course materials.
  Use this to fill gaps the PDF leaves, catch anything outdated, and to
  populate the Resources list with real, verified links (fetch each one to
  confirm it actually exists and is on-topic before including it — never
  invent a URL).
- If the PDF and your research disagree, or you're not confident about a
  specific number/dose/detail, say so in the notes rather than inventing
  precision. Getting less content that's right beats more content that's
  wrong — this is medical material.

## 1. How the app works (read this before calling anything)

Auth is cookie-based. Register or log in once, keep the session cookie, and
reuse it for every call after. If you're logged in with `curl`, use a
cookie jar (`-c cookies.txt -b cookies.txt` on every call). If you're
scripting with `fetch`/Node, keep `credentials: 'include'` and persist the
`Set-Cookie` header manually if not in a browser context.

    POST {SERVER_URL}/api/register   { "username": "...", "password": "...", "inviteCode": "..." }
    POST {SERVER_URL}/api/login      { "username": "...", "password": "..." }

Everything else goes through **one endpoint**, called as many times as you
need (it's additive — call it repeatedly to build up one subject in
batches, e.g. topics first, then notes, then questions in a few calls):

    POST {SERVER_URL}/api/import
    Content-Type: application/json

    {
      "subject": { "name": "Acid-Base Physiology", "color": "#22d3ee" },
      "topics": ["Buffer systems", "Respiratory compensation", "..."],
      "notes": { "mode": "replace", "text": "# Acid-Base Physiology\n\n...markdown, headers, lists, **bold**, and LaTeX math like $HCO_3^- / (0.03 \\times PaCO_2)$..." },
      "mnemonics": [ { "term": "...", "prompt": "...", "answer": "..." } ],
      "resources": [ { "title": "...", "url": "https://...", "category": "Textbook" } ],
      "questions": [
        { "stem": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0,
          "explanation": "Why the right answer is right AND why each distractor is wrong — this is the actual teaching moment, don't shortchange it.",
          "tags": ["acid-base"] }
      ],
      "flashcards": [ { "front": "...", "back": "..." } ],
      "diagrams": [ { "title": "...", "caption": "...", "svg": "<svg ...>...</svg>" } ]
    }

Notes on the schema:
- `subject`: pass `{ "name": ... }` — it finds an existing subject with that
  name (case-insensitive) or creates one, so calling `/api/import` multiple
  times for the same topic won't create duplicates. Use the *same* name on
  every call in this session. `color` is optional (any `#rrggbb`).
- `notes.mode`: `"replace"` the first time, `"append"` for later calls if
  you're building the notes up in sections (there's a ~20,000 character cap
  per subject — if you have more than that, prioritize; don't pad).
  Markdown and LaTeX (`$...$` inline, `$$...$$` block) both render.
- `questions[].choices`: 2–6 strings; `correctIndex` is 0-based into that
  array. Write real USMLE-style stems (a vignette, not "What is X?") where
  the source material supports it.
- Every array field is optional and additive — omit what you're not adding
  in a given call, nothing gets overwritten except `notes` in replace mode.
- Full response tells you exactly what was created vs. skipped
  (`{created:{...}, skipped:{...}, errors:[...]}`) — check it after every
  call and fix whatever got skipped rather than assuming it worked.

## 2. Diagrams — read this section before writing any `svg` field

This is the part I care most about getting right. Do **not** describe a
diagram in prose and call it done, and do not produce a generic auto-layout
diagram that could describe any topic. If you have access to the
`artifact-diagramming` skill (or equivalent guidance on hand-authored inline
SVG), load and follow it before writing any diagram. If not, follow this
directly:

- Every diagram must be a complete, valid `<svg viewBox="0 0 W H" role="img"
  aria-label="...">...</svg>` element built from native shapes (`rect`,
  `circle`, `line`, `polyline`, `path`, `text`) — no `<script>`, no
  `<image>`, no external references, no diagram-library syntax (this isn't
  Mermaid). The server will reject anything with a `<script>` tag, event
  handler attributes, or non-fragment `href`s, so don't bother trying.
- Use `stroke="currentColor"` / `fill="currentColor"` for structural lines
  and text so it themes correctly against the app's dark/light modes.
  Reserve one literal color only for the single element that's the actual
  point of the diagram (the rate-limiting step, the boundary being crossed).
- **Draw the mechanism, not a label.** A box that says "kidney" is worse
  than the sentence it replaces. A diagram showing filtrate entering
  Bowman's capsule, the three reabsorption/secretion arrows at each nephron
  segment, and where a specific drug or hormone acts — that earns its place.
  Ask "what would the reader otherwise have to assemble from three
  paragraphs of prose" and draw exactly that.
  - A physiological pathway or cycle → flow with labeled, directional arrows
  - Two mechanisms being compared/contrasted → literally side by side,
    sharing a baseline, with the actual difference visually obvious
  - A structure's spatial relationships → simplified schematic geometry,
    not photorealism — anatomically honest proportions and adjacency, not
    decorative
- Label every arrow with what it represents (`filters`, `reabsorbs Na+`,
  `inhibited by furosemide`) — an unlabeled arrow says nothing.
- Keep text at roughly 11–13px at the scale you're drawing, short labels
  (a word or three), and align things to a shared grid — eyeballed offsets
  read as sloppy at this size.
- Only build a diagram where a picture genuinely earns its place over
  prose — a handful of excellent, load-bearing diagrams beats one per
  topic. Aim for quality and relevance, not coverage.
- Before calling `/api/import`, sanity-check your own SVG: does the
  `viewBox` actually contain everything you drew? Do coordinates make
  geometric sense (a "before/after" comparison should have consistent axes
  between the two sides)? Would this diagram, alone, teach the mechanism to
  someone who hasn't read the text next to it?

## 3. Target coverage (don't undershoot this)

For a typical single-topic PDF chapter/section, aim for roughly:
- 15–30 topics (a real structured outline, following the PDF's own
  organization where it has one)
- Notes: comprehensive — headers, definitions, key relationships, the
  "why" behind mechanisms, exam-relevant pearls, not a bullet-point
  skeleton
- 15–30 practice questions, vignette-style where the material supports it,
  with explanations that teach (address every wrong answer, not just the
  right one)
- 30–60 flashcards covering discrete facts, definitions, and relationships.
  If a fact is naturally a "fill in the blank" (a value, a named structure,
  a step in a sequence), write it as a **cloze pair yourself** — put the
  blanked version in `front` and the fully revealed version in `back` (the
  API takes literal front/back text; it does not parse `{{c1::}}` syntax —
  that only happens in the app's UI form, not here)
- 5–15 mnemonics, only for content that's genuinely mnemonic-shaped
  (memorizing an ordered list, a set of features) — don't force one
  everywhere
- 5–10 resources: real links you've verified, each with a specific reason
  it's useful (the category field plus a title that says what it is)
- 3–8 diagrams: only the ones that clear the bar in section 2

Scale this up or down to match how much the PDF and your research actually
support — the target is "I stop needing outside resources for this topic,"
not a specific number.

## 4. When you're done

- Re-fetch `GET {SERVER_URL}/api/state` and sanity-check: does the subject
  you created contain roughly what you intended? Spot check a couple of
  questions and a diagram by eye.
- Give me a short summary: what subject/topics you created, counts for
  each content type, which resources you verified, and anything from the
  PDF you were uncertain about or deliberately left out.
```
