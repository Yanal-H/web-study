import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, useStoreVersion } from '../../state/useStore';
import { deckStats } from '../../data/session';
import { whenContentReady } from '../../data/bootstrap';
import { markActivity, commit } from '../../state/store';
import { Card, Stat, Badge, ProgressRing, Button, EmptyState } from '../../design/primitives';
import { IconFlame, IconTarget, IconFlashcards, IconQbank, IconStudy, IconCheck } from '../../design/icons';
import { computeStreak, forecast, weakMcqs, todayProgress } from '../../lib/stats';
import { collectItems, queueStats } from '../flashcards/deck';
import { allMcqs, getChapter } from '../../content/loader';
import { isDue as mcqDue } from '../qbank/perf';
import { useUserContentVersion } from '../../content/userContent';
import Hero from './Hero';
import ActivityCalendar from './ActivityCalendar';

export default function DashboardView() {
  const state = useStore();
  const navigate = useNavigate();

  const uv = useUserContentVersion();
  const streak = computeStreak(state.activity);
  // unified due across everything: flashcards (content + user) + MCQ reviews
  const sv = useStoreVersion();
  // personal cards from the local store, shipped cards from the engine (IndexedDB)
  const userDeck = useMemo(
    () => collectItems().filter((i) => i.source === 'user'),
    [uv, state.flashcards, state.schemaVersion, sv]
  );
  const userDue = queueStats(userDeck);
  const [engineDue, setEngineDue] = useState({ due: 0, neu: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    void whenContentReady()
      .then(() => deckStats(''))
      .then((s) => alive && setEngineDue(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sv, uv]);
  const due = {
    due: userDue.due + engineDue.due,
    neu: userDue.neu + engineDue.neu,
    total: userDue.total + engineDue.total,
  };
  const mcqDueCount = useMemo(() => allMcqs().filter((q) => state.study.mcqPerf[q.id] && mcqDue(q.id)).length, [uv, state.study.mcqPerf]);
  const fc = forecast(state.flashcards, 14);
  const weak = weakMcqs(state.study.mcqPerf);
  const goal = todayProgress(state);
  const maxFc = Math.max(1, ...fc);
  const totalActive = Object.keys(state.activity).length;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // the chapters you have opened most recently, for a personal "jump back in" row
  const recent = useMemo(() => {
    const prog = state.study.progress || {};
    return Object.entries(prog)
      .filter(([, p]: [string, any]) => p?.lastOpened)
      .map(([cid, p]: [string, any]) => ({ id: cid, ch: getChapter(cid), lastOpened: p.lastOpened as string }))
      .filter((r) => r.ch)
      .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1))
      .slice(0, 3);
  }, [state.study.progress, sv, uv]);

  // Next best action — a single, decisive recommendation.
  const nextAction = (() => {
    if (due.due > 0)
      return {
        text: `${due.due} card${due.due > 1 ? 's' : ''} due for review`,
        cta: 'Review now',
        go: '/flashcards',
        icon: <IconFlashcards size={18} />,
      };
    if (weak.length > 0)
      return {
        text: `${weak.length} weak question${weak.length > 1 ? 's' : ''} to shore up`,
        cta: 'Practise weak spots',
        go: '/qbank',
        icon: <IconQbank size={18} />,
      };
    if (due.neu > 0)
      return {
        text: `${due.neu} new card${due.neu > 1 ? 's' : ''} waiting to be learned`,
        cta: 'Start learning',
        go: '/flashcards',
        icon: <IconStudy size={18} />,
      };
    return {
      text: 'You are all caught up. Explore a chapter or add new material.',
      cta: 'Open Study',
      go: '/study',
      icon: <IconStudy size={18} />,
    };
  })();

  return (
    <>
      <Hero
        greeting={`${greet}.`}
        cta={{ text: nextAction.text, label: nextAction.cta, go: nextAction.go, icon: nextAction.icon }}
      />

      {/* Jump back into what you were reading */}
      {recent.length > 0 && (
        <section className="resume-strip enter" aria-label="Continue studying">
          {recent.map((r) => (
            <button
              key={r.id}
              className="resume-card"
              onClick={() => navigate(`/study/${encodeURIComponent(r.id)}`)}
            >
              <span className="resume-eyebrow">Continue</span>
              <span className="resume-title">{r.ch!.title}</span>
              <span className="resume-meta">
                {r.ch!.subject} · {new Date(r.lastOpened).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              <span className="resume-go">
                Resume <IconStudy size={14} />
              </span>
            </button>
          ))}
        </section>
      )}

      {/* At-a-glance */}
      <div className="stat-row enter">

        <div className="stat">
          <div className="stat-label">Current streak</div>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconFlame size={22} style={{ color: streak > 0 ? 'var(--warning)' : 'var(--text-faint)' }} />
            {streak}
            <span className="unit">days</span>
          </div>
        </div>
        <Stat label="Cards due" value={due.due} />
        <Stat label="Questions due" value={mcqDueCount} />
        <Stat label="Active days" value={totalActive} />
      </div>

      <div className="cols cols-2" style={{ marginTop: 'var(--sp-4)' }}>
        {/* Next best action */}
        <Card>
          <div className="card-eyebrow">Next best action</div>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                flex: '0 0 auto',
              }}
            >
              {nextAction.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{nextAction.text}</div>
              <Button
                variant="primary"
                size="sm"
                style={{ marginTop: 12 }}
                onClick={() => navigate(nextAction.go)}
              >
                {nextAction.cta}
              </Button>
            </div>
          </div>
        </Card>

        {/* Daily goal ring */}
        <Card>
          <div className="card-eyebrow">Today&rsquo;s goal</div>
          <div className="row" style={{ gap: 18 }}>
            <ProgressRing
              value={goal.ratio}
              label={`${Math.round(goal.ratio * 100)}%`}
              size={92}
            />
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {goal.done} / {goal.goal} reviews
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                <IconTarget size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                {goal.ratio >= 1 ? 'Goal met — nicely done.' : 'Keep the streak alive.'}
              </div>
              <Button
                size="sm"
                style={{ marginTop: 12 }}
                onClick={() => {
                  markActivity();
                  commit();
                }}
              >
                <IconCheck size={15} /> Log a review
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Activity calendar */}
      <section className="section">
        <div className="section-head">
          <h2>Activity</h2>
          <span className="see">last 6 months</span>
        </div>
        <Card>
          <ActivityCalendar activity={state.activity} weeks={26} />
        </Card>
      </section>

      {/* Forecast + weak spots */}
      <div className="cols cols-2" style={{ marginTop: 'var(--sp-5)' }}>
        <Card>
          <div className="card-eyebrow">14-day forecast</div>
          <p className="muted" style={{ fontSize: 13, marginTop: -2 }}>
            Reviews coming due, by day.
          </p>
          {due.total === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>
              No scheduled cards yet — your forecast fills in as you build a deck.
            </div>
          ) : (
            <div className="forecast2">
              {fc.map((n, i) => {
                const day = new Date();
                day.setDate(day.getDate() + i);
                const wd = day.toLocaleDateString('en-GB', { weekday: 'narrow' });
                const dom = day.getDate();
                const weekendCol = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div className={`fcol${i === 0 ? ' today' : ''}`} key={i} title={`${day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}: ${n} due`}>
                    <div className="fcol-bar-wrap">
                      <div className="fcol-bar" style={{ height: `${Math.max(n ? 8 : 0, (n / maxFc) * 100)}%` }}>
                        {n > 0 && <span className="fcol-n">{n}</span>}
                      </div>
                    </div>
                    <div className={`fcol-wd${weekendCol ? ' wknd' : ''}`}>{wd}</div>
                    <div className="fcol-dom">{i === 0 ? 'today' : dom}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="card-eyebrow">Weak spots</div>
          {weak.length === 0 ? (
            <EmptyState icon={<IconTarget size={22} />} title="Nothing flagged as weak">
              Questions you miss repeatedly will surface here for targeted practice.
            </EmptyState>
          ) : (
            <div className="list" style={{ marginTop: 10 }}>
              {weak.map((w) => (
                <div className="list-row" key={w.qid}>
                  <div className="lr-main">
                    <div className="lr-title mono" style={{ fontSize: 13 }}>
                      {w.qid}
                    </div>
                    <div className="lr-sub">
                      {w.attempts} attempts · {Math.round(w.accuracy * 100)}% correct
                    </div>
                  </div>
                  <Badge tone="error">weak</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
