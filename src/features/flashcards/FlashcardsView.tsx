import { useMemo } from 'react';
import { useStore } from '../../state/useStore';
import { Stat } from '../../design/primitives';
import { IconFlashcards } from '../../design/icons';
import { dueCounts } from '../../lib/stats';
import { allCards } from '../../content/loader';
import { useUserContentVersion } from '../../content/userContent';

export default function FlashcardsView() {
  const state = useStore();
  const uv = useUserContentVersion();
  const content = useMemo(() => allCards(), [uv]);
  const d = dueCounts(state.flashcards);
  const cloze = content.filter((c) => c.type === 'cloze').length;
  return (
    <>
      <header className="page-head">
        <h1>Flashcards</h1>
        <div className="sub">Spaced-repetition recall with SM-2+ scheduling.</div>
      </header>

      <div className="stat-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <Stat label="Cards in library" value={content.length} />
        <Stat label="Cloze" value={cloze} />
        <Stat label="In your deck" value={d.total} />
        <Stat label="Due" value={d.due} />
      </div>

      <div className="soon">
        <span className="soon-badge">
          <IconFlashcards size={14} /> Recall-grade engine coming
        </span>
        <h2 style={{ marginTop: 0 }}>A Recall-grade review session</h2>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          The full review engine — keyboard-driven grading, card flip, cloze deletions, image and
          occlusion cards — arrives in a later phase, built on the SM-2+ scheduler your data already
          uses.
        </p>
        <ul>
          <li>Again / Hard / Good / Easy grading with interval previews</li>
          <li>Cloze, image and image-occlusion card types</li>
          <li>Leech handling, sibling burying and per-deck limits</li>
        </ul>
        <div className="stub-note">
          Your cards persist under <code>foundation_med_study_v1 → flashcards</code> and load
          losslessly with every scheduling field intact.
        </div>
      </div>
    </>
  );
}
