// Authentication state for the app.
//
// Supabase persists the session and refreshes the token in the background, so a
// returning student lands straight in the app. This module wraps that in a small
// React-friendly surface and keeps the "still checking" state explicit — without
// it, the app flashes the sign-in screen for a moment on every load before the
// stored session is read, which looks like being logged out.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, ALLOWED_EMAIL_DOMAIN } from '../../lib/supabase';
import { switchUserStorage } from '../../lib/userStorage';

export type AuthPhase = 'checking' | 'signed-out' | 'signed-in';

export interface AuthState {
  phase: AuthPhase;
  email: string | null;
  userId: string | null;
}

/** Subscribe to the session. Returns 'checking' until the stored session is read. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    phase: supabase ? 'checking' : 'signed-out',
    email: null,
    userId: null,
  });

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let alive = true;
    let claimedForUserId: string | null = null;
    let applyVersion = 0;
    let activeUserId: string | null = null;

    const apply = async (session: Session | null) => {
      const thisApply = ++applyVersion;
      const nextUserId = session?.user.id ?? null;
      if (alive && nextUserId !== activeUserId) {
        // Unmount every account-specific route while local state and IndexedDB
        // connections change. This also clears component-local drafts.
        setState({ phase: 'checking', email: null, userId: null });
      }
      await switchUserStorage(nextUserId);
      // A newer auth event won while the storage switch was queued.
      if (thisApply !== applyVersion) return;
      if (!alive) return;
      activeUserId = nextUserId;
      setState({
        phase: session ? 'signed-in' : 'signed-out',
        email: session?.user.email ?? null,
        userId: session?.user.id ?? null,
      });

      // A roster entitlement may be added after this student created their
      // account. Claiming is safe to retry: the SQL function only considers a
      // row whose email matches this signed session and never lets the browser
      // choose a department or channel. Older deployments simply return an RPC
      // error until the community-foundation migration is installed; sign-in
      // must remain fully functional in that state.
      if (session && claimedForUserId !== session.user.id) {
        claimedForUserId = session.user.id;
        void client.rpc('claim_my_community_memberships').then(() => {}, () => {});
      }
      if (!session) claimedForUserId = null;
    };

    void client.auth.getSession().then(({ data }) => apply(data.session));

    // Fires on sign-in, sign-out, token refresh and — importantly — when another
    // tab signs out, so every open tab locks together.
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      void apply(session);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export interface AuthResult {
  ok: boolean;
  message?: string;
}

/**
 * Supabase projects can be configured to issue either six- or eight-digit
 * email tokens. Brevo only delivers the email; it does not decide the token
 * length. Accept both supported formats so a template/provider change cannot
 * lock the cohort out at the browser before Supabase verifies the real token.
 */
export const OTP_LENGTHS = [6, 8] as const;
export const OTP_MAX_LENGTH = Math.max(...OTP_LENGTHS);

export function isSupportedOtpLength(length: number): boolean {
  return OTP_LENGTHS.includes(length as (typeof OTP_LENGTHS)[number]);
}

/**
 * Send a sign-in code to this address.
 *
 * `shouldCreateUser` stays true so a student never has to "register" separately —
 * first sign-in creates the account. Whether that account is ALLOWED is decided
 * by the server-side domain trigger, not here.
 */
export async function sendCode(emailRaw: string): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  // Syntax only. Whether this ADDRESS may sign in is not a question the browser
  // can answer: the list of administrators lives in the database, and an earlier
  // version of this function checked the domain here and locked the owner out of
  // her own site — her address was on the admin list the browser cannot see.
  // Send it, and let the server apply the rule it actually owns.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'That does not look like an email address.' };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Send any link in the email back to the site the student is actually on.
      // Without this Supabase uses the project's Site URL, which defaults to
      // http://localhost:3000 — a developer address that fails for everyone else.
      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });

  if (error) {
    // The server rejects a disallowed domain too. It often reports that as a
    // generic "Database error saving new user" rather than the trigger's own
    // wording, so match both — otherwise a refused student is told something
    // vague and has no idea what to fix.
    if (/domain|not allowed|denied|database error saving/i.test(error.message)) {
      return {
        ok: false,
        message: ALLOWED_EMAIL_DOMAIN
          ? `Only @${ALLOWED_EMAIL_DOMAIN} addresses can use Foundation.`
          : 'That address is not allowed to sign in.',
      };
    }
    if (/rate|too many|seconds/i.test(error.message)) {
      return { ok: false, message: 'Too many attempts just now — wait a minute and try again.' };
    }
    return { ok: false, message: 'Could not send the code. Check the address and try again.' };
  }
  return { ok: true };
}

/** Exchange the emailed code for a session. */
export async function verifyCode(emailRaw: string, codeRaw: string): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase();
  const token = codeRaw.replace(/\D/g, '');
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  if (!isSupportedOtpLength(token.length)) {
    return { ok: false, message: 'Enter the 6- or 8-digit code from your email.' };
  }

  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) {
    if (/expired/i.test(error.message) && !/invalid|incorrect|wrong/i.test(error.message)) {
      return { ok: false, message: 'That code has expired. Send a new one and use the newest code.' };
    }
    return { ok: false, message: 'That code is not right. Check the latest email and try again.' };
  }
  return { ok: true };
}

/**
 * Sign out on this device.
 *
 * Chapters are dropped from memory immediately — signing out must not leave the
 * material readable, and must not hand it to whoever signs in next on a shared
 * device. Personal study data (progress, review history, notes, personal cards)
 * stays on the device and is waiting when they sign back in.
 */
export async function signOut(): Promise<void> {
  const { forgetContent } = await import('../../data/remoteContent');
  forgetContent();
  const { clearAdminCache } = await import('../../lib/admin');
  clearAdminCache();
  await supabase?.auth.signOut();
  await switchUserStorage(null);
}
