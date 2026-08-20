import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Field, Input, Select, Textarea } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { supabase } from '../../lib/supabase';
import { parseRoster } from './roster';

type Department = { id: string; code: string; name: string; active: boolean };
type AdminChannel = { id: string; department_id: string; name: string; slug: string; access_mode: 'department' | 'members'; active: boolean };
type Entitlement = { id: string; email: string; department_id: string; department_name: string; channel_id: string | null; channel_name: string | null; academic_year: string | null; claimed: boolean; created_at: string; total_count: number };
type Report = { id: string; message_id: string; reason: string; created_at: string; community_messages: { body: string; author_alias: string } | null };

const PAGE_SIZE = 50;
const IMPORT_CHUNK_SIZE = 500;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export default function CommunityAdmin({ onStructureChanged }: { onStructureChanged: () => void }) {
  const toast = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [roster, setRoster] = useState<Entitlement[]>([]);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelAccess, setChannelAccess] = useState<'department' | 'members'>('department');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [pastedRoster, setPastedRoster] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterDepartment, setRosterDepartment] = useState('');
  const [rosterClaimed, setRosterClaimed] = useState<'all' | 'claimed' | 'waiting'>('all');
  const [rosterOffset, setRosterOffset] = useState(0);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  const eligibleChannels = useMemo(
    () => channels.filter((channel) => channel.department_id === selectedDepartment && channel.active && channel.access_mode === 'members'),
    [channels, selectedDepartment]
  );
  const rosterPreview = useMemo(() => parseRoster(pastedRoster), [pastedRoster]);

  const loadRoster = useCallback(async (offset: number) => {
    if (!supabase) return;
    setRosterLoading(true);
    const { data, error } = await supabase.rpc('admin_list_community_entitlements_page', {
      p_offset: offset,
      p_limit: PAGE_SIZE,
      p_search: rosterSearch,
      p_department_id: rosterDepartment || null,
      p_claimed: rosterClaimed === 'all' ? null : rosterClaimed === 'claimed',
    });
    setRosterLoading(false);
    if (error) {
      setProblem('Run the Batch 5 community-scale SQL migration, then refresh this page.');
      return;
    }
    const page = (data ?? []) as Entitlement[];
    setRoster(page);
    setRosterTotal(Number(page[0]?.total_count ?? 0));
    setRosterOffset(offset);
  }, [rosterClaimed, rosterDepartment, rosterSearch]);

  const refreshStructure = useCallback(async () => {
    if (!supabase) return;
    const [departmentResult, channelResult, reportResult] = await Promise.all([
      supabase.from('departments').select('id,code,name,active').order('name'),
      supabase.from('community_channels').select('id,department_id,name,slug,access_mode,active').order('name'),
      supabase.from('community_reports').select('id,message_id,reason,created_at,community_messages(body,author_alias)').eq('status', 'open').order('created_at'),
    ]);
    if (departmentResult.error || channelResult.error || reportResult.error) {
      setProblem('Community administration is not configured. Run the community SQL setup scripts, then refresh.');
      return;
    }
    const nextDepartments = (departmentResult.data ?? []) as Department[];
    setDepartments(nextDepartments);
    setChannels((channelResult.data ?? []) as AdminChannel[]);
    setReports((reportResult.data ?? []) as unknown as Report[]);
    setSelectedDepartment((current) => current || nextDepartments[0]?.id || '');
    setProblem(null);
  }, []);

  const refreshAll = useCallback(async () => {
    await refreshStructure();
    await loadRoster(0);
  }, [loadRoster, refreshStructure]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);
  useEffect(() => {
    if (selectedChannel && !eligibleChannels.some((channel) => channel.id === selectedChannel)) setSelectedChannel('');
  }, [eligibleChannels, selectedChannel]);

  async function createDepartment() {
    if (!supabase || !departmentName.trim()) return;
    setBusy(true);
    const name = departmentName.trim();
    const { error } = await supabase.from('departments').insert({ code: slugify(name), name });
    setBusy(false);
    if (error) toast(error.message.includes('duplicate') ? 'That department already exists.' : 'Could not create the department.', 'error');
    else { setDepartmentName(''); await refreshStructure(); onStructureChanged(); toast('Department created', 'success'); }
  }

  async function createChannel() {
    if (!supabase || !selectedDepartment || !channelName.trim()) return;
    setBusy(true);
    const name = channelName.trim();
    const { error } = await supabase.from('community_channels').insert({
      department_id: selectedDepartment, name, slug: slugify(name), channel_type: 'general', access_mode: channelAccess,
    });
    setBusy(false);
    if (error) toast(error.message.includes('duplicate') ? 'That channel already exists.' : 'Could not create the channel.', 'error');
    else { setChannelName(''); await refreshStructure(); onStructureChanged(); toast('Channel created', 'success'); }
  }

  async function importRoster() {
    if (!supabase || !selectedDepartment) return;
    if (rosterPreview.errors.length) { setProblem(rosterPreview.errors.slice(0, 5).join(' · ')); return; }
    if (!rosterPreview.rows.length) { setProblem('Paste at least one valid student email.'); return; }
    if (!window.confirm(`Import ${rosterPreview.rows.length} unique student email(s)? Large lists are sent in safe batches of ${IMPORT_CHUNK_SIZE}.`)) return;
    setBusy(true);
    setProblem(null);
    let imported = 0;
    let duplicates = 0;
    for (let start = 0; start < rosterPreview.rows.length; start += IMPORT_CHUNK_SIZE) {
      const rows = rosterPreview.rows.slice(start, start + IMPORT_CHUNK_SIZE).map((row) => ({
        email: row.email, department_id: selectedDepartment, channel_id: selectedChannel || null,
        academic_year: row.academicYear || academicYear.trim() || null,
      }));
      const { data, error } = await supabase.rpc('admin_import_community_entitlements', { p_rows: rows });
      if (error) {
        setBusy(false);
        setProblem(`Imported ${imported} so far. The next batch failed: ${error.message}. Fix the roster and run it again; existing emails are skipped safely.`);
        return;
      }
      const result = data as { imported?: number; duplicates?: number } | null;
      imported += result?.imported ?? 0;
      duplicates += result?.duplicates ?? 0;
    }
    setBusy(false);
    setPastedRoster('');
    await loadRoster(0);
    toast(`Added ${imported}; skipped ${duplicates} existing entry${duplicates === 1 ? '' : 'ies'}.`, 'success');
  }

  async function remove(id: string, email: string) {
    if (!supabase || !window.confirm(`Remove ${email} from this community roster? Their current channel access may be revoked.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_remove_community_entitlement', { p_id: id });
    setBusy(false);
    if (error || data !== true) toast(error?.message || 'That roster entry was already removed.', 'error');
    else { await loadRoster(rosterOffset); toast('Roster entry removed'); }
  }

  async function resolveReport(id: string, status: 'dismissed' | 'actioned') {
    if (!supabase || !window.confirm(status === 'actioned' ? 'Confirm that the moderation action is complete.' : 'Dismiss this report?')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_resolve_community_report', {
      p_report_id: id, p_status: status, p_note: resolutionNotes[id] || null,
    });
    setBusy(false);
    if (error || data !== true) toast(error?.message || 'This report was already resolved.', 'error');
    else { await refreshStructure(); toast(status === 'actioned' ? 'Report marked as actioned' : 'Report dismissed'); }
  }

  const first = rosterTotal === 0 ? 0 : rosterOffset + 1;
  const last = Math.min(rosterOffset + roster.length, rosterTotal);

  return <div className="community-admin">
    {problem && <Card className="community-alert"><strong>Action needed.</strong> {problem}</Card>}
    <div className="community-admin-grid">
      <Card><h2>1. Departments</h2><p className="muted">Create the main academic group.</p><Field label="Department name"><Input value={departmentName} placeholder="Faculty of Medicine" onChange={(event) => setDepartmentName(event.target.value)} /></Field><Button variant="primary" disabled={busy || slugify(departmentName).length < 2} onClick={() => void createDepartment()}>Create department</Button></Card>
      <Card><h2>2. Channels</h2><p className="muted">Create a discussion inside the selected department.</p><Field label="Department"><Select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}><option value="">Select…</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</Select></Field><Field label="Channel name"><Input value={channelName} placeholder="General discussion" onChange={(event) => setChannelName(event.target.value)} /></Field><Field label="Who can open it"><Select value={channelAccess} onChange={(event) => setChannelAccess(event.target.value as 'department' | 'members')}><option value="department">Everyone in the department</option><option value="members">Only students assigned to this channel</option></Select></Field><Button variant="primary" disabled={busy || !selectedDepartment || slugify(channelName).length < 2} onClick={() => void createChannel()}>Create channel</Button></Card>
    </div>

    <Card><h2>3. Import student roster</h2><p className="muted">Paste one university email per line. Optionally add a comma and year. Large lists are split into safe 500-student batches automatically.</p><div className="community-admin-grid"><Field label="Department"><Select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}><option value="">Select…</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</Select></Field><Field label="Restricted channel" hint="Optional; leave blank for department-wide access"><Select value={selectedChannel} onChange={(event) => setSelectedChannel(event.target.value)}><option value="">Department only</option>{eligibleChannels.map((channel) => <option value={channel.id} key={channel.id}>{channel.name}</option>)}</Select></Field><Field label="Default academic year" hint="Optional"><Input value={academicYear} placeholder="Year 3" onChange={(event) => setAcademicYear(event.target.value)} /></Field></div><Field label="Student emails"><Textarea className="community-roster-input" value={pastedRoster} placeholder={'student1@students.kasralainy.edu.eg\nstudent2@students.kasralainy.edu.eg,Year 2'} onChange={(event) => setPastedRoster(event.target.value)} /></Field>{pastedRoster.trim() && <p className="muted">{rosterPreview.rows.length} unique valid email(s){rosterPreview.errors.length ? ` · ${rosterPreview.errors.length} issue(s) to fix` : ''}</p>}<Button variant="primary" disabled={busy || !selectedDepartment || !rosterPreview.rows.length || rosterPreview.errors.length > 0} onClick={() => void importRoster()}>{busy ? 'Importing…' : `Import ${rosterPreview.rows.length || ''} student${rosterPreview.rows.length === 1 ? '' : 's'}`}</Button></Card>

    <Card><div className="row spread"><div><h2>Roster</h2><p className="muted">Private server-side search and pages keep large cohorts responsive.</p></div><span className="badge">{rosterTotal}</span></div><div className="community-admin-grid"><Field label="Search email"><Input value={rosterSearch} placeholder="student name or email" onChange={(event) => setRosterSearch(event.target.value)} /></Field><Field label="Department"><Select value={rosterDepartment} onChange={(event) => setRosterDepartment(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</Select></Field><Field label="Status"><Select value={rosterClaimed} onChange={(event) => setRosterClaimed(event.target.value as typeof rosterClaimed)}><option value="all">All students</option><option value="claimed">Claimed</option><option value="waiting">Waiting</option></Select></Field></div><div className="row wrap" style={{ gap: 8, marginBottom: 10 }}><Button onClick={() => void loadRoster(0)} disabled={rosterLoading}>Apply filters</Button><Button variant="ghost" onClick={() => { setRosterSearch(''); setRosterDepartment(''); setRosterClaimed('all'); setRosterOffset(0); }} disabled={rosterLoading}>Clear filters</Button><span className="muted">{rosterLoading ? 'Loading…' : `Showing ${first}–${last} of ${rosterTotal}`}</span></div><div className="community-roster">{roster.length === 0 ? <p className="muted">No matching students.</p> : roster.map((entry) => <div className="community-roster-row" key={entry.id}><div><strong>{entry.email}</strong><small>{entry.department_name}{entry.channel_name ? ` · #${entry.channel_name}` : ''}{entry.academic_year ? ` · ${entry.academic_year}` : ''}</small></div><span className={entry.claimed ? 'badge badge--success' : 'badge badge--warning'}>{entry.claimed ? 'Claimed' : 'Waiting'}</span><Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(entry.id, entry.email)}>Remove</Button></div>)}</div><div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}><Button size="sm" disabled={rosterLoading || rosterOffset === 0} onClick={() => void loadRoster(Math.max(0, rosterOffset - PAGE_SIZE))}>Previous</Button><Button size="sm" disabled={rosterLoading || rosterOffset + PAGE_SIZE >= rosterTotal} onClick={() => void loadRoster(rosterOffset + PAGE_SIZE)}>Next</Button></div></Card>

    <Card><div className="row spread"><div><h2>Open reports</h2><p className="muted">Review context in Discussions, then record the outcome with an optional audit note.</p></div><span className="badge badge--warning">{reports.length}</span></div><div className="community-roster">{reports.length === 0 ? <p className="muted">No open reports.</p> : reports.map((report) => <div className="community-report-row" key={report.id}><div><strong>{report.community_messages?.author_alias || 'Unknown student'}</strong><p>{report.community_messages?.body || 'Message unavailable'}</p><small>Reason: {report.reason}</small><Input value={resolutionNotes[report.id] || ''} placeholder="Optional resolution note" onChange={(event) => setResolutionNotes((current) => ({ ...current, [report.id]: event.target.value }))} style={{ marginTop: 8, width: '100%' }} /></div><div className="row wrap"><Button size="sm" disabled={busy} onClick={() => void resolveReport(report.id, 'dismissed')}>Dismiss</Button><Button size="sm" variant="primary" disabled={busy} onClick={() => void resolveReport(report.id, 'actioned')}>Mark actioned</Button></div></div>)}</div></Card>
    <Card><h2>Publish study knowledge</h2><p className="muted">Study guides, flashcards, MCQs and EMQs use the validated draft publisher.</p><Link className="btn btn--primary" to="/admin">Open content publisher</Link></Card>
  </div>;
}
