# Server functions

Only one function lives here now: the optional AI proxy.

Sign-in, the chapter store and administrator identity all moved to **Supabase**
— see [`../DEPLOY.md`](../DEPLOY.md) for setup and [`../supabase/setup.sql`](../supabase/setup.sql)
for the database rules. The Vercel Blob/KV content store that used to live in
this folder was removed rather than kept as a second, competing backend.

---

## AI tutor proxy — `api/ai.ts`

Lets every student use the AI tutor without pasting their own API key. The
Anthropic key lives only in a server environment variable; it is never shipped
to the browser.

**Turn it on:** add `ANTHROPIC_API_KEY` in the Vercel project's environment
variables, then redeploy.

**This one costs money** — Anthropic charges per request. Leave it unset unless
you intend to pay for the cohort's usage.

**If you leave it unset:** the endpoint returns 503 and students are told they
can add their **own** key in Settings → AI tutor, which calls Anthropic directly
from their browser and costs you nothing. Everything else in the app is
unaffected.

### Notes

- Model is capped to Opus 5 / Sonnet 5 / Haiku 4.5, and `max_tokens` is capped.
- Requests must be same-origin.
- That is a deterrent suited to a class cohort, not hardened auth. If the
  audience grows large or public, add rate-limiting before relying on it.
