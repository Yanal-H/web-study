import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../../design/primitives';
import { getOperationalSnapshot, type OperationalSnapshot } from './operations';

/** A concise admin-only overview: counts, warnings, and the next safe action. */
export default function OperationsSnapshotView() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getOperationalSnapshot();
    setLoading(false);
    if (result.ok && result.snapshot) {
      setSnapshot(result.snapshot);
      setMessage(null);
    } else {
      setMessage(result.message || 'Could not load the operational snapshot.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <Card className="admin-overview">
      <div className="row spread wrap" style={{ gap: 10 }}>
        <div><h2>Control centre</h2><p className="section-lead">Live, aggregate operational signals for this administrator only.</p></div>
        <Button size="sm" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
      </div>

      {message && <div className="community-alert"><strong>Action needed.</strong> {message}</div>}
      {!message && !snapshot && <p className="muted">Loading operational health…</p>}
      {snapshot && <>
        <div className="admin-metrics" aria-label="Administrator operational snapshot">
          <Metric label="Published chapters" value={snapshot.content.published} hint={`${snapshot.content.archived} archived · ${snapshot.content.versions} saved versions`} />
          <Metric label="Drafts awaiting review" value={snapshot.content.drafts} tone={snapshot.content.drafts ? 'warning' : undefined} />
          <Metric label="Open reports" value={snapshot.community.openReports} tone={snapshot.community.openReports ? 'danger' : undefined} />
          <Metric label="Roster claimed" value={`${snapshot.community.claimed}/${snapshot.community.roster}`} hint={`${snapshot.community.waiting} waiting to sign in`} />
          <Metric label="Active community" value={`${snapshot.community.activeDepartments} departments`} hint={`${snapshot.community.activeChannels} channels`} />
        </div>
        <div className="admin-next-action">
          {snapshot.community.openReports > 0 ? <><strong>Next action:</strong> Resolve the open community reports before publishing more updates.<Button size="sm" variant="primary" onClick={() => navigate('/community')}>Open reports</Button></>
            : snapshot.content.drafts > 0 ? <><strong>Next action:</strong> Review the saved chapter drafts, then publish only the approved ones.<Button size="sm" variant="primary" onClick={() => document.getElementById('admin-content')?.scrollIntoView({ behavior: 'smooth' })}>Review drafts</Button></>
            : <><strong>All clear:</strong> no open reports or content drafts require action right now.<Button size="sm" onClick={() => navigate('/community')}>Open community</Button></>}
        </div>
      </>}
    </Card>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'warning' | 'danger' }) {
  return <div className={`admin-metric${tone ? ` admin-metric--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}
