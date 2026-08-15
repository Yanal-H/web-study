// Appearance side-effects, applied both at boot (main.tsx) and from Settings.

export function applyFontScale(scale: string) {
  const map: Record<string, string> = { S: '15px', M: '16px', L: '17.5px' };
  document.documentElement.style.fontSize = map[scale] || '16px';
}

export function applyDensity(density: string) {
  document.documentElement.classList.toggle('density-compact', density === 'compact');
}
