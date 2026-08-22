import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, useStoreVersion } from '../../state/useStore';
import { todayStr } from '../../state/store';
import { Card, Button, Stat, Segmented } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { IconFlashcards, IconUpload, IconPlus } from '../../design/icons';
import ActivityCalendar from '../dashboard/ActivityCalendar';
import { allCards } from '../../content/loader';
import { catalogCardCount, getCatalogChapter } from '../../content/catalog';
import {
  collectItems,
  buildQueue,
  queueStats,
  buildDeckTree,
  itemsInDeck,
  type ReviewItem,
  intakeOf,
} from './deck';
import { remainingToday, budgetAfter, budgetSpent, servable } from './dailyLimits';
import { engineQueue, mergeTrees, findNode } from './engineBridge';
import { MAX_STUDY_ALL_CARDS, deckTree as engineDeckTree, type EngineDeckNode } from '../../data/session';
import { whenContentReady } from '../../data/bootstrap';
import { ensureContentKind, ensureDeckContent, whenPublishedContentReady } from '../../data/remoteContent';
import DeckBrowser from './DeckBrowser';
import ReviewSession from './ReviewSession';
import { isChapterPackJson, parseDelimited, importCards } from './anki';
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
        const chapter = getCatalogChapter(queryChapter);
        return chapter?.deck || '';
      })()
    : '';
  const presetDeck = handoff?.deck || queryChapterDeck;
  const [mode, setMode] = useState<Mode>('home');
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [scope, setScope] = useState<'all' | 'due'>('due');
  const [deck, setDeck] = useState(presetDeck);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [starting, setStarting] = useState(false);

  const [engineTree, setEngineTree] = useState<EngineDeckNode[]>([]);
  const [engineStats, setEngineStats] = useState({ due: 0, neu: 0, total: 0 });
  const sv = useStoreVersion();

  // personal cards still live in the local store; content cards come from the engine
  const userItems = useMemo(
    () => {
      void state.flashcards;
      void state.schemaVersion;
      void sv;
      return collectItems().filter((i) => i.source === 'user');
    },
    [state.flashcards, state.schemaVersion, sv]
  );
  const userStats = useMemo(() => queueStats(userItems), [userItems]);
  const contentCount = useMemo(() => {
    void sv;
    return catalogCardCount() || allCards().length;
  }, [sv]);

  const refreshDecks = useCallback(async () => {
    await whenContentReady();
    await whenPublishedContentReady();
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
  }, [mode, refreshDecks, sv]);

  const tree = useMemo(
    () => mergeTrees(engineTree, buildDeckTree(userItems)),
    [engineTree, userItems]
  );
  const stats = {
    due: engineStats.due + userStats.due,
    neu: engineStats.neu + userStats.neu,
    total: engineStats.total + userStats.total,
  };
  const scopedStats = deck ? scopeOf(tree, deck, userItems) : stats;

  async function start(path = deck, force?: 'all' | 'due') {
    if (starting) return;
    setStarting(true);
    try {
      // The downloaded pack must be in THIS page's memory before scheduling rows
      // are turned into review cards. This prevents “540 due, but no cards”.
      await whenPublishedContentReady();
      const load = await ensureDeckContent(path);
      if (load.failed.length) throw new Error('card bodies unavailable');
      const S = state.settings.scheduler;
      const how = force ?? scope;
      // The daily limits are per DAY, not per session: spend what is LEFT of
      // today rather than handing out a fresh allowance every time Start is
      // pressed, and let the two card pools share one budget instead of each
      // taking the full limit. "Study all" deliberately ignores the cap — the
      // student asked for everything.
      const budget = remainingToday(state.study.daily, S, todayStr());
      if (how === 'due' && budgetSpent(budget)) {
        toast('That’s your daily limit — come back tomorrow, or use “All” to keep going.');
        return;
      }
      const fromEngine = await engineQueue(path, {
        newLimit: how === 'due' ? budget.newLeft : 9999,
        reviewLimit: how === 'due' ? budget.reviewLeft : 9999,
        includeAll: how === 'all',
        allLimit: how === 'all' ? MAX_STUDY_ALL_CARDS : undefined,
      });
      const userPool = path ? itemsInDeck(userItems, path) : userItems;
      const left = budgetAfter(budget, intakeOf(fromEngine));
      const fromUser = how === 'due'
        ? buildQueue(userPool, { newLimit: left.newLeft, reviewLimit: left.reviewLeft })
        : userPool.slice(0, Math.max(0, MAX_STUDY_ALL_CARDS - fromEngine.length));
      const q = [...fromEngine, ...fromUser];
      if (q.length === 0) {
        toast(how === 'all'
          ? 'No reviewable cards are loaded. Refresh the app; if this continues, ask the administrator to rebuild the content library.'
          : path ? 'Nothing is due in that topic. Choose All to study it anyway.' : 'Nothing is due. Choose All to study every card.');
        return;
      }
      setQueue(q);
      setMode('review');
    } catch {
      toast('Could not open the cards. Check your connection and refresh; if this continues, ask the administrator.', 'error');
    } finally {
      setStarting(false);
    }
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
              // What a session would really serve, not the whole backlog: with a
              // daily cap the backlog is a promise the session does not keep.
              {
                value: 'due',
                label: `Due (${servable(scopedStats, remainingToday(state.study.daily, state.settings.scheduler, todayStr()))})`,
              },
              { value: 'all', label: `All (${scopedStats.total}${scopedStats.total > MAX_STUDY_ALL_CARDS ? ` · first ${MAX_STUDY_ALL_CARDS}` : ''})` },
            ]}
            ariaLabel="Review scope"
          />
          <Button variant="primary" block style={{ marginTop: 14 }} disabled={starting} onClick={() => void start()}>
            <IconFlashcards size={18} /> {starting ? 'Loading cards…' : 'Start review'}
          </Button>
          <DailyAllowance />
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <Button size="sm" onClick={() => setCreating(true)}>
              <IconPlus size={15} /> New card
            </Button>
            <Button size="sm" onClick={() => setMode('occlusion')}>
              Image occlusion
            </Button>
            <Button size="sm" onClick={() => void ensureContentKind('cards').then(() => setMode('browse'))}>
              Browse
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
              <IconUpload size={15} /> Import
            </Button>
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
      toast('This is a shared study pack, not a personal card file. Ask an administrator to publish it.', 'error');
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
        sections and questions, publish the complete pack from the Admin page.
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
          Shared study pack detected. Nothing will be imported into personal cards; an administrator can publish it from Admin.
        </div>
      )}
    </Dialog>
  );
}

/**
 * Today's remaining allowance, in one line under the Start button.
 *
 * Without this the daily cap is invisible: a student who has used it up presses
 * Start, is told "nothing due", and concludes the app is broken.
 */
function DailyAllowance() {
  const state = useStore();
  const S = state.settings.scheduler;
  const budget = remainingToday(state.study.daily, S, todayStr());
  if (!(S.newPerDay > 0 || S.reviewsPerDay > 0)) return null;

  if (budgetSpent(budget)) {
    return (
      <div className="daily-allowance is-spent">
        Daily limit reached — a fresh {S.newPerDay} new and {S.reviewsPerDay} reviews tomorrow. Use
        <strong> All</strong> to keep going now.
      </div>
    );
  }
  return (
    <div className="daily-allowance">
      Left today: <strong>{budget.newLeft}</strong> new · <strong>{budget.reviewLeft}</strong> reviews
    </div>
  );
}
