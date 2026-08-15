import { state, commit } from './store';

// Theme ids stay compatible with the ported state + pre-paint script:
//   'midnight' = dark, 'paper' = light. The token layer aliases these to the new
// dark/light palettes, so stored user data keeps working unchanged.
export type ThemeId = 'midnight' | 'paper';

export function isDark(): boolean {
  return state.theme !== 'paper';
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'paper' ? '#f3f1ea' : '#0e1217');
}

export function setTheme(t: ThemeId) {
  state.theme = t;
  applyTheme();
  commit();
}

export function toggleTheme() {
  setTheme(isDark() ? 'paper' : 'midnight');
}
