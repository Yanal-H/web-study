import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { countStore, clearAll, CARDS, MCQS, CHAPTERS, MEDIA, REVIEWS, SCHEDULING } from '../../data/db';
import { deckStats } from '../../data/session';
import { rehydrateChapters } from '../../data/bootstrap';
import { resetContentSync, syncPublishedContent } from '../../data/remoteContent';
import { listCatalogChapters } from '../../content/catalog';

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
      const catalog = listCatalogChapters();
      setCounts({
        chapters: catalog.length,
        cards: catalog.reduce((sum, chapter) => sum + chapter.counts.cards, 0),
        mcqs: catalog.reduce((sum, chapter) => sum + chapter.counts.mcqs, 0),
        loadedChapters: chapters,
        loadedCards: cards,
        loadedMcqs: mcqs,
        media, reviews, sched,
      });
      setStats(await deckStats(''));
    } catch (e) {
      toast(`Card engine unavailable: ${(e as Error).message}`, 'error');
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Refresh identities and discard open bodies, keeping scheduling rows. */
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
    else toast(`Refreshed ${report.catalogued.length} published chapter(s)`, 'success');
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
        Published chapter identities and deck counts load first. Full text, cards and questions are
        downloaded securely only when you open the matching study feature; personal scheduling stays on this device.
      </p>

      {counts && (
        <div className="engine-grid">
          <Metric label="Chapters" value={counts.chapters} />
          <Metric label="Cards" value={counts.cards} />
          <Metric label="Questions" value={counts.mcqs} />
          <Metric label="Bodies open" value={counts.loadedChapters} />
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
          Refreshing library catalog…
        </div>
      )}

      <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
        <Button onClick={() => void rebuild()} disabled={busy}>
          Refresh catalog
        </Button>
        <Button variant="ghost" onClick={() => void wipe()} disabled={busy}>
          Rebuild from scratch
        </Button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        Refreshing clears open chapter bodies and reloads the protected catalog while keeping progress.
        Rebuilding from scratch also clears scheduling and review history. Both require a connection.
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
