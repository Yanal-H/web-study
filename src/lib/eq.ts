// Tone shaping for playback.
//
// The audio element is routed through a three-band shelf/peak chain, which is
// what a "bass boost" or "vocal" control actually is. The file itself is never
// re-encoded — it decodes at its native rate and bit depth, and the filters only
// change the balance — so raising the bass costs nothing in quality.
//
// A MediaElementSource can only be created once per element, so the chain is
// built on first use and reused for every track after that.

export type EqPreset = 'flat' | 'bass' | 'deep' | 'vocal' | 'bright' | 'night';

export interface EqDef {
  id: EqPreset;
  name: string;
  /** decibels at low / mid / high */
  low: number;
  mid: number;
  high: number;
  /** mid band centre, in Hz */
  midHz: number;
  /** extra output trim so a boosted preset does not simply sound louder */
  trim: number;
  /** even out loud and quiet passages, for late-night listening */
  compress?: boolean;
}

export const EQ_PRESETS: EqDef[] = [
  { id: 'flat', name: 'Flat — as recorded', low: 0, mid: 0, high: 0, midHz: 1000, trim: 1 },
  { id: 'bass', name: 'Bass', low: 7, mid: -1, high: 1, midHz: 500, trim: 0.72 },
  { id: 'deep', name: 'Deep bass', low: 11, mid: -2.5, high: 2, midHz: 400, trim: 0.6 },
  { id: 'vocal', name: 'Vocal', low: -3, mid: 4.5, high: 2, midHz: 2000, trim: 0.86 },
  { id: 'bright', name: 'Bright', low: -1, mid: 0, high: 6, midHz: 1500, trim: 0.82 },
  { id: 'night', name: 'Night — even volume', low: 2, mid: 1, high: -1, midHz: 900, trim: 0.85, compress: true },
];

interface Chain {
  ctx: AudioContext;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  gain: GainNode;
  comp: DynamicsCompressorNode;
  compressed: boolean;
}

let chain: Chain | null = null;

function defOf(id: EqPreset): EqDef {
  return EQ_PRESETS.find((p) => p.id === id) || EQ_PRESETS[0]!;
}

/**
 * Route a media element through the chain. Returns true once connected;
 * calling again is a no-op, which is what the single-source-per-element rule
 * requires.
 */
export function connectEq(el: HTMLMediaElement, preset: EqPreset = 'flat'): boolean {
  if (chain) return true;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  try {
    const ctx = new Ctor();
    const src = ctx.createMediaElementSource(el);
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 180;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.Q.value = 0.9;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 4200;
    const gain = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    src.connect(low).connect(mid).connect(high).connect(gain).connect(ctx.destination);
    chain = { ctx, low, mid, high, gain, comp, compressed: false };
    setEqPreset(preset);
    return true;
  } catch {
    // an element already routed elsewhere, or no Web Audio — playback still works
    return false;
  }
}

/** Apply a preset to the live chain. */
export function setEqPreset(id: EqPreset) {
  if (!chain) return;
  const d = defOf(id);
  const { ctx, low, mid, high, gain, comp } = chain;
  const t = ctx.currentTime;
  low.gain.setTargetAtTime(d.low, t, 0.05);
  mid.gain.setTargetAtTime(d.mid, t, 0.05);
  mid.frequency.setTargetAtTime(d.midHz, t, 0.05);
  high.gain.setTargetAtTime(d.high, t, 0.05);
  gain.gain.setTargetAtTime(d.trim, t, 0.05);

  // patch the compressor in or out without rebuilding the chain
  const want = !!d.compress;
  if (want !== chain.compressed) {
    try {
      gain.disconnect();
      if (want) gain.connect(comp).connect(ctx.destination);
      else gain.connect(ctx.destination);
      chain.compressed = want;
    } catch {
      // leave the chain as it is rather than dropping audio
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function eqReady(): boolean {
  return chain !== null;
}
