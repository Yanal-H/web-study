import { describe, it, expect, vi, beforeEach } from 'vitest';

// The publish path is the same whether a pack arrives as a file or as pasted
// text, so these cover both. What matters is that nothing invalid reaches the
// store — a malformed chapter published to a cohort is a content-integrity
// failure, not a cosmetic one.
const upsert = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({
  supabase: { from: () => ({ upsert }) },
}));

const { publishPack, stagePacks } = await import('./publish');

const validPack = {
  schema: 'foundation.study-module/v1',
  id: 'sur-ch9-test-chapter',
  subject: 'Surgery',
  title: 'A Test Chapter',
  sections: [{ id: 's1', title: 'First', digest: 'Something worth knowing.' }],
};

beforeEach(() => {
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
});

describe('publishPack — nothing invalid reaches the store', () => {
  it('refuses text that is not JSON at all, without calling the server', async () => {
    const res = await publishPack('this is not json');
    expect(res.ok).toBe(false);
    expect(res.issues?.join(' ')).toMatch(/not valid JSON/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a pack that fails the schema, and says which fields', async () => {
    const res = await publishPack(JSON.stringify({ ...validPack, id: 'not a valid id!' }));
    expect(res.ok).toBe(false);
    expect(res.issues?.length).toBeGreaterThan(0);
    expect(res.issues!.join(' ')).toMatch(/id/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a chapter with no sections', async () => {
    const res = await publishPack(JSON.stringify({ ...validPack, sections: [] }));
    expect(res.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('stages a valid pack for review before it can reach students', async () => {
    const res = await publishPack(JSON.stringify(validPack));
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/saved.*draft/i);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]![0][0]).toMatchObject({ id: validPack.id, title: validPack.title });
  });

  it('stores a revision that changes when the content does', async () => {
    await publishPack(JSON.stringify(validPack));
    const first = upsert.mock.calls[0]![0][0].revision;

    upsert.mockClear();
    await publishPack(JSON.stringify({ ...validPack, title: 'A Different Title' }));
    const second = upsert.mock.calls[0]![0][0].revision;

    // Students skip a download when the revision matches, so an unchanged
    // revision after an edit means they would never receive the correction.
    expect(first).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it('does not stage any pack when one item in a multi-file batch is invalid', async () => {
    const res = await stagePacks([
      { name: 'valid.json', text: JSON.stringify(validPack) },
      { name: 'broken.json', text: JSON.stringify({ ...validPack, id: 'not valid' }) },
    ]);
    expect(res.ok).toBe(false);
    expect(res.issues?.join(' ')).toMatch(/broken\.json.*id/i);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('publishPack — explaining a refusal from the database', () => {
  it('translates a row-level-security refusal into what to do about it', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });
    const res = await publishPack(JSON.stringify(validPack));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/administrator/i);
  });

  it('says to run the setup when a required table does not exist', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'relation "public.chapters" does not exist' } });
    const res = await publishPack(JSON.stringify(validPack));
    expect(res.message).toMatch(/setup\.sql/);
  });

  it('says to sign in again when the session has expired', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'JWT expired' } });
    const res = await publishPack(JSON.stringify(validPack));
    expect(res.message).toMatch(/sign out and back in/i);
  });
});
