// Coordinates an authenticated-account switch across every durable browser
// store. Closing IndexedDB connections before changing the namespace prevents a
// pending promise created for Account A being reused by Account B.

import { getActiveStorageOwner, setActiveStorageOwner } from './storageScope';
import { purgePersistedContent, resetConnection } from '../data/db';
import { resetFileConnection } from './blobs';
import { reloadStateForAccount, saveNow } from '../state/store';
import {
  applyColourTerms,
  applyDensity,
  applyDyslexiaFont,
  applyFontScale,
  applyMeasure,
  applyReadingTone,
} from '../features/settings/appearance';
import { applyTheme } from '../state/theme';
import { applyHaki } from '../state/haki';

let switchChain: Promise<void> = Promise.resolve();

async function performSwitch(userId: string | null): Promise<void> {
  if (getActiveStorageOwner() === userId) return;

  // Flush only while an owner is active. Signed-out memory is deliberately not
  // durable and can never become the next account's starting point.
  saveNow();
  resetConnection();
  resetFileConnection();

  setActiveStorageOwner(userId);
  const activeState = reloadStateForAccount();

  if (userId) {
    const value = activeState.settings.appearance;
    applyFontScale(value.fontScale);
    applyDensity(value.density);
    applyColourTerms(value.colourTerms !== false);
    applyReadingTone(typeof value.readingTone === 'string' ? value.readingTone : 'default');
    applyMeasure(typeof value.measure === 'string' ? value.measure : 'medium');
    applyDyslexiaFont(!!value.dyslexiaFont);
    document.documentElement.classList.toggle('reduce-motion', !!value.reducedMotion);
    applyTheme();
    applyHaki();

    // Old builds persisted shared chapter bodies. Purge them only after the
    // correct account database has been selected; personal schedules/reviews stay.
    void purgePersistedContent().catch(() => {});
  }
}

/** Serialise cross-tab/session events so rapid sign-out/sign-in cannot cross wires. */
export function switchUserStorage(userId: string | null): Promise<void> {
  switchChain = switchChain.then(() => performSwitch(userId), () => performSwitch(userId));
  return switchChain;
}
