// Admin verification (Vercel Edge Function).
//
// Only the device that knows the admin key becomes an administrator. The key is
// checked SERVER-SIDE against the ADMIN_KEY environment variable, so it cannot be
// forged by editing local storage or the client bundle — a user who flips their
// own `admin` flag still cannot pass any server-gated write, because those verify
// a signature only this server can produce (see _auth.ts).
//
// On success this returns a short-lived signed token. The client keeps that token
// for the session and sends it on mutating calls, so the long-lived key is
// transmitted once rather than on every publish.
//
// Deploy: set ADMIN_KEY in the Vercel project's Environment Variables to a long
// secret only you know, then redeploy. Enter that key once in Settings → Admin on
// your own device.

import { adminSecret, issueToken, json, safeEqual, TOKEN_TTL_MS } from './_auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const secret = adminSecret();
  if (!secret) return json({ ok: false, error: 'Admin is not configured on this server.' }, 503);

  let body: { key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  // Constant-time comparison: a plain === leaks, through response timing, how
  // many leading characters of a guess were correct.
  const supplied = typeof body.key === 'string' ? body.key : '';
  const ok = supplied.length > 0 && safeEqual(supplied, secret);
  if (!ok) return json({ ok: false }, 401);

  return json({ ok: true, token: await issueToken(secret), expiresIn: TOKEN_TTL_MS });
}
