import { useEffect, useState } from 'react';
import { Button, Card, Stat } from '../../design/primitives';
import { trueRetention, forecast, buttonSpread, reviewsPerDay, medianSeconds, DAY_MS } from './stats';
import type { ReviewLog, Scheduling } from '../../data/db';

/**
 * What the schedule is actually doing.
 *
 * Every grade has always been logged and nothing ever read it, so a student
 * could not answer the only two questions that matter: am I remembering this,
 * and how much is coming? Both are answerable from data already on the device.
 */
export default function StatsPanel({ onBack }: { onBack: () => void }) {
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const [rows, setRows] = useState<Scheduling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { reviewsSince, openDB, SCHEDULING, req } = await import('../../data/db');
      const since = Date.now() - 30 * DAY_MS;
      const [reviewLogs, db] = await Promise.all([reviewsSince(since), openDB()]);
      const scheduling = await req<Scheduling[]>(
        db.transaction([SCHEDULING], 'readonly').objectStore(SCHEDULING).getAll()
      );
      if (!alive) return;
      setLogs(reviewLogs);
      setRows(scheduling);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const now = Date.now();
  const ret = trueRetention(logs);
  const spread = buttonSpread(logs);
  const next = forecast(rows, 14, now);
  const history = reviewsPerDay(logs, 14, now);
  const median = medianSeconds(logs);
  const peak = Math.max(1, ...next.map((d) => d.count), ...history.map((d) => d.count));

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Your progress</h1>
          <div className="sub">The last 30 days of reviews, and what is coming.</div>
        </div>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </header>

      {loading ? (
        <Card>Reading your review history…</Card>
      ) : (
        <>
          <div className="stat-row" style={{ marginBottom: 'var(--sp-4)' }}>
            <Stat
              label="Recalled when due"
              value={ret.rate === null ? '—' : `${Math.round(ret.rate * 100)}%`}
            />
            <Stat label="Reviews (30 days)" value={spread.total} />
            <Stat label="Due in 7 days" value={next.slice(0, 7).reduce((n, d) => n + d.count, 0)} />
            <Stat label="Median per card" value={median === null ? '—' : `${median}s`} />
          </div>

          <Card style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="card-eyebrow">Recall when a card came back due</div>
            {ret.rate === null ? (
              <p className="muted">
                Nothing to judge yet. This counts only cards that came back <em>due</em> — a card in
                its one-minute step is being drilled, not recalled, and counting those would flatter
                the number into uselessness.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 15, margin: '6px 0' }}>
                  You recalled <strong>{ret.recalled}</strong> of <strong>{ret.reviewed}</strong> cards
                  that came back due.
                </p>
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Around 90% is the sweet spot: much lower and the intervals are too long to hold,
                  much higher and you are reviewing more than you need to.
                  {ret.unattributed > 0 &&
                    ` ${ret.unattributed} older review${ret.unattributed === 1 ? '' : 's'} predate this measurement and are left out rather than guessed at.`}
                </p>
              </>
            )}
          </Card>

          <Card style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="card-eyebrow">Coming up — next 14 days</div>
            <div className="stats-bars" role="img" aria-label="Cards due over the next fourteen days">
              {next.map((d) => (
                <div key={d.offset} className="stats-bar" title={`${d.count} due in ${d.offset} day(s)`}>
                  <span className="stats-bar-fill" style={{ height: `${(d.count / peak) * 100}%` }} />
                  <small>{d.offset === 0 ? 'now' : d.offset}</small>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              Anything already overdue is counted on today, because that is when you meet it.
            </p>
          </Card>

          <Card style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="card-eyebrow">What you did — last 14 days</div>
            <div className="stats-bars" role="img" aria-label="Reviews done over the last fourteen days">
              {[...history].reverse().map((d) => (
                <div key={d.offset} className="stats-bar" title={`${d.count} reviews ${d.offset} day(s) ago`}>
                  <span className="stats-bar-fill is-done" style={{ height: `${(d.count / peak) * 100}%` }} />
                  <small>{d.offset === 0 ? 'today' : d.offset}</small>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="card-eyebrow">Which buttons you press</div>
            {spread.total === 0 ? (
              <p className="muted">No reviews in the last 30 days.</p>
            ) : (
              <div className="stats-spread">
                {(
                  [
                    ['Again', spread.again, 'var(--grade-again)'],
                    ['Hard', spread.hard, 'var(--grade-hard)'],
                    ['Good', spread.good, 'var(--grade-good)'],
                    ['Easy', spread.easy, 'var(--grade-easy)'],
                  ] as const
                ).map(([label, n, tone]) => (
                  <div key={label} className="stats-spread-row">
                    <span className="ssr-label">{label}</span>
                    <span className="ssr-track">
                      <span style={{ width: `${(n / spread.total) * 100}%`, background: tone }} />
                    </span>
                    <span className="ssr-num">{Math.round((n / spread.total) * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
