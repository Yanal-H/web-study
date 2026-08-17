// Admin verification (Vercel Edge Function).
//
// Only the device that knows the admin key becomes an administrator. The key is
// checked SERVER-SIDE against the ADMIN_KEY environment variable, so it cannot be
// forged by editing local storage or the client bundle — a user who flips their
// own `admin` flag still cannot pass any future server-gated write, because those
// will verify against ADMIN_KEY too.
//
// Deploy: set ADMIN_KEY in the Vercel project's Environment Variables to a long
// secret only you know, then redeploy. Enter that key once in Settings → Admin on
// your own device.

export const config = { runtime: 'edge' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const secret = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.ADMIN_KEY;
  if (!secret) return json({ ok: false, error: 'Admin is not configured on this server.' }, 503);

  let body: { key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  const ok = typeof body.key === 'string' && body.key.length > 0 && body.key === secret;
  return json({ ok }, ok ? 200 : 401);
}
