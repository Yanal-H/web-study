import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, useStoreVersion } from '../../state/useStore';
import { Card, Button, Stat, Segmented } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { IconFlashcards, IconUpload, IconDownload, IconPlus } from '../../design/icons';
import ActivityCalendar from '../dashboard/ActivityCalendar';
import { allCards, getChapter } from '../../content/loader';
import {
  collectItems,
  buildQueue,
  queueStats,
  buildDeckTree,
  itemsInDeck,
  type ReviewItem,
} from './deck';
import { engineQueue, mergeTrees, findNode } from './engineBridge';
import { deckTree as engineDeckTree, type EngineDeckNode } from '../../data/session';
import { whenContentReady } from '../../data/bootstrap';
import DeckBrowser from './DeckBrowser';
import ReviewSession from './ReviewSession';
import { exportTSV, isChapterPackJson, parseDelimited, importCards } from './anki';
import { makeUserCard } from './makeCard';

// Heavy, occasionally-used views load on demand (Phase 6 perf).
const OcclusionEditor = lazy(() => import('./OcclusionEditor').then((m) => ({ default: m.OcclusionEditor })));
const CardBrowser = lazy(() => import('./CardBrowser'));

type Mode = 'home' | 'review' | 'browse' | 'occlusion';

export default function FlashcardsView() {
  const state = useStore();
  const toast = useToast();
  // a deck path handed over from the reader ("Review these cards") preselects it
  const location = useLocation();
  const handoff = (location.state ?? null) as { deck?: string } | null;
  const queryChapter = new URLSearchParams(location.search).get('chapter');
  const queryChapterDeck = queryChapter
    ? (() => {
        const chapter = getChapter(queryChapter);
        return chapter?.deck || (chapter ? `${chapter.subject}::${chapter.title}` : '');
      })()
    : '';
  const presetDeck = handoff?.deck || queryChapterDeck;
  const [mode, setMode] = useState<Mode>('home');
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [scope, setScope] = useState<'all' | 'due'>('due');
  const [deck, setDeck] = useState(presetDeck);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const [engineTree, setEngineTree] = useState<EngineDeckNode[]>([]);
  const [engineStats, setEngineStats] = useState({ due: 0, neu: 0, total: 0 });
  const sv = useStoreVersion();

  // personal cards still live in the local store; content cards come from the engine
  const userItems = useMemo(
    () => collectItems().filter((i) => i.source === 'user'),
    [state.flashcards, state.schemaVersion, sv]
  );
  const userStats = useMemo(() => queueStats(userItems), [userItems, state.study.cardSched]);
  const contentCount = useMemo(() => allCards().length, [sv]);

  const refreshDecks = useCallback(async () => {
    await whenContentReady();
    const tree = await engineDeckTree();
    setEngineTree(tree);
    setEngineStats(
      tree.reduce(
        (a, n) => ({ due: a.due + n.due, neu: a.neu + n.neu, total: a.total + n.total }),
        { due: 0, neu: 0, total: 0 }
      )
    );
  }, []);

  useEffect(() => {
    if (mode === 'home') void refreshDecks();
  }, [mode, refreshDecks]);

  const tree = useMemo(
    () => mergeTrees(engineTree, buildDeckTree(userItems)),
    [engineTree, userItems, state.study.cardSched]
  );
  const stats = {
    due: engineStats.due + userStats.due,
    neu: engineStats.neu + userStats.neu,
    total: engineStats.total + userStats.total,
  };
  const scopedStats = deck ? scopeOf(tree, deck, userItems) : stats;

  async function start(path = deck, force?: 'all' | 'due') {
    const S = state.settings.scheduler;
    const how = force ?? scope;
    // engine cards in batches, personal cards from the local store
    const fromEngine = await engineQueue(path, {
      newLimit: how === 'due' ? S.newPerDay : 9999,
      reviewLimit: how === 'due' ? S.reviewsPerDay : 9999,
      includeAll: how === 'all',
    });
    const userPool = path ? itemsInDeck(userItems, path) : userItems;
    const fromUser =
      how === 'due'
        ? buildQueue(userPool, { newLimit: S.newPerDay, reviewLimit: S.reviewsPerDay })
        : [...userPool];
    const q = [...fromEngine, ...fromUser];
    if (q.length === 0) {
      toast(path ? 'Nothing due in that deck — switch to All.' : 'Nothing due — try “Study all”.');
      return;
    }
    setQueue(q);
    setMode('review');
  }

  async function studyDeck(path: string) {
    setDeck(path);
    const node = findNode(tree, path);
    await start(path, node && node.due + node.neu > 0 ? 'due' : 'all');
  }

  if (mode === 'review') {
    return (
      <div className="review-page">
        <ReviewSession queue={queue} onExit={() => setMode('home')} />
      </div>
    );
  }
  if (mode === 'browse')
    return (
      <Suspense fallback={<div className="route-fallback">Loading…</div>}>
        <CardBrowser onBack={() => setMode('home')} />
      </Suspense>
    );
  if (mode === 'occlusion') {
    return (
      <>
        <header className="page-head">
          <h1>Image occlusion</h1>
          <div className="sub">Draw boxes over a diagram — each region becomes a card.</div>
        </header>
        <Card>
          <Suspense fallback={<div className="route-fallback">Loading…</div>}>
            <OcclusionEditor onDone={() => setMode('home')} />
          </Suspense>
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

      <div className="cols">
        <Card>
          <div className="row spread" style={{ alignItems: 'baseline', marginBottom: 8 }}>
            <div className="card-eyebrow" style={{ margin: 0 }}>Review</div>
            {deck && (
              <button className="deck-clear" onClick={() => setDeck('')}>
                {deck.split('::').join(' › ')} ✕
              </button>
            )}
          </div>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'due', label: `Due (${scopedStats.due + scopedStats.neu})` },
              { value: 'all', label: `All (${scopedStats.total})` },
            ]}
            ariaLabel="Review scope"
          />
          <Button variant="primary" block style={{ marginTop: 14 }} onClick={() => void start()}>
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
            <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
              <IconUpload size={15} /> Import
            </Button>
            <ExportButton />
          </div>
        </Card>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Topics</h2>
          <span className="see">{tree.length} subjects</span>
        </div>
        <Card padSm>
          <DeckBrowser
            nodes={tree}
            path={deck}
            onPath={setDeck}
            onStudy={(p) => void studyDeck(p)}
          />
        </Card>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Review activity</h2>
        </div>
        <Card>
          <ActivityCalendar activity={state.activity} weeks={26} />
        </Card>
      </section>

      {creating && <CreateCardDialog onClose={() => setCreating(false)} deck={deck} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}

/** Counts for the selected deck: the merged tree already has them rolled up. */
function scopeOf(tree: any[], deck: string, _user: ReviewItem[]) {
  const node = findNode(tree, deck);
  return node
    ? { due: node.due, neu: node.neu, total: node.total }
    : { due: 0, neu: 0, total: 0 };
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

function CreateCardDialog({ onClose, deck: initialDeck }: { onClose: () => void; deck?: string }) {
  const toast = useToast();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [cloze, setCloze] = useState('');
  const [deck, setDeck] = useState(initialDeck || '');
  const [type, setType] = useState<'basic' | 'cloze'>('basic');
  const valid = type === 'cloze' ? /\{\{c\d+::/.test(cloze) : front.trim() && back.trim();

  function save() {
    const d = deck.trim() || undefined;
    makeUserCard(
      type === 'cloze' ? { type: 'cloze', cloze, deck: d } : { type: 'basic', front, back, deck: d }
    );
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
        <label className="field">
          <span className="field-label">
            Deck <span className="field-hint">Optional · use :: for sub-decks</span>
          </span>
          <input
            className="input"
            placeholder="Surgery::Wound Healing::Suture materials"
            value={deck}
            onChange={(e) => setDeck(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const chapterPack = useMemo(() => isChapterPackJson(text), [text]);
  const preview = useMemo(() => (chapterPack ? [] : parseDelimited(text)), [text, chapterPack]);

  function run() {
    if (chapterPack) {
      toast('This is a study-pack JSON. Publish it from Settings → Admin, not Flashcards → Import.', 'error');
      return;
    }
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
      title="Import cards (TSV/CSV only)"
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
        This importer is for card files only: columns are front, back, tags, type and optional deck.
        Cloze rows use <code>{'{{c1::…}}'}</code> in the front column. To add study text,
        sections and MCQs, use your administrator account in Settings → Admin → Publish a chapter.
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
      {chapterPack && (
        <div className="ai-err" style={{ marginTop: 8 }}>
          Study-pack JSON detected. Nothing will be imported here: open Settings → Admin and publish the pack there.
        </div>
      )}
    </Dialog>
  );
}
