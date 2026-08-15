import { useRef, useState } from 'react';
import { useStore } from '../../state/useStore';
import { state as liveState, commit, update, reloadState, Store, runMigrations } from '../../state/store';
import { LS_KEY } from '../../state/constants';
import { setTheme, isDark } from '../../state/theme';
import { getHaki, setHaki, type HakiLevel } from '../../state/haki';
import { applyFontScale, applyDensity } from './appearance';
import { Card, Button, Segmented, Input } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { IconDownload, IconUpload, IconSun, IconMoon } from '../../design/icons';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
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
    <>
      <header className="page-head">
        <h1>Settings</h1>
        <div className="sub">Appearance, study defaults and your data.</div>
      </header>

      <Card className="settings-section">
        <h2>Appearance</h2>
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

      <Card className="settings-section">
        <h2>Question bank</h2>
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
      </Card>

      <Card className="settings-section">
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
    </>
  );
}
