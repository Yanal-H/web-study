import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input, Textarea } from '../../design/primitives';
import { useToast } from '../../design/Toast';
import { IconResources } from '../../design/icons';
import { listDailyLogs, saveDailyLog, digestText, groupForDigest, todayLocal, type DailyLog } from './dailyLog';

/**
 * What the year covered today — filed, not chatted.
 *
 * A day's learning scattered through hundreds of chat messages cannot be turned
 * into study material, which is the whole reason this is separate from the
 * discussion tab. One structured entry per lecture, and the administrator can
 * read a whole day back and build from it.
 */
export default function DailyLogPanel({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [day, setDay] = useState(() => todayLocal());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [lecturer, setLecturer] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async (which: string) => {
    setLoading(true);
    const res = await listDailyLogs(which);
    setLogs(res.logs);
    setProblem(res.ok ? null : (res.message ?? 'Could not load the logs.'));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(day);
  }, [day, load]);

  async function submit() {
    if (saving) return;
    setSaving(true);
    // The alias and year are stamped by the database; what is sent here is a
    // placeholder the trigger overwrites, so a browser cannot post as someone else.
    const res = await saveDailyLog({ subject, topic, lecturer, body, logDate: day }, 'Student-pending', null);
    setSaving(false);
    toast(res.message, res.ok ? 'success' : 'error');
    if (res.ok) {
      setTopic('');
      setLecturer('');
      setBody('');
      await load(day);
    }
  }

  async function copyDigest() {
    const text = digestText(day, logs);
    try {
      await navigator.clipboard.writeText(text);
      toast('Digest copied — paste it straight into the chapter prompt.', 'success');
    } catch {
      toast('Could not reach the clipboard. Select the text below and copy it.', 'error');
    }
  }

  const groups = groupForDigest(logs);

  return (
    <div className="daily-logs">
      {problem && (
        <Card className="community-alert">
          <strong>Daily logs unavailable.</strong> {problem}
        </Card>
      )}

      <Card>
        <div className="row spread" style={{ alignItems: 'baseline', marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Log a lecture</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              What you actually covered. This is what tomorrow’s cards and chapters get built from.
            </p>
          </div>
          <label className="muted" style={{ fontSize: 12.5 }}>
            Day{' '}
            <Input type="date" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} />
          </label>
        </div>
        <div className="daily-log-form">
          <Input placeholder="Subject — e.g. Surgery" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Input placeholder="Topic — e.g. Wound healing" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Input placeholder="Lecturer (optional)" value={lecturer} onChange={(e) => setLecturer(e.target.value)} />
        </div>
        <Textarea
          style={{ marginTop: 10, minHeight: 110 }}
          placeholder="The points that mattered — classifications, mechanisms, anything the lecturer stressed or said would be examined."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row spread" style={{ marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Your year sees this under your alias.</span>
          <Button variant="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'File this lecture'}
          </Button>
        </div>
      </Card>

      <div className="row spread" style={{ alignItems: 'baseline', margin: '18px 0 8px' }}>
        <h2 style={{ margin: 0 }}>
          {day === todayLocal() ? 'Today' : day} · {logs.length} entr{logs.length === 1 ? 'y' : 'ies'}
        </h2>
        {isAdmin && logs.length > 0 && (
          <Button onClick={() => void copyDigest()} title="Copy the whole day as one block, ready to paste">
            Copy the day for authoring
          </Button>
        )}
      </div>

      {loading ? (
        <Card>Loading…</Card>
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState icon={<IconResources size={22} />} title="Nothing filed for this day yet">
            Be the first — a few lines is enough, and it saves everyone else re-typing the lecture.
          </EmptyState>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.subject} style={{ marginBottom: 12 }}>
            <div className="card-eyebrow">{group.subject}</div>
            {group.topics.map((t) => (
              <div key={t.topic} className="daily-log-topic">
                <h3>
                  {t.topic}
                  {t.lecturer && <span className="muted"> — {t.lecturer}</span>}
                </h3>
                {t.entries.map((e) => (
                  <div className="daily-log-entry" key={e.id}>
                    <strong>{e.author_alias}</strong>
                    <p>{e.body}</p>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}
