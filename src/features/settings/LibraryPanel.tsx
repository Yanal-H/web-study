import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { countStore, clearAll, CARDS, MCQS, CHAPTERS, MEDIA, REVIEWS, SCHEDULING } from '../../data/db';
import { deckStats } from '../../data/session';
import { ensureContentLoaded, invalidateContent, type BootstrapPhase } from '../../data/bootstrap';

/**
 * What the card engine is holding. Every figure here is a `count()` over an
 * index — none of it loads a card — so it stays instant as the bank grows.
 */
export default function LibraryPanel() {
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [stats, setStats] = useState<{ due: number; neu: number; total: number } | null>(null);
  const [phase, setPhase] = useState<BootstrapPhase>({ phase: 'idle' });

  const refresh = useCallback(async () => {
    try {
      const [chapters, cards, mcqs, media, reviews, sched] = await Promise.all([
        countStore(CHAPTERS),
        countStore(CARDS),
        countStore(MCQS),
        countStore(MEDIA),
        countStore(REVIEWS),
        countStore(SCHEDULING),
      ]);
      setCounts({ chapters, cards, mcqs, media, reviews, sched });
      setStats(await deckStats(''));
    } catch (e) {
      toast(`Card engine unavailable: ${(e as Error).message}`, 'error');
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function rebuild() {
    invalidateContent();
    await ensureContentLoaded(setPhase);
    await refresh();
    setPhase({ phase: 'idle' });
    toast('Library rebuilt', 'success');
  }

  async function wipe() {
    await clearAll();
    invalidateContent();
    await ensureContentLoaded(setPhase);
    await refresh();
    setPhase({ phase: 'idle' });
    toast('Library rebuilt from scratch', 'success');
  }

  return (
    <Card className="settings-section">
      <h2>Card engine</h2>
      <p className="muted" style={{ fontSize: 13.5, marginTop: -6 }}>
        Chapters, cards, questions and scheduling live in an indexed database on this device.
        The due queue is a range scan, so it stays fast however many cards you add.
      </p>

      {counts && (
        <div className="engine-grid">
          <Metric label="Chapters" value={counts.chapters} />
          <Metric label="Cards" value={counts.cards} />
          <Metric label="Questions" value={counts.mcqs} />
          <Metric label="Diagrams" value={counts.media} />
          <Metric label="Scheduled" value={counts.sched} />
          <Metric label="Reviews logged" value={counts.reviews} />
        </div>
      )}

      {stats && (
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          {stats.due} due now · {stats.neu} never seen · {stats.total} in the bank
        </div>
      )}

      {phase.phase === 'importing' && (
        <div style={{ marginTop: 12 }}>
          <div className="row spread" style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 5 }}>
            <span>{phase.current?.title || 'Importing…'}</span>
            <span>
              {phase.done}/{phase.of}
            </span>
          </div>
          <div className="qb-bar-track">
            <div
              className="qb-bar-fill"
              style={{ width: `${(phase.done / Math.max(1, phase.of)) * 100}%`, background: 'var(--grad-haki)' }}
            />
          </div>
        </div>
      )}

      <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
        <Button onClick={() => void rebuild()} disabled={phase.phase === 'importing'}>
          Re-import chapters
        </Button>
        <Button variant="ghost" onClick={() => void wipe()} disabled={phase.phase === 'importing'}>
          Rebuild from scratch
        </Button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        Re-importing overwrites chapter text and cards but keeps every scheduling row, so your
        progress survives. Rebuilding from scratch clears the review history too.
      </p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="engine-cell">
      <div className="engine-value">{value.toLocaleString('en-GB')}</div>
      <div className="engine-label">{label}</div>
    </div>
  );
}
