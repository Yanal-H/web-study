import { useStore } from '../../state/useStore';
import { Stat } from '../../design/primitives';
import { IconQbank } from '../../design/icons';

export default function QbankView() {
  const state = useStore();
  const perf = state.study.mcqPerf || {};
  const ids = Object.keys(perf);
  const attempted = ids.filter((q) => perf[q]!.attempts > 0).length;
  const mastered = ids.filter((q) => perf[q]!.mastery === 'mastered').length;
  const flagged = ids.filter((q) => perf[q]!.flagged).length;

  return (
    <>
      <header className="page-head">
        <h1>Question Bank</h1>
        <div className="sub">MCQ and EMQ practice with tutor-mode rationale.</div>
      </header>

      <div className="stat-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <Stat label="Attempted" value={attempted} />
        <Stat label="Mastered" value={mastered} />
        <Stat label="Flagged" value={flagged} />
        <Stat label="Tracked" value={ids.length} />
      </div>

      <div className="soon">
        <span className="soon-badge">
          <IconQbank size={14} /> Quiz-template-grade engine coming
        </span>
        <h2 style={{ marginTop: 0 }}>A full question-bank experience</h2>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          Study, practice and exam modes; per-option rationale (correct answer, key points, why the
          others are wrong); EMQ sets; timed and rapid runs; a question navigator and a score ring —
          all rebuilt in a later phase on the stable question IDs your data already tracks.
        </p>
        <ul>
          <li>Immediate or exam-style feedback, with confidence tracking</li>
          <li>EMQ theme sets alongside single-best-answer MCQs</li>
          <li>Smart review of due, wrong, weak and flagged questions</li>
        </ul>
        <div className="stub-note">
          Per-question performance persists under{' '}
          <code>foundation_med_study_v1 → study.mcqPerf</code> and loads losslessly.
        </div>
      </div>
    </>
  );
}
