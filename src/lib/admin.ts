// Administrator identity for this device.
//
// The flag lives in settings.admin, but it is only ever set after the entered key
// is verified server-side (POST /api/admin against the ADMIN_KEY env var). The flag
// alone grants nothing that matters for integrity — every write to SHARED content
// is re-verified by the server against a signed token — it only unlocks the admin
// surface in the UI on the owner's own device.
//
// The token, not the flag, is what actually authorises a publish. It is short-lived
// and kept in sessionStorage rather than in the persisted store, so it dies with the
// tab and can never travel inside an exported backup.

import { state as liveState, update } from '../state/store';

const TOKEN_KEY = 'foundation_admin_token';

export function isAdmin(): boolean {
  return (liveState.settings as Record<string, unknown>).admin === true;
}

export function setAdmin(v: boolean): void {
  update((s) => {
    (s.settings as Record<string, unknown>).admin = v;
  });
  if (!v) clearAdminToken();
}

/** The signed token for this admin session, if we still hold one. */
export function adminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeAdminToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Publishing will simply ask for the key again; nothing is lost.
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * True when this device can edit SHARED content. Personal notes, personal cards
 * and progress are never gated by this — every student owns their own material.
 */
export function canEditShared(): boolean {
  return isAdmin();
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
      if (typeof data.token === 'string') storeAdminToken(data.token);
      setAdmin(true);
      return { ok: true };
    }
    return { ok: false, message: 'That admin key was not accepted.' };
  } catch {
    return { ok: false, message: 'Could not reach the server.' };
  }
}
