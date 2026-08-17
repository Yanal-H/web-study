// Supabase client — authentication and shared content.
//
// Configured from build-time env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// The anon key is designed to be public: it identifies the project, and every
// permission it carries is decided by row-level security policies on the server.
// It is not a secret and must not be treated as one.
//
// If the vars are absent the client is null and the app says "sign-in is not set
// up on this deployment" rather than crashing — the same honest-degradation rule
// used everywhere else here.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * The domain students must sign in with, e.g. "student.university.edu".
 * Empty means any domain is allowed.
 *
 * This is a CONVENIENCE for error messages only. The real restriction is
 * enforced server-side by a Supabase trigger, because anything checked in the
 * browser can be edited by the person it is meant to restrict.
 */
export const ALLOWED_EMAIL_DOMAIN = (
  (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN as string | undefined) || ''
)
  .trim()
  .toLowerCase()
  .replace(/^@/, '');

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Keep the student signed in across visits and refresh the token in the
          // background — "when they come back it knows them".
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'foundation_auth',
          // We use 6-digit codes, not links, so there is no callback URL to parse.
          detectSessionInUrl: false,
        },
      })
    : null;

/** False when this deployment has no Supabase project configured. */
export function authConfigured(): boolean {
  return supabase !== null;
}

/** True when the address ends in the allowed domain (or no domain is enforced). */
export function emailDomainAllowed(email: string): boolean {
  if (!ALLOWED_EMAIL_DOMAIN) return true;
  return email.trim().toLowerCase().endsWith('@' + ALLOWED_EMAIL_DOMAIN);
}
