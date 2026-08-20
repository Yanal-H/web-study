import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { renderMarkdown } from '../../lib/markdown';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/session';

type Category = 'clinical-pearl' | 'guideline' | 'research' | 'technology' | 'exam-alert';
type Intelligence = {
  id: string; channel_id: string; category: Category; title: string; summary: string;
  body: string; source_label: string; source_url: string; status: 'draft' | 'published' | 'archived';
  published_at: string;
};

const CATEGORY_LABEL: Record<Category, string> = {
  'clinical-pearl': 'Clinical pearl', guideline: 'Guideline', research: 'Research',
  technology: 'Medical technology', 'exam-alert': 'Exam alert',
};

export default function IntelligencePanel({ channelId, isAdmin }: { channelId: string; isAdmin: boolean }) {
  const { userId } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Intelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const query = supabase.from('community_intelligence')
      .select('id,channel_id,category,title,summary,body,source_label,source_url,status,published_at')
      .eq('channel_id', channelId).order('published_at', { ascending: false }).limit(50);
    const { data, error } = await query;
    if (error) { setProblem('Run supabase/community-intelligence.sql, then refresh this page.'); setItems([]); }
    else { setProblem(null); setItems((data ?? []) as Intelligence[]); }
    setLoading(false);
  }, [channelId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!supabase) return;
    const subscription = supabase.channel(`intelligence:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_intelligence', filter: `channel_id=eq.${channelId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase?.removeChannel(subscription); };
  }, [channelId, refresh]);

  async function publish(input: Omit<Intelligence, 'id' | 'channel_id' | 'published_at' | 'status'>) {
    if (!supabase || !userId) return false;
    const { error } = await supabase.from('community_intelligence').insert({
      ...input, channel_id: channelId, created_by: userId, status: 'published',
    });
    if (error) { toast('Could not publish the update. Check every field and the HTTPS source link.', 'error'); return false; }
    toast('Intelligence update published', 'success');
    await refresh();
    return true;
  }

  async function archive(id: string) {
    if (!supabase || !isAdmin) return;
    const { error } = await supabase.from('community_intelligence').update({ status: 'archived' }).eq('id', id);
    if (error) toast('Could not archive the update.', 'error');
    else { await refresh(); toast('Update archived'); }
  }

  return <div className="intelligence-panel">
    <div className="row spread"><p className="muted">Short, source-linked updates selected by your administrator. Educational use only.</p>{isAdmin && <Button variant="primary" onClick={() => setEditorOpen((value) => !value)}>{editorOpen ? 'Close editor' : 'Publish update'}</Button>}</div>
    {problem && <Card className="community-alert">{problem}</Card>}
    {editorOpen && isAdmin && <IntelligenceEditor onPublish={async (input) => { const ok = await publish(input); if (ok) setEditorOpen(false); }} />}
    {loading ? <Card>Loading intelligence…</Card> : items.length === 0 ? <Card><EmptyState title="No updates yet">Verified medical knowledge and technology updates will appear here.</EmptyState></Card> : items.map((item) => <article className={'intelligence-card' + (item.status !== 'published' ? ' intelligence-card--archived' : '')} key={item.id}>
      <div className="row spread"><Badge tone={item.category === 'exam-alert' ? 'warning' : 'info'}>{CATEGORY_LABEL[item.category]}</Badge><span className="muted">{new Date(item.published_at).toLocaleDateString()}</span></div>
      <h3>{item.title}</h3><p className="intelligence-summary">{item.summary}</p>
      <div className="md intelligence-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }} />
      <div className="row spread"><a href={item.source_url} target="_blank" rel="noopener noreferrer">Source: {item.source_label}</a>{isAdmin && item.status === 'published' && <Button size="sm" variant="ghost" onClick={() => void archive(item.id)}>Archive</Button>}</div>
    </article>)}
  </div>;
}

function IntelligenceEditor({ onPublish }: { onPublish: (input: Omit<Intelligence, 'id' | 'channel_id' | 'published_at' | 'status'>) => Promise<void> }) {
  const [category, setCategory] = useState<Category>('clinical-pearl');
  const [title, setTitle] = useState(''); const [summary, setSummary] = useState('');
  const [body, setBody] = useState(''); const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUrl, setSourceUrl] = useState(''); const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 5 && summary.trim().length >= 10 && body.trim().length >= 10 && sourceLabel.trim().length >= 2 && /^https:\/\/\S+$/.test(sourceUrl.trim());
  async function submit() { if (!valid || busy) return; setBusy(true); await onPublish({ category, title: title.trim(), summary: summary.trim(), body: body.trim(), source_label: sourceLabel.trim(), source_url: sourceUrl.trim() }); setBusy(false); }
  return <Card className="intelligence-editor"><h3>Publish a verified update</h3><div className="community-admin-grid"><Field label="Category"><Select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Title"><Input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} /></Field></div><Field label="Short summary"><Textarea value={summary} maxLength={600} onChange={(event) => setSummary(event.target.value)} /></Field><Field label="Details" hint="Safe Markdown is supported"><Textarea value={body} maxLength={12000} onChange={(event) => setBody(event.target.value)} /></Field><div className="community-admin-grid"><Field label="Source name"><Input value={sourceLabel} placeholder="WHO guideline" onChange={(event) => setSourceLabel(event.target.value)} /></Field><Field label="HTTPS source link"><Input type="url" value={sourceUrl} placeholder="https://…" onChange={(event) => setSourceUrl(event.target.value)} /></Field></div><Button variant="primary" disabled={!valid || busy} onClick={() => void submit()}>{busy ? 'Publishing…' : 'Publish verified update'}</Button></Card>;
}

