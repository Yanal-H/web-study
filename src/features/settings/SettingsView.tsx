import { createContext, useContext, useRef, useState } from 'react';
import { useStore } from '../../state/useStore';
import { state as liveState, commit, update, reloadState, Store, runMigrations } from '../../state/store';
import { LS_KEY } from '../../state/constants';
import { setTheme, isDark } from '../../state/theme';
import { getHaki, setHaki, type HakiLevel } from '../../state/haki';
import { applyFontScale, applyDensity, applyColourTerms } from './appearance';
import { Card, Button, Segmented, Input } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { IconDownload, IconUpload, IconSun, IconMoon } from '../../design/icons';
import { sfx } from '../../lib/sound';
import LibraryPanel from './LibraryPanel';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
  );
}

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'study', label: 'Study' },
  { id: 'questions', label: 'Questions' },
  { id: 'library', label: 'Library' },
  { id: 'data', label: 'Data' },
];

/** The active filter, so every Row can hide itself without threading a prop. */
const FilterContext = createContext('');

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  const q = useContext(FilterContext);
  if (q && !`${label} ${desc ?? ''}`.toLowerCase().includes(q)) return null;
  return (
    <div className="setting-row">
      <div>
        <div className="sr-label">{label}</div>
        {desc && <div className="sr-desc">{desc}</div>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

export default function SettingsView() {
  const state = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  const appearance = state.settings.appearance;
  const scheduler = state.settings.scheduler;
  const mcq = state.settings.mcq;
  const goals = state.settings.goals;

  function setAppearance<K extends string>(key: K, value: unknown) {
    update((s) => {
      (s.settings.appearance as any)[key] = value;
    });
    if (key === 'fontScale') applyFontScale(value as string);
    if (key === 'density') applyDensity(value as string);
    if (key === 'colourTerms') applyColourTerms(!!value);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(liveState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foundation-study-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded', 'success');
  }

  function importData(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        // back up current data before overwriting, then migrate the import losslessly
        Store.set(LS_KEY + '__preimport_' + Date.now(), JSON.stringify(liveState));
        const migrated = runMigrations(parsed);
        Store.set(LS_KEY, JSON.stringify(migrated));
        reloadState();
        commit();
        applyFontScale(liveState.settings.appearance.fontScale);
        applyDensity(liveState.settings.appearance.density);
        toast('Data imported', 'success');
      } catch {
        toast('That file could not be read', 'error');
      }
    };
    reader.readAsText(file);
  }

  function resetProgress() {
    // back up first, then clear only progress — keep subjects, notes, content, settings
    Store.set(LS_KEY + '__prereset_' + Date.now(), JSON.stringify(liveState));
    update((s) => {
      s.activity = {};
      s.study.progress = {};
      s.study.drills = [];
      s.study.mcqPerf = {};
      s.study.mcqNotes = {};
      s.study.mcqSession = null;
      s.study.daily = { date: new Date().toISOString().slice(0, 10), newDone: 0, revDone: 0 };
      s.flashcards.forEach((c) => {
        c.reps = 0;
        c.interval = 0;
        c.lapses = 0;
        c.state = 'new';
        c.step = 0;
        c.history = [];
      });
    });
    setConfirmReset(false);
    toast('Progress reset (a backup was kept)', 'success');
  }

  return (
    <FilterContext.Provider value={q}>
      <header className="page-head">
        <h1>Settings</h1>
        <div className="sub">Appearance, study defaults, your library and your data.</div>
      </header>

      <div className="settings-bar no-print">
        <input
          className="input settings-filter"
          placeholder="Filter settings…"
          value={filter}
          aria-label="Filter settings"
          onChange={(e) => setFilter(e.target.value)}
        />
        <nav className="settings-jump" aria-label="Settings sections">
          {SECTIONS.map((sec) => (
            <a key={sec.id} href={`#set-${sec.id}`}>
              {sec.label}
            </a>
          ))}
        </nav>
      </div>

      <Card className="settings-section" id="set-appearance">
        <h2>Appearance</h2>
        <p className="section-lead">How the app looks and how loud it is.</p>
        <Row label="Theme" desc="Light and dark are fully supported.">
          <Segmented
            value={isDark() ? 'midnight' : 'paper'}
            onChange={(v) => setTheme(v as 'midnight' | 'paper')}
            options={[
              { value: 'midnight', label: 'Dark' },
              { value: 'paper', label: 'Light' },
            ]}
            ariaLabel="Theme"
          />
        </Row>
        <Row label="Text size">
          <Segmented
            value={appearance.fontScale}
            onChange={(v) => setAppearance('fontScale', v)}
            options={[
              { value: 'S', label: 'S' },
              { value: 'M', label: 'M' },
              { value: 'L', label: 'L' },
            ]}
            ariaLabel="Text size"
          />
        </Row>
        <Row label="Density">
          <Segmented
            value={appearance.density}
            onChange={(v) => setAppearance('density', v)}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            ariaLabel="Density"
          />
        </Row>
        <Row label="Haki energy" desc="Lightning, embers and impact across the app.">
          <Segmented
            value={getHaki()}
            onChange={(v) => setHaki(v as HakiLevel)}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'calm', label: 'Calm' },
              { value: 'off', label: 'Off' },
            ]}
            ariaLabel="Haki energy"
          />
        </Row>
        <Row
          label="Colour coding"
          desc="Drugs, numbers, cells, conditions and red flags each get their own colour while you read."
        >
          <Switch
            label="Colour coding"
            checked={appearance.colourTerms !== false}
            onChange={(v) => setAppearance('colourTerms', v)}
          />
        </Row>
        <Row label="Sound" desc="Thunder, answer feedback and the timer chime. Synthesised in the browser — no files. Browsers only allow sound after you have clicked once on the page, and reduce-motion silences the ambient thunder along with the lightning.">
          <Switch
            label="Sound"
            checked={((state.settings as Record<string, any>).sound?.effects ?? true) !== false}
            onChange={(v) =>
              update((s) => {
                const snd = ((s.settings as Record<string, any>).sound ||= {});
                snd.effects = v;
              })
            }
          />
        </Row>
        <Row label="Sound volume" desc="Thunder, answer feedback and the timer chime.">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              aria-label="Sound volume"
              value={(state.settings as Record<string, any>).sound?.volume ?? 0.55}
              onChange={(e) =>
                update((s) => {
                  const snd = ((s.settings as Record<string, any>).sound ||= {});
                  snd.volume = Number(e.target.value);
                })
              }
            />
            <Button size="sm" onClick={() => sfx.test()}>
              Test
            </Button>
          </div>
        </Row>
        <Row label="Reduce motion" desc="Minimise animations.">
          <Switch
            label="Reduce motion"
            checked={!!appearance.reducedMotion}
            onChange={(v) => {
              setAppearance('reducedMotion', v);
              document.documentElement.classList.toggle('reduce-motion', v);
            }}
          />
        </Row>
      </Card>

      <Card className="settings-section">
        <h2>Study goals & scheduling</h2>
        <Row label="Daily goal" desc="Reviews per day to aim for.">
          <Input
            type="number"
            min={0}
            style={{ width: 110 }}
            value={goals.dailyGoal}
            onChange={(e) => update((s) => (s.settings.goals.dailyGoal = parseInt(e.target.value) || 0))}
          />
        </Row>
        <Row label="New cards / day">
          <Input
            type="number"
            min={0}
            style={{ width: 110 }}
            value={scheduler.newPerDay}
            onChange={(e) => update((s) => (s.settings.scheduler.newPerDay = parseInt(e.target.value) || 0))}
          />
        </Row>
        <Row label="Reviews / day">
          <Input
            type="number"
            min={0}
            style={{ width: 110 }}
            value={scheduler.reviewsPerDay}
            onChange={(e) => update((s) => (s.settings.scheduler.reviewsPerDay = parseInt(e.target.value) || 0))}
          />
        </Row>
      </Card>

      <Card className="settings-section" id="set-questions">
        <h2>Question bank</h2>
        <p className="section-lead">How answering feels: submit or not, and what happens next.</p>
        <Row label="Shuffle options" desc="Randomise answer order each attempt.">
          <Switch
            label="Shuffle options"
            checked={!!mcq.shuffleOptions}
            onChange={(v) => update((s) => (s.settings.mcq.shuffleOptions = v))}
          />
        </Row>
        <Row label="Tutor mode" desc="Show rationale immediately after answering.">
          <Switch
            label="Tutor mode"
            checked={!!mcq.tutorMode}
            onChange={(v) => update((s) => (s.settings.mcq.tutorMode = v))}
          />
        </Row>
        <Row label="Instant answer" desc="Tapping an option answers it — no Submit step.">
          <Switch
            label="Instant answer"
            checked={mcq.instantAnswer !== false}
            onChange={(v) => update((s) => (s.settings.mcq.instantAnswer = v))}
          />
        </Row>
        <Row label="Auto-advance" desc="Move to the next question on its own after you answer.">
          <Segmented
            value={(mcq.autoAdvance as string) ?? 'correct'}
            onChange={(v) => update((s) => (s.settings.mcq.autoAdvance = v))}
            options={[
              { value: 'correct', label: 'When right' },
              { value: 'always', label: 'Always' },
              { value: 'off', label: 'Off' },
            ]}
            ariaLabel="Auto-advance"
          />
        </Row>
        <Row label="Auto-advance delay" desc="How long the rationale stays up first.">
          <Segmented
            value={String((mcq.autoAdvanceMs as number) ?? 1500)}
            onChange={(v) => update((s) => (s.settings.mcq.autoAdvanceMs = Number(v)))}
            options={[
              { value: '800', label: 'Fast' },
              { value: '1500', label: 'Normal' },
              { value: '3000', label: 'Slow' },
            ]}
            ariaLabel="Auto-advance delay"
          />
        </Row>
      </Card>

      <div id="set-library">
        <LibraryPanel />
      </div>

      <Card className="settings-section" id="set-data">
        <h2>Your data</h2>
        <p className="muted" style={{ fontSize: 13.5, marginTop: -6 }}>
          Everything is stored locally on this device. Back it up or move it between devices here.
        </p>
        <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
          <Button onClick={exportData}>
            <IconDownload size={17} /> Export backup
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <IconUpload size={17} /> Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importData(f);
              e.target.value = '';
            }}
          />
        </div>
        <hr />
        {!confirmReset ? (
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset study progress
          </Button>
        ) : (
          <div className="row wrap" style={{ gap: 10 }}>
            <span className="muted" style={{ fontSize: 13.5 }}>
              This clears activity, schedules and question history (a backup is kept). Keep subjects
              and notes. Sure?
            </span>
            <Button variant="danger" onClick={resetProgress}>
              Yes, reset
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      <div className="row" style={{ justifyContent: 'space-between', color: 'var(--text-faint)', fontSize: 12 }}>
        <span>
          {isDark() ? <IconMoon size={13} /> : <IconSun size={13} />} Foundation · schema v
          {state.schemaVersion}
        </span>
        <span style={{ fontFamily: 'var(--font-signature)', fontSize: 18 }}>Yanal</span>
      </div>
    </FilterContext.Provider>
  );
}
