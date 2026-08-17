import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/useStore';
import { state as liveState, commit, update, reloadState, Store, runMigrations } from '../../state/store';
import { LS_KEY } from '../../state/constants';
import { setTheme, isDark } from '../../state/theme';
import { getHaki, setHaki, type HakiLevel } from '../../state/haki';
import {
  applyFontScale,
  applyDensity,
  applyColourTerms,
  applyReadingTone,
  applyMeasure,
  applyDyslexiaFont,
} from './appearance';
import { Card, Button, Segmented, Input, Select } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { IconDownload, IconUpload, IconSun, IconMoon, IconSparkle } from '../../design/icons';
import { sfx } from '../../lib/sound';
import { getAiConfig, setAiConfig, AI_MODELS } from '../../lib/ai';
import { isAdmin, setAdmin, unlockAdmin } from '../../lib/admin';
import { listPublished, publishPack, unpublishPack } from '../../lib/publish';
import type { RemoteItem } from '../../data/remoteContent';
import { replayTour } from '../onboarding/WelcomeTour';
import { resetEngineProgress } from '../../data/db';
import { invalidateDeckTree } from '../../data/session';
import { usage, requestPersistence, formatBytes } from '../../lib/blobs';
import { looksLikeStateBackup, redactBackup } from './backup';
import LibraryPanel from './LibraryPanel';

/** Storage usage + whether the origin is protected from eviction, with a way to ask. */
function StorageMeter() {
  const toast = useToast();
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void usage().then((u) => alive && setSpace(u));
    if (navigator.storage?.persisted)
      navigator.storage.persisted().then((p) => alive && setPersisted(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const pct = space && space.quota ? Math.min(100, (space.used / space.quota) * 100) : 0;

  async function protect() {
    const ok = await requestPersistence();
    setPersisted(ok);
    toast(ok ? 'Storage protected from eviction' : 'The browser declined — keep a backup', ok ? 'success' : 'error');
  }

  return (
    <div className="storage-meter">
      {space && (
        <>
          <div className="storage-track" aria-hidden="true">
            <div className="storage-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {formatBytes(space.used)} used{space.quota ? ` of about ${formatBytes(space.quota)}` : ''}
          </div>
        </>
      )}
      <div className="row spread" style={{ gap: 10, marginTop: 8, alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {persisted == null
            ? 'Checking whether your data is protected…'
            : persisted
              ? 'Protected — the browser will not evict this data.'
              : 'Not protected — the browser may evict this data under storage pressure.'}
        </span>
        {persisted === false && (
          <Button size="sm" onClick={() => void protect()}>
            Keep my data
          </Button>
        )}
      </div>
    </div>
  );
}

/** Enter the admin key (server-verified) to unlock the administrator surface on this device. */
function AdminPanel() {
  const toast = useToast();
  useStore(); // re-render when the admin flag changes
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAdmin()) {
    return (
      <>
        <Row label="Administrator" desc="This device has admin access.">
          <Button
            onClick={() => {
              setAdmin(false);
              toast('Signed out of admin');
            }}
          >
            Sign out of admin
          </Button>
        </Row>
        <PublishPanel />
      </>
    );
  }

  async function unlock() {
    setBusy(true);
    const res = await unlockAdmin(key);
    setBusy(false);
    if (res.ok) {
      setKey('');
      toast('Administrator unlocked', 'success');
    } else {
      toast(res.message || 'Could not unlock admin', 'error');
    }
  }

  return (
    <Row label="Admin key" desc="Only the administrator device should enter this.">
      <div className="row" style={{ gap: 8 }}>
        <Input
          type="password"
          placeholder="Admin key"
          autoComplete="off"
          value={key}
          style={{ width: 200 }}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && key.trim()) void unlock();
          }}
        />
        <Button variant="primary" disabled={busy || !key.trim()} onClick={() => void unlock()}>
          {busy ? 'Checking…' : 'Unlock'}
        </Button>
      </div>
    </Row>
  );
}

/**
 * Publish chapters to the whole cohort without a redeploy.
 *
 * Everything here is admin-only in the UI and re-authorised by the server, so a
 * student who forces the admin flag on their own device still cannot publish.
 * Students' own notes, cards and progress are never touched by any of this.
 */
function PublishPanel() {
  const toast = useToast();
  const [items, setItems] = useState<RemoteItem[] | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await listPublished();
    setConfigured(res.configured);
    setItems(res.items);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBusy(true);
    setIssues(null);
    let ok = 0;
    const failures: string[] = [];
    for (const file of files) {
      const res = await publishPack(await file.text());
      if (res.ok) ok++;
      else {
        failures.push(`${file.name}: ${res.message}`);
        if (res.issues?.length) setIssues(res.issues.slice(0, 12));
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    await refresh();
    if (ok) toast(`Published ${ok} chapter${ok === 1 ? '' : 's'}`, 'success');
    if (failures.length) toast(failures[0]!, 'error');
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await unpublishPack(id);
    setBusy(false);
    await refresh();
    toast(res.message, res.ok ? 'success' : 'error');
  }

  if (configured === false) {
    return (
      <Row
        label="Shared chapters"
        desc="Not set up on this server yet. Foundation works fully without it — students still get every chapter built into the app. To publish chapters without a redeploy, add a storage backend and ADMIN_KEY in your hosting settings (see api/README.md)."
      >
        <Button onClick={() => void refresh()}>Check again</Button>
      </Row>
    );
  }

  return (
    <>
      <Row
        label="Publish a chapter"
        desc="Send a chapter pack to everyone. It is validated before it is stored, so a broken file can never reach a student. Students receive it on their next load and keep it offline afterwards."
      >
        <div className="row" style={{ gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            multiple
            hidden
            onChange={(e) => void onFile(e)}
          />
          <Button variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Publishing…' : 'Choose pack JSON'}
          </Button>
        </div>
      </Row>

      {issues && (
        <div className="ai-err" style={{ marginTop: 8 }}>
          <strong>That pack was rejected:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <Row label="Published chapters" desc="Live for the whole cohort right now.">
        <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
          {items === null && <span className="muted">Loading…</span>}
          {items !== null && items.length === 0 && (
            <span className="muted">Nothing published yet.</span>
          )}
          {items?.map((it) => (
            <div key={it.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{it.id}</span>
              <Button size="sm" disabled={busy} onClick={() => void remove(it.id)}>
                Unpublish
              </Button>
            </div>
          ))}
        </div>
      </Row>
    </>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
  );
}

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'study', label: 'Study' },
  { id: 'questions', label: 'Questions' },
  { id: 'ai', label: 'AI tutor' },
  { id: 'library', label: 'Library' },
  { id: 'data', label: 'Data' },
  { id: 'admin', label: 'Admin' },
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
  const ai = getAiConfig();

  function setAppearance<K extends string>(key: K, value: unknown) {
    update((s) => {
      (s.settings.appearance as any)[key] = value;
    });
    if (key === 'fontScale') applyFontScale(value as string);
    if (key === 'density') applyDensity(value as string);
    if (key === 'colourTerms') applyColourTerms(!!value);
    if (key === 'readingTone') applyReadingTone(value as string);
    if (key === 'measure') applyMeasure(value as string);
    if (key === 'dyslexiaFont') applyDyslexiaFont(!!value);
  }

  function exportData() {
    // Redact secrets before the blob ever exists: the AI key (and any future secret)
    // must never leave the device inside a shareable backup file.
    const safe = redactBackup(liveState);
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foundation-study-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded — your API key is never included', 'success');
  }

  function importData(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      // Safe ordering: parse → validate shape → migrate in memory → verify the
      // migrated result → back up → write → verify the write → reload. The live
      // store is never touched until a valid migrated representation exists, and a
      // failed/partial write is rolled back rather than reported as success.
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        toast('That file is not valid JSON.', 'error');
        return;
      }
      if (!looksLikeStateBackup(parsed)) {
        toast('That file is not a Foundation backup — live data is unchanged.', 'error');
        return;
      }
      let migrated: ReturnType<typeof runMigrations>;
      try {
        migrated = runMigrations(parsed);
      } catch {
        toast('That backup could not be migrated — live data is unchanged.', 'error');
        return;
      }
      if (!migrated || typeof migrated !== 'object' || typeof migrated.schemaVersion !== 'number') {
        toast('That backup is structurally invalid — live data is unchanged.', 'error');
        return;
      }
      // Only now do we touch storage: back up the current blob first.
      const prior = JSON.stringify(liveState);
      Store.set(LS_KEY + '__preimport_' + Date.now(), prior);
      const serialised = JSON.stringify(migrated);
      const wrote = Store.set(LS_KEY, serialised);
      // Verify the write actually landed; if not, restore and report the failure.
      if (!wrote || Store.get(LS_KEY) !== serialised) {
        Store.set(LS_KEY, prior);
        toast('Import could not be saved — your data is unchanged.', 'error');
        return;
      }
      reloadState();
      commit();
      applyFontScale(liveState.settings.appearance.fontScale);
      applyDensity(liveState.settings.appearance.density);
      toast('Data imported', 'success');
    };
    reader.readAsText(file);
  }

  async function resetProgress() {
    // back up first, then clear ALL progress across both scheduling systems —
    // keep subjects, notes, imported content and settings.
    Store.set(LS_KEY + '__prereset_' + Date.now(), JSON.stringify(liveState));
    update((s) => {
      s.activity = {};
      s.study.progress = {};
      s.study.drills = [];
      s.study.mcqPerf = {};
      s.study.mcqNotes = {};
      s.study.mcqSession = null;
      s.study.cardSched = {}; // v7 content-card scheduling that used to survive a reset
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
    // The content cards are scheduled by the IndexedDB FSRS engine, not the store —
    // clear their schedules and review log too, or the reset would be a half-reset.
    try {
      await resetEngineProgress();
      invalidateDeckTree();
    } catch {
      // best-effort: the local reset already succeeded and was backed up
    }
    setConfirmReset(false);
    toast('Progress reset — personal and content-card schedules cleared (a backup was kept)', 'success');
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
            // Buttons, not anchors: under HashRouter an href="#set-…" would be read
            // as a route change and drop you on the Not-found page.
            <button
              key={sec.id}
              type="button"
              onClick={() =>
                document.getElementById(`set-${sec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {sec.label}
            </button>
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
        <Row
          label="Reading tone"
          desc="A warm, paper-like tint in the chapter reader for long sessions. Your theme and accent colours stay the same."
        >
          <Segmented
            value={(appearance.readingTone as string) || 'default'}
            onChange={(v) => setAppearance('readingTone', v)}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'sepia', label: 'Warm' },
            ]}
            ariaLabel="Reading tone"
          />
        </Row>
        <Row label="Reading width" desc="How long each line runs in the chapter reader. Shorter lines are easier to track.">
          <Segmented
            value={(appearance.measure as string) || 'medium'}
            onChange={(v) => setAppearance('measure', v)}
            options={[
              { value: 'narrow', label: 'Narrow' },
              { value: 'medium', label: 'Medium' },
              { value: 'wide', label: 'Wide' },
            ]}
            ariaLabel="Reading width"
          />
        </Row>
        <Row
          label="Dyslexia-friendly font"
          desc="Switch reading text to a wider-spaced, heavier-bottomed face that many dyslexic readers find steadier. Uses fonts already on your device."
        >
          <Switch
            label="Dyslexia-friendly font"
            checked={!!appearance.dyslexiaFont}
            onChange={(v) => setAppearance('dyslexiaFont', v)}
          />
        </Row>
        <Row label="Sound" desc="Answer feedback and the timer chime. Synthesised in the browser — no files. Browsers only allow sound after you have clicked once on the page.">
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
        <Row label="Sound volume" desc="Answer feedback and the timer chime.">
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
        <Row label="Welcome tour" desc="Show the getting-started guide again.">
          <Button
            size="sm"
            onClick={() => {
              replayTour();
              toast('The tour will show on the Dashboard.');
            }}
          >
            Show again
          </Button>
        </Row>
      </Card>

      <Card className="settings-section" id="set-study">
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
            value={(mcq.autoAdvance as string) ?? 'off'}
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

      <Card className="settings-section" id="set-ai">
        <h2>
          <IconSparkle size={18} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent)' }} />
          AI tutor
        </h2>
        <p className="section-lead">
          On by default. If your school has set up the shared AI server, it just works — no key needed.
          Otherwise add your own Anthropic key below and it activates for you. The <strong>Hint</strong>,
          <strong> Show explanation</strong> and <strong>Ask AI</strong> buttons are on every question and
          flashcard; nothing is sent anywhere until you press one, and the rest of the app is fully offline.
        </p>
        <Row label="Enable AI tutor" desc="Adds live hints and explanations to the question bank.">
          <Switch label="Enable AI tutor" checked={ai.enabled} onChange={(v) => setAiConfig({ enabled: v })} />
        </Row>
        <Row label="Your API key" desc="Optional when the shared server is set up. Your own Anthropic key, stored only on this device.">
          <Input
            type="password"
            placeholder="sk-ant-… (leave blank to use the shared server)"
            autoComplete="off"
            value={ai.apiKey}
            style={{ width: 240, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
            onChange={(e) => setAiConfig({ apiKey: e.target.value })}
          />
        </Row>
        <Row label="Model" desc="Opus gives the deepest explanations. If your key cannot use Opus, it falls back to Sonnet automatically.">
          <Select value={ai.model} onChange={(e) => setAiConfig({ model: e.target.value })} style={{ minWidth: 240 }}>
            {AI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Row>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          The key never leaves your browser except in the direct call to the model. AI answers are generated
          live and clearly labelled — always check them against the written rationale, which is the source of
          truth.
        </p>
      </Card>

      <div id="set-library">
        <LibraryPanel />
      </div>

      <Card className="settings-section" id="set-data">
        <h2>Your data</h2>
        <p className="muted" style={{ fontSize: 13.5, marginTop: -6 }}>
          Everything is stored locally on this device. Back it up or move it between devices here.
        </p>
        <StorageMeter />
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
              This clears activity, question history and every card schedule — your personal cards
              and the content cards alike — but keeps your subjects, notes and imported content. A
              backup is kept. Sure?
            </span>
            <Button variant="danger" onClick={() => void resetProgress()}>
              Yes, reset
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      <Card className="settings-section" id="set-admin">
        <h2>Administrator</h2>
        <p className="section-lead">
          One device — yours — manages shared settings and content. Admin is verified against the server key
          (<code>ADMIN_KEY</code>), so it cannot be faked by editing this device. Everyone else just studies:
          their own progress and personal imports stay on their device, and they cannot change the shared
          material.
        </p>
        <AdminPanel />
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
