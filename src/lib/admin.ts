// Administrator identity.
//
// There is no admin flag to set here any more, and that is the point. Whether an
// account may change shared content is decided by the DATABASE, in the
// row-level security policy in supabase/setup.sql, against the caller's real
// signed-in identity. A student who edits their own browser storage changes
// nothing that matters — their writes are still refused.
//
// What this module does is the small, honest remainder: ask the server whether
// THIS account is an administrator, so the UI can avoid showing controls that
// would only fail. It is a display hint, never a gate.

import { supabase } from './supabase';

let cached: { userId: string; isAdmin: boolean } | null = null;

/**
 * Whether the signed-in account is an administrator, according to the server.
 *
 * Implemented by asking the database directly (`public.is_admin()`), so it can
 * never disagree with the policy that actually enforces writes.
 */
export async function checkAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    cached = null;
    return false;
  }
  if (cached && cached.userId === userId) return cached.isAdmin;

  const { data, error } = await supabase.rpc('is_admin');
  const isAdmin = !error && data === true;
  cached = { userId, isAdmin };
  return isAdmin;
}

/** Forget the cached answer — call on sign-out or when switching account. */
export function clearAdminCache(): void {
  cached = null;
}

/**
 * Whether this account can edit SHARED content. Personal notes, personal cards
 * and progress are never gated by this — every student owns their own material.
 */
export const canEditShared = checkAdmin;
