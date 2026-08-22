import { useMemo, useState } from 'react';
import { useStore, useStoreVersion } from '../../state/useStore';
import { update } from '../../state/store';
import { allCards } from '../../content/loader';
import { Card, Button, Input, Segmented, Badge, IconButton, EmptyState, VirtualList } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { IconTrash, IconEdit, IconFlashcards } from '../../design/icons';

/**
 * Each row's own box height, plus the gap below it — together they must equal
 * the slot height VirtualList reserves per item, or its windowing math and the
 * actual rendered layout drift apart. See .list--virtual in features.css.
 */
const ROW_BOX_HEIGHT = 64;
const ROW_GAP = 8;
const ROW_HEIGHT = ROW_BOX_HEIGHT + ROW_GAP;

interface Row {
  key: string;
  source: 'content' | 'user';
  id: string;
  type: string;
  front: string;
  back: string;
  subject?: string;
}

export default function CardBrowser({ onBack }: { onBack: () => void }) {
  const state = useStore();
  const storeVersion = useStoreVersion();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine' | 'content'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    void storeVersion;
    const out: Row[] = [];
    for (const c of allCards()) {
      out.push({
        key: `content:${c.id}`,
        source: 'content',
        id: c.id || '',
        type: c.type,
        front: c.type === 'cloze' ? c.cloze || '' : c.front || '',
        back: c.back || '',
        subject: c.subject,
      });
    }
    for (const c of state.flashcards) {
      const anyC = c as any;
      out.push({
        key: `user:${c.id}`,
        source: 'user',
        id: c.id,
        type: anyC.type || 'basic',
        front: anyC.type === 'cloze' ? c.cloze || '' : c.front || '',
        back: c.back || '',
        subject: anyC.subject,
      });
    }
    return out;
  }, [state.flashcards, storeVersion]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'mine' && r.source !== 'user') return false;
      if (filter === 'content' && r.source !== 'content') return false;
      if (!needle) return true;
      return (r.front + ' ' + r.back).toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  function toggle(key: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function bulkDelete() {
    const ids = [...selected].filter((k) => k.startsWith('user:')).map((k) => k.slice(5));
    if (ids.length === 0) {
      toast('Only your own cards can be deleted.');
      return;
    }
    update((s) => {
      s.flashcards = s.flashcards.filter((c) => !ids.includes(c.id));
    });
    setSelected(new Set());
    toast(`Deleted ${ids.length} card${ids.length === 1 ? '' : 's'}`);
  }

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Browse cards</h1>
          <div className="sub">{rows.length} cards across the library and your deck.</div>
        </div>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </header>

      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <Input placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'content', label: 'Library' },
            { value: 'mine', label: 'Mine' },
          ]}
          ariaLabel="Filter"
        />
        {selected.size > 0 && (
          <Button variant="danger" size="sm" onClick={bulkDelete}>
            <IconTrash size={15} /> Delete {selected.size}
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={<IconFlashcards size={22} />} title="No cards match">
            Try a different search or filter.
          </EmptyState>
        </Card>
      ) : (
        // Windowed, not capped: a shared cohort library can hold thousands of
        // cards, and a card past a fixed cut-off used to be simply unreachable
        // in Browse. VirtualList renders only the rows near the viewport, so
        // the full list is always scrollable to and searchable, at any size.
        <VirtualList
          className="list--virtual"
          items={shown}
          itemHeight={ROW_HEIGHT}
          height={Math.min(shown.length * ROW_HEIGHT, 560)}
          renderItem={(r) => (
            <div className="list-row" key={r.key} style={{ height: ROW_BOX_HEIGHT, marginBottom: ROW_GAP, boxSizing: 'border-box' }}>
              {r.source === 'user' && (
                <input
                  type="checkbox"
                  checked={selected.has(r.key)}
                  onChange={() => toggle(r.key)}
                  aria-label="Select card"
                />
              )}
              <Badge tone={r.source === 'user' ? 'accent' : 'default'}>{r.type}</Badge>
              <div className="lr-main">
                <div className="lr-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.front}
                </div>
                <div className="lr-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.back}
                </div>
              </div>
              {r.source === 'user' && (
                <IconButton label="Edit card" onClick={() => setEditing(r)}>
                  <IconEdit size={15} />
                </IconButton>
              )}
            </div>
          )}
        />
      )}

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const toast = useToast();
  const [front, setFront] = useState(row.front);
  const [back, setBack] = useState(row.back);

  function save() {
    update((s) => {
      const card = s.flashcards.find((c) => c.id === row.id) as any;
      if (card) {
        if (card.type === 'cloze') card.cloze = front;
        else {
          card.front = front;
          card.back = back;
        }
      }
    });
    toast('Card updated', 'success');
    onClose();
  }

  return (
    <Dialog
      title="Edit card"
      onClose={onClose}
      footer={
        <div className="row spread">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <textarea className="textarea" value={front} onChange={(e) => setFront(e.target.value)} />
        {row.type !== 'cloze' && (
          <textarea className="textarea" value={back} onChange={(e) => setBack(e.target.value)} />
        )}
      </div>
    </Dialog>
  );
}
