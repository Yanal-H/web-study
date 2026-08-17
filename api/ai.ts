// Server-side AI proxy (Vercel Edge Function).
//
// Why this exists: it lets every student use the AI tutor WITHOUT each pasting a
// key. The Anthropic key lives only in the server environment variable
// ANTHROPIC_API_KEY — it is never shipped to the browser, so it cannot be scraped
// or drained. The client calls this same-origin endpoint (/api/ai); this function
// forwards the request to Anthropic with the secret key and streams the reply back.
//
// Deploy: set ANTHROPIC_API_KEY in the Vercel project's Environment Variables, then
// redeploy. If it is not set, this returns 503 and the client falls back to asking
// the student for their own key in Settings.
//
// Basic abuse protection: same-origin only (Origin/Referer must match the host),
// POST only, and max_tokens is capped. This is a deterrent suited to a class
// cohort, not hardened auth; add Vercel KV rate-limiting if the audience widens.

export const config = { runtime: 'edge' };

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS_CAP = 1500;
const ALLOWED_MODELS = new Set(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: { message: 'Method not allowed.' } }, 405);
  }

  // Same-origin guard: only accept requests coming from this deployment's own pages.
  const host = req.headers.get('host') || '';
  const from = req.headers.get('origin') || req.headers.get('referer') || '';
  if (host && from) {
    try {
      if (new URL(from).host !== host) {
        return json({ error: { message: 'Cross-origin requests are not allowed.' } }, 403);
      }
    } catch {
      return json({ error: { message: 'Bad origin.' } }, 403);
    }
  }

  const key = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.ANTHROPIC_API_KEY;
  if (!key) {
    return json({ error: { message: 'The AI tutor is not configured on this server.' } }, 503);
  }

  let payload: {
    system?: string;
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    maxTokens?: number;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: { message: 'Invalid request body.' } }, 400);
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return json({ error: { message: 'No messages supplied.' } }, 400);
  }

  const model = payload.model && ALLOWED_MODELS.has(payload.model) ? payload.model : 'claude-sonnet-5';
  const maxTokens = Math.min(Math.max(1, payload.maxTokens || 1000), MAX_TOKENS_CAP);

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: typeof payload.system === 'string' ? payload.system : undefined,
      messages: payload.messages,
    }),
  });

  // Pass the upstream status and body straight back so the client can read the
  // reply on success, and detect a model/permission error (e.g. 403) to downgrade.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
