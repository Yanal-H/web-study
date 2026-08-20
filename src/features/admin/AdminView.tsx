import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Select } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { IconSparkle } from '../../design/icons';
import { checkAdmin } from '../../lib/admin';
import { AI_MODELS, getAiConfig, setAiConfig } from '../../lib/ai';
import { archiveChapter, listContent, publishDrafts, restoreChapter, stagePacks, type ContentItem } from '../../lib/publish';
import { useAuth } from '../auth/session';
import LibraryPanel from '../settings/LibraryPanel';

/**
 * Operational controls live on one explicit administrator route. Hiding this
 * route is only a usability improvement; every shared write is still enforced
 * by Supabase RLS, and this view checks the same server-owned is_admin function.
 */
export default function AdminView() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void checkAdmin().then((value) => {
      if (alive) setAllowed(value);
    });
    return () => {
      alive = false;
    };
  }, [auth.userId]);

  if (allowed === null) {
    return <Card>Checking administrator access…</Card>;
  }

  if (!allowed) {
    return (
      <>
        <header className="page-head">
          <h1>Administrator access required</h1>
          <div className="sub">This area is available only to an account authorised by the database.</div>
        </header>
        <Card>
          <Button onClick={() => navigate('/')}>Return to study</Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>Admin</h1>
        <div className="sub">Publish validated content, manage community access, and inspect local content health.</div>
      </header>

      <Card className="settings-section">
        <h2>Shared study content</h2>
        <p className="section-lead">Validate and publish complete chapter packs for the cohort.</p>
        <PublishPanel />
      </Card>

      <Card className="settings-section">
        <h2>Community operations</h2>
        <p className="section-lead">Manage departments, channels, rosters, moderation, and daily intelligence.</p>
        <Button onClick={() => navigate('/community')}>Open community administration</Button>
      </Card>

      <AiOperations />
      <LibraryPanel />
    </>
  );
}

function AiOperations() {
  const [ai, setAi] = useState(getAiConfig);

  function change(patch: Partial<typeof ai>) {
    const next = { ...ai, ...patch };
    setAi(next);
    setAiConfig(patch);
  }
  return (
    <Card className="settings-section">
      <h2>
        <IconSparkle size={18} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--accent)' }} />
        AI controls
      </h2>
      <p className="section-lead">
        Optional administrator-controlled assistance. Shared AI remains unavailable unless the protected server proxy is enabled.
      </p>
      <AdminRow label="Enable AI tools" desc="Shows AI actions on this administrator device.">
        <Switch label="Enable AI tools" checked={ai.enabled} onChange={(enabled) => change({ enabled })} />
      </AdminRow>
      <AdminRow label="Personal API key" desc="Optional. Stored only in this administrator account's browser storage.">
        <Input
          type="password"
          placeholder="Leave blank to use the protected server"
          autoComplete="off"
          value={ai.apiKey}
          style={{ width: 260, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
          onChange={(event) => change({ apiKey: event.target.value })}
        />
      </AdminRow>
      <AdminRow label="Model" desc="Haiku is the lowest-cost default; choose a larger model only when necessary.">
        <Select value={ai.model} onChange={(event) => change({ model: event.target.value })} style={{ minWidth: 240 }}>
          {AI_MODELS.map((model) => (
            <option key={model.value} value={model.value}>{model.label}</option>
          ))}
        </Select>
      </AdminRow>
    </Card>
  );
}

function PublishPanel() {
  const toast = useToast();
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const result = await listContent();
    setConfigured(result.configured);
    setReady(result.ready);
    setItems(result.items);
    setSelectedDraftIds((current) => current.filter((id) => result.items.some((item) => item.id === id && item.status === 'draft')));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function publishFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setBusy(true);
    setIssues(null);
    const result = await stagePacks(await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() }))));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    if (result.ok) { await refresh(); toast(result.message, 'success'); }
    else { if (result.issues?.length) setIssues(result.issues.slice(0, 16)); toast(result.message, 'error'); }
  }

  async function stagePasted() {
    const text = paste.trim();
    if (!text) return;
    setBusy(true);
    setIssues(null);
    const result = await stagePacks([{ name: 'Pasted chapter', text }]);
    setBusy(false);
    if (result.ok) {
      setPaste('');
      setPasteOpen(false);
      await refresh();
      toast(result.message, 'success');
    } else {
      if (result.issues?.length) setIssues(result.issues.slice(0, 12));
      toast(result.message, 'error');
    }
  }

  async function publishSelected() {
    if (!selectedDraftIds.length || !window.confirm(`Publish ${selectedDraftIds.length} selected draft(s) for every eligible student?`)) return;
    setBusy(true);
    const result = await publishDrafts(selectedDraftIds);
    setBusy(false);
    if (result.ok) { await refresh(); toast(result.message, 'success'); }
    else toast(result.message, 'error');
  }

  async function archive(id: string) {
    if (!window.confirm(`Archive ${id}? Students will no longer receive it, but it can be restored later.`)) return;
    setBusy(true);
    const result = await archiveChapter(id);
    setBusy(false);
    if (result.ok) await refresh();
    toast(result.message, result.ok ? 'success' : 'error');
  }

  async function restore(id: string) {
    setBusy(true);
    const result = await restoreChapter(id);
    setBusy(false);
    if (result.ok) await refresh();
    toast(result.message, result.ok ? 'success' : 'error');
  }

  function toggleDraft(id: string) {
    setSelectedDraftIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  if (configured === false || !ready) {
    return (
      <AdminRow label="Content lifecycle" desc={configured === false ? 'Supabase publishing is not configured on this deployment.' : 'Run the Batch 4 content-lifecycle SQL migration, then refresh this page.'}>
        <Button onClick={() => void refresh()}>Check again</Button>
      </AdminRow>
    );
  }

  return (
    <>
      <AdminRow
        label="1. Validate and save drafts"
        desc="Choose one or more complete chapter JSON packs. The entire selection is validated before any draft is saved."
      >
        <div className="row wrap" style={{ gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,text/json,.json"
            multiple
            hidden
            onChange={(event) => void publishFiles(event)}
          />
          <Button variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Validating…' : 'Choose JSON packs'}
          </Button>
          <Button disabled={busy} onClick={() => setPasteOpen((open) => !open)}>
            {pasteOpen ? 'Cancel paste' : 'Paste JSON'}
          </Button>
        </div>
      </AdminRow>

      {pasteOpen && (
        <div style={{ marginTop: 10 }}>
          <label className="muted" style={{ fontSize: 12.5, display: 'block', marginBottom: 6 }}>
            Paste one complete chapter pack. The same validation is used on Windows and tablets.
          </label>
          <textarea
            className="input"
            rows={9}
            spellCheck={false}
            placeholder={'{\n  "schema": "foundation.study-module/v1",\n  "id": "chapter-id",\n  …\n}'}
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}
          />
          <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <Button variant="primary" disabled={busy || !paste.trim()} onClick={() => void stagePasted()}>
              {busy ? 'Validating…' : 'Validate and save draft'}
            </Button>
          </div>
        </div>
      )}

      {issues && (
        <div className="ai-err" style={{ marginTop: 8 }}>
          <strong>That pack was rejected:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      <AdminRow label="2. Review and publish drafts" desc="Publishing selected drafts is one server transaction: either every selected chapter becomes live, or none do.">
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
          <Button variant="primary" disabled={busy || selectedDraftIds.length === 0} onClick={() => void publishSelected()}>
            Publish selected ({selectedDraftIds.length})
          </Button>
          {items === null && <span className="muted">Loading…</span>}
          {items !== null && items.length === 0 && <span className="muted">No drafts or published chapters yet.</span>}
          {items?.map((item) => (
            <div key={item.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
              {item.status === 'draft' && <input type="checkbox" aria-label={`Select ${item.id} draft`} checked={selectedDraftIds.includes(item.id)} onChange={() => toggleDraft(item.id)} />}
              <span style={{ fontSize: 13, textAlign: 'right' }}><strong>{item.title}</strong><br /><small>{item.id}</small></span>
              <span className={item.status === 'published' ? 'badge badge--success' : item.status === 'draft' ? 'badge badge--warning' : 'badge'}>{item.status}</span>
              {item.status === 'published' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void archive(item.id)}>Archive</Button>}
              {item.status === 'archived' && <Button size="sm" variant="primary" disabled={busy} onClick={() => void restore(item.id)}>Restore</Button>}
            </div>
          ))}
        </div>
      </AdminRow>
    </>
  );
}

function AdminRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <div className="sr-label">{label}</div>
        {desc && <div className="sr-desc">{desc}</div>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}
