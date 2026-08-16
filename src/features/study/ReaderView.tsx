import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getChapter, chapterCards, chapterMcqs, listChapters } from '../../content/loader';
import { useUserContentVersion } from '../../content/userContent';
import { useStore } from '../../state/useStore';
import { chapterProgress } from './progress';
import { update } from '../../state/store';
import { Card, Button, Badge, Tabs, ProgressRing } from '../../design/primitives';
import { IconChevron, IconFlashcards, IconQbank, IconCheck } from '../../design/icons';
import { renderMarkdown } from '../../lib/markdown';
import { renderRich, renderInline, KIND_LABEL, type LexIndex, type TermKind } from '../../lib/lexicon';
import { useLexicon } from '../../lib/useLexicon';
import type { Figure, Table as TableT, GlossaryEntry } from '../../content/schema';

type Tab = 'read' | 'cards' | 'questions';

/** A live chapter-mastery ring: sections read blended with question accuracy. */
function MasteryRing({ chapter }: { chapter: NonNullable<ReturnType<typeof getChapter>> }) {
  useStore(); // re-render as reading/answering progresses
  const p = chapterProgress(chapter);
  const mastery = p.mcqAccuracy == null ? p.readPct : p.readPct * 0.5 + p.mcqAccuracy * 0.5;
  return (
    <div className="mastery-ring no-print" title="Chapter mastery: reading blended with question accuracy">
      <ProgressRing value={mastery} size={72} label={`${Math.round(mastery * 100)}%`} />
      <div className="mastery-meta">
        <div>{p.sectionsRead}/{p.sectionsTotal} read</div>
        {p.mcqAccuracy != null && <div>{Math.round(p.mcqAccuracy * 100)}% on {p.mcqAttempted} Q</div>}
      </div>
    </div>
  );
}

/** Resolve a [[wikilink]] target to a chapter route (matches chapter or section title). */
function resolveWikilink(target: string): string | null {
  const t = target.trim().toLowerCase();
  for (const ch of listChapters()) {
    if (ch.title.toLowerCase() === t) return `/study/${encodeURIComponent(ch.id)}`;
    for (const s of ch.sections) {
      if (s.title.toLowerCase() === t) return `/study/${encodeURIComponent(ch.id)}`;
    }
  }
  return null;
}

export default function ReaderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const uv = useUserContentVersion();
  const chapter = useMemo(() => (id ? getChapter(decodeURIComponent(id)) : undefined), [id, uv]);
  const [tab, setTab] = useState<Tab>('read');
  const [focus, setFocus] = useState(false);
  const [progress, setProgress] = useState(0);

  // reading progress from window scroll, and remember where you left off per chapter
  useEffect(() => {
    if (tab !== 'read' || !id) return;
    const key = `foundation_read_pos_${id}`;
    let raf = 0;
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(key, String(h.scrollTop));
        } catch {
          /* storage full or unavailable — position is a nicety, not critical */
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // restore the saved position after layout settles
    const saved = Number(sessionStorage.getItem(key) || 0);
    if (saved > 0) {
      const restore = setTimeout(() => window.scrollTo({ top: saved }), 60);
      return () => {
        clearTimeout(restore);
        cancelAnimationFrame(raf);
        window.removeEventListener('scroll', onScroll);
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [tab, id]);

  if (!chapter) {
    return (
      <>
        <header className="page-head">
          <h1>Chapter not found</h1>
          <div className="sub">It may have been removed.</div>
        </header>
        <Card>
          <Button onClick={() => navigate('/study')}>Back to library</Button>
        </Card>
      </>
    );
  }

  const cards = chapterCards(chapter);
  const mcqs = chapterMcqs(chapter);

  return (
    <div className={focus ? 'reader-focus' : ''}>
      {tab === 'read' && <div className="reading-progress" style={{ width: `${progress * 100}%` }} />}
      <div className="row spread no-print" style={{ marginBottom: 12 }}>
        <button className="btn btn--ghost btn--sm" style={{ paddingLeft: 6 }} onClick={() => navigate('/study')}>
          <IconChevron size={15} style={{ transform: 'rotate(180deg)' }} /> Library
        </button>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={() => setFocus((f) => !f)}>
            {focus ? 'Show contents' : 'Focus mode'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <header className="page-head row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="card-eyebrow">
            {chapter.subject}
            {chapter.origin === 'personal' ? ' · Imported' : ''}
            {chapter.estMinutes ? ` · ${chapter.estMinutes} min read` : ''}
          </div>
          <h1>{chapter.title}</h1>
          {chapter.source?.book && (
            <div className="sub">
              {chapter.source.book}
              {chapter.source.pages ? ` · pp. ${chapter.source.pages}` : ''}
            </div>
          )}
        </div>
        <MasteryRing chapter={chapter} />
      </header>

      <div style={{ marginBottom: 'var(--sp-4)' }} className="no-print">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'read', label: 'Read' },
            { value: 'cards', label: `Cards · ${cards.length}` },
            { value: 'questions', label: `Questions · ${mcqs.length}` },
          ]}
        />
      </div>

      {tab === 'read' && <ReadTab chapter={chapter} onNavigate={navigate} />}
      {tab === 'cards' && <CardsTab cards={cards} chapterId={chapter.id} onNavigate={navigate} />}
      {tab === 'questions' && <QuestionsTab mcqs={mcqs} chapterId={chapter.id} onNavigate={navigate} />}
    </div>
  );
}

function ReadTab({
  chapter,
  onNavigate,
}: {
  chapter: ReturnType<typeof getChapter> & object;
  onNavigate: (to: string) => void;
}) {
  const ch = chapter!;
  const state = useStore();
  const prog = state.study.progress[ch.id] || {};
  const readSections: Record<string, boolean> = prog.sections || {};
  const [activeSec, setActiveSec] = useState<string>(ch.sections[0]?.id ?? '');
  const lex = useLexicon(ch.glossary);
  // which concept classes actually occur in this chapter — drives the colour key
  const usedKinds = useMemo(() => {
    const html = ch.sections.map((s) => renderRich(s.digest, lex)).join('');
    const found = new Set<TermKind>();
    for (const m of html.matchAll(/class="t t-([a-z]+)"/g)) found.add(m[1] as TermKind);
    return [...found];
  }, [ch.id, lex]);

  // scroll-spy: highlight the section currently in view in the TOC
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActiveSec(vis.target.id.replace('sec-', ''));
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.3, 1] }
    );
    ch.sections.forEach((s) => {
      const el = document.getElementById(`sec-${s.id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ch.id]);

  function toggleRead(sectionId: string) {
    update((s) => {
      const p = (s.study.progress[ch.id] = s.study.progress[ch.id] || { sections: {} });
      p.sections = p.sections || {};
      p.sections[sectionId] = !p.sections[sectionId];
      p.lastOpened = new Date().toISOString().slice(0, 10);
    });
  }

  function onBodyClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    const wl = el.getAttribute('data-wikilink');
    if (wl) {
      e.preventDefault();
      const route = resolveWikilink(wl);
      if (route) onNavigate(route);
    }
  }

  return (
    <div className="reader-layout">
      <nav className="reader-toc" aria-label="Chapter contents">
        <div className="card-eyebrow" style={{ marginBottom: 8 }}>
          Contents
        </div>
        {ch.sections.map((s) => (
          <a
            key={s.id}
            href={`#sec-${s.id}`}
            className={`toc-link${activeSec === s.id ? ' active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {s.n ? `${s.n} ` : ''}
            {s.title}
          </a>
        ))}
        {ch.mnemonics.length > 0 && (
          <a href="#mnemonics" className="toc-link">
            Mnemonics
          </a>
        )}
        {ch.glossary.length > 0 && (
          <a href="#glossary" className="toc-link">
            Glossary
          </a>
        )}
      </nav>

      <div className="reader-body" onClick={onBodyClick}>
        {ch.objectives.length > 0 && (
          <div className="obj-box">
            <div className="obj-title">By the end of this chapter you can</div>
            <ol className="obj-list">
              {ch.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          </div>
        )}

        {usedKinds.length > 1 && (
          <div className="key-strip no-print" aria-label="Colour key">
            {usedKinds.map((k) => (
              <span className="key-item" key={k}>
                <span className="key-dot" style={{ ['--kc' as string]: `var(--k-${k})` }} />
                {KIND_LABEL[k]}
              </span>
            ))}
          </div>
        )}

        {ch.sections.map((s) => (
          <section id={`sec-${s.id}`} key={s.id} className="reader-section">
            <div className="row spread" style={{ alignItems: 'flex-start' }}>
              <h2 style={{ flex: 1 }}>
                {s.n ? <span className="sec-n">{s.n}</span> : null} {s.title}
              </h2>
              <button
                className={`btn btn--ghost btn--sm no-print ${readSections[s.id] ? 'read-on' : ''}`}
                onClick={() => toggleRead(s.id)}
                style={{ color: readSections[s.id] ? 'var(--success)' : undefined }}
                aria-pressed={!!readSections[s.id]}
              >
                <IconCheck size={15} /> {readSections[s.id] ? 'Read' : 'Mark read'}
              </button>
            </div>
            <div className="md" dangerouslySetInnerHTML={{ __html: renderRich(s.digest, lex) }} />

            {s.highYield.length > 0 && (
              <div className="hy-box">
                <div className="hy-title">High-yield</div>
                <ul>
                  {s.highYield.map((h, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(h, lex) }} />
                  ))}
                </ul>
              </div>
            )}

            {s.tables.map((t, i) => (
              <FigureTable key={i} table={t} lex={lex} />
            ))}

            {s.figures.map((f, i) => (
              <FigureBlock key={i} figure={f} />
            ))}

            {s.pitfalls.length > 0 && (
              <div className="md-callout md-callout--warning" style={{ marginTop: 12 }}>
                <strong>Pitfalls.</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {s.pitfalls.map((p, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(p, lex) }} />
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}

        {ch.mnemonics.length > 0 && (
          <section id="mnemonics" className="reader-section">
            <h2>Mnemonics</h2>
            <div className="list">
              {ch.mnemonics.map((m, i) => (
                <div className="list-row" key={i}>
                  <div className="lr-main">
                    <div className="lr-title">{m.cue}</div>
                    <div className="lr-sub" style={{ color: 'var(--text-dim)' }}>
                      {m.expansion}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {ch.glossary.length > 0 && (
          <section id="glossary" className="reader-section">
            <h2>Glossary</h2>
            <div className="gloss-list">
              {[...ch.glossary]
                .sort((a, b) => a.term.localeCompare(b.term))
                .map((g: GlossaryEntry, i) => (
                  <div className="gloss-row" key={i} style={{ ['--kc' as string]: `var(--k-${g.kind || 'condition'})` }}>
                    <div className="gloss-term">{g.term}</div>
                    <div className="gloss-def">{g.def}</div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {ch.summary && (
          <section className="reader-section">
            <h2>In one paragraph</h2>
            <div className="md summary-box" dangerouslySetInnerHTML={{ __html: renderRich(ch.summary, lex) }} />
          </section>
        )}
      </div>
    </div>
  );
}

function FigureTable({ table, lex }: { table: TableT; lex?: LexIndex }) {
  return (
    <div className="reader-table-wrap">
      {table.title && <div className="reader-table-title">{table.title}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="reader-table">
          <thead>
            <tr>
              {table.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} dangerouslySetInnerHTML={{ __html: renderInline(cell, lex) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FigureBlock({ figure }: { figure: Figure }) {
  return (
    <figure className="reader-figure">
      {figure.kind === 'image' && figure.src ? (
        <img src={figure.src} alt={figure.alt} loading="lazy" />
      ) : (
        <div className="described-figure" role="img" aria-label={figure.alt}>
          {figure.described}
        </div>
      )}
      {figure.caption && <figcaption>{figure.caption}</figcaption>}
    </figure>
  );
}

function CardsTab({
  cards,
  chapterId,
  onNavigate,
}: {
  cards: ReturnType<typeof chapterCards>;
  chapterId: string;
  onNavigate: (to: string) => void;
}) {
  const decks = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.deck || '', (m.get(c.deck || '') || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cards]);
  return (
    <>
      <div className="tab-lead">
        <div>
          <div className="tab-lead-title">{cards.length} cards in {decks.length} decks</div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Scheduled with the rest of your collection. Review them from here.
          </div>
        </div>
        <Button variant="primary" onClick={() => onNavigate(`/flashcards?chapter=${encodeURIComponent(chapterId)}`)}>
          <IconFlashcards size={16} /> Review these cards
        </Button>
      </div>
      <div className="deck-chips">
        {decks.map(([d, n]) => (
          <span className="deck-chip" key={d}>
            {d.split('::').slice(2).join(' › ') || d}
            <b>{n}</b>
          </span>
        ))}
      </div>
      <CardPreview cards={cards} />
    </>
  );
}

/**
 * A short, readable sample of a chapter's cards — never the whole bank.
 * Occlusion and image cards carry no readable front/back, so they are counted
 * but not printed as blank rows, which is what used to clutter this tab.
 */
function CardPreview({ cards }: { cards: ReturnType<typeof chapterCards> }) {
  const PREVIEW = 12;
  const readable = cards.filter((c) => c.type === 'cloze' ? c.cloze : c.front);
  const shown = readable.slice(0, PREVIEW);
  const hidden = cards.length - shown.length;
  return (
    <>
      <div className="card-eyebrow" style={{ marginBottom: 8 }}>Sample</div>
      <div className="list">
        {shown.map((c) => (
          <div className="list-row" key={c.id} style={{ alignItems: 'flex-start' }}>
            <Badge>{c.type}</Badge>
            <div className="lr-main">
              {c.type === 'cloze' ? (
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.cloze || '') }} />
              ) : (
                <>
                  <div className="lr-title">{c.front}</div>
                  {c.back && (
                    <div className="lr-sub" style={{ color: 'var(--text-dim)' }}>
                      {c.back}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <div className="muted" style={{ fontSize: 13, marginTop: 10, textAlign: 'center' }}>
          + {hidden} more — start a review to see them all
        </div>
      )}
    </>
  );
}

function QuestionsTab({
  mcqs,
  chapterId,
  onNavigate,
}: {
  mcqs: ReturnType<typeof chapterMcqs>;
  chapterId: string;
  onNavigate: (to: string) => void;
}) {
  return (
    <>
      <div className="tab-lead">
        <div>
          <div className="tab-lead-title">{mcqs.length} questions</div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Every option carries its own rationale. Answer, see why, move on.
          </div>
        </div>
        <Button variant="primary" onClick={() => onNavigate(`/qbank?chapter=${encodeURIComponent(chapterId)}`)}>
          <IconQbank size={16} /> Practise this chapter
        </Button>
      </div>
      <div className="card-eyebrow" style={{ marginBottom: 8 }}>Sample</div>
      <div className="list">
        {mcqs.slice(0, 8).map((q) => (
          <div className="list-row" key={q.id} style={{ alignItems: 'flex-start' }}>
            <Badge tone={q.difficulty === 3 ? 'error' : q.difficulty === 2 ? 'warning' : 'success'}>
              L{q.difficulty}
            </Badge>
            <div className="lr-main">
              <div className="lr-title">{q.stem}</div>
              <div className="lr-sub" style={{ color: 'var(--text-dim)' }}>
                {q.options.find((o) => o.correct)?.text}
              </div>
            </div>
          </div>
        ))}
      </div>
      {mcqs.length > 8 && (
        <div className="muted" style={{ fontSize: 13, marginTop: 10, textAlign: 'center' }}>
          + {mcqs.length - 8} more — start a session to work through them
        </div>
      )}
    </>
  );
}
