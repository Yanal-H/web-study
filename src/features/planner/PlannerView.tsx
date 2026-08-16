import { useMemo, useState } from 'react';
import { useStore, useStoreVersion } from '../../state/useStore';
import { update, commit, uid } from '../../state/store';
import { Card, Button, Input, IconButton, EmptyState } from '../../design/primitives';
import { IconPlus, IconTrash, IconCheck, IconPlanner } from '../../design/icons';
import { useToast } from '../../design/Toast';
import { parseTask, dueLabel, TYPE_META, type ParsedTask } from './parse';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TODAY = DAYS[(new Date().getDay() + 6) % 7];
const DAY_MS = 86_400_000;
const midnight = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export default function PlannerView() {
  const state = useStore();
  const toast = useToast();
  const [task, setTask] = useState('');
  const blocks: string[] = state.planner.blocks?.length
    ? state.planner.blocks
    : ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night'];

  const cellKey = (b: string, d: string) => `${b}|${d}`;

  function setCell(b: string, d: string, val: string) {
    state.planner.cells[cellKey(b, d)] = val;
    commit();
  }

  const preview: ParsedTask | null = task.trim() ? parseTask(task) : null;

  function addTask() {
    const t = task.trim();
    if (!t) return;
    const p = parseTask(t);
    update((s) => {
      s.tasks.unshift({
        id: uid(),
        title: p.title,
        done: false,
        created: Date.now(),
        type: p.type,
        due: p.due,
        priority: p.priority,
      });
    });
    setTask('');
    toast('Task added', 'success');
  }

  function toggleTask(id: string) {
    update((s) => {
      const t = s.tasks.find((x: any) => x.id === id);
      if (t) {
        t.done = !t.done;
        t.completedAt = t.done ? Date.now() : undefined;
      }
    });
  }

  function removeTask(id: string) {
    update((s) => {
      s.tasks = s.tasks.filter((x: any) => x.id !== id);
    });
  }

  return (
    <>
      <header className="page-head">
        <h1>Planner</h1>
        <div className="sub">Block out your week and keep a running task list.</div>
      </header>

      <Card padSm>
        <div
          className="planner-grid"
          style={{ gridTemplateColumns: `120px repeat(${DAYS.length}, minmax(120px, 1fr))` }}
        >
          <div className="planner-corner">Block</div>
          {DAYS.map((d) => (
            <div className={`planner-daylabel${d === TODAY ? ' today' : ''}`} key={d}>
              {d}
              {d === TODAY && <span className="today-dot" />}
            </div>
          ))}
          {blocks.map((b) => (
            <FragmentRow key={b} block={b} days={DAYS} cellKey={cellKey} get={(k) => state.planner.cells[k] || ''} onChange={setCell} />
          ))}
        </div>
      </Card>

      <TaskBoard
        task={task}
        setTask={setTask}
        preview={preview}
        addTask={addTask}
        toggleTask={toggleTask}
        removeTask={removeTask}
      />
    </>
  );
}

/** The task list, grouped into an agenda: overdue, today, this week, later, no date, done. */
function TaskBoard({
  task,
  setTask,
  preview,
  addTask,
  toggleTask,
  removeTask,
}: {
  task: string;
  setTask: (v: string) => void;
  preview: ParsedTask | null;
  addTask: () => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
}) {
  const state = useStore();
  const v = useStoreVersion();

  const groups = useMemo(() => {
    const today = midnight();
    const weekEnd = today + 7 * DAY_MS;
    const buckets: Record<string, any[]> = {
      Overdue: [], Today: [], 'This week': [], Later: [], 'No date': [], Done: [],
    };
    const open = state.tasks.filter((t: any) => !t.done);
    const rank = (t: any) => (t.priority || 0);
    open.sort((a: any, b: any) => rank(b) - rank(a) || (a.due ?? Infinity) - (b.due ?? Infinity));
    for (const t of open) {
      if (t.due == null) buckets['No date']!.push(t);
      else if (t.due < today) buckets['Overdue']!.push(t);
      else if (t.due === today) buckets['Today']!.push(t);
      else if (t.due < weekEnd) buckets['This week']!.push(t);
      else buckets['Later']!.push(t);
    }
    buckets['Done'] = state.tasks.filter((t: any) => t.done).slice(0, 12);
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tasks, v]);

  const openCount = state.tasks.filter((t: any) => !t.done).length;
  const overdue = groups['Overdue']!.length;

  return (
    <section className="section">
      <div className="section-head">
        <h2>Tasks</h2>
        <span className="see">
          {openCount} open{overdue ? ` · ${overdue} overdue` : ''}
        </span>
      </div>
      <Card>
        <div className="row" style={{ gap: 8 }}>
          <Input
            value={task}
            placeholder="Add a task — e.g. “drill upper limb tomorrow !!”"
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <Button variant="primary" onClick={addTask}>
            <IconPlus size={17} /> Add
          </Button>
        </div>

        {preview && (preview.due != null || preview.priority > 0 || preview.type !== 'task') && (
          <div className="task-preview">
            <span className="tp-title">{preview.title}</span>
            <span className={`task-type t-${preview.type}`} style={{ ['--h' as string]: TYPE_META[preview.type].hue }}>
              {TYPE_META[preview.type].label}
            </span>
            {preview.due != null && <span className="task-due">{dueLabel(preview.due)}</span>}
            {preview.priority > 0 && <span className={`task-pri p${preview.priority}`}>{preview.priority === 2 ? 'Urgent' : 'Important'}</span>}
          </div>
        )}

        {openCount === 0 && groups['Done']!.length === 0 ? (
          <EmptyState icon={<IconPlanner size={22} />} title="No tasks yet">
            Type naturally — a day (“friday”, “tomorrow”, “in 3 days”), a kind (“read”,
            “drill”, “mcqs”), and “!” for priority all get picked up.
          </EmptyState>
        ) : (
          <div style={{ marginTop: 14 }}>
            {Object.entries(groups).map(([label, items]) =>
              items.length === 0 ? null : (
                <div className="task-group" key={label}>
                  <div className={`task-group-head${label === 'Overdue' ? ' overdue' : ''}`}>
                    {label}
                    <span>{items.length}</span>
                  </div>
                  <div className="list">
                    {items.map((t: any) => (
                      <TaskRow key={t.id} t={t} onToggle={() => toggleTask(t.id)} onRemove={() => removeTask(t.id)} />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

function TaskRow({ t, onToggle, onRemove }: { t: any; onToggle: () => void; onRemove: () => void }) {
  const type = (t.type || 'task') as keyof typeof TYPE_META;
  const overdue = !t.done && t.due != null && t.due < midnight();
  return (
    <div className={`list-row task-row${t.priority ? ` pri-${t.priority}` : ''}`}>
      <button
        className="switch"
        role="checkbox"
        aria-checked={!!t.done}
        aria-label={t.done ? 'Mark incomplete' : 'Mark complete'}
        onClick={onToggle}
        style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center' }}
      >
        {t.done && <IconCheck size={15} style={{ color: '#fff' }} />}
      </button>
      <div className="lr-main">
        <div
          className="lr-title"
          style={{
            textDecoration: t.done ? 'line-through' : 'none',
            color: t.done ? 'var(--text-faint)' : 'var(--text)',
          }}
        >
          {t.title}
        </div>
        <div className="task-meta">
          {TYPE_META[type] && type !== 'task' && (
            <span className={`task-type t-${type}`} style={{ ['--h' as string]: TYPE_META[type].hue }}>
              {TYPE_META[type].label}
            </span>
          )}
          {t.due != null && <span className={`task-due${overdue ? ' overdue' : ''}`}>{dueLabel(t.due)}</span>}
        </div>
      </div>
      <IconButton label="Delete task" onClick={onRemove}>
        <IconTrash size={16} />
      </IconButton>
    </div>
  );
}

function FragmentRow({
  block,
  days,
  cellKey,
  get,
  onChange,
}: {
  block: string;
  days: string[];
  cellKey: (b: string, d: string) => string;
  get: (k: string) => string;
  onChange: (b: string, d: string, v: string) => void;
}) {
  return (
    <>
      <div className="planner-blocklabel">{block}</div>
      {days.map((d) => {
        const val = get(cellKey(block, d));
        return (
          <div className={`planner-cell${d === TODAY ? ' today' : ''}${val ? ' filled' : ''}`} key={d}>
            <textarea
              aria-label={`${block} ${d}`}
              value={val}
              onChange={(e) => onChange(block, d, e.target.value)}
              placeholder="—"
            />
          </div>
        );
      })}
    </>
  );
}
