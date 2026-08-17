// Authentication state for the app.
//
// Supabase persists the session and refreshes the token in the background, so a
// returning student lands straight in the app. This module wraps that in a small
// React-friendly surface and keeps the "still checking" state explicit — without
// it, the app flashes the sign-in screen for a moment on every load before the
// stored session is read, which looks like being logged out.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, emailDomainAllowed, ALLOWED_EMAIL_DOMAIN } from '../../lib/supabase';

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
    if (!supabase) return;
    let alive = true;

    const apply = (session: Session | null) => {
      if (!alive) return;
      setState({
        phase: session ? 'signed-in' : 'signed-out',
        email: session?.user.email ?? null,
        userId: session?.user.id ?? null,
      });
    };

    void supabase.auth.getSession().then(({ data }) => apply(data.session));

    // Fires on sign-in, sign-out, token refresh and — importantly — when another
    // tab signs out, so every open tab locks together.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session));

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
 * Send a 6-digit sign-in code to this address.
 *
 * `shouldCreateUser` stays true so a student never has to "register" separately —
 * first sign-in creates the account. Whether that account is ALLOWED is decided
 * by the server-side domain trigger, not here.
 */
export async function sendCode(emailRaw: string): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!supabase) return { ok: false, message: 'Sign-in is not set up on this deployment yet.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'That does not look like an email address.' };
  }
  if (!emailDomainAllowed(email)) {
    return { ok: false, message: `Use your @${ALLOWED_EMAIL_DOMAIN} address to sign in.` };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    // The server rejects a disallowed domain here too. Surface its wording when
    // it is specific, so the student is not told something the server disagrees with.
    if (/domain|not allowed|denied/i.test(error.message)) {
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
  if (token.length !== 6) return { ok: false, message: 'Enter the 6-digit code from your email.' };

  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) {
    if (/expired/i.test(error.message)) {
      return { ok: false, message: 'That code has expired. Send a new one.' };
    }
    return { ok: false, message: 'That code is not right. Check it and try again.' };
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
}
