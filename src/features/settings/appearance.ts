// Appearance side-effects, applied both at boot (main.tsx) and from Settings.

export function applyFontScale(scale: string) {
  const map: Record<string, string> = { S: '15px', M: '16px', L: '17.5px' };
  document.documentElement.style.fontSize = map[scale] || '16px';
}

export function applyDensity(density: string) {
  document.documentElement.classList.toggle('density-compact', density === 'compact');
}

/** Concept colour coding in the reader, on cards and in questions. */
export function applyColourTerms(on: boolean) {
  document.documentElement.dataset.lexicon = on ? 'on' : 'off';
}
