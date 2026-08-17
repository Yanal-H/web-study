import { state, commit } from './store';

// Haki intensity — how loud the energy/lightning system runs.
//   'full'  → the full show (lightning, embers, impact flashes)
//   'calm'  → subtle glow + drift, no lightning strikes
//   'off'   → static, no motion
// prefers-reduced-motion always forces at least 'calm' behaviour via CSS.
export type HakiLevel = 'full' | 'calm' | 'off';

export function getHaki(): HakiLevel {
  return (state.settings?.appearance?.haki as HakiLevel) || 'full';
}

export function applyHaki() {
  document.documentElement.setAttribute('data-haki', getHaki());
}

export function setHaki(level: HakiLevel) {
  state.settings.appearance.haki = level;
  applyHaki();
  commit();
}

/** Whether lightning/impact effects should run right now. */
export function hakiActive(): boolean {
  if (getHaki() === 'off') return false;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    return false;
  return true;
}
