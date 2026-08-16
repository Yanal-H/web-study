// Haki sound: every effect is synthesised with the Web Audio API at play time.
// No audio files ship with the app, nothing is fetched, and the whole engine is
// a few hundred bytes of maths — so it works offline and adds nothing to load.
//
// Browsers refuse to start audio before a user gesture. A context created by a
// timer stays suspended for good, so nothing plays and nothing errors — which is
// exactly the silent failure this module now avoids: installAudioUnlock() waits
// for the first click, key or touch, starts the context there, and only then do
// effects make sound.

import { state } from '../state/store';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
/** true once a real user gesture has started the audio context */
let unlocked = false;
let listening = false;

function settings() {
  const s = (state.settings as Record<string, any>).sound || {};
  return {
    on: s.effects !== false,
    volume: typeof s.volume === 'number' ? s.volume : 0.55,
  };
}

function create(): Ctx | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (master) master.gain.value = settings().volume;
  return ctx;
}

/**
 * Browsers refuse to start audio outside a user gesture, and a context created
 * by a timer stays suspended forever. So the first real interaction — a click,
 * a key, a touch — creates and resumes the context and pushes one silent buffer
 * through it, which is what iOS needs to consider it started. Until then every
 * effect is a no-op rather than a note scheduled into a dead context.
 */
export function installAudioUnlock() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const go = () => {
    const c = create();
    if (!c) return;
    void c.resume().then(() => {
      unlocked = c.state === 'running';
    });
    // a single silent sample, which some browsers require before real audio
    try {
      const b = c.createBuffer(1, 1, c.sampleRate);
      const src = c.createBufferSource();
      src.buffer = b;
      src.connect(c.destination);
      src.start(0);
    } catch {
      // nothing to do — the resume above is the part that matters
    }
    if (c.state === 'running') unlocked = true;
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(ev, go, { passive: true });
  }
}

/** Has the browser actually let audio start yet? */
export function audioReady(): boolean {
  return unlocked && ctx?.state === 'running';
}

function audio(): Ctx | null {
  const { on } = settings();
  if (!on) return null;
  if (!unlocked) return null;
  const c = create();
  if (!c) return null;
  if (c.state === 'suspended') {
    void c.resume();
    return null;
  }
  return c;
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
  const k = Math.max(0.35, intensity);
  // the crack
  noiseHit({ dur: 0.11, gain: 0.55 * k, freq: 9000, toFreq: 2200, type: 'bandpass', q: 0.6 });
  noiseHit({ dur: 0.07, gain: 0.4 * k, freq: 4200, toFreq: 1400, type: 'bandpass', q: 1.1, delay: 0.02 });
  // the roll behind it
  noiseHit({ dur: 1.25 * k, gain: 0.5 * k, freq: 900, toFreq: 45, delay: 0.04 });
  noiseHit({ dur: 1.8 * k, gain: 0.3 * k, freq: 380, toFreq: 32, delay: 0.16 });
  // the pressure you feel more than hear
  tone({ freq: 96, to: 30, dur: 0.9 * k, type: 'sine', gain: 0.45 * k, delay: 0.02 });
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

/** Play something immediately so a student can hear that sound is working. */
export function test() {
  thunder(1);
}

export const sfx = {
  thunder,
  flip,
  correct,
  wrong,
  grade,
  chime,
  combo,
  test,
  audioReady,
  installAudioUnlock,
};
