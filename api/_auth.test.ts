import { describe, it, expect } from 'vitest';
import { issueToken, verifyToken, safeEqual, bearer, sameOrigin, TOKEN_TTL_MS } from './_auth';

const SECRET = 'a-long-admin-secret-value';

describe('safeEqual', () => {
  it('matches identical strings and rejects differing ones', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('rejects on length mismatch without throwing', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });
});

describe('admin tokens', () => {
  it('accepts a token this server just issued', async () => {
    const token = await issueToken(SECRET);
    expect(await verifyToken(SECRET, token)).toBe(true);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issueToken(SECRET);
    expect(await verifyToken('some-other-secret', token)).toBe(false);
  });

  it('rejects a token whose expiry has been extended by hand', async () => {
    const now = Date.now();
    const token = await issueToken(SECRET, now);
    const sig = token.slice(token.indexOf('.') + 1);
    const forged = `${now + 10 * TOKEN_TTL_MS}.${sig}`;
    expect(await verifyToken(SECRET, forged)).toBe(false);
  });

  it('rejects a token whose signature has been tampered with', async () => {
    const token = await issueToken(SECRET);
    const [expiry, sig] = token.split('.');
    const flipped = sig!.startsWith('A') ? 'B' + sig!.slice(1) : 'A' + sig!.slice(1);
    expect(await verifyToken(SECRET, `${expiry}.${flipped}`)).toBe(false);
  });

  it('rejects an expired token', async () => {
    const past = Date.now() - 2 * TOKEN_TTL_MS;
    const token = await issueToken(SECRET, past);
    expect(await verifyToken(SECRET, token)).toBe(false);
  });

  it('rejects malformed and non-string tokens', async () => {
    for (const bad of ['', 'nodot', '.', 'abc.def', '123', null, undefined, 42, {}]) {
      expect(await verifyToken(SECRET, bad)).toBe(false);
    }
  });
});

describe('bearer', () => {
  it('reads a bearer token from the Authorization header', () => {
    const req = new Request('https://x.test/api/content', {
      headers: { authorization: 'Bearer abc.def' },
    });
    expect(bearer(req)).toBe('abc.def');
  });

  it('returns null when the header is missing or not a bearer', () => {
    expect(bearer(new Request('https://x.test/'))).toBeNull();
    expect(bearer(new Request('https://x.test/', { headers: { authorization: 'Basic xyz' } }))).toBeNull();
  });
});

describe('sameOrigin', () => {
  const make = (headers: Record<string, string>) => new Request('https://x.test/api/content', { headers });

  it('accepts a matching origin', () => {
    expect(sameOrigin(make({ host: 'x.test', origin: 'https://x.test' }))).toBe(true);
  });

  it('rejects a foreign origin', () => {
    expect(sameOrigin(make({ host: 'x.test', origin: 'https://evil.test' }))).toBe(false);
  });

  it('rejects when the host header is absent', () => {
    expect(sameOrigin(make({ origin: 'https://x.test' }))).toBe(false);
  });

  it('allows non-browser callers with no origin — they still face the token check', () => {
    expect(sameOrigin(make({ host: 'x.test' }))).toBe(true);
  });
});
