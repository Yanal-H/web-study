import { describe, it, expect, vi, beforeEach } from 'vitest';

// A configured Supabase client, stubbed. These tests are about which decisions
// sendCode makes locally versus delegating to the server — not about the network.
const signInWithOtp = vi.hoisted(() => vi.fn());
const verifyOtp = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithOtp, verifyOtp } },
  ALLOWED_EMAIL_DOMAIN: 'students.kasralainy.edu.eg',
  authConfigured: () => true,
}));

const { sendCode, verifyCode } = await import('./session');

beforeEach(() => {
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ error: null });
  verifyOtp.mockReset();
  verifyOtp.mockResolvedValue({ error: null });
});

describe('sendCode — the browser must not decide who may sign in', () => {
  // The regression this guards. An earlier version rejected any address outside
  // VITE_ALLOWED_EMAIL_DOMAIN before contacting the server. The administrator
  // list lives in the database, so that check locked the site's owner out of her
  // own site. Assert the REQUEST IS MADE rather than checking the message, so a
  // reintroduced client-side gate fails this test even if its wording differs.
  it('sends an out-of-domain address to the server instead of refusing it', async () => {
    const res = await sendCode('yanalhassoneh987@gmail.com');
    expect(signInWithOtp).toHaveBeenCalledOnce();
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'yanalhassoneh987@gmail.com' })
    );
    expect(res.ok).toBe(true);
  });

  it('sends an in-domain address too', async () => {
    const res = await sendCode('student@students.kasralainy.edu.eg');
    expect(signInWithOtp).toHaveBeenCalledOnce();
    expect(res.ok).toBe(true);
  });

  it('normalises case and surrounding spaces before sending', async () => {
    await sendCode('  Yanal.Hassoneh@Gmail.com  ');
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'yanal.hassoneh@gmail.com' })
    );
  });
});

describe('sendCode — what it still refuses locally', () => {
  it('rejects a malformed address without a network call', async () => {
    // Syntax is not permission: this costs nothing to check and saves a round
    // trip, so it stays on the client.
    for (const bad of ['', 'nope', 'no@domain', 'a b@c.com']) {
      const res = await sendCode(bad);
      expect(res.ok).toBe(false);
    }
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('verifyCode — code length follows the email provider configuration', () => {
  it.each(['123456', '12345678'])('accepts a %s token', async (token) => {
    const res = await verifyCode('student@students.kasralainy.edu.eg', token);
    expect(res.ok).toBe(true);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'student@students.kasralainy.edu.eg',
      token,
      type: 'email',
    });
  });

  it('refuses incomplete and unsupported token lengths without a network call', async () => {
    for (const token of ['12345', '1234567', '123456789']) {
      const res = await verifyCode('student@students.kasralainy.edu.eg', token);
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/6- or 8-digit/i);
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe('sendCode — turning server refusals into something readable', () => {
  it('explains a domain rejection, including Supabase’s generic wording', async () => {
    for (const message of [
      'Email domain not allowed. Use your @x address.',
      'Database error saving new user',
    ]) {
      signInWithOtp.mockResolvedValueOnce({ error: { message } });
      const res = await sendCode('outsider@example.com');
      expect(res.ok).toBe(false);
      expect(res.message).toContain('students.kasralainy.edu.eg');
    }
  });

  it('explains a rate limit as something to wait out', async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { message: 'For security purposes, you can only request this after 40 seconds.' },
    });
    const res = await sendCode('student@students.kasralainy.edu.eg');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/wait a minute/i);
  });

  it('falls back to a plain message for anything else', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { message: 'some unexpected failure' } });
    const res = await sendCode('student@students.kasralainy.edu.eg');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/could not send the code/i);
  });
});
