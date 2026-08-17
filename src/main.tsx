import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import './design/fonts.css';
import './design/tokens.css';
import './design/base.css';
import './design/primitives.css';
import './design/lexicon.css';
import './features/features.css';
import './features/dashboard/hero.css';
import './features/effects/effects.css';
import './features/gate/watermark.css';
import './features/auth/signin.css';
import './design/strength.css';

import { state } from './state/store';
import {
  applyFontScale,
  applyDensity,
  applyColourTerms,
  applyReadingTone,
  applyMeasure,
  applyDyslexiaFont,
} from './features/settings/appearance';
import { applyHaki } from './state/haki';
import { installAudioUnlock } from './lib/sound';

// Apply persisted appearance preferences before first paint of the app tree.
const ap = state.settings?.appearance;
if (ap) {
  applyFontScale(ap.fontScale);
  applyDensity(ap.density);
  applyColourTerms(ap.colourTerms !== false);
  applyReadingTone((ap.readingTone as string) || 'default');
  applyMeasure((ap.measure as string) || 'medium');
  applyDyslexiaFont(!!ap.dyslexiaFont);
  if (ap.reducedMotion) document.documentElement.classList.add('reduce-motion');
}
applyHaki();
installAudioUnlock();

// Remove any chapter content left on disk by an older build.
//
// Runs unconditionally at boot, BEFORE any sign-in check: a student who never
// signs in again would otherwise keep a full copy of the library forever, which
// is precisely what the online-only design exists to prevent. Personal progress,
// review history and notes are not touched.
void import('./data/db')
  .then((m) => m.purgePersistedContent())
  .then((n) => {
    if (n > 0) console.info(`Removed ${n} stored content row(s) — Foundation no longer keeps chapters on the device.`);
  })
  .catch(() => {
    // No IndexedDB, or it is locked. Nothing to clean up that we can reach.
  });

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');

createRoot(container).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// Register the offline service worker (production builds only; dev has no /sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}

// Stale-chunk recovery: after a redeploy, a lazy import may 404 because its hashed
// filename changed. Reload ONCE to fetch the fresh shell (index.html is served
// no-cache), which pulls the new chunk map. A sessionStorage guard prevents loops.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  const KEY = 'foundation_reloaded_for_chunk';
  if (!sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, '1');
    window.location.reload();
  }
});
