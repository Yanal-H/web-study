import { describe, it, expect, afterEach } from 'vitest';
import { getStore } from './_store';

const KEYS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'BLOB_READ_WRITE_TOKEN'] as const;

function setEnv(vars: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

afterEach(() => setEnv({}));

describe('getStore — driver selection', () => {
  it('returns null when nothing is configured, so the API can answer 503', () => {
    setEnv({});
    expect(getStore()).toBeNull();
  });

  it('uses KV when both KV variables are present', () => {
    setEnv({ KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 'tok' });
    expect(getStore()?.name).toBe('kv');
  });

  it('does not half-configure KV from a single variable', () => {
    setEnv({ KV_REST_API_URL: 'https://kv.test' });
    expect(getStore()).toBeNull();
    setEnv({ KV_REST_API_TOKEN: 'tok' });
    expect(getStore()).toBeNull();
  });

  it('falls back to Blob when only the blob token is present', () => {
    setEnv({ BLOB_READ_WRITE_TOKEN: 'tok' });
    expect(getStore()?.name).toBe('blob');
  });

  it('prefers KV when both are configured', () => {
    setEnv({
      KV_REST_API_URL: 'https://kv.test',
      KV_REST_API_TOKEN: 'tok',
      BLOB_READ_WRITE_TOKEN: 'blob',
    });
    expect(getStore()?.name).toBe('kv');
  });
});
