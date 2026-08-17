import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../design/primitives';

/** One jagged vertical lightning path from top to bottom with a little jitter. */
function boltPath(x: number, width: number, height: number, segs: number, seed: number): string {
  let rng = seed;
  const rand = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  let cx = x;
  let d = `M ${x.toFixed(1)} 0`;
  for (let i = 1; i <= segs; i++) {
    const y = (height * i) / segs;
    cx += (rand() - 0.5) * width;
    d += ` L ${cx.toFixed(1)} ${y.toFixed(1)}`;
    // occasional short branch
    if (rand() > 0.72 && i < segs - 1) {
      const bx = cx + (rand() - 0.5) * width * 1.4;
      const by = y + height / segs / 1.6;
      d += ` M ${cx.toFixed(1)} ${y.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)} M ${cx.toFixed(1)} ${y.toFixed(1)}`;
    }
  }
  return d;
}

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Hero({
  greeting,
  cta,
}: {
  greeting: string;
  cta: { text: string; label: string; go: string; icon: React.ReactNode };
}) {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const reduced = useRef(prefersReduced());

  // Regenerate the bolt set periodically so the haki keeps crackling (unless reduced).
  useEffect(() => {
    if (reduced.current) return;
    const t = setInterval(() => setTick((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, []);

  const bolts = useMemo(() => {
    const H = 460;
    const count = reduced.current ? 3 : 6;
    // cluster bolts around the centre (behind the signature), striking downward
    return Array.from({ length: count }, (_, i) => {
      const x = 200 + (i - count / 2) * 120 + (Math.random() - 0.5) * 60;
      return {
        d: boltPath(x, 46, H, 9, (tick + 1) * 1000 + i * 137 + Math.floor(Math.random() * 999)),
        delay: (Math.random() * 2.2).toFixed(2),
        dur: (0.9 + Math.random() * 1.4).toFixed(2),
        key: `${tick}-${i}`,
      };
    });
  }, [tick]);

  return (
    <section className="haki-hero" aria-label="Foundation">
      <div className="haki-aura" aria-hidden="true" />
      <div className="haki-vignette" aria-hidden="true" />

      <svg className="haki-bolts" viewBox="0 0 800 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <filter id="haki-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {bolts.map((b) => (
          <g key={b.key} className="haki-bolt" style={{ animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}>
            <path d={b.d} className="bolt-halo" filter="url(#haki-glow)" />
            <path d={b.d} className="bolt-core" />
          </g>
        ))}
      </svg>

      <div className="haki-center" aria-hidden="true">
        <div className="haki-name">Yanal</div>
        {/* descending swash that strikes downward under the name */}
        <svg className="haki-swash" viewBox="0 0 200 220" preserveAspectRatio="xMidYMin meet">
          <path
            className="swash-path"
            d="M100 4 C104 60 70 78 96 120 C120 158 92 176 108 216"
            fill="none"
          />
        </svg>
      </div>

      <div className="haki-copy">
        <div className="haki-eyebrow">by Yanal · Cairo 2026</div>
        <h1 className="haki-title">{greeting}</h1>
        <p className="haki-sub">
          Your war table for medicine — recall, question banks, and reference, forged into one.
          Strike where it counts.
        </p>
        <div className="haki-actions">
          <Button variant="primary" size="lg" className="btn--haki" onClick={() => navigate(cta.go)}>
            {cta.icon} {cta.label}
          </Button>
          <Button size="lg" onClick={() => navigate('/study')}>
            Enter the library
          </Button>
        </div>
        <div className="haki-cta-note">{cta.text}</div>
      </div>
    </section>
  );
}
