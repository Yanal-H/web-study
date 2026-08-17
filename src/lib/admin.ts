// Administrator identity for this device.
//
// The flag lives in settings.admin, but it is only ever set after the entered key
// is verified server-side (POST /api/admin against the ADMIN_KEY env var). The flag
// alone grants nothing that matters for integrity — any future write to SHARED
// content must be re-verified by the server — it only unlocks the admin surface in
// the UI on the owner's own device.

import { state as liveState, update } from '../state/store';

export function isAdmin(): boolean {
  return (liveState.settings as Record<string, unknown>).admin === true;
}

export function setAdmin(v: boolean): void {
  update((s) => {
    (s.settings as Record<string, unknown>).admin = v;
  });
}

/** Verify the key with the server; on success mark this device an administrator. */
export async function unlockAdmin(key: string): Promise<{ ok: boolean; message?: string }> {
  const k = key.trim();
  if (!k) return { ok: false, message: 'Enter the admin key.' };
  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: k }),
    });
    if (!(res.headers.get('content-type') || '').includes('application/json')) {
      return { ok: false, message: 'Admin is not set up on this server yet.' };
    }
    const data = await res.json();
    if (res.status === 503) return { ok: false, message: 'Admin is not set up on this server yet.' };
    if (data?.ok) {
      setAdmin(true);
      return { ok: true };
    }
    return { ok: false, message: 'That admin key was not accepted.' };
  } catch {
    return { ok: false, message: 'Could not reach the server.' };
  }
}
