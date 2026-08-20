import { describe, expect, it } from 'vitest';
import { planContentSync } from './remoteContentPlan';

describe('planContentSync', () => {
  it('skips unchanged revisions and batches changed chapters', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `ch-${i}`, revision: `r-${i}` }));
    const plan = planContentSync(rows, { 'ch-0': 'r-0', 'ch-old': 'old' }, 3);

    expect(plan.batches).toEqual([
      ['ch-1', 'ch-2', 'ch-3'],
      ['ch-4', 'ch-5', 'ch-6'],
    ]);
    expect(plan.removed).toEqual(['ch-old']);
    expect([...plan.seen]).toHaveLength(7);
  });

  it('uses a safe minimum batch size', () => {
    const plan = planContentSync([{ id: 'one', revision: 'r1' }], {}, 0);
    expect(plan.batches).toEqual([['one']]);
  });
});
