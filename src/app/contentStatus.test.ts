import { describe, expect, it } from 'vitest';
import { contentStatusAfterSync, contentStatusForKnownCatalog } from './contentStatus';

describe('global content status', () => {
  it('clears the empty banner after a same-session administrator publish', () => {
    expect(contentStatusForKnownCatalog(0)).toBe('empty');
    expect(contentStatusForKnownCatalog(14)).toBe('ready');
  });

  it('distinguishes an empty live library from an unreachable one', () => {
    expect(contentStatusAfterSync({ skipped: 'unreachable' }, 0)).toBe('offline');
    expect(contentStatusAfterSync({ skipped: undefined }, 0)).toBe('empty');
    expect(contentStatusAfterSync({ skipped: undefined }, 14)).toBe('ready');
  });
});
