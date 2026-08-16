// Built-in study music, synthesised in the browser.
//
// No audio files ship and nothing is fetched, so these tracks work offline, add
// nothing to the download, and carry no licence to honour. Each track is a small
// score — tempo, a chord progression, a bass figure, a drum pattern and an arp —
// played by a look-ahead scheduler that queues the next slice of bars slightly
// ahead of the clock, which is what keeps timing steady even when the main
// thread is busy laying out a page.
//
// If you want real released music instead (NCS and similar), download the files
// and add them in the player: those play from IndexedDB alongside these.

export interface TrackDef {
  id: string;
  name: string;
  blurb: string;
  bpm: number;
  /** root note of each bar, as semitones from A2 */
  progression: number[];
  /** which sixteenths carry a kick / snare / hat */
  kick: number[];
  snare: number[];
  hat: number[];
  /** arpeggio degrees over the bar's chord */
  arp: number[];
  /** minor by default; a major third where the mood needs lifting */
  third: 3 | 4;
  lead: boolean;
  gain: number;
}

export const TRACKS: TrackDef[] = [
  {
    id: 'conqueror',
    name: 'Conqueror',
    blurb: 'Dark, driving, four to the floor.',
    bpm: 124,
    progression: [0, 0, -3, -5],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    arp: [0, 7, 12, 7, 15, 12, 7, 12],
    third: 3,
    lead: true,
    gain: 0.5,
  },
  {
    id: 'storm-front',
    name: 'Storm Front',
    blurb: 'Faster, brighter, for a sprint.',
    bpm: 140,
    progression: [0, 5, -3, 2],
    kick: [0, 3, 8, 11],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    arp: [0, 12, 7, 12, 3, 12, 7, 15],
    third: 3,
    lead: true,
    gain: 0.45,
  },
  {
    id: 'deep-work',
    name: 'Deep Work',
    blurb: 'Slow pads, no drums, nothing to follow.',
    bpm: 72,
    progression: [0, -5, -3, -7],
    kick: [],
    snare: [],
    hat: [],
    arp: [0, 7, 12, 19],
    third: 4,
    lead: false,
    gain: 0.55,
  },
  {
    id: 'night-ward',
    name: 'Night Ward',
    blurb: 'Quiet pulse for late revision.',
    bpm: 96,
    progression: [0, -3, -5, -3],
    kick: [0, 8],
    snare: [],
    hat: [4, 12],
    arp: [0, 3, 7, 10, 7, 3],
    third: 3,
    lead: false,
    gain: 0.5,
  },
  {
    id: 'red-line',
    name: 'Red Line',
    blurb: 'Hard, minimal, no let-up.',
    bpm: 132,
    progression: [0, 0, 0, -2],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [1, 3, 5, 7, 9, 11, 13, 15],
    arp: [0, 0, 12, 0, 7, 0, 10, 7],
    third: 3,
    lead: true,
    gain: 0.45,
  },
  {
    id: 'ward-round',
    name: 'Ward Round',
    blurb: 'Steady mid-tempo, easy to think over.',
    bpm: 108,
    progression: [0, 3, -2, -4],
    kick: [0, 6, 8, 14],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    arp: [0, 4, 7, 11, 7, 4],
    third: 4,
    lead: false,
    gain: 0.5,
  },
  {
    id: 'first-light',
    name: 'First Light',
    blurb: 'Warm and major, for early mornings.',
    bpm: 88,
    progression: [0, 5, 7, 5],
    kick: [0, 8],
    snare: [12],
    hat: [2, 6, 10, 14],
    arp: [0, 4, 7, 12, 7, 4],
    third: 4,
    lead: false,
    gain: 0.55,
  },
  {
    id: 'long-case',
    name: 'Long Case',
    blurb: 'Sparse ambience that stays out of the way.',
    bpm: 60,
    progression: [0, -4, -7, -5],
    kick: [],
    snare: [],
    hat: [],
    arp: [0, 7, 12, 16, 12, 7],
    third: 4,
    lead: false,
    gain: 0.6,
  },
  {
    id: 'crash-call',
    name: 'Crash Call',
    blurb: 'Fast and urgent — timed papers only.',
    bpm: 150,
    progression: [0, -1, -3, -5],
    kick: [0, 2, 6, 8, 10, 14],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    arp: [0, 12, 15, 12, 7, 12, 10, 12],
    third: 3,
    lead: true,
    gain: 0.42,
  },
  {
    id: 'pre-op',
    name: 'Pre-Op',
    blurb: 'Low and level, for reading long chapters.',
    bpm: 80,
    progression: [0, -5, -3, -8],
    kick: [0],
    snare: [],
    hat: [8],
    arp: [0, 3, 7, 3],
    third: 3,
    lead: false,
    gain: 0.58,
  },
];

const A2 = 110;
const semi = (n: number) => A2 * Math.pow(2, n / 12);

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private bar = 0;
  private track: TrackDef = TRACKS[0]!;
  private _volume = 0.7;
  playing = false;

  /** how far ahead notes are queued, and how often we top the queue up */
  private readonly lookahead = 0.15;
  private readonly tick = 40;

  private audio(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume * this.track.gain;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get volume() {
    return this._volume;
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this._volume * this.track.gain;
  }

  get trackId() {
    return this.track.id;
  }

  play(trackId?: string) {
    const next = TRACKS.find((t) => t.id === trackId) || this.track;
    const changed = next.id !== this.track.id;
    this.track = next;
    const ctx = this.audio();
    if (!ctx) return false;
    if (changed) {
      this.step = 0;
      this.bar = 0;
    }
    if (this.master) this.master.gain.value = this._volume * this.track.gain;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.playing = true;
    if (this.timer === null) this.timer = window.setInterval(() => this.pump(), this.tick);
    return true;
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Release the audio context entirely (on unmount). */
  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private pump() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const stepDur = 60 / this.track.bpm / 4; // a sixteenth
    while (this.nextNoteTime < ctx.currentTime + this.lookahead) {
      this.emit(this.step, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private env(t: number, dur: number, peak: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, peak: number, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = this.env(t, dur, peak);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(t: number, dur: number, peak: number, freq: number, type: BiquadFilterType = 'highpass') {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * (dur + 0.02));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.env(t, dur, peak);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private emit(step: number, t: number) {
    const tr = this.track;
    const root = tr.progression[this.bar % tr.progression.length]!;

    // drums
    if (tr.kick.includes(step)) {
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      const g = this.env(t, 0.24, 0.9);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 0.28);
    }
    if (tr.snare.includes(step)) this.noise(t, 0.16, 0.28, 1600);
    if (tr.hat.includes(step)) this.noise(t, 0.045, 0.12, 7200);

    // bass on the beat
    if (step % 4 === 0) {
      this.osc('sawtooth', semi(root - 12), t, 0.34, 0.3);
      this.osc('sine', semi(root - 24), t, 0.4, 0.34);
    }

    // pad, once a bar, held
    if (step === 0) {
      const dur = (60 / tr.bpm) * 4 * 0.95;
      [0, tr.third, 7].forEach((iv, i) =>
        this.osc('triangle', semi(root + iv), t, dur, 0.1 - i * 0.015, i * 6)
      );
    }

    // arpeggio
    if (tr.lead ? step % 2 === 0 : step % 4 === 0) {
      const idx = tr.lead ? step / 2 : step / 4 + this.bar;
      const deg = tr.arp[Math.floor(idx) % tr.arp.length]!;
      this.osc('square', semi(root + deg + 12), t, tr.lead ? 0.13 : 0.5, tr.lead ? 0.075 : 0.06);
    }
  }
}

let engine: MusicEngine | null = null;

/** The one shared engine — music should never double up across components. */
export function musicEngine(): MusicEngine {
  if (!engine) engine = new MusicEngine();
  return engine;
}
