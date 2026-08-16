import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/useStore';
import { update, uid } from '../../state/store';
import { COLORS } from '../../state/constants';
import { Button, IconButton, Card, Field, Input, EmptyState } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { IconPlus, IconEdit, IconTrash, IconSubjects, IconChevron } from '../../design/icons';
import { allCards, allMcqs } from '../../content/loader';
import { useUserContentVersion } from '../../content/userContent';
import type { Subject } from '../../state/types';

export default function SubjectsView() {
  const state = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const uv = useUserContentVersion();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);

  // content available per subject (cards + questions) — powers each card's stats
  const bySubject = useMemo(() => {
    const m = new Map<string, { cards: number; mcqs: number }>();
    for (const c of allCards()) {
      const e = m.get(c.subject) || { cards: 0, mcqs: 0 };
      e.cards++;
      m.set(c.subject, e);
    }
    for (const q of allMcqs()) {
      const e = m.get(q.subject) || { cards: 0, mcqs: 0 };
      e.mcqs++;
      m.set(q.subject, e);
    }
    return m;
  }, [uv]);

  function remove(id: string) {
    update((s) => {
      s.subjects = s.subjects.filter((x) => x.id !== id);
    });
    toast('Subject removed');
  }

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Subjects</h1>
          <div className="sub">Organise your curriculum into subjects and topics.</div>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <IconPlus size={17} /> New subject
        </Button>
      </header>

      {state.subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconSubjects size={22} />}
            title="No subjects yet"
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <IconPlus size={17} /> Add your first subject
              </Button>
            }
          >
            Add a subject to start grouping cards, questions and notes.
          </EmptyState>
        </Card>
      ) : (
        <div className="subject-grid">
          {state.subjects.map((sub) => {
            const stats = bySubject.get(sub.name) || { cards: 0, mcqs: 0 };
            const hasContent = stats.cards > 0 || stats.mcqs > 0;
            return (
              <div
                className={`subject-card sc-live${hasContent ? ' sc-clickable' : ''}`}
                key={sub.id}
                style={{ ['--sc-color' as string]: sub.color }}
                onClick={() => hasContent && navigate('/study')}
              >
                <div className="sc-bar" style={{ background: sub.color }} />
                <div className="sc-glow" />
                <div className="row spread" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3>{sub.name}</h3>
                    <div className="sc-meta">
                      {(sub.topics?.length ?? 0)} topic{(sub.topics?.length ?? 0) === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="lr-actions" onClick={(e) => e.stopPropagation()}>
                    <IconButton label="Edit subject" onClick={() => setEditing(sub)}>
                      <IconEdit size={16} />
                    </IconButton>
                    <IconButton label="Delete subject" onClick={() => remove(sub.id)}>
                      <IconTrash size={16} />
                    </IconButton>
                  </div>
                </div>
                <div className="sc-foot">
                  {hasContent ? (
                    <>
                      <span className="sc-chip" style={{ color: sub.color }}>
                        {stats.cards} cards
                      </span>
                      <span className="sc-chip" style={{ color: sub.color }}>
                        {stats.mcqs} questions
                      </span>
                      <span className="sc-open">
                        Open <IconChevron size={13} />
                      </span>
                    </>
                  ) : (
                    <span className="sc-meta">No content yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <SubjectDialog
          subject={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(name, color) => {
            if (editing) {
              update((s) => {
                const t = s.subjects.find((x) => x.id === editing.id);
                if (t) {
                  t.name = name;
                  t.color = color;
                }
              });
              toast('Subject updated');
            } else {
              update((s) => {
                s.subjects.push({ id: uid(), name, color, topics: [] });
              });
              toast('Subject added', 'success');
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function SubjectDialog({
  subject,
  onClose,
  onSave,
}: {
  subject: Subject | null;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
}) {
  const [name, setName] = useState(subject?.name ?? '');
  const [color, setColor] = useState(subject?.color ?? COLORS[0]!);
  const valid = name.trim().length > 0;

  return (
    <Dialog
      title={subject ? 'Edit subject' : 'New subject'}
      onClose={onClose}
      footer={
        <div className="row spread">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => valid && onSave(name.trim(), color)}>
            {subject ? 'Save' : 'Add subject'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <Field label="Name">
          <Input
            value={name}
            autoFocus
            placeholder="e.g. Surgery"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) onSave(name.trim(), color);
            }}
          />
        </Field>
        <Field label="Colour">
          <div className="row wrap" style={{ gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: c,
                  border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
