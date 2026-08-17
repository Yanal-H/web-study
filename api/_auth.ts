// Admin tokens for server-gated writes (Vercel Edge runtime).
//
// Why a token rather than re-sending the key: publishing content is a repeated
// action, and sending the long-lived ADMIN_KEY on every request means more
// chances for it to end up in a log, a proxy trace or a screenshot. Instead the
// key is exchanged ONCE (POST /api/admin) for a short-lived token signed with
// that same key using HMAC-SHA-256.
//
// The security property that matters: a student who flips `settings.admin` in
// their own localStorage still cannot publish anything, because every mutating
// request is verified here against a signature only the server can produce.
// Client-side admin state is a UI convenience; this is the actual gate.

const ENC = new TextEncoder();

/** Token lifetime. Long enough for an authoring session, short enough to matter. */
export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

export function adminSecret(): string | undefined {
  return env('ADMIN_KEY');
}

/** URL-safe base64 without padding, so tokens survive headers and query strings. */
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    ENC.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, ENC.encode(message));
  return b64url(new Uint8Array(sig));
}

/**
 * Compare two strings without leaking, through timing, how many leading
 * characters matched. Used for both the key check and the signature check.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a token that expires at `now + TOKEN_TTL_MS`. Format: `<expiry>.<sig>`. */
export async function issueToken(secret: string, now = Date.now()): Promise<string> {
  const expiry = String(now + TOKEN_TTL_MS);
  return `${expiry}.${await hmac(secret, expiry)}`;
}

/**
 * True only for a token this server signed that has not yet expired. Any
 * malformed, tampered or stale token is simply false — callers answer 401.
 */
export async function verifyToken(secret: string, token: unknown, now = Date.now()): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry) || !sig) return false;
  if (Number(expiry) <= now) return false;
  return safeEqual(sig, await hmac(secret, expiry));
}

/** Read the bearer token from an Authorization header. */
export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]! : null;
}

/**
 * Same-origin guard, matching the AI proxy: these endpoints exist for the app's
 * own pages, not for arbitrary cross-site callers. A deterrent suited to a class
 * cohort, not a substitute for the signature check above.
 */
export function sameOrigin(req: Request): boolean {
  const host = req.headers.get('host');
  if (!host) return false;
  const ref = req.headers.get('origin') || req.headers.get('referer');
  if (!ref) return true; // non-browser callers still face the token check
  try {
    return new URL(ref).host === host;
  } catch {
    return false;
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
