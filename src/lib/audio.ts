// Playback, static transitions and the analyser that feeds the visualizer.
//
// Signal path:
//   <audio> ─ episodeGain ─┐
//   static + whistle ──────┴─ bus ─┬─ analyser   (visualizer taps pre-volume)
//                                  └─ master ─ destination
//   dial clicks ─────────────────────┘
//
// A single <audio> element is reused for every episode so that, once unlocked by
// the first user gesture, later play() calls are allowed on every browser.

import { resolveAsset } from './channels';
import { createSilenceUrl, loadSfxBuffer, synthClick, synthStatic } from './sfx';

export type TransitionKind = 'channel' | 'episode';

export type TuneResult =
  | { type: 'playing' }
  | { type: 'cancelled' }
  | { type: 'blocked' }
  | { type: 'failed'; message: string };

interface EngineEvents {
  time: { currentTime: number; duration: number };
  ended: void;
  error: string;
  buffering: boolean;
  /** Playback was paused by something other than us (OS media controls, unplugged headphones). */
  interrupted: void;
}

type Listener<T> = (payload: T) => void;

interface Graph {
  ctx: AudioContext;
  episodeGain: GainNode;
  bus: GainNode;
  master: GainNode;
  analyser: AnalyserNode;
}

interface StaticVoice {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  whistle: OscillatorNode;
  whistleGain: GainNode;
  gain: GainNode;
}

/** Minimum time the static burst plays before the new transmission fades in. */
const STATIC_MS: Record<TransitionKind, number> = { channel: 650, episode: 420 };
const STATIC_LEVEL = 0.7;
const LOAD_TIMEOUT_MS = 15_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AudioEngine {
  private readonly audio: HTMLAudioElement;
  private graph: Graph | null = null;
  private staticBuffer: AudioBuffer | null = null;
  private clickBuffer: AudioBuffer | null = null;
  private staticVoice: StaticVoice | null = null;
  private silenceUrl: string | null = null;

  /** Bumped by every tune/pause/stop; async work from an older generation bails out. */
  private generation = 0;
  private transitioning = false;
  private ownPause = false;
  /** URL of the episode that finished tuning and can be resumed in place. */
  private loadedUrl: string | null = null;

  private volume = 0.8;
  private muted = false;
  private readonly listeners = new Map<keyof EngineEvents, Set<Listener<never>>>();

  constructor() {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audio.addEventListener('timeupdate', this.emitTime);
    audio.addEventListener('durationchange', this.emitTime);
    audio.addEventListener('ended', () => {
      if (this.loadedUrl && !this.transitioning) this.emit('ended', undefined);
    });
    audio.addEventListener('error', () => {
      if (this.loadedUrl && !this.transitioning) {
        this.loadedUrl = null;
        this.emit('error', describeMediaError(audio.error));
      }
    });
    audio.addEventListener('waiting', () => {
      if (this.loadedUrl && !this.transitioning) this.emit('buffering', true);
    });
    audio.addEventListener('playing', () => this.emit('buffering', false));
    audio.addEventListener('pause', () => {
      if (this.ownPause) {
        this.ownPause = false;
        return;
      }
      if (this.loadedUrl && !this.transitioning && !audio.ended) this.emit('interrupted', undefined);
    });
    this.audio = audio;
  }

  // ── Events ──────────────────────────────────────────────────────────────

  on<K extends keyof EngineEvents>(event: K, listener: Listener<EngineEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  private emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => (listener as Listener<EngineEvents[K]>)(payload));
  }

  private emitTime = (): void => {
    if (!this.loadedUrl || this.transitioning) return;
    this.emit('time', { currentTime: this.audio.currentTime, duration: this.audio.duration });
  };

  // ── Setup ───────────────────────────────────────────────────────────────

  get isReady(): boolean {
    return this.graph !== null;
  }

  /**
   * Creates/resumes the AudioContext and unlocks the media element. Must run
   * synchronously inside a user gesture handler; safe to call repeatedly.
   */
  unlock(): void {
    const { ctx } = this.ensureGraph();
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    if (this.silenceUrl === null && !this.audio.getAttribute('src')) {
      const url = (this.silenceUrl = createSilenceUrl());
      this.audio.src = url;
      this.audio.play().then(
        () => {
          if (this.audio.src === url) this.pauseElement();
        },
        () => {},
      );
    }
  }

  private ensureGraph(): Graph {
    if (this.graph) return this.graph;

    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const source = ctx.createMediaElementSource(this.audio);
    const episodeGain = ctx.createGain();
    const bus = ctx.createGain();
    const master = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = -88;
    analyser.maxDecibels = -18;
    master.gain.value = this.outputGain();

    source.connect(episodeGain).connect(bus);
    bus.connect(analyser);
    bus.connect(master).connect(ctx.destination);

    // iOS can interrupt the context (calls, Siri). Keep the UI honest about it.
    ctx.addEventListener('statechange', () => {
      if ((ctx.state as string) === 'interrupted' && !this.audio.paused) {
        this.pauseElement();
        this.emit('interrupted', undefined);
      }
    });

    this.staticBuffer = synthStatic(ctx);
    this.clickBuffer = synthClick(ctx);
    void loadSfxBuffer(ctx, resolveAsset('/sfx/static-burst.mp3')).then((b) => b && (this.staticBuffer = b));
    void loadSfxBuffer(ctx, resolveAsset('/sfx/dial-click.mp3')).then((b) => b && (this.clickBuffer = b));

    this.graph = { ctx, episodeGain, bus, master, analyser };
    return this.graph;
  }

  getAnalyser(): AnalyserNode | null {
    return this.graph?.analyser ?? null;
  }

  // ── Transport ───────────────────────────────────────────────────────────

  /**
   * Static burst → swap source → fade the new transmission in. The new file
   * starts loading (muted) under the static, so slow loads just mean more static.
   */
  async tune(url: string, { loop = false, kind = 'episode' }: { loop?: boolean; kind?: TransitionKind } = {}): Promise<TuneResult> {
    const graph = this.ensureGraph();
    const generation = ++this.generation;
    this.transitioning = true;
    this.loadedUrl = null;

    this.startStatic(kind);
    setGain(graph.ctx, graph.episodeGain.gain, 0, 0.012);
    const minimum = delay(STATIC_MS[kind]);

    await delay(60); // let the duck land before cutting the old audio
    if (generation !== this.generation) return { type: 'cancelled' };

    this.pauseElement();
    this.audio.loop = loop;
    this.audio.src = url;
    const started = this.audio.play().then(
      () => null,
      (error: unknown) => error as Error,
    );
    const timeout = delay(LOAD_TIMEOUT_MS).then(() => new Error('timeout'));
    const [error] = await Promise.all([Promise.race([started, timeout]), minimum]);
    if (generation !== this.generation) return { type: 'cancelled' };

    if (error) {
      this.transitioning = false;
      this.pauseElement();
      this.stopStatic(0.15);
      if (error.name === 'NotAllowedError') return { type: 'blocked' };
      const message =
        error.message === 'timeout'
          ? 'The transmission is taking too long to arrive.'
          : describeMediaError(this.audio.error);
      return { type: 'failed', message };
    }

    // The file may have been playing muted under the static for a moment.
    if (this.audio.currentTime > 0.05) this.audio.currentTime = 0;
    this.transitioning = false;
    this.loadedUrl = url;
    this.stopStatic(0.4);
    setGain(graph.ctx, graph.episodeGain.gain, 1, 0.1);
    this.emitTime();
    return { type: 'playing' };
  }

  /** True if `url` is tuned in and can be resumed without a new transition. */
  canResume(url: string): boolean {
    return this.loadedUrl === url && !this.audio.error;
  }

  async resume(): Promise<TuneResult> {
    const graph = this.ensureGraph();
    const generation = ++this.generation;
    setGain(graph.ctx, graph.episodeGain.gain, 0, 0.001);
    try {
      await this.audio.play();
    } catch (error) {
      if (generation !== this.generation) return { type: 'cancelled' };
      if ((error as Error).name === 'NotAllowedError') return { type: 'blocked' };
      return { type: 'failed', message: describeMediaError(this.audio.error) };
    }
    if (generation !== this.generation) return { type: 'cancelled' };
    setGain(graph.ctx, graph.episodeGain.gain, 1, 0.04);
    return { type: 'playing' };
  }

  pause(): void {
    const generation = ++this.generation;
    if (this.transitioning) {
      this.transitioning = false;
      this.loadedUrl = null;
    }
    this.stopStatic(0.08);
    if (!this.graph) return this.pauseElement();
    setGain(this.graph.ctx, this.graph.episodeGain.gain, 0, 0.015);
    setTimeout(() => {
      if (generation === this.generation) this.pauseElement();
    }, 80);
  }

  /** Silence everything and unload the current file. */
  stop(): void {
    this.generation++;
    this.transitioning = false;
    this.loadedUrl = null;
    this.stopStatic(0.1);
    this.pauseElement();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  seek(seconds: number): void {
    const { duration } = this.audio;
    if (!this.loadedUrl || !Number.isFinite(duration)) return;
    this.audio.currentTime = Math.min(Math.max(0, seconds), duration);
    this.emitTime();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  /** The mechanical detent click of the dial. */
  click(intensity = 1): void {
    const graph = this.graph;
    if (!graph || !this.clickBuffer || graph.ctx.state !== 'running') return;
    const source = graph.ctx.createBufferSource();
    source.buffer = this.clickBuffer;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    const gain = graph.ctx.createGain();
    gain.gain.value = 0.55 * intensity;
    source.connect(gain).connect(graph.master);
    source.start();
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private outputGain(): number {
    return this.muted ? 0 : this.volume ** 2; // perceptual-ish curve
  }

  private applyVolume(): void {
    if (this.graph) setGain(this.graph.ctx, this.graph.master.gain, this.outputGain(), 0.03);
  }

  private pauseElement(): void {
    if (this.audio.paused) return;
    this.ownPause = true;
    this.audio.pause();
  }

  /** Starts (or re-sweeps, if already running) the static burst. */
  private startStatic(kind: TransitionKind): void {
    const graph = this.graph;
    if (!graph || !this.staticBuffer) return;
    const { ctx } = graph;
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
      gain.connect(graph.bus);
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
    setGain(ctx, voice.gain.gain, STATIC_LEVEL, 0.012);
  }

  private stopStatic(seconds: number): void {
    const voice = this.staticVoice;
    const graph = this.graph;
    if (!voice || !graph) return;
    this.staticVoice = null;
    const end = graph.ctx.currentTime + seconds + 0.05;
    setGain(graph.ctx, voice.gain.gain, 0, seconds / 4);
    voice.source.stop(end);
    voice.whistle.stop(end);
    voice.source.addEventListener('ended', () => voice.gain.disconnect());
  }
}

/** Smoothly approaches `value` (time constant in seconds) from wherever it is now, without clicks. */
function setGain(ctx: BaseAudioContext, param: AudioParam, value: number, timeConstant: number): void {
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

function describeMediaError(error: MediaError | null): string {
  switch (error?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The transmission was interrupted by a network error.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'The transmission arrived garbled and could not be decoded.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Nothing is broadcasting at this address. The audio file is missing or unreadable.';
    default:
      return 'The signal dropped for reasons this dimension does not understand.';
  }
}

export const engine = new AudioEngine();
