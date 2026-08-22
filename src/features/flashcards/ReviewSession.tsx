import { useCallback, useEffect, useRef, useState } from 'react';
import { state, commit } from '../../state/store';
import { type Grade, type CardSched } from '../../lib/scheduler';
import { gradeItemLive, undoGrade, gradePreview, itemState, toggleSuspend, cramGrade, type ReviewItem, type GradeUndo } from './deck';
import {
  initLive, placeGraded, promoteDue, nextDueAt, isDueSoon, isComplete, reinsertForUndo,
  aheadCounts, type LiveState,
} from './liveQueue';
import { buryFrom, countSiblings } from './siblings';
import { Button, ProgressRing } from '../../design/primitives';
import { useToast } from '../../design/Toast';
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
  cram = false,
}: {
  queue: ReviewItem[];
  onExit: () => void;
  /** Practice only: nothing is written to the student's schedule. */
  cram?: boolean;
}) {
  const S = state.settings.scheduler;
  // A LIVE queue, not a frozen array walked by an index. A card graded "Again"
  // is rescheduled a minute out and must come back inside this same session;
  // the old forward-only index could never revisit it, so it silently never did.
  const [live, setLive] = useState<LiveState>(() => initLive(queue));
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState(false);
  const undo = useRef<GradeUndo[]>([]);
  const [tally, setTally] = useState({ reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
  const [swipeHint, setSwipeHint] = useState<Grade | null>(null);
  const [impact, setImpact] = useState<{ g: Grade; key: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [mutating, setMutating] = useState(false);
  const [, setTick] = useState(0); // ticks each second only while waiting
  const timerGen = useRef(0); // supersedes a stale next-due timer
  const toast = useToast();

  const item = live.ready[0];
  const done = isComplete(live);
  const dueSoon = isDueSoon(live);

  // what is still ahead in this session, by card state
  const ahead = aheadCounts(live, itemState);
  const cardState = (item ? itemState(item) : undefined) ?? 'new';
  const remaining = live.ready.length + live.waiting.length;
  const progress = tally.reviewed + remaining > 0 ? tally.reviewed / (tally.reviewed + remaining) : 0;

  /** Move any waiting card that has come due back into the ready queue. */
  const revalidate = useCallback(() => {
    setLive((prev) => promoteDue(prev, Date.now()));
  }, []);

  const grade = useCallback(
    async (g: Grade) => {
      const cur = live.ready[0];
      if (!cur || mutating) return;
      setMutating(true);
      try {
        // Persist BEFORE advancing, and learn where the card landed, so a short
        // learning step can be put back into this session rather than lost.
        // Cram writes nothing: no schedule, no daily ledger, no review log.
        const res = cram
          ? { ...cramGrade(g), undo: null }
          : await gradeItemLive(cur, g, S);
        if (res.undo) undo.current.push(res.undo);
        setLive((prev) => {
          const rest = prev.ready.slice(1);
          const waiting = placeGraded(prev.waiting, cur, { due: res.due, state: res.cardState }, Date.now());
          // Bury the siblings — the other regions of this same diagram. Seeing
          // them back to back is answered from the card just seen, not from
          // memory, which teaches the scheduler the wrong thing. Their schedules
          // are untouched; they simply do not come up again this sitting.
          if (!S.burySiblings) return { ready: rest, waiting };
          return {
            ready: buryFrom(rest, cur),
            waiting: waiting.filter((w) => buryFrom([w.item], cur).length > 0),
          };
        });
        setTally((t) => ({ ...t, reviewed: t.reviewed + 1, [g]: t[g] + 1 }));
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
        if (S.burySiblings) {
          const buried = countSiblings(live.ready.slice(1), cur);
          if (buried > 0) {
            toast(
              `${buried} more from this card's diagram held back for the rest of this session — answering them now would just be copying.`
            );
          }
        }
      } catch {
        toast('Could not save this grade. Please try again.', 'error');
      } finally {
        setMutating(false);
      }
    },
    [live, S, mutating, toast, cram]
  );

  const doUndo = useCallback(async () => {
    if (mutating) return;
    const last = undo.current.pop();
    if (!last) return;
    setMutating(true);
    try {
      await undoGrade(last);
      // Back to the front of ready, and out of waiting if a timer had parked it
      // there — or back from an already-complete session.
      setLive((prev) => reinsertForUndo(prev, last.item));
      setRevealed(true);
      setTally((t) => ({
        ...t,
        reviewed: Math.max(0, t.reviewed - 1),
        [last.grade]: Math.max(0, t[last.grade] - 1),
      }));
      setCombo(0); // the streak is no longer something the student earned
    } catch {
      undo.current.push(last);
      toast('Could not undo the grade. Please try again.', 'error');
    } finally {
      setMutating(false);
    }
  }, [mutating, toast]);

  // One timer for the earliest waiting card. It fires once, revalidates, and is
  // superseded whenever the queue changes (generation guard) — no polling loop.
  useEffect(() => {
    // Runs whenever ANYTHING is waiting — not only once the deck has emptied.
    // Gating this on an empty deck meant a card owed in a minute simply sat
    // there while the student worked through the rest, so on a real deck it
    // never came back at all.
    const na = nextDueAt(live.waiting);
    if (na == null) return;
    const gen = ++timerGen.current;
    const to = setTimeout(() => {
      if (gen === timerGen.current) revalidate();
    }, Math.max(0, na - Date.now()) + 50);
    return () => clearTimeout(to);
  }, [live, revalidate]);

  // Keep the countdown honest while waiting.
  useEffect(() => {
    if (!dueSoon) return;
    const iv = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [dueSoon]);

  // Returning to the tab re-checks due times at once, rather than trusting a
  // timer that a backgrounded tab may have throttled.
  useEffect(() => {
    const on = () => revalidate();
    window.addEventListener('focus', on);
    document.addEventListener('visibilitychange', on);
    return () => {
      window.removeEventListener('focus', on);
      document.removeEventListener('visibilitychange', on);
    };
  }, [revalidate]);

  /**
   * Take this card out of rotation. A student meeting a card that is wrong,
   * badly worded or simply not on their exam had no way to stop seeing it.
   * It skips to the next card, because the suspended one is no longer studiable.
   */
  const suspendCurrent = useCallback(async () => {
    if (!item || mutating) return;
    setMutating(true);
    try {
      const nowSuspended = await toggleSuspend(item);
      if (nowSuspended) {
        setLive((prev) => ({ ready: prev.ready.slice(1), waiting: prev.waiting }));
        setRevealed(false);
        toast('Card suspended — it will not come back until you unsuspend it.');
      }
    } catch {
      toast('Could not suspend this card. Please try again.', 'error');
    } finally {
      setMutating(false);
    }
  }, [item, mutating, toast]);

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
        if (gr) void grade(gr.g);
      } else if (e.key.toLowerCase() === 'u') {
        void doUndo();
      } else if (e.key === '!') {
        void suspendCurrent();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFlag();
      } else if (e.key.toLowerCase() === 'h') {
        setHint((h) => !h);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, revealed, grade, doUndo, toggleFlag, suspendCurrent, onExit]);

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
    if (dy < -60 && Math.abs(dy) > Math.abs(dx)) void grade('easy');
    else if (dx > 70) void grade('good');
    else if (dx < -70) void grade('again');
  }

  if (done) {
    const acc = tally.reviewed ? (tally.good + tally.easy) / tally.reviewed : 0;
    return (
      <div className="review-summary">
        <ProgressRing value={acc} size={120} label={`${Math.round(acc * 100)}%`} sublabel="recalled" />
        <h2 style={{ marginTop: 18 }}>{cram ? 'Cram complete' : 'Session complete'}</h2>
        {cram && <p className="muted">Your schedule is exactly as you left it.</p>}
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

  // Nothing ready, but a card graded "Again" is due back within this session.
  // Hold on a live countdown rather than ending — this is the whole point of the
  // live queue: the one-minute card comes back on its own.
  if (dueSoon) {
    const na = nextDueAt(live.waiting);
    const secs = na != null ? Math.max(0, Math.ceil((na - Date.now()) / 1000)) : 0;
    return (
      <div className="review-duesoon">
        <div className="review-duesoon-ring">
          <ProgressRing
            value={secs > 0 ? 1 - Math.min(1, secs / 60) : 1}
            size={112}
            label={secs > 0 ? `${secs}s` : 'now'}
            sublabel="next card"
          />
        </div>
        <h2 style={{ marginTop: 18 }}>Nice — quick breather</h2>
        <p className="muted">
          {live.waiting.length} card{live.waiting.length === 1 ? '' : 's'} you just learned
          {live.waiting.length === 1 ? ' comes' : ' come'} back in a moment.
        </p>
        <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={revalidate}>
            <IconCheck size={16} /> Check now
          </Button>
          <Button variant="ghost" onClick={onExit}>
            End session
          </Button>
        </div>
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
      {cram && (
        <div className="cram-banner" role="status">
          <strong>Cram</strong> — practice only. Nothing you answer here changes your real schedule.
        </div>
      )}
      <div className="review-top">
        <div className="row" style={{ gap: 6 }}>
          <Button variant="ghost" size="sm" onClick={onExit} disabled={mutating}>
            <IconChevron size={15} style={{ transform: 'rotate(180deg)' }} /> Decks
          </Button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => void doUndo()}
            disabled={cram || undo.current.length === 0 || mutating}
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
          {remaining} left
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
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => void suspendCurrent()}
            disabled={mutating}
            title="Stop showing this card until you bring it back (!)"
          >
            Suspend
          </button>
        </div>
      </div>
      <div className="review-bar">
        <div className="review-bar-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div
        key={item!.key}
        className={`flashcard${revealed ? ' is-open' : ''}${
          cardState === 'relearning' || (item!.sched?.lapses ?? 0) >= 2 ? ' is-difficult' : ''
        }`}
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
            <button
              key={gr.g}
              className="grade-btn"
              style={{ ['--gt' as string]: gr.tone }}
              onClick={() => void grade(gr.g)}
              disabled={mutating}
            >
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
