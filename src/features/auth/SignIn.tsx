// Sign-in screen: email address, then a 6-digit code.
//
// Codes rather than magic links, on purpose. Students share and open links from
// WhatsApp and Instagram, whose in-app browsers frequently break magic links or
// open them in a different browser than the one that requested them — landing the
// student in a session they cannot see. A code stays in whatever browser they
// started in, and phones offer it straight from the notification.
//
// No password anywhere: nothing to forget, nothing to reuse from another site,
// and no password reset flow to build.

import { useEffect, useRef, useState } from 'react';
import { sendCode, verifyCode } from './session';
import { ALLOWED_EMAIL_DOMAIN, authConfigured } from '../../lib/supabase';

type Step = 'email' | 'code';

const RESEND_SECONDS = 30;

export default function SignIn() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (step === 'email' ? emailRef : codeRef).current?.focus();
  }, [step]);

  // A sign-in link that failed (expired, already used) sends the reason back in
  // the URL; main.tsx stashes it before clearing the fragment. Show it once —
  // otherwise the student lands back here with no idea why, which reads as the
  // app looping rather than the link being stale.
  useEffect(() => {
    const stashed = sessionStorage.getItem('foundation_auth_error');
    if (!stashed) return;
    sessionStorage.removeItem('foundation_auth_error');
    setErr(stashed);
  }, []);

  // Resend countdown — a visible timer beats a button that silently does nothing.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submitEmail(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await sendCode(email);
    setBusy(false);
    if (!res.ok) {
      setErr(res.message || 'Could not send the code.');
      return;
    }
    setStep('code');
    setCooldown(RESEND_SECONDS);
    setNote(`We sent a 6-digit code to ${email.trim().toLowerCase()}.`);
  }

  async function submitCode(value: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await verifyCode(email, value);
    setBusy(false);
    if (!res.ok) {
      setErr(res.message || 'That code is not right.');
      setCode('');
      codeRef.current?.focus();
      return;
    }
    // On success the session listener in useAuth swaps this screen for the app.
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setErr(null);
    // Submit as soon as six digits exist, whether typed, pasted, or autofilled
    // from the OS notification — no "now press the button" step.
    if (digits.length === 6) void submitCode(digits);
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setErr(null);
    const res = await sendCode(email);
    setBusy(false);
    if (res.ok) {
      setCooldown(RESEND_SECONDS);
      setNote('New code sent.');
    } else {
      setErr(res.message || 'Could not resend the code.');
    }
  }

  if (!authConfigured()) {
    return (
      <Shell>
        <h1>Foundation</h1>
        <p className="signin-lead">
          Sign-in is not set up on this deployment yet. Add the Supabase keys in your hosting
          settings and redeploy — see DEPLOY.md.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1>Foundation</h1>

      {step === 'email' ? (
        <>
          <p className="signin-lead">
            Sign in with your
            {ALLOWED_EMAIL_DOMAIN ? ` @${ALLOWED_EMAIL_DOMAIN} ` : ' '}
            email. We will send you a code — no password to remember.
          </p>
          <form onSubmit={submitEmail} noValidate>
            <label className="signin-label" htmlFor="signin-email">
              Email address
            </label>
            <input
              ref={emailRef}
              id="signin-email"
              className="signin-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={ALLOWED_EMAIL_DOMAIN ? `you@${ALLOWED_EMAIL_DOMAIN}` : 'you@example.com'}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErr(null);
              }}
            />
            <button className="signin-btn" type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="signin-lead">{note}</p>
          <p className="signin-hint">
            Type the 6-digit code below. If the email has a sign-in link instead, opening that
            works too.
          </p>
          <label className="signin-label" htmlFor="signin-code">
            6-digit code
          </label>
          <input
            ref={codeRef}
            id="signin-code"
            className="signin-input signin-code"
            type="text"
            inputMode="numeric"
            // Lets iOS and Android offer the code straight from the notification.
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            aria-describedby="signin-help"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
          <button
            className="signin-btn"
            type="button"
            disabled={busy || code.length !== 6}
            onClick={() => void submitCode(code)}
          >
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className="signin-alt" id="signin-help">
            <button type="button" className="signin-link" onClick={() => void resend()} disabled={cooldown > 0 || busy}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              className="signin-link"
              onClick={() => {
                setStep('email');
                setCode('');
                setErr(null);
                setNote(null);
              }}
            >
              Use a different email
            </button>
          </div>
        </>
      )}

      {err && (
        <div className="signin-err" role="alert">
          {err}
        </div>
      )}
    </Shell>
  );
}

/** The branded frame — keeps the mark, the signature and the Cairo line. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="signin">
      <svg className="signin-bolts" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className="sbolt" d="M250 -10 L240 120 L275 150 L235 260 L270 300 L245 460 L280 610" />
        <path className="sbolt b2" d="M560 -10 L575 110 L540 160 L585 250 L550 320 L590 470 L560 610" />
      </svg>
      <div className="signin-card">
        <div className="signin-mark">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 2 8l10 5 10-5-10-5Z" />
            <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
          </svg>
        </div>
        <div className="signin-sign">Yanal</div>
        {children}
        <div className="signin-foot">by Yanal · Cairo 2026</div>
      </div>
    </div>
  );
}
