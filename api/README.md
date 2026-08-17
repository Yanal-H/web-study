# Shared AI server (optional)

`api/ai.ts` is a Vercel Edge Function that lets every student use the AI tutor
without each pasting their own API key. The Anthropic key lives only in a server
environment variable — it is never shipped to the browser.

## Turn it on

1. In the Vercel project → **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your Anthropic API key (`sk-ant-…`)
2. **Redeploy** the project.

That is it. The app calls the same-origin endpoint `/api/ai`; the function forwards
the request to Anthropic with the secret key and returns the reply. Students see the
Hint / Show explanation / Ask AI buttons working with no setup.

## If you do NOT set it up

The app still works fully offline for studying. When a student presses an AI button
with no server key configured, they are told they can add their **own** key in
Settings → AI tutor, which then calls Anthropic directly from their browser.

## Notes

- Model is capped to Opus 5 / Sonnet 5 / Haiku 4.5 and `max_tokens` is capped.
- Requests must be same-origin (Origin/Referer must match the host).
- This is a deterrent suited to a class cohort, not hardened auth. If the audience
  grows large or public, add rate-limiting (e.g. Vercel KV) before relying on it.
