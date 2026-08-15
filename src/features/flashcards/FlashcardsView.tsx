import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/useStore';
import { Card, Button, Stat, Segmented } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { IconFlashcards, IconUpload, IconDownload, IconPlus } from '../../design/icons';
import { heatmapWeeks, heatLevel } from '../../lib/stats';
import { allCards } from '../../content/loader';
import { useUserContentVersion } from '../../content/userContent';
import { collectItems, buildQueue, queueStats, type ReviewItem } from './deck';
import ReviewSession from './ReviewSession';
import { OcclusionEditor } from './Occlusion';
import CardBrowser from './CardBrowser';
import { exportTSV, parseDelimited, importCards } from './anki';
import { makeUserCard } from './makeCard';

type Mode = 'home' | 'review' | 'browse' | 'occlusion';

export default function FlashcardsView() {
  const state = useStore();
  const uv = useUserContentVersion();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('home');
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [scope, setScope] = useState<'all' | 'due'>('due');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const items = useMemo(() => collectItems(), [uv, state.flashcards, state.schemaVersion]);
  const stats = useMemo(() => queueStats(items), [items, state.study.cardSched]);
  const weeks = useMemo(() => heatmapWeeks(state.activity, 17), [state.activity]);
  const contentCount = useMemo(() => allCards().length, [uv]);

  function start() {
    const S = state.settings.scheduler;
    const q =
      scope === 'due'
        ? buildQueue(items, { newLimit: S.newPerDay, reviewLimit: S.reviewsPerDay })
        : // "study all" — everything, new + review, ignoring caps
          [...items];
    if (q.length === 0) {
      toast('Nothing due — try “Study all”.');
      return;
    }
    setQueue(q);
    setMode('review');
  }

  if (mode === 'review') {
    return (
      <div className="review-page">
        <ReviewSession queue={queue} onExit={() => setMode('home')} />
      </div>
    );
  }
  if (mode === 'browse') return <CardBrowser onBack={() => setMode('home')} />;
  if (mode === 'occlusion') {
    return (
      <>
        <header className="page-head">
          <h1>Image occlusion</h1>
          <div className="sub">Draw boxes over a diagram — each region becomes a card.</div>
        </header>
        <Card>
          <OcclusionEditor onDone={() => setMode('home')} />
        </Card>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>Flashcards</h1>
        <div className="sub">Spaced-repetition recall with SM-2+ scheduling.</div>
      </header>

      <div className="stat-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <Stat label="Due now" value={stats.due} />
        <Stat label="New" value={stats.neu} />
        <Stat label="In library" value={contentCount} />
        <Stat label="Your cards" value={state.flashcards.length} />
      </div>

      <div className="cols cols-2">
        <Card>
          <div className="card-eyebrow">Review</div>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'due', label: `Due (${stats.due + stats.neu})` },
              { value: 'all', label: `All (${stats.total})` },
            ]}
            ariaLabel="Review scope"
          />
          <Button variant="primary" block style={{ marginTop: 14 }} onClick={start}>
            <IconFlashcards size={18} /> Start review
          </Button>
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <Button size="sm" onClick={() => setCreating(true)}>
              <IconPlus size={15} /> New card
            </Button>
            <Button size="sm" onClick={() => setMode('occlusion')}>
              Image occlusion
            </Button>
            <Button size="sm" onClick={() => setMode('browse')}>
              Browse
            </Button>
          </div>
        </Card>

        <Card>
          <div className="card-eyebrow">Import / export (Anki TSV/CSV)</div>
          <p className="muted" style={{ fontSize: 13, marginTop: -2 }}>
            Round-trips front, back, tags and type.
          </p>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            <Button size="sm" onClick={() => setImporting(true)}>
              <IconUpload size={15} /> Import
            </Button>
            <ExportButton />
          </div>
        </Card>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Review activity</h2>
        </div>
        <Card>
          <div className="heatmap">
            {weeks.map((col, ci) => (
              <div className="heat-col" key={ci}>
                {col.map((cell) => (
                  <div key={cell.key} className={`heat-cell heat-${heatLevel(cell.count)}`} title={`${cell.key}: ${cell.count}`} />
                ))}
              </div>
            ))}
          </div>
        </Card>
      </section>

      {creating && <CreateCardDialog onClose={() => setCreating(false)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}

function ExportButton() {
  const state = useStore();
  const toast = useToast();
  function run() {
    if (state.flashcards.length === 0) {
      toast('No personal cards to export.');
      return;
    }
    const tsv = exportTSV(state.flashcards);
    const blob = new Blob([tsv], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foundation-cards-${new Date().toISOString().slice(0, 10)}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Cards exported', 'success');
  }
  return (
    <Button size="sm" onClick={run}>
      <IconDownload size={15} /> Export
    </Button>
  );
}

function CreateCardDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [cloze, setCloze] = useState('');
  const [type, setType] = useState<'basic' | 'cloze'>('basic');
  const valid = type === 'cloze' ? /\{\{c\d+::/.test(cloze) : front.trim() && back.trim();

  function save() {
    makeUserCard(type === 'cloze' ? { type: 'cloze', cloze } : { type: 'basic', front, back });
    toast('Card added', 'success');
    onClose();
  }

  return (
    <Dialog
      title="New card"
      onClose={onClose}
      footer={
        <div className="row spread">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>Add card</Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'basic', label: 'Basic' },
            { value: 'cloze', label: 'Cloze' },
          ]}
          ariaLabel="Card type"
        />
        {type === 'basic' ? (
          <>
            <textarea className="textarea" placeholder="Front" value={front} onChange={(e) => setFront(e.target.value)} />
            <textarea className="textarea" placeholder="Back" value={back} onChange={(e) => setBack(e.target.value)} />
          </>
        ) : (
          <textarea
            className="textarea"
            placeholder="Wound contraction is driven by {{c1::myofibroblasts}}."
            value={cloze}
            onChange={(e) => setCloze(e.target.value)}
          />
        )}
      </div>
    </Dialog>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => parseDelimited(text), [text]);

  function run() {
    if (preview.length === 0) {
      toast('Nothing to import.');
      return;
    }
    const n = importCards(preview);
    toast(`Imported ${n} card${n === 1 ? '' : 's'}`, 'success');
    onClose();
  }

  return (
    <Dialog
      title="Import cards (TSV/CSV)"
      onClose={onClose}
      footer={
        <div className="row spread">
          <button className="btn btn--ghost" style={{ cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
            <IconUpload size={16} /> Choose file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".tsv,.csv,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                const r = new FileReader();
                r.onload = () => setText(String(r.result));
                r.readAsText(f);
              }
              e.target.value = '';
            }}
          />
          <Button variant="primary" disabled={preview.length === 0} onClick={run}>
            Import {preview.length || ''}
          </Button>
        </div>
      }
    >
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Columns: front, back, tags, type. Cloze rows use <code>{'{{c1::…}}'}</code> in the front column.
      </p>
      <textarea
        className="textarea"
        style={{ minHeight: 180, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
        placeholder={'front\tback\ttags\ttype\nWhat is X?\tThe answer\tsurgery\tbasic'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {preview.length > 0 && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          {preview.length} card{preview.length === 1 ? '' : 's'} detected.
        </div>
      )}
    </Dialog>
  );
}
