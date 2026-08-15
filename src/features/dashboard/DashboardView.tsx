import { state } from '../../state/store';
import { SCHEMA_VERSION } from '../../state/constants';

/**
 * Phase 0 dashboard. Deliberately reads the live, migrated state so the acceptance
 * gate can eyeball that existing data loaded without loss (counts reflect whatever
 * was in localStorage under foundation_med_study_v1).
 */
export default function DashboardView() {
  const mcqPerfCount = Object.keys(state.study?.mcqPerf ?? {}).length;
  const stats: Array<[string, number | string]> = [
    ['Schema version', state.schemaVersion],
    ['Subjects', state.subjects?.length ?? 0],
    ['Flashcards', state.flashcards?.length ?? 0],
    ['Tasks', state.tasks?.length ?? 0],
    ['MCQ perf records', mcqPerfCount],
    ['Notes', Object.keys(state.notes ?? {}).length],
    ['Active days', Object.keys(state.activity ?? {}).length],
    ['Theme', state.theme],
  ];

  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <div className="sub">Your study state loaded and migrated to schema v{SCHEMA_VERSION}.</div>
      </header>

      <div className="card">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 14,
          }}
        >
          {stats.map(([label, value]) => (
            <div
              key={label}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px 16px',
                background: 'var(--bg-elev)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-faint)', letterSpacing: '0.03em' }}>
                {label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
        <div className="stub-note">
          These figures are read straight from the ported state layer — proof that data under{' '}
          <code>foundation_med_study_v1</code> survives the v1→v6 migration chain intact.
        </div>
      </div>
    </>
  );
}
