import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/useStore';
import { Card, Button, Badge, ProgressRing } from '../../design/primitives';
import { IconFlag, IconFlashcards, IconCheck, IconChevron } from '../../design/icons';
import {
  getSession,
  saveSession,
  endSession,
  startSession,
  bankById,
  isAnswerCorrect,
  summarise,
  type McqSession,
} from './engine';
import { recordResult, toggleFlag, isFlagged } from './perf';
import { makeUserCard } from '../flashcards/makeCard';
import { useToast } from '../../design/Toast';
import type { Mcq, Option } from '../../content/schema';
import { getChapter } from '../../content/loader';
import { renderInline } from '../../lib/lexicon';
import { globalIndex } from '../../lib/useLexicon';
import { sfx } from '../../lib/sound';
import { hintPrompt, explainPrompt } from '../../lib/ai';
import AiTutor from '../ai/AiTutor';

export default function QuestionRunner({ onExit }: { onExit: () => void }) {
  const state = useStore();
  const toast = useToast();
  const byId = useMemo(() => bankById(), []);
  const [session, setSession] = useState<McqSession | null>(() => getSession());
  const [chosen, setChosen] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(() => Boolean(getSession()?.resultsCommittedAt));
  const [surge, setSurge] = useState<null | 'ok' | 'no'>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [, force] = useState(0);
  const qStart = useRef(Date.now());
  const autoTimer = useRef<number | null>(null);
  const finalizing = useRef(false);
  const immediate = session ? session.mode !== 'exam' : true;

  const mcqCfg = state.settings.mcq as Record<string, unknown>;
  /** answer the moment an option is clicked — no Submit step (single-answer only) */
  const instant = mcqCfg.instantAnswer !== false;
  /** 'correct' advances only when you got it right, so a miss always gets read */
  // Default OFF: answering never auto-jumps to the next question. You stay on the
  // question to read the explanation and move on with Next (or →) when ready.
  const autoMode = (mcqCfg.autoAdvance as 'correct' | 'always' | 'off') ?? 'off';
  const autoMs = (mcqCfg.autoAdvanceMs as number) ?? 1500;

  const q = session ? byId.get(session.ids[session.index]!) : undefined;

  // restore an already-answered question when navigating back
  useEffect(() => {
    const current = getSession();
    if (!current) return;
    const prev = current.answers[current.ids[current.index]!];
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
    cancelAuto();
  }, [session?.id, session?.index, immediate]);

  useEffect(() => () => cancelAuto(), []);

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
    // finish intentionally uses the current render's session; depending on the
    // function itself would recreate this one-second interval on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [q, state.settings.mcq.shuffleOptions]);

  // keyboard-first: 1–6 or A–F pick an option, Enter/→ moves on, F flags
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!session || !q) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const letters = 'abcdef';
      let pick = -1;
      if (/^[1-6]$/.test(k)) pick = Number(k) - 1;
      else if (letters.includes(k) && k !== 'f') pick = letters.indexOf(k);
      if (pick >= 0 && pick < options.length && !submitted) {
        e.preventDefault();
        choose(options[pick]!.id!);
        return;
      }
      if (k === 'f') {
        e.preventDefault();
        toggleFlag(q.id);
        force((n) => n + 1);
        return;
      }
      if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (submitted) go(1);
        else if (chosen.length) submit();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.index, submitted, chosen, options]);

  if (!session || !q) {
    return (
      <Center>
        <p className="muted">No active session.</p>
        <Button onClick={onExit}>Back</Button>
      </Center>
    );
  }

  const isMulti = q.type === 'multi';

  function cancelAuto() {
    if (autoTimer.current) window.clearTimeout(autoTimer.current);
    autoTimer.current = null;
    setAutoRun(false);
  }

  function choose(id: string) {
    if (submitted) return;
    if (isMulti) {
      setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
      return;
    }
    setChosen([id]);
    if (instant) submit([id]);
  }

  function record(next: McqSession) {
    saveSession(next);
    setSession({ ...next });
  }

  function submit(selection?: string[]) {
    const sel = selection ?? chosen;
    if (sel.length === 0) return;
    const ok = isAnswerCorrect(q!, sel);
    const next = { ...session! };
    next.answers[q!.id] = { chosen: sel, correct: ok, confidence, timeMs: Date.now() - qStart.current };
    if (immediate) {
      setSubmitted(true);
      setSurge(ok ? 'ok' : 'no');
      if (ok) sfx.correct();
      else sfx.wrong();
      setTimeout(() => setSurge(null), 620);
      record(next);
      const last = session!.index + 1 >= session!.ids.length;
      if (!last && (autoMode === 'always' || (autoMode === 'correct' && ok))) {
        setAutoRun(true);
        autoTimer.current = window.setTimeout(() => {
          autoTimer.current = null;
          setAutoRun(false);
          go(1);
        }, autoMs);
      }
    } else {
      // exam: store, advance
      record(next);
      go(1);
    }
  }

  function go(delta: number) {
    cancelAuto();
    const ni = session!.index + delta;
    if (ni < 0) return;
    if (ni >= session!.ids.length) return finish();
    record({ ...session!, index: ni });
  }
  function jump(i: number) {
    record({ ...session!, index: i });
  }

  function finish() {
    // `recordResult` is keyed by this session/question pair, so restore, timer
    // and double-click paths cannot duplicate performance history. Persist the
    // completion marker only after the result loop has finished.
    if (!session!.resultsCommittedAt && !finalizing.current) {
      finalizing.current = true;
      for (const qid of Object.keys(session!.answers)) {
        const a = session!.answers[qid]!;
        recordResult(qid, a.correct, a.confidence ?? null, `${session!.id}:${qid}`);
      }
      record({ ...session!, resultsCommittedAt: Date.now() });
    }
    setShowResults(true);
  }

  if (showResults) {
    return (
      <Results
        session={session}
        onExit={() => {
          endSession();
          onExit();
        }}
        onRedo={(ids) => {
          endSession();
          const next = startSession(session!.mode, ids);
          setShowResults(false);
          setChosen([]);
          setSubmitted(false);
          setSession(next);
        }}
      />
    );
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
        <div className="qb-main">
        <Card
          key={q.id}
          className={`qb-question qb-swap${surge ? ` surge-${surge}` : ''}`}
          onPointerDownCapture={() => autoRun && cancelAuto()}
        >
          {autoRun && (
            <div className="auto-bar" aria-hidden="true">
              <div className="auto-bar-fill" style={{ animationDuration: `${autoMs}ms` }} />
            </div>
          )}
          <div className="row spread" style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={q.difficulty === 3 ? 'error' : q.difficulty === 2 ? 'warning' : 'success'}>
                Level {q.difficulty}
              </Badge>
              {isMulti && <Badge tone="info">Select all that apply</Badge>}
            </div>
            <span className="qb-source" title="Where this question comes from">
              {sourceOf(q)}
            </span>
          </div>

          {q.figure && <QFigure fig={q.figure} />}
          <div
            className="qb-stem"
            dangerouslySetInnerHTML={{ __html: renderInline(q.stem, globalIndex()) }}
          />

          <div className="qb-options">
            {options.map((o, i) => {
              const picked = chosen.includes(o.id!);
              let cls = 'qb-option';
              if (submitted) {
                if (o.correct) cls += ' correct';
                else if (picked) cls += ' incorrect';
              } else if (picked) cls += ' picked';
              return (
                <button key={o.id} className={cls} onClick={() => choose(o.id!)} disabled={submitted}>
                  <span className="qb-key" aria-hidden="true">{'ABCDEF'[i]}</span>
                  <span className="qb-mark">{isMulti ? (picked ? '☑' : '☐') : picked ? '●' : '○'}</span>
                  <span
                    className="qb-opt-text"
                    dangerouslySetInnerHTML={{ __html: renderInline(o.text, globalIndex()) }}
                  />
                  {submitted && (o.correct || picked) && o.why && (
                    <span
                      className="qb-why"
                      dangerouslySetInnerHTML={{ __html: renderInline(o.why, globalIndex()) }}
                    />
                  )}
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

          <div className="row spread" style={{ marginTop: 18 }}>
            <Button variant="ghost" size="sm" disabled={session.index === 0} onClick={() => go(-1)}>
              <IconChevron size={15} style={{ transform: 'rotate(180deg)' }} /> Prev
            </Button>
            {!submitted ? (
              instant && !isMulti && immediate ? (
                <span className="qb-hint-keys">Pick an answer — keys 1–{options.length} or A–{'ABCDEF'[options.length - 1]}</span>
              ) : (
                <Button variant="primary" disabled={chosen.length === 0} onClick={() => submit()}>
                  {immediate ? 'Submit' : session.index + 1 === session.ids.length ? 'Finish' : 'Save & next'}
                </Button>
              )
            ) : (
              <Button variant="primary" onClick={() => go(1)}>
                {session.index + 1 === session.ids.length ? 'Finish' : 'Next'} <IconChevron size={15} />
              </Button>
            )}
          </div>
        </Card>

        {/* The box below the answer card: the brief authored rationale (once answered)
            and the AI buttons — hint before, explanation + chat after. Always shown so
            the AI buttons are discoverable. */}
        <div className="answer-box qb-answerbox">
          {submitted && (
              <Explanation
                q={q}
                correct={!!session.answers[q.id]?.correct}
                onMakeCard={() => {
                  makeUserCard({ front: q.stem, back: q.options.filter((o) => o.correct).map((o) => o.text).join('; ') + (q.teachingPoint ? ` — ${q.teachingPoint}` : ''), tags: ['from-qbank'] });
                  toast('Flashcard created', 'success');
                }}
              />
            )}
            <AiTutor
              cacheKey={`explain:${q.id}`}
              explainPrompt={explainPrompt(q).user}
              hintPrompt={hintPrompt(q).user}
              canHint={!submitted}
              canExplain={submitted}
              contextForChat={mcqContext(q, submitted)}
            />
          </div>
        </div>

        <Navigator session={session} onJump={jump} />
      </div>
    </div>
  );
}

/** A plain-text description of the question, so the AI chat has full context. */
function mcqContext(q: Mcq, submitted: boolean): string {
  const opts = q.options.map((o, i) => `${'ABCDEF'[i]}. ${o.text}`).join('\n');
  const correct = submitted
    ? `\nCorrect answer: ${q.options.filter((o) => o.correct).map((o) => o.text).join('; ')}`
    : '';
  return `Question:\n${q.stem}\n\nOptions:\n${opts}${correct}`;
}

/** Subject, chapter and section, so a question is never context-free. */
function sourceOf(q: Mcq & { chapterId?: string; subject?: string }): string {
  const ch = q.chapterId ? getChapter(q.chapterId) : undefined;
  const section = ch?.sections.find((sec) => sec.id === (q.sectionId || q.sectionTag));
  return [ch?.subject ?? q.subject, ch?.title, section?.title].filter(Boolean).join(' › ');
}

/**
 * Trim a list of explanation lines to a word budget, cutting on a word boundary of
 * the line that tips over the limit. Keeps the answer short and scannable; the full
 * depth is one tap away in the AI tutor below.
 */
function capExplanation(lines: string[], limit = 200): { lines: string[]; truncated: boolean } {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (used + words.length <= limit) {
      out.push(line);
      used += words.length;
    } else {
      const room = limit - used;
      if (room >= 8) out.push(words.slice(0, room).join(' ') + '…');
      return { lines: out, truncated: true };
    }
  }
  return { lines: out, truncated: false };
}

function Explanation({ q, correct, onMakeCard }: { q: Mcq; correct: boolean; onMakeCard: () => void }) {
  const capped = capExplanation(q.explanation, 200);
  return (
    <div className={`qb-explain ${correct ? 'ok' : 'no'}`}>
      <div className="qb-verdict">{correct ? 'Correct' : 'Incorrect'}</div>
      {capped.lines.length > 0 && (
        <ol className="qb-explain-list">
          {capped.lines.map((e, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(e, globalIndex()) }} />
          ))}
        </ol>
      )}
      {capped.truncated && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          Trimmed to keep it brief — use <strong>Ask AI</strong> below for the full explanation.
        </div>
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

const DIFF_LABEL: Record<number, string> = { 1: 'Level 1 · recall', 2: 'Level 2 · applied', 3: 'Level 3 · hard' };

function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Results({ session, onExit, onRedo }: { session: McqSession; onExit: () => void; onRedo: (ids: string[]) => void }) {
  const toast = useToast();
  const byId = bankById();
  const sum = summarise(session);
  const grade = sum.accuracy >= 0.8 ? 'strong' : sum.accuracy >= 0.6 ? 'fair' : 'weak';

  return (
    <div className="qb-results">
      <div className={`qb-result-head grade-${grade}`}>
        <ProgressRing value={sum.accuracy} size={140} label={`${Math.round(sum.accuracy * 100)}%`} sublabel="correct" />
        <h2 style={{ marginTop: 16 }}>
          {grade === 'strong' ? 'Strong session' : grade === 'fair' ? 'Session complete' : 'Keep drilling'}
        </h2>
        <p className="muted">
          {sum.correct}/{sum.answered} correct
        </p>
      </div>

      {/* timing + effort at a glance */}
      <div className="qb-metrics">
        <div className="qb-metric">
          <div className="qbm-value">{fmtTime(sum.timeMs)}</div>
          <div className="qbm-label">Total time</div>
        </div>
        <div className="qb-metric">
          <div className="qbm-value">{fmtTime(sum.avgMs)}</div>
          <div className="qbm-label">Avg / question</div>
        </div>
        <div className="qb-metric">
          <div className="qbm-value">{sum.incorrectIds.length}</div>
          <div className="qbm-label">Incorrect</div>
        </div>
        {sum.slowest && (
          <div className="qb-metric">
            <div className="qbm-value">{fmtTime(sum.slowest.ms)}</div>
            <div className="qbm-label">Slowest</div>
          </div>
        )}
      </div>

      {sum.incorrectIds.length > 0 && (
        <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => onRedo(sum.incorrectIds)}>
            Redo {sum.incorrectIds.length} incorrect
          </Button>
          <Button
            onClick={() => {
              sum.incorrectIds.forEach((qid) => {
                const q = byId.get(qid);
                if (q) makeUserCard({ front: q.stem, back: q.options.filter((o) => o.correct).map((o) => o.text).join('; '), tags: ['from-qbank'] });
              });
              toast(`${sum.incorrectIds.length} flashcards created`, 'success');
            }}
          >
            <IconFlashcards size={15} /> Cards from all missed
          </Button>
        </div>
      )}

      {Object.keys(sum.byChapter).length > 0 && (
        <Card style={{ marginTop: 20 }}>
          <div className="card-eyebrow">By chapter</div>
          {Object.entries(sum.byChapter)
            .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
            .map(([id, v]) => (
              <Bar key={id} label={getChapter(id)?.title || id} correct={v.correct} total={v.total} />
            ))}
        </Card>
      )}

      {Object.keys(sum.byDifficulty).length > 1 && (
        <Card style={{ marginTop: 14 }}>
          <div className="card-eyebrow">By difficulty</div>
          {Object.entries(sum.byDifficulty)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([d, v]) => (
              <Bar key={d} label={DIFF_LABEL[Number(d)] || `Level ${d}`} correct={v.correct} total={v.total} />
            ))}
        </Card>
      )}

      {sum.incorrectIds.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <div className="card-eyebrow">Missed ({sum.incorrectIds.length})</div>
          <div className="list" style={{ marginTop: 8 }}>
            {sum.incorrectIds.map((qid) => {
              const q = byId.get(qid);
              if (!q) return null;
              return (
                <div className="list-row" key={qid} style={{ alignItems: 'flex-start' }}>
                  <div className="lr-main">
                    <div className="lr-title" dangerouslySetInnerHTML={{ __html: renderInline(q.stem, globalIndex()) }} />
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
