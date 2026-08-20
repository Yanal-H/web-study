import { beforeEach, describe, expect, it, vi } from 'vitest';

const importPack = vi.hoisted(() => vi.fn());
vi.mock('./importPack', () => ({ importPack }));

const { importPackIntoSession, importRunsInWorker } = await import('./importClient');

describe('session import boundary', () => {
  beforeEach(() => importPack.mockReset());

  it('always imports in the page memory realm, never an isolated worker', async () => {
    const result = { cards: 540, mcqs: 30, seeded: 540 };
    importPack.mockResolvedValue(result);
    const progress = vi.fn();
    const pack = { id: 'test-ch1-memory' } as never;

    await expect(importPackIntoSession(pack, progress)).resolves.toEqual(result);
    expect(importRunsInWorker()).toBe(false);
    expect(importPack).toHaveBeenCalledWith(pack, progress);
  });
});

