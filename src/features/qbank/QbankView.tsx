import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, useStoreVersion } from '../../state/useStore';
import { Card, Button, Stat, Segmented } from '../../design/primitives';
import { allMcqs, allEmqs } from '../../content/loader';
import { getCatalogChapter } from '../../content/catalog';
import { ensureContentKind } from '../../data/remoteContent';

/** Chapter title for an id, falling back to the id when a pack has been removed. */
const chapterTitle = (id: string) => getCatalogChapter(id)?.title ?? id;
import {
  buildPool,
  poolCount,
  startSession,
  getSession,
  type QMode,
  type Special,
} from './engine';
import QuestionRunner from './QuestionRunner';
import EmqRunner from './EmqRunner';

type Screen = 'setup' | 'run' | 'emq';

const MODES: Array<{ value: QMode; label: string; blurb: string }> = [
  { value: 'study', label: 'Study', blurb: 'Immediate feedback + teaching' },
  { value: 'practice', label: 'Practice', blurb: 'Immediate mark, lighter' },
  { value: 'exam', label: 'Exam', blurb: 'Timed, feedback at the end' },
  { value: 'cram', label: 'Cram', blurb: 'Rapid, immediate feedback' },
];
const POOLS: Array<{ value: Special; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'due', label: 'Due' },
  { value: 'weak', label: 'Weak' },
  { value: 'wrong', label: 'Wrong' },
  { value: 'flagged', label: 'Flagged' },
];

export default function QbankView() {
  const state = useStore();
  const storeVersion = useStoreVersion();
  // a chapter/subject handed over from Study or Subjects preselects the filters
  const preset = (useLocation().state ?? null) as { chapterId?: string; subject?: string } | null;
  const [screen, setScreen] = useState<Screen>(getSession() ? 'run' : 'setup');
  const [mode, setMode] = useState<QMode>('study');
  const [special, setSpecial] = useState<Special>('all');
  const [subject, setSubject] = useState<string>(preset?.subject ?? '');
  const [chapter, setChapter] = useState<string>(preset?.chapterId ?? '');
  const [difficulties, setDifficulties] = useState<number[]>([1, 2, 3]);
  const [size, setSize] = useState<number>(20);
  const [loadingBank, setLoadingBank] = useState(true);
  const [bankLoadFailed, setBankLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void ensureContentKind('questions')
      .then((report) => { if (alive) setBankLoadFailed(report.failed.length > 0); })
      .finally(() => { if (alive) setLoadingBank(false); });
    return () => { alive = false; };
  }, []);

  const bank = useMemo(() => allMcqs(), [storeVersion]);
  const emqs = useMemo(() => allEmqs(), [storeVersion]);
  const subjects = useMemo(() => [...new Set(bank.map((q) => q.subject))].sort(), [bank]);
  /** chapters within the chosen subject, with how many questions each holds */
  const chapters = useMemo(() => {
    const counts = new Map<string, { id: string; title: string; n: number }>();
    for (const q of bank) {
      if (subject && q.subject !== subject) continue;
      const row = counts.get(q.chapterId) || {
        id: q.chapterId,
        title: chapterTitle(q.chapterId),
        n: 0,
      };
      row.n++;
      counts.set(q.chapterId, row);
    }
    return [...counts.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [bank, subject]);
  const perf = state.study.mcqPerf || {};
  const ids = Object.keys(perf);
  const attempted = ids.filter((q) => perf[q]!.attempts > 0).length;
  const mastered = ids.filter((q) => perf[q]!.mastery === 'mastered').length;

  const filter = {
    subjects: subject ? [subject] : undefined,
    chapters: chapter ? [chapter] : undefined,
    difficulties,
    special,
  };
  // The pool is small and the filter is a fresh object each render; calculate it
  // directly so the displayed count always follows every selected filter.
  const available = poolCount(filter);

  if (loadingBank) {
    return (
      <>
        <header className="page-head"><h1>Question Bank</h1></header>
        <Card><div className="route-fallback">Loading questions…</div></Card>
      </>
    );
  }

  if (bankLoadFailed) {
    return (
      <>
        <header className="page-head"><h1>Question Bank</h1></header>
        <Card>
          <p>Questions could not be downloaded. Check your connection and try again.</p>
          <Button variant="primary" onClick={() => window.location.reload()}>Try again</Button>
        </Card>
      </>
    );
  }

  function toggleDiff(d: number) {
    setDifficulties((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]).sort());
  }

  function begin() {
    const pool = buildPool({ ...filter, shuffle: true, limit: size });
    if (pool.length === 0) return;
    const timed = mode === 'exam' ? { totalSeconds: Math.round(pool.length * (state.settings.mcq.examMinPerQ || 1.5) * 60) } : undefined;
    startSession(mode, pool, timed);
    setScreen('run');
  }

  if (screen === 'run') {
    return <QuestionRunner onExit={() => setScreen('setup')} />;
  }
  if (screen === 'emq') {
    return <EmqRunner emqs={emqs} onExit={() => setScreen('setup')} />;
  }

  const resumable = getSession();

  return (
    <>
      <header className="page-head">
        <h1>Question Bank</h1>
        <div className="sub">Single-best-answer, multi-answer and EMQ, with per-option rationale.</div>
      </header>

      <div className="stat-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <Stat label="Questions" value={bank.length} />
        <Stat label="EMQ sets" value={emqs.length} />
        <Stat label="Attempted" value={attempted} />
        <Stat label="Mastered" value={mastered} />
      </div>

      {resumable && (
        <Card style={{ marginBottom: 'var(--sp-4)', borderColor: 'var(--accent)' }}>
          <div className="row spread wrap" style={{ gap: 12 }}>
            <div>
              <div className="card-eyebrow">Resume session</div>
              <div style={{ fontWeight: 500 }}>
                {resumable.mode} · {Object.keys(resumable.answers).length}/{resumable.ids.length} answered
              </div>
            </div>
            <Button variant="primary" onClick={() => setScreen('run')}>
              Resume
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="card-eyebrow">New session</div>
        <div className="qb-setup">
          <div>
            <div className="setup-label">Mode</div>
            <div className="mode-grid">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  className={`mode-card ${mode === m.value ? 'active' : ''}`}
                  onClick={() => setMode(m.value)}
                >
                  <span className="mode-name">{m.label}</span>
                  <span className="mode-blurb">{m.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="row wrap" style={{ gap: 20, marginTop: 18 }}>
            <div>
              <div className="setup-label">Pool</div>
              <Segmented value={special} onChange={setSpecial} options={POOLS} ariaLabel="Pool" />
            </div>
            <div>
              <div className="setup-label">Difficulty</div>
              <div className="row" style={{ gap: 6 }}>
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    className={`chip ${difficulties.includes(d) ? 'on' : ''}`}
                    onClick={() => toggleDiff(d)}
                  >
                    L{d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="setup-label">Subject</div>
              <select
                className="select"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setChapter(''); // a chapter from the old subject would empty the pool
                }}
                style={{ minWidth: 160 }}
              >
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="setup-label">Chapter</div>
              <select
                className="select"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">All chapters{chapters.length ? ` (${chapters.length})` : ''}</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="setup-label">Length</div>
              <Segmented
                value={String(size)}
                onChange={(v) => setSize(Number(v))}
                options={[
                  { value: '10', label: '10' },
                  { value: '20', label: '20' },
                  { value: '40', label: '40' },
                  { value: '9999', label: 'All' },
                ]}
                ariaLabel="Length"
              />
            </div>
          </div>

          <div className="row spread wrap" style={{ marginTop: 22, gap: 12 }}>
            <div className="muted" style={{ fontSize: 13.5 }}>
              <strong style={{ color: 'var(--text)' }}>{Math.min(available, size)}</strong> question
              {Math.min(available, size) === 1 ? '' : 's'} in this pool
              {available === 0 && ' — nothing matches, widen the filters.'}
            </div>
            <div className="row" style={{ gap: 10 }}>
              {emqs.length > 0 && (
                <Button onClick={() => setScreen('emq')}>EMQ sets ({emqs.length})</Button>
              )}
              <Button variant="primary" disabled={available === 0} onClick={begin}>
                Start {MODES.find((m) => m.value === mode)!.label}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
