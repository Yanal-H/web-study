import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const within = vi.hoisted(() => vi.fn());
const equal = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({
  supabase: {
    rpc,
    from: () => ({ select }),
  },
}));

const { publishDrafts, verifyPublishedChapters } = await import('./publish');

beforeEach(() => {
  rpc.mockReset();
  select.mockReset();
  within.mockReset();
  equal.mockReset();
  select.mockReturnValue({ in: within });
  within.mockReturnValue({ eq: equal });
});

describe('publish read-after-write verification', () => {
  it('confirms every selected chapter is live', async () => {
    equal.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    await expect(verifyPublishedChapters(['a', 'b'])).resolves.toEqual({
      verified: true, missing: [], unavailable: false,
    });
  });

  it('reports a missing published chapter without inviting a duplicate write', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    equal.mockResolvedValue({ data: [{ id: 'a' }], error: null });
    const result = await publishDrafts(['a', 'b']);
    expect(result).toMatchObject({ ok: true, verified: false });
    expect(result.message).toMatch(/do not republish/i);
  });

  it('distinguishes an unavailable confirmation read from a failed publish', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    equal.mockResolvedValue({ data: null, error: { message: 'network' } });
    const result = await publishDrafts(['a']);
    expect(result).toMatchObject({ ok: true, verified: false });
    expect(result.message).toMatch(/confirmation read was unavailable/i);
  });

  it('does not claim a stale selection was newly written when everything was already live', async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    equal.mockResolvedValue({ data: [{ id: 'a' }], error: null });
    const result = await publishDrafts(['a']);
    expect(result).toMatchObject({ ok: true, verified: true });
    expect(result.message).toMatch(/transaction updated 0/i);
  });
});
