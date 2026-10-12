// The receiver's audio graph. Only plumbing lives here; the director decides what plays when.
//
//   music engine ─ musicIn ─ duck ─ musicBus ─┐
//   voice clips ─ (per-clip gain) ─ voiceBus ─┴─ programme ─ wobble ─ eventDuck ─ reception ─┐
//   tuning static, dial noise + whistle, hiss ─ staticBus ───────────────────────────────────┤
//   HUSH, event clips and event sound ─ overlayBus ──────────────────────────────────────────┴─ mix ─┬─ analyser (pre-volume)
//                                                                                                   └─ master ─ output
//   dial click ─────────────────────────────────────────────────────────────────────────────────────────┘
//
// Reception (v3): the programme passes through a high-pass, a low-pass and a gain that follow
// the signal at the dial position, so a detuned station thins out and sinks into the dial
// noise, and a distant one is only a faint band-passed bleed. One programme, one music
// engine: bleed is the same audio, shaped, never a second station.
//
// Output is either the context destination or, on mobile, a MediaStream played by an
// <audio> element: that keeps iOS/Android treating us as a media player (lock screen,
// Media Session, background playback, the iOS silent switch).

import { loadSfxBuffer, synthClick, synthStatic } from './sfx';
import { resolveAsset } from './manifest';

export type OutputMode = 'auto' | 'destination' | 'element';
export type StaticKind = 'channel' | 'short';
export type Bus = 'music' | 'voice' | 'overlay' | 'mix';

export interface VoiceHandle {
  /** Context time the clip stops (or stopped). */
  readonly end: number;
  readonly ended: boolean;
  /** Fades out and stops now. */
  stop(fade?: number): void;
}

export interface VoiceOptions {
  /** Context time to start at. */
  when: number;
  /** Seconds into the buffer to start from. */
  offset: number;
  /** Context time the slot ends; a longer buffer is faded out by then. */
  end: number;
  fadeIn: number;
  gain: number;
}

/** What the receiver hears at the dial position (see Mixer.setReception). */
export interface ReceptionLevels {
  /** The programme's signal at the dial, 0–1. */
  signal: number;
  /** Faint bleed beyond its reach, 0–1 (scaled down a lot). */
  bleed: number;
  /** How much dial noise, 0–1 (1 = nothing decoded). */
  noise: number;
  /** Distance from the programme's centre in MHz (texture and the heterodyne whistle). */
  detune: number;
}

interface StaticVoice {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  whistle: OscillatorNode;
  whistleGain: GainNode;
  gain: GainNode;
}

interface DialNoise {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  whistle: OscillatorNode;
  whistleGain: GainNode;
}

interface Wobble {
  lfos: OscillatorNode[];
  depths: GainNode[];
}

const STATIC_LEVEL = 0.6;
/** Dial noise at no signal (the tuning burst is STATIC_LEVEL). */
const NOISE_LEVEL = 0.34;
/** Programme level of a distant station's bleed at the edge of its reach. */
const BLEED_LEVEL = 0.075;
const WHISTLE_LEVEL = 0.012;
/** Reception filter range (Hz). */
const LP_MIN = 1600;
const HP_MAX = 520;
/** Gains and filters follow the dial with these time constants (s): smooth, no zipper noise. */
const DIAL_TAU = 0.035;
const FILTER_TAU = 0.05;

/** Mobile browsers get the media-element output; desktop plays straight to the destination. */
function prefersElementOutput(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua) || iPadOS;
}

export class Mixer {
  readonly ctx: AudioContext;
  /** Connect the music engine's output here. */
  readonly musicIn: GainNode;
  readonly duck: GainNode;
  readonly musicBus: GainNode;
  readonly voiceBus: GainNode;
  /** HUSH and multiverse events: heard on every frequency, through the static. */
  readonly overlayBus: GainNode;
  /** Ducks the programme under HUSH and events. */
  readonly eventDuck: GainNode;
  readonly analyser: AnalyserNode;
  private readonly programme: GainNode;
  private readonly wobbleDelay: DelayNode;
  private readonly highpass: BiquadFilterNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly reception: GainNode;
  private readonly staticBus: GainNode;
  private readonly mix: GainNode;
  private readonly master: GainNode;
  private readonly taps = new Map<Bus, AnalyserNode>();

  private element: HTMLAudioElement | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private ownElementPause = false;
  outputMode: 'destination' | 'element' = 'destination';

  private staticBuffer: AudioBuffer;
  private clickBuffer: AudioBuffer;
  private staticVoice: StaticVoice | null = null;
  private hissVoice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private dialNoise: DialNoise | null = null;
  private dialRelease: ReturnType<typeof setTimeout> | undefined;
  private levels: ReceptionLevels = { signal: 1, bleed: 0, noise: 0, detune: 0 };
  private wobble: Wobble | null = null;

  /** Called when the OS interrupts or pauses playback behind our back. */
  onInterrupted: (() => void) | null = null;

  constructor(mode: OutputMode = 'auto') {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    const gain = (value = 1) => {
      const node = ctx.createGain();
      node.gain.value = value;
      return node;
    };
    this.musicIn = gain();
    this.duck = gain();
    this.musicBus = gain();
    this.voiceBus = gain();
    this.overlayBus = gain();
    this.eventDuck = gain();
    this.programme = gain(0);
    this.wobbleDelay = ctx.createDelay(0.1);
    this.wobbleDelay.delayTime.value = 0;
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.value = 20;
    this.highpass.Q.value = 0.5;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = this.lpMax;
    this.lowpass.Q.value = 0.5;
    this.reception = gain();
    this.staticBus = gain();
    this.mix = gain();
    this.master = gain(0);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;
    this.analyser.minDecibels = -88;
    this.analyser.maxDecibels = -18;

    this.musicIn.connect(this.duck).connect(this.musicBus).connect(this.programme);
    this.voiceBus.connect(this.programme);
    this.programme.connect(this.wobbleDelay).connect(this.eventDuck).connect(this.highpass).connect(this.lowpass);
    this.lowpass.connect(this.reception).connect(this.mix);
    this.staticBus.connect(this.mix);
    this.overlayBus.connect(this.mix);
    this.mix.connect(this.analyser);
    this.mix.connect(this.master);
    this.connectOutput(mode === 'auto' ? (prefersElementOutput() ? 'element' : 'destination') : mode);

    // iOS interrupts the context for calls and Siri; Safari may suspend it in the
    // background. (The director ignores this while it's paused itself.)
    ctx.addEventListener('statechange', () => {
      const state = ctx.state as string;
      if (state === 'interrupted' || state === 'suspended') this.onInterrupted?.();
    });

    // Lets iOS play through the silent switch, like any music app.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        // Not supported.
      }
    }

    this.staticBuffer = synthStatic(ctx);
    this.clickBuffer = synthClick(ctx);
    void loadSfxBuffer(ctx, resolveAsset('/sfx/static-burst.mp3')).then((b) => b && (this.staticBuffer = b));
    void loadSfxBuffer(ctx, resolveAsset('/sfx/dial-click.mp3')).then((b) => b && (this.clickBuffer = b));
  }

  private connectOutput(mode: 'destination' | 'element'): void {
    if (mode === 'element' && typeof this.ctx.createMediaStreamDestination === 'function') {
      try {
        const destination = this.ctx.createMediaStreamDestination();
        const element = new Audio();
        element.srcObject = destination.stream;
        element.setAttribute('playsinline', '');
        element.addEventListener('pause', () => {
          if (this.ownElementPause) this.ownElementPause = false;
          else this.onInterrupted?.();
        });
        this.master.connect(destination);
        this.streamDestination = destination;
        this.element = element;
        this.outputMode = 'element';
        return;
      } catch {
        // Fall through to the plain destination.
      }
    }
    this.master.connect(this.ctx.destination);
    this.outputMode = 'destination';
  }

  private fallBackToDestination(): void {
    if (!this.streamDestination) return;
    this.master.disconnect(this.streamDestination);
    this.master.connect(this.ctx.destination);
    this.element = null;
    this.streamDestination = null;
    this.outputMode = 'destination';
  }

  /** Resumes the context and starts the output element. Call inside a user gesture. */
  unlock(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    const element = this.element;
    if (element && element.paused) {
      element.play().catch(() => this.fallBackToDestination());
    }
  }

  /** Pauses the output element (lets the OS show "paused"); the context may be suspended later. */
  sleep(): void {
    if (this.element && !this.element.paused) {
      this.ownElementPause = true;
      this.element.pause();
    }
  }

  /** Suspends the audio thread entirely (saves battery while paused). */
  suspend(): void {
    if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  /** Resolves when the context is running, or after `timeoutMs`. */
  async whenRunning(timeoutMs: number): Promise<boolean> {
    if (this.running) return true;
    await Promise.race([
      this.ctx.resume().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    return this.running;
  }

  get running(): boolean {
    return this.ctx.state === 'running';
  }

  /** Output latency in seconds (how far behind ctx.currentTime the speakers are). */
  get latency(): number {
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  // ── Levels ────────────────────────────────────────────────────────────────

  setVolume(volume: number, muted: boolean): void {
    // Perceptual-ish curve.
    setGain(this.ctx, this.master.gain, muted ? 0 : Math.min(1, Math.max(0, volume)) ** 2, 0.03);
  }

  /** Fades the programme (music + voice) in or out; static is unaffected. */
  fadeProgramme(target: number, seconds: number, at = this.ctx.currentTime): void {
    const param = this.programme.gain;
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
    param.linearRampToValueAtTime(target, at + Math.max(seconds, 0.005));
  }

  /** Moves the music duck towards `level` from `at`, with time constant `tau` (seconds). */
  duckTo(level: number, at: number, tau: number): void {
    this.duck.gain.setTargetAtTime(level, Math.max(at, this.ctx.currentTime), tau);
  }

  /** Clears any duck automation and returns the music to full level. */
  resetDuck(): void {
    const param = this.duck.gain;
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(1, now, 0.05);
  }

  /** An analyser on one bus, created on first use (for meters). */
  tap(bus: Bus): AnalyserNode {
    let node = this.taps.get(bus);
    if (!node) {
      node = this.ctx.createAnalyser();
      node.fftSize = 512;
      node.smoothingTimeConstant = 0.5;
      const source = { music: this.musicBus, voice: this.voiceBus, overlay: this.overlayBus, mix: this.mix }[bus];
      source.connect(node);
      this.taps.set(bus, node);
    }
    return node;
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  /** Plays a clip on the station's voice bus, or on the overlay (HUSH, events). */
  playVoice(buffer: AudioBuffer, { when, offset, end, fadeIn, gain }: VoiceOptions, bus: 'voice' | 'overlay' = 'voice'): VoiceHandle {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const level = ctx.createGain();
    if (fadeIn > 0) {
      level.gain.value = 0;
      level.gain.setValueAtTime(0, when);
      level.gain.linearRampToValueAtTime(gain, when + fadeIn);
    } else {
      level.gain.value = gain;
    }
    const natural = when + (buffer.duration - offset);
    let stopAt = Math.min(end, natural);
    if (natural > end + 0.05) {
      // The slot is shorter than the clip: fade it out by the end of the slot.
      const fade = Math.min(0.35, (end - when) / 3);
      level.gain.setValueAtTime(gain, Math.max(when + fadeIn, end - fade));
      level.gain.linearRampToValueAtTime(0, end);
      stopAt = end;
    }
    source.connect(level).connect(bus === 'overlay' ? this.overlayBus : this.voiceBus);
    source.start(when, Math.max(0, offset));
    source.stop(stopAt + 0.02);

    const handle = {
      end: stopAt,
      ended: false,
      stop: (fade = 0.08) => {
        if (handle.ended) return;
        const now = ctx.currentTime;
        level.gain.cancelScheduledValues(now);
        level.gain.setValueAtTime(level.gain.value, now);
        level.gain.linearRampToValueAtTime(0, now + fade);
        try {
          source.stop(now + fade + 0.01);
        } catch {
          // Already stopped.
        }
        handle.end = Math.min(handle.end, now + fade);
      },
    };
    source.addEventListener('ended', () => {
      handle.ended = true;
      source.disconnect();
      level.disconnect();
    });
    return handle;
  }

  // ── Static, hiss, click ───────────────────────────────────────────────────

  /** The dial click. */
  click(intensity = 1): void {
    const { ctx } = this;
    if (ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = this.clickBuffer;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.45 * intensity;
    source.connect(gain).connect(this.master);
    source.start();
  }

  /** Starts (or re-sweeps) the tuning static: band-pass-swept noise and a heterodyne whistle. */
  startStatic(kind: StaticKind): void {
    const { ctx } = this;
    const now = ctx.currentTime;
    let voice = this.staticVoice;
    if (!voice) {
      const source = ctx.createBufferSource();
      source.buffer = this.staticBuffer;
      source.loop = true;
      const length = this.staticBuffer.duration;
      // Skip MP3 encoder padding at the edges so the loop has no gap.
      if (length > 0.4) {
        source.loopStart = 0.08;
        source.loopEnd = length - 0.08;
      }
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.7;
      const whistle = ctx.createOscillator();
      const whistleGain = ctx.createGain();
      whistleGain.gain.value = 0;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain);
      whistle.connect(whistleGain).connect(gain);
      gain.connect(this.staticBus);
      source.start(now, Math.random() * length * 0.6);
      whistle.start(now);
      voice = this.staticVoice = { source, filter, whistle, whistleGain, gain };
    }
    // Sweep the band like a needle crossing stations, with a faint heterodyne whistle.
    const sweep = kind === 'channel' ? 0.6 : 0.35;
    const [from, to] = Math.random() < 0.5 ? [700, 3200] : [3200, 700];
    rampTo(voice.filter.frequency, from * (0.8 + Math.random() * 0.4), to * (0.8 + Math.random() * 0.4), now, sweep);
    rampTo(voice.whistle.frequency, 900 + Math.random() * 1800, 250 + Math.random() * 600, now, sweep);
    const whistleLevel = kind === 'channel' ? 0.045 : 0.02;
    voice.whistleGain.gain.cancelScheduledValues(now);
    voice.whistleGain.gain.setValueAtTime(0, now);
    voice.whistleGain.gain.linearRampToValueAtTime(whistleLevel, now + 0.05);
    voice.whistleGain.gain.linearRampToValueAtTime(0, now + sweep);
    setGain(ctx, voice.gain.gain, kind === 'channel' ? STATIC_LEVEL : STATIC_LEVEL * 0.7, 0.012);
    // The burst stands in for the dial noise while it plays.
    this.applyReception(0.5);
  }

  stopStatic(seconds: number): void {
    const voice = this.staticVoice;
    if (!voice) return;
    this.staticVoice = null;
    const end = this.ctx.currentTime + seconds + 0.05;
    setGain(this.ctx, voice.gain.gain, 0, seconds / 4);
    voice.source.stop(end);
    voice.whistle.stop(end);
    voice.source.addEventListener('ended', () => voice.gain.disconnect());
    this.applyReception(Math.max(1, seconds * 3));
  }

  get staticPlaying(): boolean {
    return this.staticVoice !== null;
  }

  // ── Reception (v3) ────────────────────────────────────────────────────────

  private get lpMax(): number {
    return Math.min(18_000, this.ctx.sampleRate / 2 - 500);
  }

  /** Static level (dial noise, tuning burst) from 0 to 1; events from beyond turn it down. */
  setStaticLevel(level: number, seconds = 0.5): void {
    setGain(this.ctx, this.staticBus.gain, level, seconds / 3);
  }

  /**
   * Shapes the programme and the dial noise for the signal at the dial position. Call as
   * often as the dial moves: everything glides (tens of milliseconds), so dragging is smooth.
   */
  setReception(levels: ReceptionLevels): void {
    this.levels = levels;
    this.applyReception();
  }

  private applyReception(tauScale = 1): void {
    const { ctx } = this;
    const { signal, bleed, noise, detune } = this.levels;
    const s = clamp01(signal);
    setGain(ctx, this.reception.gain, Math.max(s ** 1.25, clamp01(bleed) * BLEED_LEVEL), DIAL_TAU * tauScale);
    setGain(ctx, this.lowpass.frequency, LP_MIN * (this.lpMax / LP_MIN) ** (s ** 0.8), FILTER_TAU * tauScale);
    setGain(ctx, this.highpass.frequency, 20 + HP_MAX * (1 - s) ** 2, FILTER_TAU * tauScale);

    const noiseLevel = this.staticVoice ? 0 : NOISE_LEVEL * clamp01(noise) ** 1.35;
    const whistleLevel = !this.staticVoice && s > 0.06 && s < 0.94 ? WHISTLE_LEVEL * Math.sin(Math.PI * s) : 0;
    if (noiseLevel < 0.001 && whistleLevel < 0.0005) {
      const dial = this.dialNoise;
      if (dial) {
        setGain(ctx, dial.gain.gain, 0, DIAL_TAU * tauScale);
        setGain(ctx, dial.whistleGain.gain, 0, DIAL_TAU);
        // Release the nodes once they've been silent a while (saves battery when tuned in).
        if (this.dialRelease === undefined) this.dialRelease = setTimeout(() => this.releaseDialNoise(), 3000);
      }
      return;
    }
    clearTimeout(this.dialRelease);
    this.dialRelease = undefined;
    const dial = this.ensureDialNoise();
    setGain(ctx, dial.gain.gain, noiseLevel, DIAL_TAU * tauScale);
    setGain(ctx, dial.filter.frequency, 1300 + Math.min(1, Math.abs(detune) * 3) * 2600, FILTER_TAU);
    setGain(ctx, dial.whistleGain.gain, whistleLevel, DIAL_TAU);
    setGain(ctx, dial.whistle.frequency, 180 + Math.abs(detune) * 7000, FILTER_TAU);
  }

  private ensureDialNoise(): DialNoise {
    if (this.dialNoise) return this.dialNoise;
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = this.staticBuffer;
    source.loop = true;
    const length = this.staticBuffer.duration;
    if (length > 0.4) {
      source.loopStart = 0.08;
      source.loopEnd = length - 0.08;
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.45;
    filter.frequency.value = 2000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const whistle = ctx.createOscillator();
    whistle.frequency.value = 600;
    const whistleGain = ctx.createGain();
    whistleGain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.staticBus);
    whistle.connect(whistleGain).connect(this.staticBus);
    source.start(ctx.currentTime, Math.random() * length * 0.6);
    whistle.start();
    return (this.dialNoise = { source, filter, gain, whistle, whistleGain });
  }

  private releaseDialNoise(): void {
    this.dialRelease = undefined;
    const dial = this.dialNoise;
    if (!dial || dial.gain.gain.value > 0.001) return;
    this.dialNoise = null;
    try {
      dial.source.stop();
      dial.whistle.stop();
    } catch {
      // Already stopped.
    }
    dial.gain.disconnect();
    dial.whistleGain.disconnect();
  }

  /** Silences the dial noise at once (pause, power off). */
  quietDial(): void {
    const dial = this.dialNoise;
    if (!dial) return;
    setGain(this.ctx, dial.gain.gain, 0, 0.03);
    setGain(this.ctx, dial.whistleGain.gain, 0, 0.03);
    clearTimeout(this.dialRelease);
    this.dialRelease = setTimeout(() => this.releaseDialNoise(), 400);
  }

  /** True while the dial noise nodes exist (for the lab and battery checks). */
  get dialNoiseActive(): boolean {
    return this.dialNoise !== null;
  }

  /** A seamless loop of noise, for event treatments. */
  get noiseBuffer(): AudioBuffer {
    return this.staticBuffer;
  }

  /**
   * Time-slip tape wobble on the programme: a slowly modulated delay (pitch drift of about
   * a percent). Glides in and out; costs nothing when off.
   */
  setWobble(on: boolean): void {
    const { ctx } = this;
    const now = ctx.currentTime;
    const delay = this.wobbleDelay.delayTime;
    if (on && !this.wobble) {
      const lfos: OscillatorNode[] = [];
      const depths: GainNode[] = [];
      for (const [rate, depth] of [
        [0.55, 0.0035],
        [0.17, 0.006],
      ] as const) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(depth, now + 1.5);
        lfo.connect(g).connect(delay);
        lfo.start(now);
        lfos.push(lfo);
        depths.push(g);
      }
      this.wobble = { lfos, depths };
      setGain(ctx, delay, 0.025, 0.15);
    } else if (!on && this.wobble) {
      const { lfos, depths } = this.wobble;
      this.wobble = null;
      for (const g of depths) setGain(ctx, g.gain, 0, 0.2);
      for (const lfo of lfos) lfo.stop(now + 1.2);
      lfos[0]?.addEventListener('ended', () => depths.forEach((g) => g.disconnect()));
      setGain(ctx, delay, 0, 0.25);
    }
  }

  /** A faint, filtered noise floor (used when the music engine is unavailable). */
  setHiss(level: number): void {
    const { ctx } = this;
    if (level <= 0) {
      const hiss = this.hissVoice;
      if (!hiss) return;
      this.hissVoice = null;
      setGain(ctx, hiss.gain.gain, 0, 0.2);
      hiss.source.stop(ctx.currentTime + 1);
      hiss.source.addEventListener('ended', () => hiss.gain.disconnect());
      return;
    }
    if (!this.hissVoice) {
      const source = ctx.createBufferSource();
      source.buffer = this.staticBuffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.staticBus);
      source.start();
      this.hissVoice = { source, gain };
    }
    setGain(ctx, this.hissVoice.gain.gain, level, 0.3);
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

/** Smoothly approaches `value` (time constant in seconds) from wherever it is now, without clicks. */
export function setGain(ctx: BaseAudioContext, param: AudioParam, value: number, timeConstant: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, Math.max(timeConstant, 0.001));
}

function rampTo(param: AudioParam, from: number, to: number, start: number, seconds: number): void {
  param.cancelScheduledValues(start);
  param.setValueAtTime(from, start);
  param.exponentialRampToValueAtTime(to, start + seconds);
}
