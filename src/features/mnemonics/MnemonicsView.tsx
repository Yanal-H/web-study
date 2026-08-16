import { useMemo, useState } from 'react';
import { useStore, useStoreVersion } from '../../state/useStore';
import { update, uid } from '../../state/store';
import { Card, Button, Input, Textarea, Field } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { IconPlus, IconTrash, IconMnemonics } from '../../design/icons';
import { useToast } from '../../design/Toast';
import { listChapters } from '../../content/loader';
import { useUserContentVersion } from '../../content/userContent';

interface Mnem {
  id: string;
  title: string;
  text: string;
  source?: string; // chapter title, for the ones that ship with content
  ownable: boolean; // false = read-only, from a chapter
}

/** Every mnemonic from every loaded chapter, so the page is full on day one. */
function contentMnemonics(): Mnem[] {
  return listChapters().flatMap((ch) =>
    ch.mnemonics.map((m, i) => ({
      id: `content:${ch.id}:${i}`,
      title: m.cue,
      text: m.expansion,
      source: `${ch.subject} · ${ch.title}`,
      ownable: false,
    }))
  );
}

export default function MnemonicsView() {
  const state = useStore();
  const v = useStoreVersion();
  const uv = useUserContentVersion();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const list: Mnem[] = useMemo(() => {
    const mine: Mnem[] = (Array.isArray(state.mnemonics) ? state.mnemonics : []).map((m: any) => ({
      id: m.id,
      title: m.title || m.key || 'Mnemonic',
      text: m.text || m.body || '',
      ownable: true,
    }));
    const q = query.trim().toLowerCase();
    const all = [...mine, ...contentMnemonics()];
    return q
      ? all.filter((m) => `${m.title} ${m.text} ${m.source ?? ''}`.toLowerCase().includes(q))
      : all;
  }, [state.mnemonics, v, uv, query]);

  // group the content ones by subject for a book-like layout; mine sit up top
  const mine = list.filter((m) => m.ownable);
  const bySubject = useMemo(() => {
    const g = new Map<string, Mnem[]>();
    for (const m of list) {
      if (m.ownable) continue;
      const subj = m.source?.split(' · ')[0] || 'Other';
      (g.get(subj) || g.set(subj, []).get(subj)!).push(m);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

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
          <div className="sub">Every hook from your chapters, plus the ones you add.</div>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <IconPlus size={17} /> New mnemonic
        </Button>
      </header>

      <Input
        value={query}
        placeholder="Search mnemonics…"
        aria-label="Search mnemonics"
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 'var(--sp-4)', maxWidth: 360 }}
      />

      {mine.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Yours</h2>
          </div>
          <div className="mnem-grid">
            {mine.map((m) => (
              <MnemonicCard key={m.id} m={m} onRemove={() => remove(m.id)} />
            ))}
          </div>
        </section>
      )}

      {bySubject.map(([subject, items]) => (
        <section className="section" key={subject}>
          <div className="section-head">
            <h2>{subject}</h2>
            <span className="see">{items.length}</span>
          </div>
          <div className="mnem-grid">
            {items.map((m) => (
              <MnemonicCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      ))}

      {list.length === 0 && (
        <Card>
          <div className="es" style={{ textAlign: 'center', padding: 'var(--sp-6)' }}>
            <IconMnemonics size={22} />
            <p className="muted" style={{ marginTop: 8 }}>
              {query ? 'No mnemonics match that search.' : 'No mnemonics yet — add your first.'}
            </p>
          </div>
        </Card>
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

function MnemonicCard({ m, onRemove }: { m: Mnem; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`mnem-card${open ? ' open' : ''}`}
      onClick={() => setOpen((o) => !o)}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
    >
      <div className="mnem-cue">{m.title}</div>
      <div className="mnem-exp">{m.text}</div>
      <div className="mnem-foot">
        <span className="mnem-hint">{open ? 'Tap to hide' : 'Tap to reveal'}</span>
        {onRemove ? (
          <button
            className="btn btn--ghost btn--icon"
            aria-label="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <IconTrash size={15} />
          </button>
        ) : m.source ? (
          <span className="mnem-src">{m.source.split(' · ').slice(1).join(' · ')}</span>
        ) : null}
      </div>
    </div>
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
