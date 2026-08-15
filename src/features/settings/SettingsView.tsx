import { useState } from 'react';
import { state, save } from '../../state/store';

const THEMES: Array<{ id: string; label: string }> = [
  { id: 'midnight', label: 'Midnight' },
  { id: 'paper', label: 'Paper' },
];

/**
 * Phase 0 settings. Only the theme toggle is wired — enough to prove theme
 * persistence round-trips through the ported state layer (state.theme + the
 * foundation_theme key). Full settings UI arrives in a later phase.
 */
export default function SettingsView() {
  const [theme, setTheme] = useState(state.theme);

  function pick(id: string) {
    state.theme = id;
    document.documentElement.setAttribute('data-theme', id);
    setTheme(id);
    save();
  }

  return (
    <>
      <header className="page-head">
        <h1>Settings</h1>
        <div className="sub">Appearance and study preferences.</div>
      </header>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Theme</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              style={{
                padding: '10px 18px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: theme === t.id ? 'var(--accent-glow)' : 'var(--bg-elev)',
                color: 'var(--text)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="stub-note">
          Remaining preferences (scheduler, MCQ, session, goals) already persist under{' '}
          <code>foundation_med_study_v1 → settings</code> and are deep-merged on load; their editors
          arrive in a later phase.
        </div>
      </div>
    </>
  );
}
