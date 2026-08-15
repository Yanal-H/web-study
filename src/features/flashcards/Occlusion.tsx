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
