import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Field, Input, Select, Textarea } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { supabase } from '../../lib/supabase';
import { parseRoster } from './roster';

type Department = { id: string; code: string; name: string; active: boolean };
type AdminChannel = { id: string; department_id: string; name: string; slug: string; access_mode: 'department' | 'members'; active: boolean };
type Entitlement = { id: string; email: string; department_id: string; department_name: string; channel_id: string | null; channel_name: string | null; academic_year: string | null; claimed: boolean };
type Report = { id: string; message_id: string; reason: string; created_at: string; community_messages: { body: string; author_alias: string } | null };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export default function CommunityAdmin({ onStructureChanged }: { onStructureChanged: () => void }) {
  const toast = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [roster, setRoster] = useState<Entitlement[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelAccess, setChannelAccess] = useState<'department' | 'members'>('department');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [pastedRoster, setPastedRoster] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [departmentResult, channelResult, rosterResult, reportResult] = await Promise.all([
      supabase.from('departments').select('id,code,name,active').order('name'),
      supabase.from('community_channels').select('id,department_id,name,slug,access_mode,active').order('name'),
      supabase.rpc('admin_list_community_entitlements'),
      supabase.from('community_reports').select('id,message_id,reason,created_at,community_messages(body,author_alias)').eq('status', 'open').order('created_at'),
    ]);
    if (departmentResult.error || channelResult.error || rosterResult.error || reportResult.error) {
      setProblem('Run supabase/community-admin.sql, then refresh this page.');
      return;
    }
    const nextDepartments = (departmentResult.data ?? []) as Department[];
    setDepartments(nextDepartments);
    setChannels((channelResult.data ?? []) as AdminChannel[]);
    setRoster((rosterResult.data ?? []) as Entitlement[]);
    setReports((reportResult.data ?? []) as unknown as Report[]);
    setSelectedDepartment((current) => current || nextDepartments[0]?.id || '');
    setProblem(null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const eligibleChannels = useMemo(() => channels.filter((channel) => channel.department_id === selectedDepartment && channel.active && channel.access_mode === 'members'), [channels, selectedDepartment]);
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
    else { setDepartmentName(''); await refresh(); onStructureChanged(); toast('Department created', 'success'); }
  }

  async function createChannel() {
    if (!supabase || !selectedDepartment || !channelName.trim()) return;
    setBusy(true);
    const name = channelName.trim();
    const { error } = await supabase.from('community_channels').insert({
      department_id: selectedDepartment, name, slug: slugify(name),
      channel_type: 'general', access_mode: channelAccess,
    });
    setBusy(false);
    if (error) toast(error.message.includes('duplicate') ? 'That channel already exists.' : 'Could not create the channel.', 'error');
    else { setChannelName(''); await refresh(); onStructureChanged(); toast('Channel created', 'success'); }
  }

  async function importRoster() {
    if (!supabase || !selectedDepartment) return;
    const parsed = parseRoster(pastedRoster);
    if (parsed.errors.length) { setProblem(parsed.errors.slice(0, 5).join(' · ')); return; }
    if (!parsed.rows.length) { setProblem('Paste at least one valid student email.'); return; }
    if (parsed.rows.length > 500) { setProblem('Import at most 500 students at a time.'); return; }
    setBusy(true);
    const rows = parsed.rows.map((row) => ({
      email: row.email, department_id: selectedDepartment,
      channel_id: selectedChannel || null,
      academic_year: row.academicYear || academicYear.trim() || null,
    }));
    const { data, error } = await supabase.rpc('admin_import_community_entitlements', { p_rows: rows });
    setBusy(false);
    if (error) { setProblem(error.message); return; }
    const result = data as { imported?: number; duplicates?: number } | null;
    setPastedRoster(''); setProblem(null); await refresh();
    toast(`Added ${result?.imported ?? 0}; skipped ${result?.duplicates ?? 0} duplicate(s).`, 'success');
  }

  async function remove(id: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc('admin_remove_community_entitlement', { p_id: id });
    if (error) toast('Could not remove the roster entry.', 'error');
    else { await refresh(); toast('Roster entry removed'); }
  }

  async function resolveReport(id: string, status: 'dismissed' | 'actioned') {
    if (!supabase) return;
    const { error } = await supabase.rpc('admin_resolve_community_report', { p_report_id: id, p_status: status, p_note: null });
    if (error) toast('Could not resolve the report.', 'error');
    else { await refresh(); toast(status === 'actioned' ? 'Report marked as actioned' : 'Report dismissed'); }
  }

  return <div className="community-admin">
    {problem && <Card className="community-alert"><strong>Action needed.</strong> {problem}</Card>}
    <div className="community-admin-grid">
      <Card><h2>1. Departments</h2><p className="muted">Create the main academic group.</p><Field label="Department name"><Input value={departmentName} placeholder="Faculty of Medicine" onChange={(event) => setDepartmentName(event.target.value)} /></Field><Button variant="primary" disabled={busy || slugify(departmentName).length < 2} onClick={() => void createDepartment()}>Create department</Button></Card>
      <Card><h2>2. Channels</h2><p className="muted">Create a discussion inside the selected department.</p><Field label="Department"><Select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}><option value="">Select…</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</Select></Field><Field label="Channel name"><Input value={channelName} placeholder="General discussion" onChange={(event) => setChannelName(event.target.value)} /></Field><Field label="Who can open it"><Select value={channelAccess} onChange={(event) => setChannelAccess(event.target.value as 'department' | 'members')}><option value="department">Everyone in the department</option><option value="members">Only students assigned to this channel</option></Select></Field><Button variant="primary" disabled={busy || !selectedDepartment || slugify(channelName).length < 2} onClick={() => void createChannel()}>Create channel</Button></Card>
    </div>
    <Card><h2>3. Import student roster</h2><p className="muted">Paste one university email per line. Optionally add a comma and year: <code>student@students.kasralainy.edu.eg,Year 3</code>.</p><div className="community-admin-grid"><Field label="Department"><Select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}><option value="">Select…</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</Select></Field><Field label="Restricted channel" hint="Optional; leave blank for department-wide access"><Select value={selectedChannel} onChange={(event) => setSelectedChannel(event.target.value)}><option value="">Department only</option>{eligibleChannels.map((channel) => <option value={channel.id} key={channel.id}>{channel.name}</option>)}</Select></Field><Field label="Default academic year" hint="Optional"><Input value={academicYear} placeholder="Year 3" onChange={(event) => setAcademicYear(event.target.value)} /></Field></div><Field label="Student emails"><Textarea className="community-roster-input" value={pastedRoster} placeholder={'student1@students.kasralainy.edu.eg\nstudent2@students.kasralainy.edu.eg,Year 2'} onChange={(event) => setPastedRoster(event.target.value)} /></Field><Button variant="primary" disabled={busy || !selectedDepartment || !pastedRoster.trim()} onClick={() => void importRoster()}>{busy ? 'Working…' : 'Import roster'}</Button></Card>
    <Card><div className="row spread"><div><h2>Roster</h2><p className="muted">Claimed means the student has signed in and received access.</p></div><span className="badge">{roster.length}</span></div><div className="community-roster">{roster.length === 0 ? <p className="muted">No students imported yet.</p> : roster.map((entry) => <div className="community-roster-row" key={entry.id}><div><strong>{entry.email}</strong><small>{entry.department_name}{entry.channel_name ? ` · #${entry.channel_name}` : ''}{entry.academic_year ? ` · ${entry.academic_year}` : ''}</small></div><span className={entry.claimed ? 'badge badge--success' : 'badge badge--warning'}>{entry.claimed ? 'Claimed' : 'Waiting'}</span><Button size="sm" variant="ghost" onClick={() => void remove(entry.id)}>Remove</Button></div>)}</div></Card>
    <Card><div className="row spread"><div><h2>Open reports</h2><p className="muted">Review reports, moderate the message in Discussions, then record the result here.</p></div><span className="badge badge--warning">{reports.length}</span></div><div className="community-roster">{reports.length === 0 ? <p className="muted">No open reports.</p> : reports.map((report) => <div className="community-report-row" key={report.id}><div><strong>{report.community_messages?.author_alias || 'Unknown student'}</strong><p>{report.community_messages?.body || 'Message unavailable'}</p><small>Reason: {report.reason}</small></div><div className="row wrap"><Button size="sm" onClick={() => void resolveReport(report.id, 'dismissed')}>Dismiss</Button><Button size="sm" variant="primary" onClick={() => void resolveReport(report.id, 'actioned')}>Mark actioned</Button></div></div>)}</div></Card>
    <Card><h2>Publish study knowledge</h2><p className="muted">Study guides, flashcards, MCQs and EMQs already use the validated publisher. It accepts a JSON file on Windows or pasted JSON on a tablet.</p><Link className="btn btn--primary" to="/settings#set-admin">Open content publisher</Link></Card>
  </div>;
}
