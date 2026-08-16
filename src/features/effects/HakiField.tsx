import { useEffect, useRef } from 'react';
import { thunder } from '../../lib/sound';

/*
 * HakiField — the living energy behind the whole app. A single fixed canvas:
 *   - a slow crimson/violet nebula that drifts,
 *   - rising embers,
 *   - rare lightning strikes.
 * Perf-guarded: capped DPR, ~50 embers, rAF, paused when the tab is hidden.
 * Honours data-haki ("full" | "calm" | "off") and prefers-reduced-motion.
 */

interface Ember {
  x: number;
  y: number;
  vy: number;
  vx: number;
  r: number;
  life: number;
  max: number;
  hue: number;
}

function boltPoints(x0: number, y0: number, x1: number, y1: number, segs: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[x0, y0]];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const x = x0 + (x1 - x0) * t + (Math.random() - 0.5) * 70;
    const y = y0 + (y1 - y0) * t + (Math.random() - 0.5) * 30;
    pts.push([x, y]);
  }
  pts.push([x1, y1]);
  return pts;
}

export default function HakiField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const embers: Ember[] = [];
    let raf = 0;
    let running = true;
    let t = 0;
    let nextBolt = 180 + Math.random() * 320;
    let flash: { pts: Array<[number, number]>; fork?: Array<[number, number]>; life: number } | null = null;

    const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const level = () => document.documentElement.getAttribute('data-haki') || 'full';
    const isLight = () => {
      const th = document.documentElement.getAttribute('data-theme');
      return th === 'paper' || th === 'light';
    };

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + 'px';
      canvas!.style.height = H + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function spawnEmber(): Ember {
      const hue = Math.random() < 0.6 ? 342 : 268; // crimson or violet
      return {
        x: Math.random() * W,
        y: H + 10,
        vy: -(0.15 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 0.3,
        r: 0.6 + Math.random() * 1.8,
        life: 0,
        max: 300 + Math.random() * 500,
        hue,
      };
    }

    function frame() {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const lv = level();
      if (lv === 'off') {
        ctx!.clearRect(0, 0, W, H);
        return;
      }
      t += 1;
      ctx!.clearRect(0, 0, W, H);
      const light = isLight();
      const alphaScale = light ? 0.4 : 1;

      // drifting nebula (a few soft radial blobs)
      const blobs = [
        { x: W * (0.22 + 0.05 * Math.sin(t / 340)), y: H * (0.8 + 0.04 * Math.cos(t / 300)), c: '255,45,85', s: Math.max(W, H) * 0.5 },
        { x: W * (0.82 + 0.05 * Math.cos(t / 380)), y: H * (0.2 + 0.05 * Math.sin(t / 320)), c: '124,58,237', s: Math.max(W, H) * 0.55 },
      ];
      for (const b of blobs) {
        const g = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.s);
        g.addColorStop(0, `rgba(${b.c},${(light ? 0.05 : 0.1) * alphaScale + 0.03})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, W, H);
      }

      // embers
      const target = reduced() ? 0 : light ? 26 : 46;
      while (embers.length < target) embers.push(spawnEmber());
      ctx!.globalCompositeOperation = 'lighter';
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]!;
        e.life++;
        e.x += e.vx;
        e.y += e.vy;
        const fade = Math.sin((e.life / e.max) * Math.PI); // rise then fade
        if (e.life >= e.max || e.y < -10) {
          embers.splice(i, 1);
          continue;
        }
        ctx!.beginPath();
        ctx!.fillStyle = `hsla(${e.hue}, 90%, ${light ? 55 : 62}%, ${0.5 * fade * alphaScale})`;
        ctx!.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = 'source-over';

      // rare lightning (only at full intensity, motion allowed)
      if (lv === 'full' && !reduced()) {
        nextBolt--;
        if (nextBolt <= 0 && !flash) {
          const x0 = W * (0.1 + Math.random() * 0.8);
          const endY = H * (0.5 + Math.random() * 0.5);
          const main = boltPoints(x0, -10, x0 + (Math.random() - 0.5) * 240, endY, 11);
          // a fork peeling off the middle of the strike
          const mid = main[Math.floor(main.length * 0.55)]!;
          const fork = boltPoints(mid[0], mid[1], mid[0] + (Math.random() - 0.5) * 300, endY * 0.92, 6);
          flash = { pts: main, fork, life: 20 };
          nextBolt = 150 + Math.random() * 360;
          // Not every strike is overhead: about half of them carry, and quietly,
          // so the room has weather rather than a metronome.
          if (Math.random() < 0.55) thunder(0.45 + Math.random() * 0.4);
        }
        if (flash) {
          const a = flash.life / 20;
          // the whole field lights for an instant, then falls away
          ctx!.fillStyle = `rgba(255,60,100,${0.09 * a * a * alphaScale})`;
          ctx!.fillRect(0, 0, W, H);
          ctx!.shadowColor = 'rgba(255,45,85,0.95)';
          const draw = (pts: Array<[number, number]>, width: number, alpha: number) => {
            ctx!.strokeStyle = `rgba(255,231,240,${alpha})`;
            ctx!.lineWidth = width;
            ctx!.beginPath();
            pts.forEach((p, i) => (i ? ctx!.lineTo(p[0], p[1]) : ctx!.moveTo(p[0], p[1])));
            ctx!.stroke();
          };
          // wide crimson halo under a hot white core
          ctx!.shadowBlur = 26;
          ctx!.strokeStyle = `rgba(255,45,85,${0.5 * a})`;
          ctx!.lineWidth = 7;
          ctx!.beginPath();
          flash.pts.forEach((p, i) => (i ? ctx!.lineTo(p[0], p[1]) : ctx!.moveTo(p[0], p[1])));
          ctx!.stroke();
          ctx!.shadowBlur = 18;
          draw(flash.pts, 2.4, 0.95 * a);
          if (flash.fork) draw(flash.fork, 1.4, 0.65 * a);
          ctx!.shadowBlur = 0;
          flash.life--;
          if (flash.life <= 0) flash = null;
        }
      }
    }
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} className="haki-field" aria-hidden="true" />;
}
