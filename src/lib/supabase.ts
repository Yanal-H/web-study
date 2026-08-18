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
          // The emailed link is consumed by hand in main.tsx, before React and
          // HashRouter get near the URL — so this stays off.
          detectSessionInUrl: false,
          // Implicit, NOT pkce, and this is the whole point.
          //
          // PKCE keeps a secret in the browser that asked for the link and needs
          // it back to complete sign-in. Students open email in Gmail, which
          // launches a different browser from the one they typed their address
          // into — so the secret is missing, the exchange fails, and they are
          // bounced back to the sign-in screen with no explanation. An endless
          // loop that looks like the app is broken.
          //
          // Implicit puts the tokens in the link itself, so it works in whatever
          // browser opens it. Its usual drawback — tokens landing in the URL
          // fragment, which HashRouter also owns — is handled by reading and
          // clearing them ourselves before the router ever runs.
          flowType: 'implicit',
        },
      })
    : null;

/** False when this deployment has no Supabase project configured. */
export function authConfigured(): boolean {
  return supabase !== null;
}
