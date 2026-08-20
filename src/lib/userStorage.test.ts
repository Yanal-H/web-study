import { beforeEach, describe, expect, it } from 'vitest';
import { clearActiveStorageOwner } from './storageScope';
import { switchUserStorage } from './userStorage';
import { saveNow, state } from '../state/store';

beforeEach(async () => {
  await switchUserStorage(null);
  localStorage.clear();
  clearActiveStorageOwner();
});

describe('authenticated account switching', () => {
  it('unloads one account state before loading another', async () => {
    await switchUserStorage('account-alpha');
    state.notes.privateNote = { id: 'privateNote', title: 'Alpha', body: 'Only Alpha' };
    saveNow();

    await switchUserStorage('account-bravo');
    expect(state.notes.privateNote).toBeUndefined();
    state.notes.bravoNote = { id: 'bravoNote', title: 'Bravo', body: 'Only Bravo' };
    saveNow();

    await switchUserStorage('account-alpha');
    expect(state.notes.privateNote?.body).toBe('Only Alpha');
    expect(state.notes.bravoNote).toBeUndefined();
  });

  it('clears personal state from memory on sign-out', async () => {
    await switchUserStorage('account-alpha');
    state.notes.privateNote = { id: 'privateNote', title: 'Alpha', body: 'Secret' };
    saveNow();

    await switchUserStorage(null);
    expect(state.notes.privateNote).toBeUndefined();
  });
});

