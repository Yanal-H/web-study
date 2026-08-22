# Rule: testing

## The gate (run all four, none may regress)

```
npx tsc --noEmit                       # 0 errors
npm run build                          # must succeed
npx vitest run                         # all green
npx eslint src --ext .ts,.tsx          # 0 errors; ~29 warnings baseline
```

## How to test what

- **Pure logic** (scheduling decisions, the live queue, extract/validate) → Vitest
  unit tests. Prefer pure, clock-injected functions so timing is tested with a fake
  clock (`vi.useFakeTimers()` / `vi.setSystemTime()`), never by sleeping.
- **React components** → `@testing-library/react` under jsdom. `getContext` on
  canvas is not implemented in jsdom; the resulting console noise from
  `HakiField` is benign and expected — do not chase it.
- **Browser end-to-end** → Playwright is available at
  `/opt/node22/lib/node_modules/playwright/index.js`. It is CommonJS: import as
  `import pw from '...'; const { chromium } = pw`. Do **not** run
  `playwright install` (see the environment notes on the pre-installed browser).
  Use preview ports 4212–4219 to avoid clashes.

## Standards

- A bug fix lands with a test that fails before the fix and passes after. For the
  flashcard queue that means a fake-clock test of the exact scenario.
- Mock Supabase and the data layer in unit tests; never hit the network.
- Don't weaken an assertion to make a test pass. Don't delete a failing test to
  get to green. If a test is genuinely wrong, fix it and say why in the message.
- Adding warnings to the eslint baseline is a regression. Keep it at 0 errors and
  do not grow the warning count.
