// Nightjar ship cabin ambience generator (Pillar 3, docs/V5-PLAN.md).
//
// Synthesizes a cozy, diegetic relay-vessel soundscape purely with Web Audio nodes:
//   1. Warm low hull thruster resonance (detuned 55 Hz sine + 82.5 Hz triangle through a
//      140 Hz low-pass filter, gently modulated by a 0.08 Hz breathing LFO).
//   2. Soft cabin ventilation / viewport rain texture (looping pink/brown noise through a
//      480 Hz filter stage with a slow breathing LFO).
//   3. Faint console CRT flyback / transformer hum (120 Hz harmonic at very low gain).
//
// Costs nothing when off: nodes are lazily created when `setLevel(level > 0)` is called and
// released after fading to silence when `setLevel(0)` is called.

import { setGain } from './mixer';

export const CABIN_MAX_GAIN = 0.22;
const RELEASE_DELAY_MS = 650;
const RAMP_TAU = 0.14;

interface CabinNodes {
  master: GainNode;
  thrusterOsc1: OscillatorNode;
  thrusterOsc2: OscillatorNode;
  thrusterFilter: BiquadFilterNode;
  thrusterGain: GainNode;
  thrusterLfo: OscillatorNode;
  thrusterLfoDepth: GainNode;
  ventSource: AudioBufferSourceNode;
  ventBand: BiquadFilterNode;
  ventLowpass: BiquadFilterNode;
  ventGain: GainNode;
  ventLfo: OscillatorNode;
  ventLfoDepth: GainNode;
  humOsc: OscillatorNode;
  humGain: GainNode;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

/** Synthesizes a warm pink/brown noise loop for cabin ventilation and viewport rain. */
export function synthCabinNoise(ctx: BaseAudioContext, seconds = 3): AudioBuffer {
  const rate = ctx.sampleRate || 44_100;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let brown = 0;
  for (let i = 0; i < length; i++) {
    // Deterministic-ish smooth noise texture with gentle rain-like micro-patter.
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    const pink = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    brown = (brown + 0.025 * white) / 1.025;
    data[i] = pink * 0.55 + brown * 0.45;
  }
  return buffer;
}

export class CabinAmbience {
  readonly ctx: AudioContext;
  private readonly destination: AudioNode;
  private noiseBuffer: AudioBuffer | null = null;
  private nodes: CabinNodes | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | undefined;
  private currentLevel = 0;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
  }

  /** Current normalized cabin level in [0, 1]. */
  get level(): number {
    return this.currentLevel;
  }

  /** True while the cabin synthesis nodes are allocated and running. */
  get active(): boolean {
    return this.nodes !== null;
  }

  /**
   * Sets the cabin ambience level (clamped to `0..1`).
   * Lazily starts the Web Audio graph when `level > 0`, and smoothly ramps down and releases
   * nodes when `level === 0`.
   */
  setLevel(level: number): void {
    const clamped = clamp01(level);
    this.currentLevel = clamped;
    if (clamped > 0) {
      if (this.releaseTimer !== undefined) {
        clearTimeout(this.releaseTimer);
        this.releaseTimer = undefined;
      }
      const nodes = this.ensureNodes();
      setGain(this.ctx, nodes.master.gain, clamped * CABIN_MAX_GAIN, RAMP_TAU);
      return;
    }

    if (!this.nodes) return;
    setGain(this.ctx, this.nodes.master.gain, 0, RAMP_TAU * 0.8);
    if (this.releaseTimer === undefined) {
      this.releaseTimer = setTimeout(() => {
        this.releaseTimer = undefined;
        if (this.currentLevel === 0) this.releaseNodes();
      }, RELEASE_DELAY_MS);
    }
  }

  /** Immediately stops and disconnects all cabin ambience nodes. */
  dispose(): void {
    if (this.releaseTimer !== undefined) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = undefined;
    }
    this.currentLevel = 0;
    this.releaseNodes();
  }

  private ensureNodes(): CabinNodes {
    if (this.nodes) return this.nodes;
    const { ctx } = this;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(this.destination);

    // 1. Warm low hull thruster resonance (55 Hz sine + 82.5 Hz triangle -> 140 Hz LP, 0.08 Hz LFO)
    const thrusterOsc1 = ctx.createOscillator();
    thrusterOsc1.type = 'sine';
    thrusterOsc1.frequency.value = 55;

    const thrusterOsc2 = ctx.createOscillator();
    thrusterOsc2.type = 'triangle';
    thrusterOsc2.frequency.value = 82.5;

    const thrusterFilter = ctx.createBiquadFilter();
    thrusterFilter.type = 'lowpass';
    thrusterFilter.frequency.value = 140;
    thrusterFilter.Q.value = 0.85;

    const thrusterGain = ctx.createGain();
    thrusterGain.gain.value = 0.44;

    const thrusterLfo = ctx.createOscillator();
    thrusterLfo.type = 'sine';
    thrusterLfo.frequency.value = 0.08;

    const thrusterLfoDepth = ctx.createGain();
    thrusterLfoDepth.gain.value = 20;

    thrusterLfo.connect(thrusterLfoDepth).connect(thrusterFilter.frequency);
    thrusterOsc1.connect(thrusterFilter);
    thrusterOsc2.connect(thrusterFilter);
    thrusterFilter.connect(thrusterGain).connect(master);

    // 2. Soft cabin ventilation / viewport rain texture (looping pink/brown noise -> 480 Hz filter + LFO)
    this.noiseBuffer ??= synthCabinNoise(ctx);
    const ventSource = ctx.createBufferSource();
    ventSource.buffer = this.noiseBuffer;
    ventSource.loop = true;

    const ventBand = ctx.createBiquadFilter();
    ventBand.type = 'bandpass';
    ventBand.frequency.value = 480;
    ventBand.Q.value = 0.55;

    const ventLowpass = ctx.createBiquadFilter();
    ventLowpass.type = 'lowpass';
    ventLowpass.frequency.value = 480;
    ventLowpass.Q.value = 0.7;

    const ventGain = ctx.createGain();
    ventGain.gain.value = 0.36;

    const ventLfo = ctx.createOscillator();
    ventLfo.type = 'sine';
    ventLfo.frequency.value = 0.11;

    const ventLfoDepth = ctx.createGain();
    ventLfoDepth.gain.value = 90;

    ventLfo.connect(ventLfoDepth).connect(ventLowpass.frequency);
    ventSource.connect(ventBand).connect(ventLowpass).connect(ventGain).connect(master);

    // 3. Faint console CRT flyback / transformer hum (120 Hz harmonic at very low gain)
    const humOsc = ctx.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.value = 120;

    const humGain = ctx.createGain();
    humGain.gain.value = 0.032;
    humOsc.connect(humGain).connect(master);

    thrusterOsc1.start(now);
    thrusterOsc2.start(now);
    thrusterLfo.start(now);
    ventSource.start(now);
    ventLfo.start(now);
    humOsc.start(now);

    this.nodes = {
      master,
      thrusterOsc1,
      thrusterOsc2,
      thrusterFilter,
      thrusterGain,
      thrusterLfo,
      thrusterLfoDepth,
      ventSource,
      ventBand,
      ventLowpass,
      ventGain,
      ventLfo,
      ventLfoDepth,
      humOsc,
      humGain,
    };
    return this.nodes;
  }

  private releaseNodes(): void {
    const nodes = this.nodes;
    if (!nodes) return;
    this.nodes = null;
    const sources: AudioScheduledSourceNode[] = [
      nodes.thrusterOsc1,
      nodes.thrusterOsc2,
      nodes.thrusterLfo,
      nodes.ventSource,
      nodes.ventLfo,
      nodes.humOsc,
    ];
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        // Already stopped.
      }
      try {
        s.disconnect();
      } catch {
        // Ignore.
      }
    }
    try {
      nodes.master.disconnect();
    } catch {
      // Ignore.
    }
  }
}
