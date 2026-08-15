import { useState } from 'react';
import { useStore } from '../../state/useStore';
import { update, uid } from '../../state/store';
import { Card, Button, Input, Field, IconButton, EmptyState } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { IconPlus, IconTrash, IconResources } from '../../design/icons';
import { useToast } from '../../design/Toast';

export default function ResourcesView() {
  const state = useStore();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const list: any[] = Array.isArray(state.resources) ? state.resources : [];

  function remove(id: string) {
    update((s) => {
      s.resources = s.resources.filter((r: any) => r.id !== id);
    });
    toast('Resource removed');
  }

  function safeHost(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Resources</h1>
          <div className="sub">Reference links and material.</div>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <IconPlus size={17} /> New resource
        </Button>
      </header>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconResources size={22} />}
            title="No resources yet"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                <IconPlus size={17} /> Add a link
              </Button>
            }
          >
            Keep your go-to references in one place.
          </EmptyState>
        </Card>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div className="list-row" key={r.id}>
              <div className="lr-main">
                <div className="lr-title">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.title || r.name || safeHost(r.url)}
                    </a>
                  ) : (
                    r.title || r.name || 'Resource'
                  )}
                </div>
                {r.url && <div className="lr-sub">{safeHost(r.url)}</div>}
                {r.note && <div className="lr-sub">{r.note}</div>}
              </div>
              <IconButton label="Delete" onClick={() => remove(r.id)}>
                <IconTrash size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddResource
          onClose={() => setAdding(false)}
          onSave={(title, url, note) => {
            update((s) => {
              s.resources.unshift({ id: uid(), title, url, note });
            });
            toast('Resource saved', 'success');
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

function AddResource({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (title: string, url: string, note: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const valid = title.trim().length > 0;
  return (
    <Dialog
      title="New resource"
      onClose={onClose}
      footer={
        <div className="row spread">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => valid && onSave(title.trim(), url.trim(), note.trim())}>
            Save
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Title">
          <Input value={title} autoFocus placeholder="e.g. Wound healing overview" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="URL" hint="Optional">
          <Input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="Note" hint="Optional">
          <Input value={note} placeholder="Why it matters" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
