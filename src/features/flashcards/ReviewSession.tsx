import { useCallback, useEffect, useRef, useState } from 'react';
import { state, commit } from '../../state/store';
import { scheduleCard, gradeLabel, type Grade, type CardSched } from '../../lib/scheduler';
import { persistGrade, restoreSched, itemSched, type ReviewItem } from './deck';
import { Button, ProgressRing } from '../../design/primitives';
import { IconFlag, IconCheck } from '../../design/icons';
import { renderMarkdown } from '../../lib/markdown';
import { OcclusionView } from './Occlusion';

const GRADES: Array<{ g: Grade; label: string; key: string; tone: string }> = [
  { g: 'again', label: 'Again', key: '1', tone: 'var(--grade-again)' },
  { g: 'hard', label: 'Hard', key: '2', tone: 'var(--grade-hard)' },
  { g: 'good', label: 'Good', key: '3', tone: 'var(--grade-good)' },
  { g: 'easy', label: 'Easy', key: '4', tone: 'var(--grade-easy)' },
];

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
  const undo = useRef<Array<{ item: ReviewItem; prev: CardSched | undefined; idx: number }>>([]);
  const [tally, setTally] = useState({ reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
  const [swipeHint, setSwipeHint] = useState<Grade | null>(null);

  const done = idx >= queue.length;
  const item = queue[idx];

  const grade = useCallback(
    (g: Grade) => {
      if (!item) return;
      const prev = state.study.cardSched[item.key] as CardSched | undefined;
      const cur = itemSched(item);
      const next = scheduleCard(S, cur, g);
      persistGrade(item, next);
      undo.current.push({ item, prev, idx });
      setTally((t) => ({ ...t, reviewed: t.reviewed + 1, [g]: (t as any)[g] + 1 }));
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
    restoreSched(last.item, last.prev);
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

  return (
    <div className="review-wrap">
      <div className="review-top">
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit
        </Button>
        <div className="review-progress">
          {idx + 1} / {queue.length}
        </div>
        <button
          className={`btn btn--ghost btn--icon ${flagged ? 'flagged' : ''}`}
          aria-label="Flag card"
          onClick={toggleFlag}
          style={{ color: flagged ? 'var(--warning)' : undefined }}
        >
          <IconFlag size={17} />
        </button>
      </div>
      <div className="review-bar">
        <div className="review-bar-fill" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      <div
        className="flashcard"
        onClick={() => !revealed && setRevealed(true)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {swipeHint && <div className={`swipe-hint swipe-${swipeHint}`}>{swipeHint}</div>}

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
              <span className="grade-interval">{gradeLabel(S, itemSched(item!), gr.g)}</span>
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
    return <div className="fc-text md" dangerouslySetInnerHTML={{ __html: renderMarkdown(clozeFront(card.cloze)).replace(/\[…\]/g, '') }} />;
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
      <div className="fc-text">{q}</div>
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

function CardBack({ card, typed }: { card: ReviewItem['card']; typed: string }) {
  if (card.type === 'cloze' && card.cloze) {
    return <div className="fc-back md" dangerouslySetInnerHTML={{ __html: renderMarkdown(clozeBack(card.cloze)) }} />;
  }
  if (card.type === 'occlusion') {
    return <div className="fc-back"><strong>{card.back || 'Region'}</strong>{card.extra ? ` — ${card.extra}` : ''}</div>;
  }
  const a = card.type === 'reversed' ? card.front : card.back;
  const correct = card.type === 'type' && typed.trim().toLowerCase() === (a || '').trim().toLowerCase();
  return (
    <div className="fc-back">
      {card.type === 'type' && typed && (
        <div className={`type-verdict ${correct ? 'ok' : 'no'}`}>
          {correct ? 'Correct' : `You typed: ${typed}`}
        </div>
      )}
      <div className="fc-text">{a}</div>
      {card.extra && <div className="fc-extra">{card.extra}</div>}
    </div>
  );
}
