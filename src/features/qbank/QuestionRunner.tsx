import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/useStore';
import { Card, Button, Badge, ProgressRing } from '../../design/primitives';
import { IconFlag, IconFlashcards, IconCheck, IconChevron } from '../../design/icons';
import {
  getSession,
  saveSession,
  endSession,
  bankById,
  isAnswerCorrect,
  summarise,
  type McqSession,
} from './engine';
import { recordResult, toggleFlag, isFlagged } from './perf';
import { makeUserCard } from '../flashcards/makeCard';
import { useToast } from '../../design/Toast';
import type { Mcq, Option } from '../../content/schema';

export default function QuestionRunner({ onExit }: { onExit: () => void }) {
  const state = useStore();
  const toast = useToast();
  const byId = useMemo(() => bankById(), []);
  const [session, setSession] = useState<McqSession | null>(() => getSession());
  const [chosen, setChosen] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [, force] = useState(0);
  const qStart = useRef(Date.now());
  const immediate = session ? session.mode !== 'exam' : true;

  const q = session ? byId.get(session.ids[session.index]!) : undefined;

  // restore an already-answered question when navigating back
  useEffect(() => {
    if (!session) return;
    const prev = session.answers[session.ids[session.index]!];
    if (prev) {
      setChosen(prev.chosen);
      setSubmitted(immediate); // show feedback for answered in immediate modes
      setConfidence(prev.confidence ?? null);
    } else {
      setChosen([]);
      setSubmitted(false);
      setConfidence(null);
    }
    qStart.current = Date.now();
  }, [session?.index]);

  // whole-set timer (exam)
  useEffect(() => {
    if (!session?.timedEndsAt) return;
    const t = setInterval(() => {
      if (Date.now() >= session.timedEndsAt!) {
        clearInterval(t);
        finish();
      } else force((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [session?.timedEndsAt]);

  const options: Option[] = useMemo(() => {
    if (!q) return [];
    const opts = q.options.map((o, i) => ({ ...o, id: o.id || 'abcdefgh'[i]! }));
    if (state.settings.mcq.shuffleOptions) {
      const arr = opts.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
      return arr;
    }
    return opts;
  }, [q?.id, state.settings.mcq.shuffleOptions]);

  if (!session || !q) {
    return (
      <Center>
        <p className="muted">No active session.</p>
        <Button onClick={onExit}>Back</Button>
      </Center>
    );
  }

  const isMulti = q.type === 'multi';

  function choose(id: string) {
    if (submitted) return;
    if (isMulti) setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    else setChosen([id]);
  }

  function record(next: McqSession) {
    saveSession(next);
    setSession({ ...next });
  }

  function submit() {
    if (chosen.length === 0) return;
    const ok = isAnswerCorrect(q!, chosen);
    const next = { ...session! };
    next.answers[q!.id] = { chosen, correct: ok, confidence, timeMs: Date.now() - qStart.current };
    if (immediate) {
      setSubmitted(true);
      record(next);
    } else {
      // exam: store, advance
      record(next);
      go(1);
    }
  }

  function go(delta: number) {
    const ni = session!.index + delta;
    if (ni < 0) return;
    if (ni >= session!.ids.length) return finish();
    record({ ...session!, index: ni });
  }
  function jump(i: number) {
    record({ ...session!, index: i });
  }

  function finish() {
    // commit perf for every answered question (once), then show results
    for (const qid of Object.keys(session!.answers)) {
      const a = session!.answers[qid]!;
      recordResult(qid, a.correct, a.confidence ?? null);
    }
    setShowResults(true);
  }

  if (showResults) {
    return <Results session={session} onExit={() => { endSession(); onExit(); }} />;
  }

  const flagged = isFlagged(q.id);
  const answered = Object.keys(session.answers).length;
  const timeLeft = session.timedEndsAt ? Math.max(0, Math.round((session.timedEndsAt - Date.now()) / 1000)) : null;

  return (
    <div className="qb-run">
      <div className="review-top">
        <Button variant="ghost" size="sm" onClick={onExit}>Exit</Button>
        <div className="review-progress">
          {session.index + 1} / {session.ids.length}
          {timeLeft != null && (
            <span className={`qb-timer ${timeLeft < 60 ? 'low' : ''}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        <button className={`btn btn--ghost btn--icon ${flagged ? 'flagged' : ''}`} aria-label="Flag" onClick={() => { toggleFlag(q.id); force((n) => n + 1); }} style={{ color: flagged ? 'var(--warning)' : undefined }}>
          <IconFlag size={17} />
        </button>
      </div>
      <div className="review-bar">
        <div className="review-bar-fill" style={{ width: `${(answered / session.ids.length) * 100}%` }} />
      </div>

      <div className="qb-layout">
        <Card className="qb-question">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <Badge tone={q.difficulty === 3 ? 'error' : q.difficulty === 2 ? 'warning' : 'success'}>
              Level {q.difficulty}
            </Badge>
            {isMulti && <Badge tone="info">Select all that apply</Badge>}
          </div>

          {q.figure && <QFigure fig={q.figure} />}
          <div className="qb-stem">{q.stem}</div>

          <div className="qb-options">
            {options.map((o) => {
              const picked = chosen.includes(o.id!);
              let cls = 'qb-option';
              if (submitted) {
                if (o.correct) cls += ' correct';
                else if (picked) cls += ' incorrect';
              } else if (picked) cls += ' picked';
              return (
                <button key={o.id} className={cls} onClick={() => choose(o.id!)} disabled={submitted}>
                  <span className="qb-mark">{isMulti ? (picked ? '☑' : '☐') : picked ? '●' : '○'}</span>
                  <span className="qb-opt-text">{o.text}</span>
                  {submitted && (o.correct || picked) && o.why && <span className="qb-why">{o.why}</span>}
                </button>
              );
            })}
          </div>

          {!submitted && immediate && state.settings.mcq.confidenceTracking && (
            <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13 }}>Confidence:</span>
              {[1, 2, 3].map((c) => (
                <button key={c} className={`chip ${confidence === c ? 'on' : ''}`} onClick={() => setConfidence(c)}>
                  {['Low', 'Med', 'High'][c - 1]}
                </button>
              ))}
            </div>
          )}

          {submitted && <Explanation q={q} correct={!!session.answers[q.id]?.correct} onMakeCard={() => {
            makeUserCard({ front: q.stem, back: q.options.filter((o) => o.correct).map((o) => o.text).join('; ') + (q.teachingPoint ? ` — ${q.teachingPoint}` : ''), tags: ['from-qbank'] });
            toast('Flashcard created', 'success');
          }} />}

          <div className="row spread" style={{ marginTop: 18 }}>
            <Button variant="ghost" size="sm" disabled={session.index === 0} onClick={() => go(-1)}>
              <IconChevron size={15} style={{ transform: 'rotate(180deg)' }} /> Prev
            </Button>
            {!submitted ? (
              <Button variant="primary" disabled={chosen.length === 0} onClick={submit}>
                {immediate ? 'Submit' : session.index + 1 === session.ids.length ? 'Finish' : 'Save & next'}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => go(1)}>
                {session.index + 1 === session.ids.length ? 'Finish' : 'Next'} <IconChevron size={15} />
              </Button>
            )}
          </div>
        </Card>

        <Navigator session={session} onJump={jump} />
      </div>
    </div>
  );
}

function Explanation({ q, correct, onMakeCard }: { q: Mcq; correct: boolean; onMakeCard: () => void }) {
  return (
    <div className={`qb-explain ${correct ? 'ok' : 'no'}`}>
      <div className="qb-verdict">{correct ? 'Correct' : 'Incorrect'}</div>
      {q.explanation.length > 0 && (
        <ol className="qb-explain-list">
          {q.explanation.map((e, i) => <li key={i}>{e}</li>)}
        </ol>
      )}
      {q.keyFacts.length > 0 && (
        <div className="qb-keyfacts">
          {q.keyFacts.map((k, i) => <Badge key={i} tone="accent">{k}</Badge>)}
        </div>
      )}
      {q.teachingPoint && <div className="qb-teaching"><strong>Teaching point.</strong> {q.teachingPoint}</div>}
      {!correct && (
        <Button size="sm" style={{ marginTop: 12 }} onClick={onMakeCard}>
          <IconFlashcards size={15} /> Make a flashcard from this
        </Button>
      )}
    </div>
  );
}

function Navigator({ session, onJump }: { session: McqSession; onJump: (i: number) => void }) {
  return (
    <Card className="qb-nav" padSm>
      <div className="card-eyebrow" style={{ marginBottom: 8 }}>Navigator</div>
      <div className="qb-nav-grid">
        {session.ids.map((qid, i) => {
          const a = session.answers[qid];
          let cls = 'qb-nav-cell';
          if (i === session.index) cls += ' current';
          if (a) cls += a.correct ? ' correct' : ' incorrect';
          return (
            <button key={qid} className={cls} onClick={() => onJump(i)} aria-label={`Question ${i + 1}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Results({ session, onExit }: { session: McqSession; onExit: () => void }) {
  const toast = useToast();
  const byId = bankById();
  const sum = summarise(session);
  const missed = Object.keys(session.answers).filter((qid) => !session.answers[qid]!.correct);
  return (
    <div className="qb-results">
      <div style={{ textAlign: 'center' }}>
        <ProgressRing value={sum.accuracy} size={130} label={`${Math.round(sum.accuracy * 100)}%`} sublabel="correct" />
        <h2 style={{ marginTop: 16 }}>Session complete</h2>
        <p className="muted">
          {sum.correct}/{sum.answered} correct · {Math.round(sum.timeMs / 1000)}s total
        </p>
      </div>

      {Object.keys(sum.bySubject).length > 0 && (
        <Card style={{ marginTop: 20 }}>
          <div className="card-eyebrow">By subject</div>
          {Object.entries(sum.bySubject).map(([s, v]) => (
            <Bar key={s} label={s} correct={v.correct} total={v.total} />
          ))}
        </Card>
      )}
      {Object.keys(sum.byTag).length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <div className="card-eyebrow">By topic</div>
          {Object.entries(sum.byTag).sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total).slice(0, 8).map(([t, v]) => (
            <Bar key={t} label={t} correct={v.correct} total={v.total} />
          ))}
        </Card>
      )}

      {missed.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <div className="card-eyebrow">Missed ({missed.length})</div>
          <div className="list" style={{ marginTop: 8 }}>
            {missed.map((qid) => {
              const q = byId.get(qid);
              if (!q) return null;
              return (
                <div className="list-row" key={qid} style={{ alignItems: 'flex-start' }}>
                  <div className="lr-main">
                    <div className="lr-title">{q.stem}</div>
                    <div className="lr-sub" style={{ color: 'var(--success)' }}>
                      {q.options.filter((o) => o.correct).map((o) => o.text).join('; ')}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => {
                    makeUserCard({ front: q.stem, back: q.options.filter((o) => o.correct).map((o) => o.text).join('; '), tags: ['from-qbank'] });
                    toast('Flashcard created', 'success');
                  }}>
                    <IconFlashcards size={15} /> Card
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}>
        <Button variant="primary" onClick={onExit}>
          <IconCheck size={17} /> Done
        </Button>
      </div>
    </div>
  );
}

function Bar({ label, correct, total }: { label: string; correct: number; total: number }) {
  const pct = total ? (correct / total) * 100 : 0;
  return (
    <div style={{ margin: '8px 0' }}>
      <div className="row spread" style={{ fontSize: 13, marginBottom: 3 }}>
        <span>{label}</span>
        <span className="muted">{correct}/{total}</span>
      </div>
      <div className="qb-bar-track">
        <div className="qb-bar-fill" style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--error)' }} />
      </div>
    </div>
  );
}

function QFigure({ fig }: { fig: NonNullable<Mcq['figure']> }) {
  return (
    <figure className="reader-figure" style={{ marginTop: 0 }}>
      {fig.kind === 'image' && fig.src ? (
        <img src={fig.src} alt={fig.alt} loading="lazy" />
      ) : (
        <div className="described-figure" role="img" aria-label={fig.alt}>{fig.described}</div>
      )}
      {fig.caption && <figcaption>{fig.caption}</figcaption>}
    </figure>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ textAlign: 'center', padding: 'var(--sp-7)' }}>{children}</div>;
}
