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
 * PRESENTATION ONLY — used for the sign-in hint and the input placeholder. Do
 * NOT gate sign-in on this. The real restriction is a Supabase trigger, which
 * also knows the administrator list; a browser-side check does not, and one
 * written here previously locked the owner out of her own site. Anything checked
 * in the browser can be edited by the person it is meant to restrict anyway.
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
          // Accept BOTH ways in: the 6-digit code typed into the app, and a link
          // clicked in the email.
          //
          // Codes remain the design — links break in the in-app browsers students
          // actually open mail from. But Supabase will not let you edit the email
          // template until you have configured your own SMTP server, and its stock
          // template sends a link and no code. Refusing to honour that link would
          // mean nobody can sign in at all until SMTP is set up.
          detectSessionInUrl: true,
          // PKCE returns the credential in the QUERY STRING (?code=…). The implicit
          // flow returns it in the URL fragment, which this app already uses for
          // routing (HashRouter) — the two would fight over the same hash.
          flowType: 'pkce',
        },
      })
    : null;

/** False when this deployment has no Supabase project configured. */
export function authConfigured(): boolean {
  return supabase !== null;
}
