// The receiver's audio graph. Only plumbing lives here; the director decides what plays when.
//
//   music engine ─ musicIn ─ duck ─ musicBus ─┐
//   voice clips ─ (per-clip gain) ─ voiceBus ─┴─ programme ─┐
//   static + whistle (tuning), hiss ─ staticBus ────────────┴─ mix ─┬─ analyser   (pre-volume)
//                                                                   └─ master ─ output
//   dial click ─────────────────────────────────────────────────────────┘
//
// Output is either the context destination or, on mobile, a MediaStream played by an
// <audio> element: that keeps iOS/Android treating us as a media player (lock screen,
// Media Session, background playback, the iOS silent switch).

import { loadSfxBuffer, synthClick, synthStatic } from './sfx';
import { resolveAsset } from './manifest';

export type OutputMode = 'auto' | 'destination' | 'element';
export type StaticKind = 'channel' | 'short';
export type Bus = 'music' | 'voice' | 'mix';

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

interface StaticVoice {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  whistle: OscillatorNode;
  whistleGain: GainNode;
  gain: GainNode;
}

const STATIC_LEVEL = 0.6;

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
  readonly analyser: AnalyserNode;
  private readonly programme: GainNode;
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
    this.programme = gain(0);
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
    this.programme.connect(this.mix);
    this.staticBus.connect(this.mix);
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
      (bus === 'music' ? this.musicBus : bus === 'voice' ? this.voiceBus : this.mix).connect(node);
      this.taps.set(bus, node);
    }
    return node;
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  playVoice(buffer: AudioBuffer, { when, offset, end, fadeIn, gain }: VoiceOptions): VoiceHandle {
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
    source.connect(level).connect(this.voiceBus);
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
  }

  get staticPlaying(): boolean {
    return this.staticVoice !== null;
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
