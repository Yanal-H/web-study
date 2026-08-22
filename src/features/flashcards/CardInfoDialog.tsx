import { useEffect, useState } from 'react';
import { Button, Input } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { cardHistory, forgetCard, setDueInDays, type CardHistory } from './cardOps';
import type { ReviewLog, Scheduling } from '../../data/db';

/**
 * One card's record, and the three things a student can do about it.
 *
 * These are the only operations in the app that change a schedule WITHOUT a
 * grade, so each acts on exactly this one card, from an explicit press, and
 * says what it did. Nothing here is ever applied to a set of cards — see
 * .claude/rules/data-safety.md.
 */
export default function CardInfoDialog({
  cardKey,
  front,
  onClose,
}: {
  cardKey: string;
  front: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [history, setHistory] = useState<CardHistory | null>(null);
  const [sched, setSched] = useState<Scheduling | null>(null);
  const [days, setDays] = useState('1');
  const [busy, setBusy] = useState(false);

  // Only engine cards carry an IndexedDB scheduling row and a review log. A
  // personal card's history lives in the store and is not shown here yet.
  const engineId = cardKey.startsWith('engine:') ? cardKey.slice('engine:'.length) : null;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { reviewsSince, getScheduling } = await import('../../data/db');
      const logs = (await reviewsSince(0)).filter((l: ReviewLog) => l.cardId === engineId);
      const row = engineId ? await getScheduling(engineId) : undefined;
      if (!alive) return;
      setHistory(cardHistory(logs));
      setSched(row ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [engineId]);

  async function apply(next: Scheduling, message: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { putScheduling } = await import('../../data/db');
      const { invalidateDeckTree } = await import('../../data/session');
      await putScheduling(next);
      invalidateDeckTree();
      setSched(next);
      toast(message, 'success');
    } catch {
      toast('Could not change this card. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const fmt = (ts: number | null) => (ts === null ? '—' : new Date(ts).toLocaleDateString());

  return (
    <Dialog
      title="Card info"
      onClose={onClose}
      footer={
        <div className="row spread">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>{front}</p>

      {history === null ? (
        <p className="muted">Reading this card’s history…</p>
      ) : !engineId ? (
        <p className="muted">
          History and scheduling tools are available for library cards. This is one of your own —
          edit it directly instead.
        </p>
      ) : (
        <>
          <div className="card-info-grid">
            <div><span>Reviews</span><strong>{history.reviews}</strong></div>
            <div><span>Lapses</span><strong>{history.lapses}</strong></div>
            <div>
              <span>Recalled when due</span>
              <strong>{history.retention === null ? '—' : `${Math.round(history.retention * 100)}%`}</strong>
            </div>
            <div><span>Median time</span><strong>{history.medianSeconds === null ? '—' : `${history.medianSeconds}s`}</strong></div>
            <div><span>First seen</span><strong>{fmt(history.first)}</strong></div>
            <div><span>Last seen</span><strong>{fmt(history.last)}</strong></div>
          </div>

          {history.lapses >= 6 && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              You have forgotten this one {history.lapses} times. A card that keeps coming back is
              usually worth rewriting or splitting rather than drilling harder.
            </p>
          )}

          <hr />

          <div className="card-info-actions">
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Input
                type="number"
                min={0}
                style={{ width: 90 }}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-label="Days from today"
              />
              <Button
                disabled={busy || !sched}
                onClick={() =>
                  sched &&
                  void apply(
                    setDueInDays(sched, parseInt(days, 10) || 0, Date.now()),
                    `Set to come back in ${parseInt(days, 10) || 0} day(s).`
                  )
                }
              >
                Show it again in… days
              </Button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
              Changes only when it next appears. What it has learned is kept, so the interval after
              that is still worked out from your real answers.
            </p>

            <Button
              variant="danger"
              disabled={busy || !sched}
              onClick={() =>
                sched &&
                void apply(
                  forgetCard(sched),
                  'Reset to new. Its lapse count is kept, so a difficult card stays flagged as one.'
                )
              }
            >
              Forget — treat as never seen
            </Button>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              For a card that was mis-scheduled, or whose material has changed under it. Its review
              history is not deleted.
            </p>
          </div>
        </>
      )}
    </Dialog>
  );
}
