import { useStore } from '../../state/useStore';
import { Stat } from '../../design/primitives';
import { IconFlashcards } from '../../design/icons';
import { dueCounts } from '../../lib/stats';

export default function FlashcardsView() {
  const state = useStore();
  const d = dueCounts(state.flashcards);
  return (
    <>
      <header className="page-head">
        <h1>Flashcards</h1>
        <div className="sub">Spaced-repetition recall with SM-2+ scheduling.</div>
      </header>

      <div className="stat-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <Stat label="Total cards" value={d.total} />
        <Stat label="Due" value={d.due} />
        <Stat label="New" value={d.neu} />
        <Stat label="Learning" value={d.learning} />
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
