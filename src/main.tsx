import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import './design/fonts.css';
import './design/tokens.css';
import './design/base.css';
import './design/primitives.css';
import './features/features.css';
import './features/dashboard/hero.css';
import './features/gate/watermark.css';

import { state } from './state/store';
import { applyFontScale, applyDensity } from './features/settings/appearance';

// Apply persisted appearance preferences before first paint of the app tree.
const ap = state.settings?.appearance;
if (ap) {
  applyFontScale(ap.fontScale);
  applyDensity(ap.density);
  if (ap.reducedMotion) document.documentElement.classList.add('reduce-motion');
}

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
