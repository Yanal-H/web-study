// Authenticated, quota-controlled Vercel Edge proxy for the optional AI tutor.
// Leave AI_PROXY_ENABLED unset/false to keep shared-credit AI disabled.

export const config = { runtime: 'edge' };

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 6_000;
const MAX_INPUT_CHARS = 24_000;
const MAX_TOKENS_CAP = 1_200;
const UPSTREAM_TIMEOUT_MS = 30_000;
const IP_WINDOW_MS = 60_000;
const IP_WINDOW_LIMIT = 30;
const ALLOWED_MODELS = new Set(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']);
const SERVER_SYSTEM =
  'You are a concise medical-school tutor. Use British spelling. Never invent facts, citations, ' +
  'doses, thresholds or recommendations. State uncertainty clearly. This is educational content, ' +
  'not patient-specific medical advice.';

interface ServerEnv {
  ANTHROPIC_API_KEY?: string;
  AI_PROXY_ENABLED?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}
interface TutorPayload {
  messages?: Array<{ role?: unknown; content?: unknown }>;
  model?: unknown;
  maxTokens?: unknown;
}

const ipWindows = new Map<string, { started: number; count: number }>();

function env(): ServerEnv {
  return ((globalThis as { process?: { env?: ServerEnv } }).process?.env || {}) as ServerEnv;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function sameOrigin(req: Request): boolean {
  const from = req.headers.get('origin') || req.headers.get('referer');
  if (!from) return false;
  try {
    return new URL(from).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

function bearerToken(req: Request): string | null {
  const value = req.headers.get('authorization') || '';
  const match = value.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || null;
}

function requestIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown')
    .split(',')[0]!
    .trim()
    .slice(0, 80);
}

function allowIp(req: Request, now = Date.now()): boolean {
  const key = requestIp(req);
  const current = ipWindows.get(key);
  if (!current || now - current.started >= IP_WINDOW_MS) {
    ipWindows.set(key, { started: now, count: 1 });
    if (ipWindows.size > 2_000) {
      for (const [candidate, window] of ipWindows) {
        if (now - window.started >= IP_WINDOW_MS) ipWindows.delete(candidate);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= IP_WINDOW_LIMIT;
}

async function verifyUser(supabaseUrl: string, anonKey: string, token: string): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return false;
  const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return typeof user?.id === 'string' && user.id.length > 0;
}

async function consumeQuota(
  supabaseUrl: string,
  anonKey: string,
  token: string,
  inputChars: number
): Promise<'allowed' | 'limited' | 'unavailable'> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_input_chars: inputChars }),
  }).catch(() => null);
  if (!response?.ok) return 'unavailable';
  return (await response.json().catch(() => false)) === true ? 'allowed' : 'limited';
}

function validatePayload(payload: TutorPayload):
  | { ok: true; messages: Array<{ role: 'user' | 'assistant'; content: string }>; inputChars: number }
  | { ok: false; message: string } {
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > MAX_MESSAGES) {
    return { ok: false, message: `Supply between 1 and ${MAX_MESSAGES} messages.` };
  }
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let inputChars = 0;
  for (const message of payload.messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      return { ok: false, message: 'Every message needs a valid role.' };
    }
    if (typeof message.content !== 'string' || message.content.length < 1 || message.content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, message: `Every message must contain 1–${MAX_MESSAGE_CHARS} characters.` };
    }
    inputChars += message.content.length;
    messages.push({ role: message.role, content: message.content });
  }
  if (inputChars > MAX_INPUT_CHARS) return { ok: false, message: 'The conversation is too large.' };
  if (messages[messages.length - 1]?.role !== 'user') {
    return { ok: false, message: 'The final message must come from the user.' };
  }
  return { ok: true, messages, inputChars };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: { message: 'Method not allowed.' } }, 405);

  const settings = env();
  if (settings.AI_PROXY_ENABLED !== 'true' || !settings.ANTHROPIC_API_KEY) {
    return json({ error: { message: 'The shared AI tutor is disabled.' } }, 503);
  }
  if (!sameOrigin(req)) return json({ error: { message: 'A same-origin app request is required.' } }, 403);

  const token = bearerToken(req);
  if (!token) return json({ error: { message: 'Sign in before using the AI tutor.' } }, 401);

  const supabaseUrl = (settings.SUPABASE_URL || settings.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = settings.SUPABASE_ANON_KEY || settings.VITE_SUPABASE_ANON_KEY || '';
  if (!/^https:\/\//.test(supabaseUrl) || !anonKey) {
    return json({ error: { message: 'The AI authentication service is not configured.' } }, 503);
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: { message: 'Request body is too large.' } }, 413);

  const raw = await req.text().catch(() => '');
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: { message: raw ? 'Request body is too large.' : 'Invalid request body.' } }, raw ? 413 : 400);
  }

  let payload: TutorPayload;
  try {
    payload = JSON.parse(raw) as TutorPayload;
  } catch {
    return json({ error: { message: 'Invalid request body.' } }, 400);
  }
  const checked = validatePayload(payload);
  if (!checked.ok) return json({ error: { message: checked.message } }, 400);

  if (!(await verifyUser(supabaseUrl, anonKey, token).catch(() => false))) {
    return json({ error: { message: 'Your session is invalid or expired.' } }, 401);
  }
  if (!allowIp(req)) return json({ error: { message: 'Too many requests. Wait a minute.' } }, 429);

  const quota = await consumeQuota(supabaseUrl, anonKey, token, checked.inputChars);
  if (quota === 'unavailable') {
    return json({ error: { message: 'AI quota protection is unavailable, so the request was not sent.' } }, 503);
  }
  if (quota === 'limited') return json({ error: { message: 'Your AI usage limit has been reached.' } }, 429);

  const model = typeof payload.model === 'string' && ALLOWED_MODELS.has(payload.model)
    ? payload.model
    : 'claude-haiku-4-5-20251001';
  const requestedTokens = typeof payload.maxTokens === 'number' && Number.isFinite(payload.maxTokens)
    ? Math.floor(payload.maxTokens)
    : 800;
  const maxTokens = Math.min(Math.max(1, requestedTokens), MAX_TOKENS_CAP);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  req.signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SERVER_SYSTEM,
        messages: checked.messages,
      }),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return json({ error: { message: timedOut ? 'The AI request timed out.' : 'The AI service could not be reached.' } }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
