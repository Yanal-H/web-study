# Server functions

Only one function lives here now: the optional AI proxy.

Sign-in, the chapter store and administrator identity all moved to **Supabase**
— see [`../DEPLOY.md`](../DEPLOY.md) for setup and [`../supabase/setup.sql`](../supabase/setup.sql)
for the database rules. The Vercel Blob/KV content store that used to live in
this folder was removed rather than kept as a second, competing backend.

---

## AI tutor proxy — `api/ai.ts`

Optional shared-credit AI tutor. It is disabled by default and fails closed if
authentication or the database quota check is unavailable. The Anthropic key
lives only in a server environment variable; it is never shipped to the browser.

**Turn it on only after the Batch 1 SQL migration is deployed:** add
`AI_PROXY_ENABLED=true`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, and
`SUPABASE_ANON_KEY` in Vercel, then redeploy. The anon key is public by design;
the Anthropic key is not.

**This one costs money** — Anthropic charges per request. Leave it unset unless
you intend to pay for the cohort's usage.

**If you leave it disabled:** the endpoint returns 503 without contacting
Anthropic. Students may still use their own key if you keep that UI enabled.

### Notes

- A valid Supabase bearer token and same-origin browser request are required.
- Body, message, input and output sizes are capped.
- Database-backed per-user quotas and a short per-instance IP window run before
  Anthropic is called.
- The server owns the system prompt; arbitrary client system prompts are ignored.
- The endpoint times out and fails closed if quota protection is unavailable.
