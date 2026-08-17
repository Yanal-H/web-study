import { useCallback, useEffect, useRef, useState } from 'react';
import { state, commit } from '../../state/store';
import { type Grade, type CardSched } from '../../lib/scheduler';
import { gradeItem, undoGrade, gradePreview, type ReviewItem, type GradeUndo } from './deck';
import { Button, ProgressRing } from '../../design/primitives';
import { IconFlag, IconCheck, IconChevron } from '../../design/icons';
import { chapterImage } from '../../content/loader';
import { renderRich, renderInline } from '../../lib/lexicon';
import { globalIndex } from '../../lib/useLexicon';
import { sfx } from '../../lib/sound';
import { hintCardPrompt, explainCardPrompt } from '../../lib/ai';
import AiTutor from '../ai/AiTutor';
import ListenButton from '../tts/ListenButton';
import { OcclusionView, MaskedFigure } from './Occlusion';

const GRADES: Array<{ g: Grade; label: string; key: string; tone: string; hint: string }> = [
  { g: 'again', label: 'Again', key: '1', tone: 'var(--grade-again)', hint: 'forgot it' },
  { g: 'hard', label: 'Hard', key: '2', tone: 'var(--grade-hard)', hint: 'a struggle' },
  { g: 'good', label: 'Good', key: '3', tone: 'var(--grade-good)', hint: 'recalled it' },
  { g: 'easy', label: 'Easy', key: '4', tone: 'var(--grade-easy)', hint: 'instant' },
];

const STATE_LABEL: Record<string, string> = {
  new: 'New card',
  learning: 'Learning',
  relearning: 'Relearning',
  review: 'Review',
};

/** Stability, in words a student reads at a glance. */
function fmtDays(d: number): string {
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
  if (d < 30) return `${Math.round(d)} d`;
  if (d < 365) return `${(d / 30.44).toFixed(1)} mo`;
  return `${(d / 365.25).toFixed(1)} y`;
}

function clozeFront(s: string): string {
  return s.replace(/\{\{c\d+::([^}]*?)(?:::([^}]*?))?\}\}/g, (_m, _ans, hint) => {
    return `<span class="cloze-blank">[${hint ? hint : '…'}]</span>`;
  });
}
function clozeBack(s: string): string {
  return s.replace(/\{\{c\d+::([^}]*?)(?:::[^}]*?)?\}\}/g, (_m, ans) => `<span class="cloze">${ans}</span>`);
}

export default function ReviewSession({
  queue,
  onExit,
}: {
  queue: ReviewItem[];
  onExit: () => void;
}) {
  const S = state.settings.scheduler;
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState(false);
  const undo = useRef<GradeUndo[]>([]);
  const [tally, setTally] = useState({ reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
  const [swipeHint, setSwipeHint] = useState<Grade | null>(null);
  const [impact, setImpact] = useState<{ g: Grade; key: number } | null>(null);
  const [combo, setCombo] = useState(0);

  const done = idx >= queue.length;
  const item = queue[idx];

  // what is still ahead in this session, by card state
  const ahead = queue.slice(idx).reduce(
    (a, it) => {
      const st = it.sched?.state ?? (state.study.cardSched[it.key] as CardSched | undefined)?.state;
      if (!st || st === 'new') a.neu++;
      else if (st === 'learning' || st === 'relearning') a.learn++;
      else a.due++;
      return a;
    },
    { neu: 0, learn: 0, due: 0 }
  );
  const cardState = item?.sched?.state ?? (state.study.cardSched[item?.key ?? ''] as CardSched | undefined)?.state ?? 'new';

  const grade = useCallback(
    (g: Grade) => {
      if (!item) return;
      undo.current.push(gradeItem(item, g, S, idx));
      setTally((t) => ({ ...t, reviewed: t.reviewed + 1, [g]: (t as any)[g] + 1 }));
      setImpact({ g, key: Date.now() });
    sfx.grade(g);
      setCombo((c) => {
      const n = g === 'good' || g === 'easy' ? c + 1 : 0;
      if (n >= 3) sfx.combo(n);
      return n;
    });
      setRevealed(false);
      setTyped('');
      setHint(false);
      setIdx((i) => i + 1);
    },
    [item, idx, S]
  );

  const doUndo = useCallback(() => {
    const last = undo.current.pop();
    if (!last) return;
    undoGrade(last);
    setIdx(last.idx);
    setRevealed(true);
    setTally((t) => ({ ...t, reviewed: Math.max(0, t.reviewed - 1) }));
  }, []);

  const toggleFlag = useCallback(() => {
    if (!item) return;
    const s = (state.study.cardSched[item.key] as CardSched) || {};
    s.flagged = !s.flagged;
    state.study.cardSched[item.key] = s;
    commit();
    setTally((t) => ({ ...t })); // force re-render
  }, [item]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) {
        if (e.key === 'Enter') onExit();
        return;
      }
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(t.tagName) && e.key !== 'Enter') return;
      if (e.key === ' ') {
        e.preventDefault();
        setRevealed(true);
      } else if (e.key === 'Enter' && !revealed) {
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        const gr = GRADES.find((x) => x.key === e.key);
        if (gr) grade(gr.g);
      } else if (e.key.toLowerCase() === 'u') {
        doUndo();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFlag();
      } else if (e.key.toLowerCase() === 'h') {
        setHint((h) => !h);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, revealed, grade, doUndo, toggleFlag, onExit]);

  // touch swipe
  const touch = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!touch.current || !revealed) return;
    const dx = e.touches[0]!.clientX - touch.current.x;
    const dy = e.touches[0]!.clientY - touch.current.y;
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return setSwipeHint(null);
    if (dy < -50 && Math.abs(dy) > Math.abs(dx)) setSwipeHint('easy');
    else if (dx > 50) setSwipeHint('good');
    else if (dx < -50) setSwipeHint('again');
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return;
    const dx = e.changedTouches[0]!.clientX - touch.current.x;
    const dy = e.changedTouches[0]!.clientY - touch.current.y;
    touch.current = null;
    setSwipeHint(null);
    if (!revealed) {
      if (Math.abs(dx) > 60 || Math.abs(dy) > 60) setRevealed(true);
      return;
    }
    if (dy < -60 && Math.abs(dy) > Math.abs(dx)) grade('easy');
    else if (dx > 70) grade('good');
    else if (dx < -70) grade('again');
  }

  if (done) {
    const acc = tally.reviewed ? (tally.good + tally.easy) / tally.reviewed : 0;
    return (
      <div className="review-summary">
        <ProgressRing value={acc} size={120} label={`${Math.round(acc * 100)}%`} sublabel="recalled" />
        <h2 style={{ marginTop: 18 }}>Session complete</h2>
        <p className="muted">
          {tally.reviewed} card{tally.reviewed === 1 ? '' : 's'} reviewed
        </p>
        <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span className="badge badge--error">{tally.again} again</span>
          <span className="badge badge--warning">{tally.hard} hard</span>
          <span className="badge badge--success">{tally.good} good</span>
          <span className="badge badge--info">{tally.easy} easy</span>
        </div>
        <Button variant="primary" style={{ marginTop: 22 }} onClick={onExit}>
          <IconCheck size={17} /> Done
        </Button>
      </div>
    );
  }

  const c = item!.card;
  const flagged = !!(state.study.cardSched[item!.key] as CardSched | undefined)?.flagged;
  // text to read aloud: the prompt before you flip, the answer after
  const frontText = c.type === 'cloze' ? '' : c.type === 'reversed' ? c.back || '' : c.front || '';
  const backText = c.type === 'cloze' ? c.cloze || '' : c.type === 'reversed' ? c.front || '' : c.back || '';
  const ttsText = (revealed ? backText : frontText) + (revealed && c.extra ? `. ${c.extra}` : '');

  return (
    <div className="review-wrap">
      {impact && <div key={impact.key} className={`impact-flash impact-${impact.g}`} aria-hidden="true" />}
      <div className="review-top">
        <div className="row" style={{ gap: 6 }}>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <IconChevron size={15} style={{ transform: 'rotate(180deg)' }} /> Decks
          </Button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={doUndo}
            disabled={undo.current.length === 0}
            aria-label="Previous card"
            title="Back to the previous card (u)"
          >
            Back
          </button>
        </div>
        <div className="review-progress">
          {combo >= 2 && <span className="combo-chip">⚡ {combo} streak</span>}
          <span className="rc-counts" title="Still to come: new · learning · due">
            <span className="rc-new">{ahead.neu}</span>
            <span className="rc-learn">{ahead.learn}</span>
            <span className="rc-due">{ahead.due}</span>
          </span>
          {idx + 1} / {queue.length}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {!revealed && (
            <button className="btn btn--ghost btn--sm" onClick={() => setRevealed(true)} title="Show answer (space)">
              Flip
            </button>
          )}
          {ttsText.trim() && <ListenButton text={ttsText} />}
          <button
            className={`btn btn--ghost btn--icon ${flagged ? 'flagged' : ''}`}
            aria-label="Flag card"
            onClick={toggleFlag}
            style={{ color: flagged ? 'var(--warning)' : undefined }}
          >
            <IconFlag size={17} />
          </button>
        </div>
      </div>
      <div className="review-bar">
        <div className="review-bar-fill" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      <div
        key={item!.key}
        className={`flashcard${revealed ? ' is-open' : ''}`}
        onClick={() => !revealed && setRevealed(true)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {swipeHint && <div className={`swipe-hint swipe-${swipeHint}`}>{swipeHint}</div>}

        <div className="fc-state">
          <span className={`fc-chip st-${cardState}`}>{STATE_LABEL[cardState] || cardState}</span>
          {item!.sched && item!.sched.reps > 0 && (
            <span className="fc-chip">
              seen {item!.sched.reps}×{item!.sched.lapses ? ` · ${item!.sched.lapses} lapse${item!.sched.lapses === 1 ? '' : 's'}` : ''}
            </span>
          )}
          {item!.sched && item!.sched.S > 0 && (
            <span className="fc-chip" title="How long this card is expected to stay learned">
              memory {fmtDays(item!.sched.S)}
            </span>
          )}
        </div>
        <div className="fc-deck" title={item!.deck}>
          {item!.deck.split('::').map((part, i, arr) => (
            <span key={i} className={i === arr.length - 1 ? 'fc-deck-leaf' : undefined}>
              {part}
              {i < arr.length - 1 && <span className="fc-deck-sep">›</span>}
            </span>
          ))}
        </div>

        <div className="flashcard-face">
          <CardFront card={c} revealed={revealed} typed={typed} setTyped={setTyped} hint={hint} />
          {revealed && (
            <>
              <hr />
              <CardBack card={c} typed={typed} />
            </>
          )}
        </div>

        {!revealed && c.hint && (
          <button className="btn btn--ghost btn--sm hint-btn" onClick={(e) => { e.stopPropagation(); setHint((h) => !h); }}>
            {hint ? 'Hide hint' : 'Hint (h)'}
          </button>
        )}
      </div>

      {/* The box below the card: a brief authored answer note (once revealed) and the
          AI buttons — hint before you flip, full explanation after, chat any time.
          AiTutor renders only when the tutor is switched on with a key. */}
      <div className="answer-box">
        {revealed && c.extra && c.type !== 'cloze' && (
          <div className="answer-note md" dangerouslySetInnerHTML={{ __html: renderInline(c.extra, globalIndex()) }} />
        )}
        <AiTutor
          cacheKey={`cardexplain:${item!.key}`}
          hintPrompt={hintCardPrompt(c).user}
          explainPrompt={explainCardPrompt(c).user}
          canHint
          canExplain={revealed}
          contextForChat={
            revealed
              ? c.cloze
                ? `Flashcard (cloze): ${c.cloze}`
                : `Flashcard — Front: ${c.front ?? ''}\nBack (answer): ${c.back ?? ''}`
              : c.cloze
                ? 'Flashcard cloze card (answer hidden — do not reveal it)'
                : `Flashcard front (answer hidden — do not reveal it): ${c.front ?? ''}`
          }
        />
      </div>

      {!revealed ? (
        <div className="review-actions">
          <Button variant="primary" block onClick={() => setRevealed(true)}>
            Show answer <span className="kbd-inline">space</span>
          </Button>
        </div>
      ) : (
        <div className="grade-row">
          {GRADES.map((gr) => (
            <button key={gr.g} className="grade-btn" style={{ ['--gt' as string]: gr.tone }} onClick={() => grade(gr.g)}>
              <span className="grade-label">{gr.label}</span>
              <span className="grade-interval">{gradePreview(item!, S, gr.g)}</span>
              <span className="grade-sub">{gr.hint}</span>
              <span className="grade-key">{gr.key}</span>
            </button>
          ))}
        </div>
      )}

      <div className="review-hints">
        <span><span className="kbd">space</span> flip</span>
        <span><span className="kbd">1–4</span> grade</span>
        <span><span className="kbd">u</span> undo</span>
        <span><span className="kbd">f</span> flag</span>
      </div>
    </div>
  );
}

function CardFront({
  card,
  revealed,
  typed,
  setTyped,
  hint,
}: {
  card: ReviewItem['card'];
  revealed: boolean;
  typed: string;
  setTyped: (v: string) => void;
  hint: boolean;
}) {
  if (card.type === 'cloze' && card.cloze) {
    return <div className="fc-text md" dangerouslySetInnerHTML={{ __html: renderRich(clozeFront(card.cloze), globalIndex()).replace(/\[…\]/g, '') }} />;
  }
  if (card.type === 'occlusion' && card.masks?.length) {
    const src = card.image?.src || resolveImage(card);
    if (src)
      return (
        <MaskedFigure
          src={src}
          masks={card.masks}
          target={card.target}
          mode={card.occMode}
          revealed={revealed}
          label={card.label}
        />
      );
  }
  if (card.type === 'occlusion' && card.image?.src && card.regions) {
    return <OcclusionView src={card.image.src} regions={card.regions} testIndex={card.regionIndex ?? 0} revealed={revealed} />;
  }
  if (card.type === 'image' && card.image?.src) {
    return (
      <div>
        <img className="fc-image" src={card.image.src} alt={card.image.alt || ''} />
        {card.front && <div className="fc-text" style={{ marginTop: 10 }}>{card.front}</div>}
      </div>
    );
  }
  const q = card.type === 'reversed' ? card.back : card.front;
  return (
    <div>
      <div className="fc-text" dangerouslySetInnerHTML={{ __html: renderInline(q || '', globalIndex()) }} />
      {hint && card.hint && <div className="fc-hint">{card.hint}</div>}
      {card.type === 'type' && !revealed && (
        <input
          className="input"
          style={{ marginTop: 14 }}
          placeholder="Type your answer…"
          value={typed}
          autoFocus
          onChange={(e) => setTyped(e.target.value)}
        />
      )}
    </div>
  );
}

/** Occlusion cards name a diagram in their chapter's images map. */
function resolveImage(card: ReviewItem['card']): string | undefined {
  if (!card.image?.imageId || !card.chapterId) return undefined;
  return chapterImage(card.chapterId, card.image.imageId)?.src;
}

function CardBack({ card, typed }: { card: ReviewItem['card']; typed: string }) {
  if (card.type === 'cloze' && card.cloze) {
    return <div className="fc-back md" dangerouslySetInnerHTML={{ __html: renderRich(clozeBack(card.cloze), globalIndex()) }} />;
  }
  if (card.type === 'occlusion') {
    const answer = card.masks?.find((m) => m.id === card.target)?.label;
    return (
      <div className="fc-back">
        <strong>{answer || card.back || 'Region'}</strong>
        {card.extra ? ` — ${card.extra}` : ''}
      </div>
    );
  }
  const a = card.type === 'reversed' ? card.front : card.back;
  const correct = card.type === 'type' && typed.trim().toLowerCase() === (a || '').trim().toLowerCase();
  // The card face stays brief — just the answer. Any authored detail (extra) is
  // shown in the box below, next to the AI buttons.
  return (
    <div className="fc-back">
      {card.type === 'type' && typed && (
        <div className={`type-verdict ${correct ? 'ok' : 'no'}`}>
          {correct ? 'Correct' : `You typed: ${typed}`}
        </div>
      )}
      <div className="fc-text" dangerouslySetInnerHTML={{ __html: renderInline(a || '', globalIndex()) }} />
    </div>
  );
}
