# Review prompt — Foundation Med-School Toolkit (v8)

Paste everything below the line into another AI tool (Claude, GPT, Gemini, etc.), and
attach the file `Foundation__Med_School_Toolkit-8.html` (or `index.html` — they are
identical). The reviewer's job is to critique, **not** to rewrite the whole file. The
output is meant to be handed straight back to the developer AI that builds the app.

---

You are a senior reviewer auditing a **single-file, fully offline, zero-dependency
HTML study application** for medical students. The entire app — HTML, CSS and
JavaScript — lives in the one file attached. It persists to `localStorage`, runs with
no network access of any kind, and ships under the brand **"by Yanal · Cairo 2026"**.

Read the file end to end before writing anything. Then review it against the areas
below and return findings in the exact format specified at the end.

## Hard constraints you must respect (do not propose anything that breaks these)
- **One self-contained `.html` file. Zero runtime dependencies, zero network fetches**
  (no CDNs, no web fonts, no external images). Typography uses the system-font tokens
  `--font-display / --font-ui / --font-mono`.
- **Offline-first**, `localStorage` key `foundation_med_study_v1`, additive
  migration-safe schema (currently `SCHEMA_VERSION = 4`) — no change may drop or
  corrupt existing user data.
- **No emoji anywhere** — icons are inline stroke SVGs.
- **British spelling** throughout UI copy and comments.
- Preserve the three themes (midnight / paper / clinic) and the flash-free pre-paint
  theme script.

## What the app already contains (so you don't "discover" it as missing)
- Study Engine: baked chapter **modules** (`foundation.study-module/v1`), a textbook
  **Reader** (sticky TOC, tables, must-know / pitfalls callouts, mark-reviewed).
- **SM-2+ scheduler** (`scheduleCard`) with learning/relearning steps, ease deltas,
  interval multipliers, fuzz, daily new/review caps, leech handling, sibling burying;
  `sm2()` kept as a back-compat wrapper. Tunables in `state.settings.scheduler`.
- **MCQ v2** (`foundation.mcq/v2`): vignette+stem, per-option rationale, ordered
  `explanation[]`, `keyFacts[]`, difficulty 1–3, single / multi / EMQ types,
  confidence tracking, immediate / end-of-set feedback, light Leitner spacing.
- **Cards v2** (`foundation.card/v2`) in the shared `state.flashcards` store.
- Settings drawer (gear icon), 14-day review forecast, weak-spot tag analytics, cram
  mode, printable chapter view, undo-last-review, ⌘K palette, keyboard shortcuts.
- Dashboard (contribution heatmap, streak with freeze), Planner, Q-Bank, Focus Timer
  (Web Audio), Markdown Notes, cited Calculators, Mnemonics, Resources.
- One baked chapter: **Surgery Ch.1 — Wound Healing** (95 cards, 46 MCQs).

## Review these dimensions
1. **UX & visual design** — hierarchy, spacing, colour, motion, empty states,
   first-run experience, and whether the Reader genuinely reads like a textbook.
2. **Accessibility** — keyboard reachability, visible focus, ARIA roles/labels,
   colour contrast in all three themes, `prefers-reduced-motion`, screen-reader flow,
   target sizes.
3. **Responsive** — behaviour at 375 / 768 / 1280 px; the mobile TOC; no horizontal
   body scroll; touch ergonomics.
4. **Spaced-repetition correctness** — audit `scheduleCard`: learning/relearning
   transitions, lapse → relearn → graduate intervals, ease floor, fuzz, daily-cap
   accounting, leech/suspend, and the four interval previews. Flag any state machine
   bug or off-by-one.
5. **MCQ pedagogy & medical accuracy** — sample the baked wound-healing MCQs and cards.
   Flag any that are **clinically wrong, ambiguous, or have a weak/incorrect
   distractor rationale**, and give the correction with a one-line justification from
   standard surgical teaching. Do **not** invent facts or citations.
6. **Security** — the hand-rolled Markdown subset and cloze/MCQ rendering must escape
   HTML (XSS-safe). Try to find any injection path (digest, cloze answer, table cell,
   note, MCQ option) that could execute markup.
7. **Offline & data safety** — confirm no network calls; audit `runMigrations` for any
   path that could lose keys or mis-upgrade a v2/v3 blob; check `localStorage` quota
   handling.
8. **Performance** — single ~350 KB file: parse/first-paint cost, large-DOM renders
   (heatmap, 95-card lists), any layout thrash, needless full re-renders.
9. **Code quality** — duplication, dead code, fragile selectors, event-listener leaks
   on re-render, naming, and anything that will make adding the next chapter harder.
10. **Content scale-up** — is the module/MCQ/card schema strong enough to add many more
    chapters cleanly? Suggest schema or tooling improvements if not.

## Method
- Prefer **concrete, high-confidence findings** over speculation. If you assert a bug,
  describe the exact trigger and the wrong result.
- Quote the smallest relevant code snippet or the function name + nearby text so the
  developer can locate it (there are no stable line numbers once edited).
- Propose **targeted fixes** — a small diff, a replacement snippet, or a precise
  description — never a full-file rewrite.
- Rank by impact. Be honest about severity; don't pad.

## Output format (return exactly this)
1. **Summary** — 3–5 sentences: overall quality and the single most important thing to fix.
2. **Findings table** — columns: `ID | Area | Severity (P0/P1/P2) | Finding | Location | Suggested fix | Effort (S/M/L)`.
   - P0 = correctness/security/data-loss/clinically-wrong content; P1 = significant UX/accessibility/perf; P2 = polish.
3. **Detailed notes** — for each P0 and P1, a short paragraph with the trigger, why it
   matters, and the concrete fix (snippet welcome).
4. **Medical-accuracy audit** — a short list of any wound-healing card/MCQ that is
   wrong or weak, each with the correction.
5. **Top 10 prioritised action list** — the exact changes you'd make next, in order,
   phrased as instructions a developer AI can execute directly.

Keep it rigorous and specific. This report will be pasted back to the build agent as
its work queue.
