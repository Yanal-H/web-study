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

/**
 * A calmer, warmer page tint for long reading sessions. 'default' leaves the
 * chosen colour theme untouched; 'sepia' washes the reader in a paper-warm tone
 * that lowers glare without changing the app's accent colours.
 */
export function applyReadingTone(tone: string) {
  const el = document.documentElement;
  if (tone && tone !== 'default') el.dataset.readtone = tone;
  else delete el.dataset.readtone;
}

/**
 * Reading measure — the maximum line length in the reader. Shorter lines are
 * easier for the eye to track; the value is applied as a CSS custom property the
 * reader body reads for its max-width.
 */
export function applyMeasure(measure: string) {
  const map: Record<string, string> = { narrow: '58ch', medium: '70ch', wide: '84ch' };
  document.documentElement.style.setProperty('--reader-measure', map[measure] || map.medium!);
}

/**
 * A dyslexia-friendly reading face. When on, body copy in the reader, on cards
 * and in questions switches to a heavier-bottomed, wider-spaced stack that many
 * dyslexic readers find steadier. Fully offline — uses system faces, no download.
 */
export function applyDyslexiaFont(on: boolean) {
  document.documentElement.classList.toggle('dyslexia-font', on);
}
