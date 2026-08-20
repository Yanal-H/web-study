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
import { clearAdminCache } from '../../lib/admin';
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
  /** Stable, non-sensitive support code shown when delivery fails. */
  reason?: AuthFailureReason;
}

export type AuthFailureReason =
  | 'NOT_CONFIGURED'
  | 'INVALID_EMAIL'
  | 'DOMAIN_NOT_ALLOWED'
  | 'ACCOUNT_CREATION_FAILED'
  | 'SMTP_NOT_CONFIGURED'
  | 'SIGNUP_DISABLED'
  | 'RATE_LIMITED'
  | 'DELIVERY_FAILED'
  | 'INVALID_CODE'
  | 'EXPIRED_CODE';

type AuthErrorLike = { message?: string; code?: string; status?: number };

/** Translate provider errors without exposing raw server/database details. */
export function describeSendError(error: AuthErrorLike): AuthResult {
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '');
  if (code === 'email_address_not_authorized') {
    return {
      ok: false,
      reason: 'SMTP_NOT_CONFIGURED',
      message: 'Student email delivery is not enabled yet. Ask the administrator to check Custom SMTP.',
    };
  }
  if (code === 'signup_disabled') {
    return {
      ok: false,
      reason: 'SIGNUP_DISABLED',
      message: 'New student sign-in is disabled. Ask the administrator to enable new user signup.',
    };
  }
  if (code === 'over_email_send_rate_limit' || error.status === 429 || /rate|too many|seconds/i.test(message)) {
    return {
      ok: false,
      reason: 'RATE_LIMITED',
      message: 'Too many code requests just now. Wait one minute, then request one new code.',
    };
  }
  if (code === 'email_address_invalid') {
    return { ok: false, reason: 'INVALID_EMAIL', message: 'That email address was not accepted.' };
  }
  if (/domain.*not allowed|email.*denied/i.test(message)) {
    return {
      ok: false,
      reason: 'DOMAIN_NOT_ALLOWED',
      message: ALLOWED_EMAIL_DOMAIN
        ? `Only @${ALLOWED_EMAIL_DOMAIN} addresses can use Foundation.`
        : 'That address is not allowed to sign in.',
    };
  }
  if (/database error saving|unexpected_failure/i.test(`${code} ${message}`)) {
    return {
      ok: false,
      reason: 'ACCOUNT_CREATION_FAILED',
      message: 'The student account could not be created. Ask the administrator to check Supabase Auth logs.',
    };
  }
  return {
    ok: false,
    reason: 'DELIVERY_FAILED',
    message: 'The email service could not accept this request. Wait a minute and try again.',
  };
}

/**
 * Supabase projects can be configured to issue either six- or eight-digit
 * email tokens. Brevo only delivers the email; it does not decide the token
 * length. Accept both supported formats so a template/provider change cannot
 * lock the cohort out at the browser before Supabase verifies the real token.
 */
export const OTP_LENGTHS = [6, 8] as const;
export const OTP_MAX_LENGTH = Math.max(...OTP_LENGTHS);
/** Matches Supabase's default same-address OTP request window. */
export const OTP_RESEND_SECONDS = 60;

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
  if (!supabase) return { ok: false, reason: 'NOT_CONFIGURED', message: 'Sign-in is not set up on this deployment yet.' };
  // Syntax only. Whether this ADDRESS may sign in is not a question the browser
  // can answer: the list of administrators lives in the database, and an earlier
  // version of this function checked the domain here and locked the owner out of
  // her own site — her address was on the admin list the browser cannot see.
  // Send it, and let the server apply the rule it actually owns.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: 'INVALID_EMAIL', message: 'That does not look like an email address.' };
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
    return describeSendError(error);
  }
  return { ok: true };
}

/** Exchange the emailed code for a session. */
export async function verifyCode(emailRaw: string, codeRaw: string): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase();
  const token = codeRaw.replace(/\D/g, '');
  if (!supabase) return { ok: false, reason: 'NOT_CONFIGURED', message: 'Sign-in is not set up on this deployment yet.' };
  if (!isSupportedOtpLength(token.length)) {
    return { ok: false, reason: 'INVALID_CODE', message: 'Enter the 6- or 8-digit code from your email.' };
  }

  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) {
    if (/expired/i.test(error.message) && !/invalid|incorrect|wrong/i.test(error.message)) {
      return { ok: false, reason: 'EXPIRED_CODE', message: 'That code has expired. Send a new one and use the newest code.' };
    }
    return { ok: false, reason: 'INVALID_CODE', message: 'That code is not right. Check the latest email and try again.' };
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
  clearAdminCache();
  await supabase?.auth.signOut();
  await switchUserStorage(null);
}
