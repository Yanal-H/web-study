import { useMemo, useState } from 'react';
import { useStore, useStoreVersion } from '../../state/useStore';
import { commit, update, uid } from '../../state/store';
import { Card, Button, Input, IconButton, Segmented, EmptyState } from '../../design/primitives';
import { IconPlus, IconTrash, IconNotes } from '../../design/icons';
import { useToast } from '../../design/Toast';
import { renderMarkdown, extractWikilinks } from '../../lib/markdown';

interface Note {
  id: string;
  title: string;
  body: string;
  updated: number;
}

/** Normalise the historical notes map (values may be strings or partial objects). */
function readNotes(raw: Record<string, any>): Note[] {
  const out: Note[] = [];
  for (const key in raw) {
    const v = raw[key];
    if (typeof v === 'string') out.push({ id: key, title: key, body: v, updated: 0 });
    else if (v && typeof v === 'object')
      out.push({
        id: v.id || key,
        title: v.title || v.name || key,
        body: v.body || v.content || v.text || '',
        updated: v.updated || 0,
      });
  }
  return out.sort((a, b) => b.updated - a.updated);
}

export default function NotesView() {
  const state = useStore();
  const toast = useToast();
  const v = useStoreVersion();
  // key on the store version, not state.notes — the object is mutated in place
  const notes = useMemo(() => readNotes(state.notes), [state.notes, v]);
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const active = notes.find((n) => n.id === activeId) ?? null;

  function writeNote(id: string, patch: Partial<Note>) {
    const existing = state.notes[id] || {};
    state.notes[id] = {
      id,
      title: patch.title ?? existing.title ?? 'Untitled',
      body: patch.body ?? existing.body ?? '',
      updated: Date.now(),
    };
    commit();
  }

  function newNote() {
    const id = uid();
    update((s) => {
      s.notes[id] = { id, title: 'Untitled note', body: '', updated: Date.now() };
    });
    setActiveId(id);
    setMode('edit');
  }

  function remove(id: string) {
    update((s) => {
      delete s.notes[id];
    });
    setActiveId((cur) => (cur === id ? null : cur));
    toast('Note deleted');
  }

  const backlinks = useMemo(() => {
    if (!active) return [];
    return notes.filter(
      (n) => n.id !== active.id && extractWikilinks(n.body).some((w) => w.toLowerCase() === active.title.toLowerCase())
    );
  }, [active, notes]);

  function openWikilink(target: string) {
    const found = notes.find((n) => n.title.toLowerCase() === target.toLowerCase());
    if (found) {
      setActiveId(found.id);
      setMode('preview');
    } else {
      const id = uid();
      update((s) => {
        s.notes[id] = { id, title: target, body: '', updated: Date.now() };
      });
      setActiveId(id);
      setMode('edit');
      toast(`Created “${target}”`, 'success');
    }
  }

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Notes</h1>
          <div className="sub">Markdown with [[wikilinks]], callouts and {'{{c1::cloze}}'}.</div>
        </div>
        <Button variant="primary" onClick={newNote}>
          <IconPlus size={17} /> New note
        </Button>
      </header>

      <div className="notes-layout">
        <div className="notes-list">
          {notes.length === 0 && (
            <div className="muted" style={{ padding: 12, fontSize: 13 }}>
              No notes yet.
            </div>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className={`note-item${n.id === activeId ? ' active' : ''}`}
              onClick={() => setActiveId(n.id)}
            >
              {n.title || 'Untitled'}
            </div>
          ))}
        </div>

        {active ? (
          <Card>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <Input
                value={active.title}
                aria-label="Note title"
                onChange={(e) => writeNote(active.id, { title: e.target.value })}
                style={{ fontWeight: 600, maxWidth: 360 }}
              />
              <div className="row" style={{ gap: 8 }}>
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'edit', label: 'Edit' },
                    { value: 'preview', label: 'Preview' },
                  ]}
                  ariaLabel="Editor mode"
                />
                <IconButton label="Delete note" onClick={() => remove(active.id)}>
                  <IconTrash size={16} />
                </IconButton>
              </div>
            </div>

            {mode === 'edit' ? (
              <div className="note-editor">
                <textarea
                  className="textarea note-textarea"
                  value={active.body}
                  aria-label="Note body"
                  placeholder={'# Heading\n\nWrite in **Markdown**. Link with [[Another note]].\n\n> [!note] Callouts work too.'}
                  onChange={(e) => writeNote(active.id, { body: e.target.value })}
                />
                <div className="note-count">
                  {(active.body.trim().match(/\S+/g) || []).length} words · {active.body.length} chars
                </div>
              </div>
            ) : (
              <div
                className="md"
                onClick={(e) => {
                  const el = e.target as HTMLElement;
                  const wl = el.getAttribute('data-wikilink');
                  if (wl) {
                    e.preventDefault();
                    openWikilink(wl);
                  }
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(active.body) }}
              />
            )}

            {backlinks.length > 0 && (
              <div className="backlinks">
                <strong>Linked from:</strong>{' '}
                {backlinks.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ', '}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveId(b.id);
                        setMode('preview');
                      }}
                    >
                      {b.title}
                    </a>
                  </span>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<IconNotes size={22} />}
              title="Select or create a note"
              action={
                <Button variant="primary" onClick={newNote}>
                  <IconPlus size={17} /> New note
                </Button>
              }
            >
              Notes support Markdown, wikilinks and cloze markup.
            </EmptyState>
          </Card>
        )}
      </div>
    </>
  );
}
