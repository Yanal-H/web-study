import type { OcclusionRegion } from './deck';

/** Review renderer: hides the tested region on the front, outlines + labels it on the back. */
export function OcclusionView({
  src,
  regions,
  testIndex,
  revealed,
}: {
  src: string;
  regions: OcclusionRegion[];
  testIndex: number;
  revealed: boolean;
}) {
  return (
    <div className="occ-view">
      <img src={src} alt="" />
      {regions.map((r, i) => {
        const isTest = i === testIndex;
        if (!isTest) return null;
        const style = {
          left: `${r.x * 100}%`,
          top: `${r.y * 100}%`,
          width: `${r.w * 100}%`,
          height: `${r.h * 100}%`,
        };
        return (
          <div key={i} className={`occ-mask ${revealed ? 'revealed' : ''}`} style={style}>
            {revealed && r.label ? <span>{r.label}</span> : !revealed ? '?' : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Authored occlusion (content packs): the diagram comes from the chapter's images
 * map and the boxes are the card's own masks. `hideAll` covers every box so the
 * shape of the diagram gives nothing away; `hideOne` covers only the target.
 */
export function MaskedFigure({
  src,
  masks,
  target,
  mode = 'hideAll',
  revealed,
  label,
}: {
  src: string;
  masks: Array<{ id: string; x: number; y: number; w: number; h: number; label?: string }>;
  target?: string;
  mode?: 'hideAll' | 'hideOne';
  revealed: boolean;
  label?: string;
}) {
  const answer = masks.find((m) => m.id === target) ?? masks[0];
  return (
    <div className="occ-figure">
      {label && <div className="occ-label">{label}</div>}
      <div className="occ-view">
        <img src={src} alt={label || ''} />
        {masks.map((m) => {
          const isTarget = m.id === answer?.id;
          if (mode === 'hideOne' && !isTarget) return null;
          const style = {
            left: `${m.x * 100}%`,
            top: `${m.y * 100}%`,
            width: `${m.w * 100}%`,
            height: `${m.h * 100}%`,
          };
          if (isTarget) {
            return (
              <div key={m.id} className={`occ-mask target ${revealed ? 'revealed' : ''}`} style={style}>
                {revealed ? <span>{m.label}</span> : '?'}
              </div>
            );
          }
          // other boxes stay covered until the answer is shown, then fade back
          return <div key={m.id} className={`occ-mask other ${revealed ? 'revealed' : ''}`} style={style} />;
        })}
      </div>
    </div>
  );
}
