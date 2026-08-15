import { useState } from 'react';
import { useStore } from '../../state/useStore';
import { update, uid } from '../../state/store';
import { Card, Button, Input, Textarea, Field, IconButton, EmptyState } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { IconPlus, IconTrash, IconMnemonics } from '../../design/icons';
import { useToast } from '../../design/Toast';

export default function MnemonicsView() {
  const state = useStore();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const list: any[] = Array.isArray(state.mnemonics) ? state.mnemonics : [];

  function remove(id: string) {
    update((s) => {
      s.mnemonics = s.mnemonics.filter((m: any) => m.id !== id);
    });
    toast('Mnemonic removed');
  }

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Mnemonics</h1>
          <div className="sub">Memory hooks worth keeping.</div>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <IconPlus size={17} /> New mnemonic
        </Button>
      </header>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconMnemonics size={22} />}
            title="No mnemonics yet"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                <IconPlus size={17} /> Add one
              </Button>
            }
          >
            Capture the hooks that make facts stick.
          </EmptyState>
        </Card>
      ) : (
        <div className="list">
          {list.map((m) => (
            <div className="list-row" key={m.id} style={{ alignItems: 'flex-start' }}>
              <div className="lr-main">
                <div className="lr-title">{m.title || m.key || 'Mnemonic'}</div>
                <div className="lr-sub" style={{ color: 'var(--text-dim)', fontSize: 13.5, marginTop: 4 }}>
                  {m.text || m.body}
                </div>
              </div>
              <IconButton label="Delete" onClick={() => remove(m.id)}>
                <IconTrash size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddMnemonic
          onClose={() => setAdding(false)}
          onSave={(title, text) => {
            update((s) => {
              s.mnemonics.unshift({ id: uid(), title, text });
            });
            toast('Mnemonic saved', 'success');
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

function AddMnemonic({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (title: string, text: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const valid = title.trim() && text.trim();
  return (
    <Dialog
      title="New mnemonic"
      onClose={onClose}
      footer={
        <div className="row spread">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => valid && onSave(title.trim(), text.trim())}>
            Save
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Title / trigger">
          <Input value={title} autoFocus placeholder="e.g. SOCRATES" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="What it stands for">
          <Textarea
            value={text}
            placeholder="Site, Onset, Character, Radiation, Associations, Timing, Exacerbating, Severity"
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
