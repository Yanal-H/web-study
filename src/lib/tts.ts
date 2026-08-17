// Read-aloud using the browser's built-in Web Speech API. No network, no files —
// it uses the operating system's own voices, so it works offline where the platform
// supports it and is simply absent where it does not. Opt-in per use (a Listen
// button), never automatic.

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Strip markdown/HTML/cloze markup so the spoken text reads naturally. */
function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{c\d+::([^}]*?)(?:::[^}]*?)?\}\}/g, '$1')
    .replace(/[#>*`_~[\]|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string, opts: { onEnd?: () => void } = {}): void {
  if (!ttsSupported()) return;
  const t = clean(text);
  if (!t) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.rate = 1;
  u.pitch = 1;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
