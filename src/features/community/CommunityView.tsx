import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Tabs, Textarea } from '../../design/primitives';
import { IconFlag, IconResources } from '../../design/icons';
import { useToast } from '../../design/Toast';
import { checkAdmin } from '../../lib/admin';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/session';
import CommunityAdmin from './CommunityAdmin';
import IntelligencePanel from './IntelligencePanel';
import DailyLogPanel from './DailyLogPanel';

type Channel = { id: string; name: string; description: string | null; channel_type: string; academic_year: string | null };
type Message = { id: string; channel_id: string; author_id: string; author_alias: string; body: string; status: 'visible' | 'hidden' | 'deleted'; created_at: string; edited_at: string | null };

const PAGE_SIZE = 50;

function readableTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function CommunityView() {
  const { userId } = useAuth();
  const toast = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [more, setMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [section, setSection] = useState<'discussion' | 'logs' | 'intelligence'>('discussion');
  const [live, setLive] = useState(false);

  const selected = useMemo(() => channels.find((channel) => channel.id === channelId) ?? null, [channels, channelId]);

  const loadChannels = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data, error }, admin] = await Promise.all([
      supabase.from('community_channels').select('id,name,description,channel_type,academic_year').eq('active', true).order('name'),
      checkAdmin(),
    ]);
    if (error) {
      setProblem('Community is not set up in Supabase yet. Paste supabase/community-ALL-IN-ONE.sql into the Supabase SQL editor and run it — one file, once, about two minutes.');
      setChannels([]);
    } else {
      const next = (data ?? []) as Channel[];
      setChannels(next);
      setChannelId((current) => (current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null));
      setProblem(null);
    }
    setIsAdmin(admin);
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (id: string, offset = 0) => {
    if (!supabase) return;
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('community_messages')
      .select('id,channel_id,author_id,author_alias,body,status,created_at,edited_at')
      .eq('channel_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      setProblem('Could not load this discussion. Please refresh and try again.');
    } else {
      const page = (data ?? []) as Message[];
      setMessages((current) => (offset > 0 ? [...current, ...page] : page));
      setMore(page.length === PAGE_SIZE);
      setProblem(null);
    }
    setLoadingMessages(false);
  }, []);

  useEffect(() => { void loadChannels(); }, [loadChannels]);
  useEffect(() => {
    if (channelId) void loadMessages(channelId);
    else setMessages([]);
  }, [channelId, loadMessages]);
  useEffect(() => {
    const client = supabase;
    if (!client || !channelId) return;
    setLive(false);
    const subscription = client.channel(`messages:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_messages', filter: `channel_id=eq.${channelId}` }, () => void loadMessages(channelId))
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { setLive(false); void client.removeChannel(subscription); };
  }, [channelId, loadMessages]);

  async function post(body: string) {
    if (!supabase || !channelId || !userId) return;
    const { error } = await supabase.from('community_messages').insert({
      channel_id: channelId,
      author_id: userId,
      // The database replaces this with the authenticated user's safe alias.
      author_alias: 'Student-pending',
      body,
    });
    if (error) {
      toast('Could not post. Please try again.', 'error');
      return;
    }
    toast('Posted', 'success');
    await loadMessages(channelId);
  }

  async function report(messageId: string) {
    if (!supabase || !userId) return;
    const reason = window.prompt('Why should this message be reviewed? (3–500 characters)')?.trim();
    if (!reason) return;
    if (reason.length < 3) {
      toast('Please give a slightly more detailed reason.', 'error');
      return;
    }
    const { error } = await supabase.from('community_reports').insert({ message_id: messageId, reporter_id: userId, reason });
    if (error) toast('That report could not be sent. You may already have reported this message.', 'error');
    else toast('Report sent to the administrator.', 'success');
  }

  async function moderate(message: Message, action: 'hide' | 'restore' | 'delete') {
    if (!supabase || !userId || !isAdmin) return;
    const status = action === 'restore' ? 'visible' : action === 'hide' ? 'hidden' : 'deleted';
    const { error } = await supabase.from('community_messages').update({ status }).eq('id', message.id);
    if (error) { toast('Could not update the message.', 'error'); return; }
    await supabase.from('community_moderation_actions').insert({ message_id: message.id, actor_id: userId, action });
    await loadMessages(message.channel_id);
  }

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div><h1>{managing ? 'Community administration' : 'Community'}</h1>
        <div className="sub">{managing ? 'Departments, channels, and private student roster.' : 'Private department discussions. Use your public alias; be helpful, precise, and respectful.'}</div></div>
        {isAdmin && <Button onClick={() => setManaging((value) => !value)}>{managing ? 'Back to discussions' : 'Manage community'}</Button>}
      </header>
      {managing && isAdmin ? <CommunityAdmin onStructureChanged={() => void loadChannels()} /> : <>
      {problem && <Card className="community-alert"><strong>Community unavailable.</strong> {problem}</Card>}
      {loading ? <Card>Loading your channels…</Card> : channels.length === 0 ? (
        <Card><EmptyState icon={<IconResources size={22} />} title="No community channels assigned yet">Your administrator controls department access from the private roster.</EmptyState></Card>
      ) : (
        <div className="community-layout">
          <aside className="community-channels" aria-label="Community channels">
            {channels.map((channel) => <button key={channel.id} className={channel.id === channelId ? 'community-channel active' : 'community-channel'} onClick={() => setChannelId(channel.id)}>
              <span>#</span><span><strong>{channel.name}</strong>{channel.academic_year && <small>{channel.academic_year}</small>}</span>
            </button>)}
          </aside>
          <section className="community-thread">
            <div className="community-thread-head"><div><h2>{selected ? `# ${selected.name}` : 'Discussion'}</h2><p>{selected?.description || 'Department discussion'}</p></div><div className="row"><Badge tone="info">Private</Badge><Badge dot tone={live ? 'success' : 'default'}>{live ? 'Live' : 'Refresh available'}</Badge></div></div>
            <Tabs value={section} onChange={setSection} tabs={[{ value: 'discussion', label: 'Discussion' }, { value: 'logs', label: "Today's lectures" }, { value: 'intelligence', label: 'Daily intelligence' }]} />
            {section === 'discussion' ? <div className="community-discussion">
            <Composer disabled={!channelId || loadingMessages} onPost={post} />
            <div className="community-feed" aria-live="polite">
              {loadingMessages && messages.length === 0 ? <Card>Loading messages…</Card> : messages.length === 0 ? <Card><EmptyState title="Start the conversation">Ask a clear question or share a useful study insight.</EmptyState></Card> : messages.map((message) => (
                <article className={'community-message' + (message.status !== 'visible' ? ' community-message--moderated' : '')} key={message.id}>
                  <div className="community-message-meta"><strong>{message.author_alias}</strong><span>{readableTime(message.created_at)}{message.edited_at ? ' · edited' : ''}</span>{message.status !== 'visible' && <Badge tone="warning">{message.status}</Badge>}</div>
                  <p>{message.status === 'deleted' && !isAdmin ? 'This message was removed by moderation.' : message.body}</p>
                  <div className="community-message-actions">
                    {message.author_id !== userId && <Button size="sm" variant="ghost" onClick={() => void report(message.id)}><IconFlag size={14} /> Report</Button>}
                    {isAdmin && message.status === 'visible' && <Button size="sm" variant="ghost" onClick={() => void moderate(message, 'hide')}>Hide</Button>}
                    {isAdmin && message.status === 'hidden' && <Button size="sm" variant="ghost" onClick={() => void moderate(message, 'restore')}>Restore</Button>}
                    {isAdmin && message.status !== 'deleted' && <Button size="sm" variant="danger" onClick={() => void moderate(message, 'delete')}>Delete</Button>}
                  </div>
                </article>
              ))}
            </div>
            {more && <Button disabled={loadingMessages} onClick={() => channelId && void loadMessages(channelId, messages.length)}>Load earlier messages</Button>}
            </div> : section === 'logs' ? <DailyLogPanel isAdmin={isAdmin} /> : channelId && <IntelligencePanel channelId={channelId} isAdmin={isAdmin} />}
          </section>
        </div>
      )}
      </>}
    </>
  );
}

function Composer({ disabled, onPost }: { disabled: boolean; onPost: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  async function submit() {
    const value = body.trim();
    if (!value || posting) return;
    setPosting(true);
    await onPost(value);
    setPosting(false);
    setBody('');
  }
  return <Card className="community-compose"><Textarea value={body} maxLength={4000} disabled={disabled || posting} placeholder="Write a helpful message…" onChange={(event) => setBody(event.target.value)} /><div className="row spread"><span className="muted">{body.length}/4000 · No patient-identifying information.</span><Button variant="primary" disabled={disabled || posting || !body.trim()} onClick={() => void submit()}>{posting ? 'Posting…' : 'Post message'}</Button></div></Card>;
}
