import { describe, it, expect } from 'vitest';
import { looksLikeStateBackup, redactBackup } from './backup';

describe('redactBackup (C3 — API key must never be exported)', () => {
  it('strips settings.ai.apiKey from the export', () => {
    const state = {
      schemaVersion: 7,
      settings: { ai: { enabled: true, apiKey: 'sk-ant-secret-123', model: 'claude-haiku-4-5-20251001' } },
      flashcards: [],
    };
    const out = redactBackup(state);
    expect(out.settings.ai.apiKey).toBeUndefined();
    // the rest of the AI config survives, so re-import keeps preferences
    expect(out.settings.ai.enabled).toBe(true);
    expect(out.settings.ai.model).toBe('claude-haiku-4-5-20251001');
  });

  it('does not mutate the original state', () => {
    const state = { settings: { ai: { apiKey: 'sk-ant-keep' } } };
    redactBackup(state);
    expect(state.settings.ai.apiKey).toBe('sk-ant-keep');
  });

  it('serialised export contains no key material', () => {
    const state = { settings: { ai: { apiKey: 'sk-ant-should-not-appear' } }, notes: {} };
    const json = JSON.stringify(redactBackup(state));
    expect(json).not.toContain('sk-ant-should-not-appear');
  });

  it('is a no-op when there is no AI config', () => {
    const state = { schemaVersion: 7, flashcards: [], settings: { appearance: {} } };
    expect(() => redactBackup(state)).not.toThrow();
    expect(redactBackup(state).schemaVersion).toBe(7);
  });
});

describe('looksLikeStateBackup (C5 — reject non-backups before touching the store)', () => {
  it('accepts a real-looking state blob', () => {
    expect(looksLikeStateBackup({ schemaVersion: 7, settings: {}, flashcards: [] })).toBe(true);
    expect(looksLikeStateBackup({ notes: {} })).toBe(true);
    expect(looksLikeStateBackup({ subjects: [] })).toBe(true);
  });

  it('rejects a chapter content file (a common mistake)', () => {
    expect(looksLikeStateBackup({ schema: 'foundation.study-module/v1', sections: [] })).toBe(false);
  });

  it('rejects arrays, primitives and null', () => {
    expect(looksLikeStateBackup([])).toBe(false);
    expect(looksLikeStateBackup(null)).toBe(false);
    expect(looksLikeStateBackup(42)).toBe(false);
    expect(looksLikeStateBackup('a string')).toBe(false);
  });

  it('rejects an unrelated JSON object', () => {
    expect(looksLikeStateBackup({ hello: 'world', foo: 1 })).toBe(false);
  });
});
