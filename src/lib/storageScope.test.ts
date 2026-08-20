import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearActiveStorageOwner,
  scopedDatabaseName,
  scopedLocalStorageKey,
  setActiveStorageOwner,
} from './storageScope';

beforeEach(() => {
  localStorage.clear();
  clearActiveStorageOwner();
});

describe('per-account browser storage', () => {
  it('assigns legacy storage once and never hands it to a second account', () => {
    setActiveStorageOwner('account-alpha');
    expect(scopedLocalStorageKey('foundation_med_study_v1')).toBe('foundation_med_study_v1');
    expect(scopedDatabaseName('foundation')).toBe('foundation');

    setActiveStorageOwner('account-bravo');
    expect(scopedLocalStorageKey('foundation_med_study_v1')).toBe(
      'foundation_med_study_v1__user_account-bravo'
    );
    expect(scopedDatabaseName('foundation')).toBe('foundation__user_account-bravo');

    setActiveStorageOwner('account-alpha');
    expect(scopedLocalStorageKey('foundation_med_study_v1')).toBe('foundation_med_study_v1');
  });

  it('refuses personal-storage access while signed out', () => {
    expect(() => scopedLocalStorageKey('private')).toThrow(/sign in/i);
    expect(() => scopedDatabaseName('private')).toThrow(/sign in/i);
  });

  it('keeps account payloads separate', () => {
    setActiveStorageOwner('account-alpha');
    localStorage.setItem(scopedLocalStorageKey('state'), 'alpha');

    setActiveStorageOwner('account-bravo');
    localStorage.setItem(scopedLocalStorageKey('state'), 'bravo');
    expect(localStorage.getItem(scopedLocalStorageKey('state'))).toBe('bravo');

    setActiveStorageOwner('account-alpha');
    expect(localStorage.getItem(scopedLocalStorageKey('state'))).toBe('alpha');
  });
});

