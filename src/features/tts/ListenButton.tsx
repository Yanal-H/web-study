import { useEffect, useState } from 'react';
import { ttsSupported, speak, stopSpeaking } from '../../lib/tts';

/** A small toggle that reads the given text aloud; hidden where TTS is unsupported. */
export default function ListenButton({ text, label = 'Listen' }: { text: string; label?: string }) {
  const [on, setOn] = useState(false);

  // stop speaking if this unmounts (navigation, next card, etc.)
  useEffect(() => () => stopSpeaking(), []);

  if (!ttsSupported()) return null;

  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm listen-btn${on ? ' on' : ''}`}
      aria-label={on ? 'Stop reading' : 'Read aloud'}
      onClick={(e) => {
        e.stopPropagation();
        if (on) {
          stopSpeaking();
          setOn(false);
        } else {
          speak(text, { onEnd: () => setOn(false) });
          setOn(true);
        }
      }}
    >
      {on ? 'Stop' : label}
    </button>
  );
}
