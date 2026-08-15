import { useState } from 'react';
import { useStore } from '../../state/useStore';
import { update, commit, uid } from '../../state/store';
import { Card, Button, Input, IconButton, EmptyState } from '../../design/primitives';
import { IconPlus, IconTrash, IconCheck, IconPlanner } from '../../design/icons';
import { useToast } from '../../design/Toast';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

  function addTask() {
    const t = task.trim();
    if (!t) return;
    update((s) => {
      s.tasks.unshift({ id: uid(), title: t, done: false, created: Date.now() });
    });
    setTask('');
    toast('Task added', 'success');
  }

  function toggleTask(id: string) {
    update((s) => {
      const t = s.tasks.find((x: any) => x.id === id);
      if (t) t.done = !t.done;
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
            <div className="planner-daylabel" key={d}>
              {d}
            </div>
          ))}
          {blocks.map((b) => (
            <FragmentRow key={b} block={b} days={DAYS} cellKey={cellKey} get={(k) => state.planner.cells[k] || ''} onChange={setCell} />
          ))}
        </div>
      </Card>

      <section className="section">
        <div className="section-head">
          <h2>Tasks</h2>
          <span className="see">{state.tasks.filter((t: any) => !t.done).length} open</span>
        </div>
        <Card>
          <div className="row" style={{ gap: 8 }}>
            <Input
              value={task}
              placeholder="Add a task…"
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
            />
            <Button variant="primary" onClick={addTask}>
              <IconPlus size={17} /> Add
            </Button>
          </div>

          {state.tasks.length === 0 ? (
            <EmptyState icon={<IconPlanner size={22} />} title="No tasks yet">
              Jot down what you need to get through this week.
            </EmptyState>
          ) : (
            <div className="list" style={{ marginTop: 14 }}>
              {state.tasks.map((t: any) => (
                <div className="list-row" key={t.id}>
                  <button
                    className="switch"
                    role="checkbox"
                    aria-checked={!!t.done}
                    aria-label={t.done ? 'Mark incomplete' : 'Mark complete'}
                    onClick={() => toggleTask(t.id)}
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
                  </div>
                  <IconButton label="Delete task" onClick={() => removeTask(t.id)}>
                    <IconTrash size={16} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </>
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
      {days.map((d) => (
        <div className="planner-cell" key={d}>
          <textarea
            aria-label={`${block} ${d}`}
            value={get(cellKey(block, d))}
            onChange={(e) => onChange(block, d, e.target.value)}
            placeholder="—"
          />
        </div>
      ))}
    </>
  );
}
