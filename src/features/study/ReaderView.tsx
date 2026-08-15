import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getChapter, chapterCards, chapterMcqs, listChapters } from '../../content/loader';
import { useUserContentVersion } from '../../content/userContent';
import { useStore } from '../../state/useStore';
import { update } from '../../state/store';
import { Card, Button, Badge, Tabs } from '../../design/primitives';
import { IconChevron, IconFlashcards, IconQbank, IconCheck } from '../../design/icons';
import { renderMarkdown } from '../../lib/markdown';
import type { Figure, Table as TableT } from '../../content/schema';

type Tab = 'read' | 'cards' | 'questions';

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

  // reading progress from window scroll
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
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

      <header className="page-head">
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
      {tab === 'cards' && <CardsTab cards={cards} />}
      {tab === 'questions' && <QuestionsTab mcqs={mcqs} />}
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
          <a key={s.id} href={`#sec-${s.id}`} className="toc-link">
            {s.n ? `${s.n} ` : ''}
            {s.title}
          </a>
        ))}
        {ch.mnemonics.length > 0 && (
          <a href="#mnemonics" className="toc-link">
            Mnemonics
          </a>
        )}
      </nav>

      <div className="reader-body" onClick={onBodyClick}>
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
            <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.digest) }} />

            {s.highYield.length > 0 && (
              <div className="hy-box">
                <div className="hy-title">High-yield</div>
                <ul>
                  {s.highYield.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {s.tables.map((t, i) => (
              <FigureTable key={i} table={t} />
            ))}

            {s.figures.map((f, i) => (
              <FigureBlock key={i} figure={f} />
            ))}

            {s.pitfalls.length > 0 && (
              <div className="md-callout md-callout--warning" style={{ marginTop: 12 }}>
                <strong>Pitfalls.</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {s.pitfalls.map((p, i) => (
                    <li key={i}>{p}</li>
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
      </div>
    </div>
  );
}

function FigureTable({ table }: { table: TableT }) {
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
                  <td key={ci}>{cell}</td>
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

function CardsTab({ cards }: { cards: ReturnType<typeof chapterCards> }) {
  return (
    <>
      <div className="soon" style={{ marginBottom: 'var(--sp-4)', padding: 'var(--sp-4)' }}>
        <span className="soon-badge">
          <IconFlashcards size={14} /> Review engine arrives in Phase 3
        </span>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          These {cards.length} cards are loaded from the chapter and ready. Grading, flip and
          scheduling come with the Recall-grade engine.
        </p>
      </div>
      <div className="list">
        {cards.map((c) => (
          <div className="list-row" key={c.id} style={{ alignItems: 'flex-start' }}>
            <Badge>{c.type}</Badge>
            <div className="lr-main">
              {c.type === 'cloze' ? (
                <div
                  className="md"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(c.cloze || '') }}
                />
              ) : (
                <>
                  <div className="lr-title">{c.front}</div>
                  <div className="lr-sub" style={{ color: 'var(--text-dim)' }}>
                    {c.back}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function QuestionsTab({ mcqs }: { mcqs: ReturnType<typeof chapterMcqs> }) {
  return (
    <>
      <div className="soon" style={{ marginBottom: 'var(--sp-4)', padding: 'var(--sp-4)' }}>
        <span className="soon-badge">
          <IconQbank size={14} /> Quiz engine arrives in Phase 4
        </span>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          {mcqs.length} questions are loaded with options, per-option rationale and explanations.
          Interactive practice, timing and EMQs come next.
        </p>
      </div>
      <div className="list">
        {mcqs.map((q) => (
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
    </>
  );
}
