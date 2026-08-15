import { useState } from 'react';
import { useStore } from '../../state/useStore';
import { update, uid } from '../../state/store';
import { COLORS } from '../../state/constants';
import { Button, IconButton, Card, Field, Input, EmptyState } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { IconPlus, IconEdit, IconTrash, IconSubjects } from '../../design/icons';
import type { Subject } from '../../state/types';

export default function SubjectsView() {
  const state = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);

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
          {state.subjects.map((sub) => (
            <div className="subject-card" key={sub.id}>
              <div className="sc-bar" style={{ background: sub.color }} />
              <div className="row spread" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <h3>{sub.name}</h3>
                  <div className="sc-meta">
                    {(sub.topics?.length ?? 0)} topic{(sub.topics?.length ?? 0) === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="lr-actions">
                  <IconButton label="Edit subject" onClick={() => setEditing(sub)}>
                    <IconEdit size={16} />
                  </IconButton>
                  <IconButton label="Delete subject" onClick={() => remove(sub.id)}>
                    <IconTrash size={16} />
                  </IconButton>
                </div>
              </div>
            </div>
          ))}
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
