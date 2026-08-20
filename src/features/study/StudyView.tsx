import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listChapters, type LoadedChapter } from '../../content/loader';
import { useStore, useStoreVersion } from '../../state/useStore';
import { chapterProgress } from './progress';
import { Card, Button, Badge, EmptyState } from '../../design/primitives';
import { IconStudy, IconChevron } from '../../design/icons';

export default function StudyView() {
  const navigate = useNavigate();
  const state = useStore();
  const storeVersion = useStoreVersion();
  // Content hydration calls notify() once authenticated packs have arrived.
  // Key this memo to that version so a direct visit to /study cannot get stuck
  // with the empty library that rendered before the background download ended.
  const chapters = useMemo(() => listChapters(), [storeVersion]);
  // a subject handed over from the Subjects page narrows the library
  const presetSubject = ((useLocation().state ?? null) as { subject?: string } | null)?.subject ?? '';
  const [filterSubject, setFilterSubject] = useState<string>(presetSubject);

  const recent = useMemo(() => {
    let best: { ch: LoadedChapter; when: string } | null = null;
    for (const ch of chapters) {
      const when = state.study.progress[ch.id]?.lastOpened;
      if (when && (!best || when > best.when)) best = { ch, when };
    }
    return best?.ch;
  }, [chapters, state.study.progress, state.schemaVersion]);

  const bySubject = useMemo(() => {
    const map = new Map<string, LoadedChapter[]>();
    for (const c of chapters) {
      if (filterSubject && c.subject !== filterSubject) continue;
      if (!map.has(c.subject)) map.set(c.subject, []);
      map.get(c.subject)!.push(c);
    }
    return [...map.entries()];
  }, [chapters, filterSubject]);

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Study</h1>
          <div className="sub">Your library of chapters — read, then drill.</div>
        </div>
      </header>

      {filterSubject && (
        <div className="filter-pill no-print" style={{ marginBottom: 'var(--sp-4)' }}>
          Showing <strong>{filterSubject}</strong>
          <button className="filter-pill-x" aria-label="Clear filter" onClick={() => setFilterSubject('')}>
            Show all
          </button>
        </div>
      )}

      {recent && (
        <Card interactive style={{ marginBottom: 'var(--sp-4)', borderColor: 'var(--accent)' }} onClick={() => navigate(`/study/${encodeURIComponent(recent.id)}`)}>
          <div className="row spread wrap" style={{ gap: 12 }}>
            <div>
              <div className="card-eyebrow">Continue where you left off</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{recent.title}</div>
            </div>
            <Button variant="primary" size="sm">
              Resume <IconChevron size={15} />
            </Button>
          </div>
        </Card>
      )}

      {chapters.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconStudy size={22} />}
            title="No chapters yet"
          >
            No study material is available yet. Refresh once, then ask the administrator if the library remains empty.
          </EmptyState>
        </Card>
      ) : (
        bySubject.map(([subject, list]) => (
          <section className="section" key={subject}>
            <div className="section-head">
              <h2>{subject}</h2>
              <span className="see">{list.length} chapter{list.length === 1 ? '' : 's'}</span>
            </div>
            <div className="subject-grid">
              {list.map((c) => (
                <Card
                  key={c.id}
                  interactive
                  padSm
                  onClick={() => navigate(`/study/${encodeURIComponent(c.id)}`)}
                >
                  <div className="row spread" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="card-eyebrow">
                        Chapter
                        {c.estMinutes ? ` · ${c.estMinutes} min` : ''}
                      </div>
                      <h3 style={{ margin: '2px 0 8px', fontSize: 'var(--fs-md)' }}>{c.title}</h3>
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <Badge>{c.sections.length} sections</Badge>
                    <Badge tone="accent">{c.cards.length} cards</Badge>
                    <Badge tone="info">{c.mcqs.length} MCQs</Badge>
                    {c.emqs.length > 0 && <Badge tone="warning">{c.emqs.length} EMQs</Badge>}
                  </div>
                  <ChapterProgressBar chapter={c} />
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
function ChapterProgressBar({ chapter }: { chapter: LoadedChapter }) {
  const p = chapterProgress(chapter);
  return (
    <div style={{ marginTop: 12 }}>
      <div className="qb-bar-track" style={{ height: 6 }}>
        <div className="qb-bar-fill" style={{ width: `${p.readPct * 100}%`, background: 'var(--accent)' }} />
      </div>
      <div className="row spread" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-faint)' }}>
        <span>{Math.round(p.readPct * 100)}% read</span>
        <span>
          {p.cardsDue} due
          {p.mcqAccuracy != null ? ` · ${Math.round(p.mcqAccuracy * 100)}% MCQ` : ''}
        </span>
      </div>
    </div>
  );
}

