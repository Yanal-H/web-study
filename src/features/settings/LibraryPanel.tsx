import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { countStore, clearAll, CARDS, MCQS, CHAPTERS, MEDIA, REVIEWS, SCHEDULING } from '../../data/db';
import { deckStats } from '../../data/session';
import { rehydrateChapters } from '../../data/bootstrap';
import { resetContentSync, syncPublishedContent } from '../../data/remoteContent';

/**
 * What the card engine is holding. Every figure here is a `count()` over an
 * index — none of it loads a card — so it stays instant as the bank grows.
 */
export default function LibraryPanel() {
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [stats, setStats] = useState<{ due: number; neu: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

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

  /** Re-download every chapter from the content store, keeping scheduling rows. */
  async function rebuild() {
    setBusy(true);
    resetContentSync();
    const report = await syncPublishedContent();
    await rehydrateChapters();
    await refresh();
    setBusy(false);
    if (report.skipped === 'signed-out') toast('Sign in first to download chapters.', 'error');
    else if (!report.configured) toast('No content store is set up for this site.', 'error');
    else if (report.failed.length) toast(`${report.failed.length} chapter(s) failed to download.`, 'error');
    else toast(`Re-downloaded ${report.imported.length} chapter(s)`, 'success');
  }

  /** Clear everything on the device, including review history, then re-download. */
  async function wipe() {
    setBusy(true);
    await clearAll();
    resetContentSync();
    const report = await syncPublishedContent();
    await rehydrateChapters();
    await refresh();
    setBusy(false);
    if (report.skipped === 'signed-out') toast('Sign in first to download chapters.', 'error');
    else toast('Library rebuilt from scratch', 'success');
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

      {busy && (
        <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Downloading chapters…
        </div>
      )}

      <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
        <Button onClick={() => void rebuild()} disabled={busy}>
          Re-import chapters
        </Button>
        <Button variant="ghost" onClick={() => void wipe()} disabled={busy}>
          Rebuild from scratch
        </Button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        Re-importing downloads the chapters again and overwrites their text and cards, but keeps
        every scheduling row, so your progress survives. Rebuilding from scratch clears the review
        history too. Both need a connection; your existing chapters keep working offline.
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
