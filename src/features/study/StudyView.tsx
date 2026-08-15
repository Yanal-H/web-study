import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/useStore';
import { Button } from '../../design/primitives';
import { IconStudy } from '../../design/icons';

export default function StudyView() {
  const state = useStore();
  const navigate = useNavigate();
  return (
    <>
      <header className="page-head">
        <h1>Study</h1>
        <div className="sub">Your library of chapters — reader, digests and recall.</div>
      </header>
      <div className="soon">
        <span className="soon-badge">
          <IconStudy size={14} /> Next up
        </span>
        <h2 style={{ marginTop: 0 }}>The textbook reader is coming next</h2>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          Chapters load from a validated content pipeline: table of contents, key-fact digests,
          must-know tables and pitfalls, with recall and question drills wired in. Your existing
          Surgery chapter migrates in first.
        </p>
        <ul>
          <li>Library and chapter reader with a live table of contents</li>
          <li>Key-fact digests, must-know tables and common pitfalls</li>
          <li>One tap into recall drills and the question bank</li>
        </ul>
        <div className="row" style={{ gap: 10, marginTop: 20 }}>
          <Button variant="primary" onClick={() => navigate('/flashcards')}>
            Go to flashcards
          </Button>
          <Button onClick={() => navigate('/qbank')}>Open question bank</Button>
        </div>
        <div className="stub-note">
          Persisted study progress already lives under <code>foundation_med_study_v1 → study</code>{' '}
          and is loaded losslessly ({Object.keys(state.study.progress).length} module record
          {Object.keys(state.study.progress).length === 1 ? '' : 's'}).
        </div>
      </div>
    </>
  );
}
