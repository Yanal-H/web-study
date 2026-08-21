import { afterAll, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const importPackIntoSession = vi.hoisted(() => vi.fn());
const seedScheduling = vi.hoisted(() => vi.fn());
const rehydrateChapters = vi.hoisted(() => vi.fn());

const pack = {
  schema: 'foundation.study-module/v1',
  id: 'sur-ch1-lazy-delivery',
  subject: 'Surgery',
  title: 'Lazy delivery',
  sections: [{ id: 's1', title: 'First', digest: 'Authenticated study text.' }],
  cards: [{ id: 'card-1', type: 'basic', front: 'Question', back: 'Answer' }],
};

const catalogRow = {
  id: pack.id,
  revision: 'r1',
  subject: pack.subject,
  title: pack.title,
  updated_at: '2026-08-20T00:00:00Z',
  deck: 'Surgery::Lazy delivery',
  section_index: [{ id: 's1', title: 'First' }],
  card_index: [{ id: 'card-1', deck: 'Surgery::Lazy delivery::First' }],
  mcq_index: [],
  section_count: 1,
  card_count: 1,
  mcq_count: 0,
  emq_count: 0,
  mnemonic_count: 0,
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'student-1' } } } })) },
    rpc,
    from,
  },
}));
vi.mock('./importClient', () => ({ importPackIntoSession }));
vi.mock('./importPack', () => ({ seedScheduling }));
vi.mock('./bootstrap', () => ({ rehydrateChapters }));
vi.mock('../state/store', () => ({ notify: vi.fn() }));

const remote = await import('./remoteContent');
const catalog = await import('../content/catalog');

describe('authenticated catalog-to-body acceptance boundary', () => {
  it('loads identities first and the selected deck body only on demand', async () => {
    rpc.mockResolvedValue({ data: [catalogRow], error: null });
    seedScheduling.mockResolvedValue(1);
    rehydrateChapters.mockResolvedValue(0);

    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    builder.select = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.returns = vi.fn(async () => ({
      data: [{ id: pack.id, revision: 'r1', pack }], error: null,
    }));
    from.mockReturnValue(builder);

    const sync = await remote.syncPublishedContent();
    expect(sync.catalogued).toEqual([pack.id]);
    expect(catalog.catalogCardCount()).toBe(1);
    expect(seedScheduling).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'card-1', deck: 'Surgery::Lazy delivery::First' }),
    ]);
    expect(from).not.toHaveBeenCalled();
    expect(importPackIntoSession).not.toHaveBeenCalled();

    const body = await remote.ensureDeckContent('Surgery::Lazy delivery');
    expect(body).toEqual({ imported: [pack.id], failed: [] });
    expect(from).toHaveBeenCalledWith('chapters');
    expect(importPackIntoSession).toHaveBeenCalledWith(expect.objectContaining({ id: pack.id }));

    seedScheduling.mockClear();
    await remote.syncPublishedContent();
    expect(seedScheduling).not.toHaveBeenCalled();
  });
});

afterAll(() => remote.forgetContent());
