# Self-prompt — where the app can get smarter

A working brief for the next passes. Every item is scoped so it can be picked up
on its own, built, verified in the browser, and shipped without breaking the
offline-first, no-runtime-fetch, lossless-data guarantees. British spelling, no
emoji, keep the Yanal brand and signature.

## Navigation & flow (everything should reach everything)
- Add a persistent context bar inside the reader that links Read → Cards → Questions
  → Notes for the *same* chapter, and a "next chapter / previous chapter" pager so a
  student can move through a subject without returning to the library.
- Make the flashcards deck browser accept the `?chapter=` / navigation-state hand-off
  that Study already sends, so "Review these cards" lands on the exact deck instead of
  the general page.
- After a question session, offer "Read the chapter this came from" and "Make these a
  deck" as one-tap follow-ups on the results screen.
- Breadcrumbs on every detail page (Subject › Chapter › Section) that are clickable.
- Remember the last tab per chapter (Read/Cards/Questions) the way scroll position is
  already remembered.

## Question bank & the AI tutor
- Stream the AI reply token-by-token instead of waiting for the whole completion.
- Cache AI hints/explanations per question id in IndexedDB so re-opening a question is
  instant and costs nothing.
- Add a "explain like I'm revising at 2am" vs "exam-precise" tone toggle for the tutor.
- Let the tutor generate *new* practice questions from a chapter on demand, validated
  against the content schema before they enter the pool.
- Confidence-weighted scoring: a wrong high-confidence answer should surface louder in
  weak-spots than a wrong guess.
- Per-option analytics across all attempts (which distractor pulls people in) shown on
  the results screen.

## Study / reader
- Inline "make a card from this sentence" selection handler in the reader body.
- A real reading-time estimate from word count rather than the authored `estMinutes`.
- Auto-generate a one-line section summary the first time a section is marked read, so
  the TOC can show a recap on hover.
- Highlighter + margin notes stored per chapter (additive to progress).

## Subjects
- Let a subject own real chapters (not just a name): drag chapters between subjects,
  and show a mini bar of chapter mastery inside each subject card.
- Sort/group controls (by due, by weakest, alphabetical).
- A subject detail route (`/subjects/:name`) instead of only filtering Study.

## Dashboard
- "Today's plan" that stitches the planner, due cards and weak questions into a single
  ordered checklist a student can work top-to-bottom.
- Trend lines (accuracy over time, cards learned per week) beside the activity grid.
- Surface the resume strip's most-recent chapter as the hero's primary CTA when there
  is reading in progress.

## Planner / schedule
- Turn parsed tasks into real scheduled items that feed the dashboard "today" list.
- Recurring tasks ("revise anatomy every Tuesday").
- Drag tasks between days on the week grid; sync due dates on drop.
- A cohort-shared exam calendar (import an .ics, no server) so deadlines line up.

## Flashcards
- Worker-side FSRS scheduling and a virtualised deck browser for very large decks.
- An "interleave subjects" review mode.
- Undo across a whole session, not just the last card.

## Onboarding (the ~1000-student cohort)
- A first-run guided tour that names each page and where to start.
- A single "what should I do right now" button on an empty account that seeds a sensible
  first session.
- Shareable read-only study packs so a class rep can hand out a starting set.

## Craft / polish
- Real haki page transitions with the View Transitions API where supported, falling back
  to the current CSS.
- A proper reduced-data / reduced-motion audit so every animation has an off-switch.
- Split the 1.6 MB main bundle with manualChunks (content data, vendor, engine).
- Colour-contrast pass on the red theme for AA on small text.
- Keyboard shortcuts for cross-navigation (g then s = study, g then q = questions).

## Data & safety
- Encrypt the stored API key at rest with a device key, and never include it in exports.
- A schema-versioned migration test that loads every historical export shape and asserts
  nothing is dropped.
- An in-app "storage used" meter for the IndexedDB blob library.
