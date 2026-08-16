import { useCallback, useEffect, useRef, useState } from 'react';
import { update } from '../../state/store';
import { useStore } from '../../state/useStore';
import { IconTimer, IconPlay, IconPause, IconStop, IconClose } from '../../design/icons';
import { chime } from '../../lib/sound';
import { useToast } from '../../design/Toast';

/**
 * Focus timer that belongs to the whole app, not to one page. It lives in the
 * shell, so switching pages never interrupts it, and it keeps time from wall-clock
 * timestamps rather than counting ticks — a backgrounded tab that throttles
 * timers still comes back with the right number on the clock.
 */

const PRESETS = [
  { min: 25, label: '25' },
  { min: 50, label: '50' },
  { min: 15, label: '15' },
  { min: 5, label: '5' },
];

export default function FocusTimer() {
  const state = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(25);
  /** wall-clock time the current run should end */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  /** milliseconds banked from previous runs of this session */
  const [remaining, setRemaining] = useState(25 * 60_000);
  const [running, setRunning] = useState(false);
  const startedAt = useRef<number | null>(null);
  const titleRef = useRef<string>('');

  const left = running && endsAt ? Math.max(0, endsAt - Date.now()) : remaining;

  const finish = useCallback(
    (completed: boolean) => {
      const started = startedAt.current;
      startedAt.current = null;
      setRunning(false);
      setEndsAt(null);
      setRemaining(minutes * 60_000);
      if (started) {
        const mins = Math.max(0, Math.round((Date.now() - started) / 60_000));
        if (mins > 0) {
          update((s) => {
            const f = (s.study.focus ||= { totalMin: 0, sessions: 0, byDay: {} });
            const day = new Date().toISOString().slice(0, 10);
            f.totalMin = (f.totalMin || 0) + mins;
            f.sessions = (f.sessions || 0) + 1;
            f.byDay[day] = (f.byDay[day] || 0) + mins;
          });
        }
        if (completed) {
          chime();
          toast(`Focus block done — ${minutes} minutes logged`, 'success');
        }
      }
    },
    [minutes, toast]
  );

  // tick for the display, and end the run exactly on time
  useEffect(() => {
    if (!running || !endsAt) return;
    const id = window.setInterval(() => {
      if (Date.now() >= endsAt) finish(true);
      else setRemaining(Math.max(0, endsAt - Date.now()));
    }, 250);
    return () => window.clearInterval(id);
  }, [running, endsAt, finish]);

  // show the countdown in the tab title while it runs
  useEffect(() => {
    if (running) {
      if (!titleRef.current) titleRef.current = document.title;
      document.title = `${clock(left)} · Focus`;
    } else if (titleRef.current) {
      document.title = titleRef.current;
      titleRef.current = '';
    }
    return () => {
      if (titleRef.current) {
        document.title = titleRef.current;
        titleRef.current = '';
      }
    };
  }, [running, left]);

  function start(mins = minutes) {
    setMinutes(mins);
    const ms = running && endsAt ? Math.max(0, endsAt - Date.now()) : mins * 60_000;
    startedAt.current = startedAt.current ?? Date.now();
    setEndsAt(Date.now() + ms);
    setRemaining(ms);
    setRunning(true);
  }

  function pause() {
    if (!endsAt) return;
    setRemaining(Math.max(0, endsAt - Date.now()));
    setEndsAt(null);
    setRunning(false);
  }

  function reset() {
    finish(false);
    setRemaining(minutes * 60_000);
  }

  function pick(mins: number) {
    setMinutes(mins);
    setRemaining(mins * 60_000);
    if (running) {
      startedAt.current = Date.now();
      setEndsAt(Date.now() + mins * 60_000);
    }
  }

  const todayMin = state.study.focus?.byDay?.[new Date().toISOString().slice(0, 10)] || 0;
  const pct = minutes ? 1 - left / (minutes * 60_000) : 0;

  return (
    <>
      {!open && (
        <button
          className={`timer-fab${running ? ' running' : ''}`}
          onClick={() => setOpen(true)}
          aria-label={running ? `Focus timer, ${clock(left)} left` : 'Focus timer'}
          title="Focus timer"
        >
          {running ? <span className="timer-fab-time">{clock(left)}</span> : <IconTimer size={17} />}
        </button>
      )}

      {open && (
        <div className="timer-panel" role="region" aria-label="Focus timer">
          <div className="tp-head">
            <span className="tp-title">Focus</span>
            <button className="tp-x" aria-label="Close timer" onClick={() => setOpen(false)}>
              <IconClose size={15} />
            </button>
          </div>

          <div className="tp-dial" style={{ ['--pct' as string]: pct }}>
            <span className="tp-clock">{clock(left)}</span>
          </div>

          <div className="tp-presets">
            {PRESETS.map((p) => (
              <button
                key={p.min}
                className={`tp-preset${minutes === p.min ? ' on' : ''}`}
                onClick={() => pick(p.min)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="tp-controls">
            {running ? (
              <button className="tp-main" onClick={pause}>
                <IconPause size={16} /> Pause
              </button>
            ) : (
              <button className="tp-main" onClick={() => start()}>
                <IconPlay size={16} /> Start
              </button>
            )}
            <button className="tp-sec" onClick={reset} aria-label="Reset">
              <IconStop size={14} />
            </button>
          </div>

          <div className="tp-foot">
            {todayMin} min today · {state.study.focus?.totalMin || 0} min all time
          </div>
        </div>
      )}
    </>
  );
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
