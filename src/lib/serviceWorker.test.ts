import { describe, expect, it } from 'vitest';
import { shouldCheckForAppUpdate } from './serviceWorker';

describe('shouldCheckForAppUpdate', () => {
  const fifteenMinutes = 15 * 60 * 1000;

  it('checks immediately and again after the throttle interval', () => {
    expect(shouldCheckForAppUpdate(0, fifteenMinutes, true, true)).toBe(true);
    expect(shouldCheckForAppUpdate(1_000, 1_000 + fifteenMinutes, true, true)).toBe(true);
  });

  it('does not spend requests while offline, hidden or inside the throttle window', () => {
    expect(shouldCheckForAppUpdate(0, fifteenMinutes, false, true)).toBe(false);
    expect(shouldCheckForAppUpdate(0, fifteenMinutes, true, false)).toBe(false);
    expect(shouldCheckForAppUpdate(1_000, 1_000 + fifteenMinutes - 1, true, true)).toBe(false);
  });
});
