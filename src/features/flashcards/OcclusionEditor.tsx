import { useRef, useState } from 'react';
import { state, commit, uid } from '../../state/store';
import { Button, Input, Field } from '../../design/primitives';
import { IconTrash, IconUpload, IconPlus } from '../../design/icons';
import { useToast } from '../../design/Toast';
import type { OcclusionRegion } from './deck';

/** Editor: upload an image, drag boxes over labelled regions; each region → one card. */
export function OcclusionEditor({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [src, setSrc] = useState<string | null>(null);
  const [regions, setRegions] = useState<OcclusionRegion[]>([]);
  const [subject, setSubject] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<OcclusionRegion | null>(null);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  function rel(e: React.MouseEvent) {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }
  function down(e: React.MouseEvent) {
    if (!src) return;
    drag.current = rel(e);
    setDraft({ ...drag.current, w: 0, h: 0 });
  }
  function move(e: React.MouseEvent) {
    if (!drag.current) return;
    const p = rel(e);
    const x = Math.min(drag.current.x, p.x);
    const y = Math.min(drag.current.y, p.y);
    setDraft({ x, y, w: Math.abs(p.x - drag.current.x), h: Math.abs(p.y - drag.current.y) });
  }
  function up() {
    if (draft && draft.w > 0.02 && draft.h > 0.02) {
      setRegions((r) => [...r, { ...draft, label: '' }]);
    }
    drag.current = null;
    setDraft(null);
  }

  function save() {
    if (!src || regions.length === 0) return;
    state.flashcards.push({
      id: uid(),
      schema: 'foundation.card/v2',
      type: 'occlusion',
      image: { src, alt: 'Image occlusion' },
      regions,
      subject,
      tags: ['occlusion'],
    } as any);
    commit();
    toast(`Created ${regions.length} occlusion card${regions.length === 1 ? '' : 's'}`, 'success');
    onDone();
  }

  return (
    <div>
      {!src ? (
        <label className="btn btn--primary" style={{ cursor: 'pointer' }}>
          <IconUpload size={17} /> Choose an image
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
            Drag boxes over each region you want to test. Each box becomes its own card ({regions.length}{' '}
            so far).
          </p>
          <div
            className="occ-editor"
            ref={boxRef}
            onMouseDown={down}
            onMouseMove={move}
            onMouseUp={up}
            onMouseLeave={up}
          >
            <img src={src} alt="" draggable={false} />
            {regions.map((r, i) => (
              <div
                key={i}
                className="occ-box"
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
              >
                <span>{i + 1}</span>
              </div>
            ))}
            {draft && (
              <div
                className="occ-box draft"
                style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
              />
            )}
          </div>

          {regions.length > 0 && (
            <div className="list" style={{ marginTop: 14 }}>
              {regions.map((r, i) => (
                <div className="list-row" key={i}>
                  <span className="badge">{i + 1}</span>
                  <Input
                    placeholder={`Label for region ${i + 1} (optional)`}
                    value={r.label || ''}
                    onChange={(e) =>
                      setRegions((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <button className="btn btn--ghost btn--icon" aria-label="Remove region" onClick={() => setRegions((rs) => rs.filter((_, j) => j !== i))}>
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
            <Field label="Subject (optional)">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Anatomy" style={{ maxWidth: 220 }} />
            </Field>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 16 }}>
            <Button variant="primary" disabled={regions.length === 0} onClick={save}>
              <IconPlus size={17} /> Create {regions.length} card{regions.length === 1 ? '' : 's'}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
