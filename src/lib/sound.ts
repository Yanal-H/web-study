// Haki sound: every effect is synthesised with the Web Audio API at play time.
// No audio files ship with the app, nothing is fetched, and the whole engine is
// a few hundred bytes of maths — so it works offline and adds nothing to load.
//
// Browsers refuse to start audio before a user gesture, so the context is
// created lazily on the first effect and resumed if the browser suspended it.

import { state } from '../state/store';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function settings() {
  const s = (state.settings as Record<string, any>).sound || {};
  return {
    on: s.effects !== false,
    volume: typeof s.volume === 'number' ? s.volume : 0.55,
  };
}

function audio(): Ctx | null {
  const { on } = settings();
  if (!on) return null;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (master) master.gain.value = settings().volume;
  return ctx;
}

/** One second of white noise, reused by every noise-based effect. */
function noiseBuffer(c: Ctx): AudioBuffer {
  if (noise) return noise;
  const len = c.sampleRate;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

interface ToneOpts {
  freq: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  /** glide to this frequency across the note */
  to?: number;
  delay?: number;
}

function tone({ freq, dur = 0.16, type = 'sine', gain = 0.3, to, delay = 0 }: ToneOpts) {
  const c = audio();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface NoiseOpts {
  dur?: number;
  gain?: number;
  /** low-pass cutoff at the start, gliding down to `toFreq` */
  freq?: number;
  toFreq?: number;
  q?: number;
  type?: BiquadFilterType;
  delay?: number;
}

function noiseHit({
  dur = 0.5,
  gain = 0.35,
  freq = 1200,
  toFreq = 120,
  q = 0.9,
  type = 'lowpass',
  delay = 0,
}: NoiseOpts) {
  const c = audio();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/* ------------------------------------------------------------------ effects */

/** The haki strike: a crack of lightning over a low rolling rumble. */
export function thunder(intensity = 1) {
  noiseHit({ dur: 0.09, gain: 0.3 * intensity, freq: 9000, toFreq: 2400, type: 'bandpass', q: 0.6 });
  noiseHit({ dur: 0.85 * intensity, gain: 0.26 * intensity, freq: 900, toFreq: 55, delay: 0.03 });
  tone({ freq: 92, to: 38, dur: 0.6 * intensity, type: 'sine', gain: 0.22 * intensity, delay: 0.02 });
}

/** Soft tick when a card flips. */
export function flip() {
  noiseHit({ dur: 0.07, gain: 0.14, freq: 5200, toFreq: 900, type: 'bandpass', q: 1.2 });
}

/** Right answer: a short rising pair. */
export function correct() {
  tone({ freq: 660, dur: 0.1, type: 'triangle', gain: 0.24 });
  tone({ freq: 990, dur: 0.16, type: 'triangle', gain: 0.2, delay: 0.075 });
}

/** Wrong answer: a flat, low double — clear but never harsh. */
export function wrong() {
  tone({ freq: 200, to: 150, dur: 0.19, type: 'sawtooth', gain: 0.16 });
  tone({ freq: 150, to: 110, dur: 0.22, type: 'sine', gain: 0.14, delay: 0.09 });
}

/** Grading a card — the harder the grade, the lower the note. */
export function grade(g: 'again' | 'hard' | 'good' | 'easy') {
  const map = { again: 180, hard: 300, good: 520, easy: 760 };
  tone({ freq: map[g], dur: 0.13, type: 'triangle', gain: 0.2 });
  if (g === 'easy') tone({ freq: 1140, dur: 0.16, type: 'triangle', gain: 0.14, delay: 0.08 });
}

/** Session finished, or a timer ending. */
export function chime() {
  [523.25, 659.25, 783.99].forEach((f, i) =>
    tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.2, delay: i * 0.11 })
  );
}

/** A streak building up — pitch climbs with the combo. */
export function combo(n: number) {
  tone({ freq: 420 + Math.min(12, n) * 55, dur: 0.11, type: 'square', gain: 0.12 });
}

/** Call once from a click handler to unlock audio on iOS. */
export function warmUp() {
  audio();
}

export const sfx = { thunder, flip, correct, wrong, grade, chime, combo, warmUp };
