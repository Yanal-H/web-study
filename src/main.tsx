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

/**
 * Complete a sign-in that arrived as a link in an email.
 *
 * Supabase's implicit flow returns the session in the URL fragment:
 *   https://site/#access_token=…&refresh_token=…&type=magiclink
 *
 * That is the same fragment HashRouter uses for routing, so the two cannot both
 * be left to their own devices — hence detectSessionInUrl is off and this reads
 * the tokens itself, hands them to Supabase, and clears the fragment before the
 * router ever sees it.
 *
 * Tokens travel IN the link, so this works in whatever browser opens the email —
 * which is the point. Students open mail in Gmail, which launches a different
 * browser from the one they typed their address into; a flow that needs a secret
 * left behind in the first browser bounces them back to sign-in forever.
 *
 * Errors come back the same way (#error=…&error_description=…) and are surfaced
 * rather than swallowed, so an expired link says so instead of looking like a loop.
 */
async function consumeAuthFromUrl(): Promise<void> {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw || (!raw.includes('access_token=') && !raw.includes('error='))) return;

  const params = new URLSearchParams(raw);
  const clearHash = () => {
    // Back to the app's own route, without leaving tokens in history.
    history.replaceState(null, '', window.location.pathname + window.location.search + '#/');
  };

  const errorDescription = params.get('error_description');
  if (errorDescription) {
    sessionStorage.setItem('foundation_auth_error', errorDescription.replace(/\+/g, ' '));
    clearHash();
    return;
  }

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return;

  try {
    const { supabase } = await import('./lib/supabase');
    await supabase?.auth.setSession({ access_token, refresh_token });
  } catch {
    sessionStorage.setItem('foundation_auth_error', 'That sign-in link could not be used. Ask for a new one.');
  }
  clearHash();
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');

// Awaited before the first render so a student arriving from an email link lands
// straight in the app, rather than seeing the sign-in screen flash first.
void consumeAuthFromUrl().finally(() => {
  createRoot(container).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
});

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
