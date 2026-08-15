import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listChapters, type LoadedChapter } from '../../content/loader';
import { useUserContentVersion, importChapterJson, removeUserChapter } from '../../content/userContent';
import { useStore } from '../../state/useStore';
import { chapterProgress } from './progress';
import { Card, Button, Badge, IconButton, EmptyState, Textarea } from '../../design/primitives';
import { Dialog } from '../../design/Dialog';
import { useToast } from '../../design/Toast';
import { IconStudy, IconUpload, IconTrash, IconChevron } from '../../design/icons';

export default function StudyView() {
  const navigate = useNavigate();
  const toast = useToast();
  const uv = useUserContentVersion();
  const state = useStore();
  const chapters = useMemo(() => listChapters(), [uv]);
  const [importing, setImporting] = useState(false);

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
      if (!map.has(c.subject)) map.set(c.subject, []);
      map.get(c.subject)!.push(c);
    }
    return [...map.entries()];
  }, [chapters]);

  return (
    <>
      <header className="page-head row spread" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Study</h1>
          <div className="sub">Your library of chapters — read, then drill.</div>
        </div>
        <Button variant="primary" onClick={() => setImporting(true)}>
          <IconUpload size={17} /> Import chapter
        </Button>
      </header>

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
            action={
              <Button variant="primary" onClick={() => setImporting(true)}>
                <IconUpload size={17} /> Import a chapter
              </Button>
            }
          >
            Shipped chapters appear here after a build; you can also import your own chapter JSON.
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
                        {c.origin === 'personal' ? 'Imported' : 'Chapter'}
                        {c.estMinutes ? ` · ${c.estMinutes} min` : ''}
                      </div>
                      <h3 style={{ margin: '2px 0 8px', fontSize: 'var(--fs-md)' }}>{c.title}</h3>
                    </div>
                    {c.origin === 'personal' && (
                      <IconButton
                        label="Remove imported chapter"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeUserChapter(c.id);
                          toast('Imported chapter removed');
                        }}
                      >
                        <IconTrash size={15} />
                      </IconButton>
                    )}
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

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
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

function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  function doImport() {
    const res = importChapterJson(text);
    if (res.ok && res.chapter) {
      toast(`Imported “${res.chapter.title}”`, 'success');
      onClose();
      navigate(`/study/${encodeURIComponent(res.chapter.id)}`);
    } else {
      setErrors(res.errors ?? ['Import failed']);
    }
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result));
    reader.readAsText(file);
  }

  return (
    <Dialog
      title="Import chapter JSON"
      onClose={onClose}
      footer={
        <div className="row spread">
          <label className="btn btn--ghost" style={{ cursor: 'pointer' }}>
            <IconUpload size={16} /> Choose file
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
          </label>
          <Button variant="primary" disabled={!text.trim()} onClick={doImport}>
            Validate & import
          </Button>
        </div>
      }
    >
      <p className="muted" style={{ fontSize: 13.5, marginTop: -4 }}>
        Paste a chapter JSON (or choose a file). It is validated against the content schema in your
        browser — all-or-nothing, and stored separately from shipped content so a redeploy never
        overwrites it.
      </p>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErrors([]);
        }}
        placeholder='{ "schema": "foundation.study-module/v1", "id": "subject-ch1-slug", … }'
        style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
      />
      {errors.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 14px',
            border: '1px solid var(--error)',
            background: 'var(--error-soft)',
            borderRadius: 'var(--radius-sm)',
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--error)', marginBottom: 6, fontSize: 13 }}>
            {errors.length} problem{errors.length === 1 ? '' : 's'} — nothing was imported
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>
            {errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
