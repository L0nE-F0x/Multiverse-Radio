// The director: plays the schedule. It joins a programme live at the right offset, keeps
// voice clips, music runs and ducking scheduled a few seconds ahead on the AudioContext
// clock, and recovers from missing clips, a missing music engine, clock jumps and OS
// interruptions. The store (./store.ts) is its only client; the lab pokes at it directly.
//
// v3, the continuous dial: the director owns the dial position. Whatever transmitter the
// receiver locks on to there (./dial.ts) is the *programme*: a roster station, a pirate or
// an oddity, or nothing at all on bare static. Exactly one programme plays at a time, on one
// music engine; reception (signal, bleed, dial noise) is shaped in the mixer as the dial
// moves, and the programme changes only once the dial settles on a new transmitter. On top,
// the overlay (./overlay.ts) airs multiverse events and HUSH on every frequency.
//
// Timing model: each tick maps station time to context time (`ctxAt`) and schedules
// anything starting within the lookahead. Ticks come from a Worker, but nothing relies on
// them being punctual — a late tick only eats into the lookahead.

import { createMusicEngine, type MusicEngine, type TrackRequest } from '../music';
import { AudioBufferCache, contextDecoder } from './audioCache';
import { bleedOf, clampFrequency, onPirateNames, receptionAt, signalOf, stationForId, type Reception, type Transmitter } from './dial';
import { eventAt as seededEventAt } from './events';
import type { HushLevel } from './hush';
import { POOLS, type VoiceLibrary } from './library';
import { resolveAsset } from './manifest';
import { Mixer, type OutputMode, type VoiceHandle } from './mixer';
import type { Overlay } from './overlay';
import { daypartForHour, joinOffset, skipOffset, type MusicRun, type StationSchedule } from './scheduler';
import { createTicker, type Ticker } from './ticker';
import { browserTzOffset, localTime, type TzOffset } from './time';
import type { ActiveEvent, PlayStatus, StationDef, VoiceSegment } from './types';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface DirectorOptions {
  library: VoiceLibrary;
  /** The roster (used as a fallback for `station`). */
  stations: StationDef[];
  /** Initial station (ignored if `frequency` is given). */
  stationId?: string;
  /** Initial dial position in MHz. */
  frequency?: number;
  clock?: Clock;
  output?: OutputMode;
  createEngine?: (ctx: AudioContext) => Promise<MusicEngine>;
  volume?: number;
  tzOffset?: TzOffset;
}

export interface LogEntry {
  /** Wall-clock ms. */
  at: number;
  text: string;
}

export interface DirectorDebug {
  ctxTime: number;
  ctxState: string;
  outputMode: string;
  engine: 'idle' | 'loading' | 'ready' | 'failed';
  stationTime: number;
  offset: number;
  music: MusicRun | null;
  musicPending: { boundaryMs: number; atCtx: number; run: MusicRun | null } | null;
  voices: string[];
  failed: string[];
  cacheBytes: number;
  cacheEntries: number;
  duck: number;
  eventDuck: number;
  latency: number;
  frequency: number;
  signal: number;
  program: string | null;
  shiftMs: number;
  listenMs: number;
  hushLevel: number;
  hushInMs: number;
  dialNoise: boolean;
}

type StartKind = 'power' | 'channel' | 'dial' | 'skip' | 'resume' | 'retry';

/** Voice clips are scheduled this far ahead (we own those nodes and can cancel them). */
const VOICE_LOOKAHEAD_MS = 4000;
/** Music commands go to the engine this far ahead (kept short: engines may not cancel well). */
const MUSIC_LOOKAHEAD_MS = 2000;
const PREFETCH_COUNT = 2;
const TICK_LIVE_MS = 250;
/** Hidden tabs don't need 4 Hz captions; the lookahead covers the slower beat. */
const TICK_LIVE_HIDDEN_MS = 500;
const TICK_IDLE_MS = 1000;
/** Ducking under bed clips: about -13 dB (ambient stations: a gentler -8 dB). */
const DUCK = { default: 10 ** (-13 / 20), ambient: 10 ** (-8 / 20) };
const VOICE_GAIN = { default: 1, ambient: 0.75 };
const MIN_STATIC_MS: Record<StartKind, number> = { power: 650, channel: 650, retry: 650, dial: 150, skip: 320, resume: 280 };
/** While dragging, the programme changes only after the dial has rested on a new transmitter this long. */
const SETTLE_MS = 160;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function request(run: MusicRun): TrackRequest {
  return {
    recipe: run.recipe,
    seed: run.seed,
    durationSeconds: (run.endMs - run.startMs) / 1000,
    ...(run.tweaks ? { tweaks: run.tweaks } : {}),
    ...(run.artist !== undefined ? { artist: run.artist } : {}),
  };
}

export class Director {
  status: PlayStatus = 'off';
  message: string | null = null;
  /** Wall clock (plus any lab time warp). */
  readonly clock: Clock;
  readonly library: VoiceLibrary;
  readonly log: LogEntry[] = [];
  /** Events and HUSH (loaded on first power-on: a separate chunk). */
  overlay: Overlay | null = null;

  /** Dial position in MHz. */
  frequency: number;
  /** What the dial picks up at `frequency`. */
  reception: Reception;
  /** The programme being played (null on bare static). */
  program: Transmitter | null;
  /** The last station or pirate the programme was (stays put on oddities and static). */
  lastStationId: string;

  private readonly stations: StationDef[];
  private readonly baseClock: Clock;
  private warpMs = 0;
  private readonly tz: TzOffset;
  private readonly output: OutputMode;
  private createEngine: (ctx: AudioContext) => Promise<MusicEngine>;
  private readonly offsets = new Map<string, number>();
  private readonly ticker: Ticker;
  private readonly listeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();

  private mixer: Mixer | null = null;
  private cache: AudioBufferCache | null = null;
  private engine: MusicEngine | null = null;
  private engineLoad: Promise<MusicEngine | null> | null = null;
  private engineFailed = false;
  private volume: number;
  private muted = false;

  /** Bumped by every start/pause; async work from an older generation bails out. */
  private generation = 0;
  private live = false;
  private joining = false;
  private rejoin = false;
  private suspendTimer: ReturnType<typeof setTimeout> | undefined;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private settleTarget: string | null | undefined;
  private lastTick: { wall: number; ctx: number } | null = null;
  private lastPrefetch = 0;
  /** The time-slip shift the programme was last joined with. */
  private appliedShift = 0;
  private overlayLoad: Promise<Overlay | null> | null = null;
  /** performance.now() of the last join until the programme is actually audible (0 once it is). */
  private awaitingSound = 0;
  private readonly levelBuffer = new Float32Array(512);
  private hushOverride: HushLevel | null = null;

  private readonly voices = new Map<string, { handle: VoiceHandle; segment: VoiceSegment }>();
  /** Voice segments that couldn't air (id → end of slot, station ms). Music fills them. */
  private readonly failed = new Map<string, number>();
  private musicNow: MusicRun | null = null;
  private musicPending: { boundaryMs: number; atCtx: number; run: MusicRun | null } | null = null;
  /**
   * Context time until which a command already sent to the engine may still sound after
   * a halt (engines can't necessarily cancel a play() scheduled for the future). Joins
   * wait it out under the static.
   */
  private musicQuietUntil = 0;

  constructor(options: DirectorOptions) {
    this.library = options.library;
    this.stations = options.stations;
    this.baseClock = options.clock ?? systemClock;
    this.clock = { now: () => this.baseClock.now() + this.warpMs };
    this.tz = options.tzOffset ?? browserTzOffset;
    this.output = options.output ?? 'auto';
    this.createEngine = options.createEngine ?? createMusicEngine;
    this.volume = options.volume ?? 0.8;
    const start = stationForId(options.stationId ?? '') ?? this.stations[0]!;
    this.frequency = clampFrequency(options.frequency ?? start.frequency);
    this.reception = receptionAt(this.frequency);
    this.program = this.reception.lock;
    this.lastStationId = this.program && this.program.kind !== 'oddity' ? this.program.id : start.id;
    // Pirates get their real names a moment after first being tuned: look again.
    onPirateNames(() => {
      this.reception = receptionAt(this.frequency);
      this.emit();
    });
    this.ticker = createTicker(this.tick);
    this.ticker.setInterval(TICK_IDLE_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.updateTickRate);
  }

  private readonly updateTickRate = (): void => {
    const live = this.status === 'playing' || this.status === 'tuning';
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.ticker.setInterval(live ? (hidden ? TICK_LIVE_HIDDEN_MS : TICK_LIVE_MS) : TICK_IDLE_MS);
  };

  /** Stops everything and releases the audio graph (used on hot reload). */
  dispose(): void {
    this.generation++;
    clearTimeout(this.settleTimer);
    this.halt(0.02);
    this.overlay?.stop(0.02);
    this.ticker.dispose();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.updateTickRate);
    this.engine?.dispose();
    void this.mixer?.ctx.close().catch(() => {});
    this.listeners.clear();
    this.tickListeners.clear();
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Id of the programme (station, pirate or oddity), or the last station on bare static. */
  get stationId(): string {
    return this.program?.id ?? this.lastStationId;
  }

  /** The programme's station definition (synthetic for pirates and oddities). */
  get station(): StationDef {
    return this.program?.station ?? stationForId(this.lastStationId) ?? this.stations[0]!;
  }

  get powered(): boolean {
    return this.status === 'playing' || this.status === 'tuning';
  }

  schedule(station: StationDef = this.station): StationSchedule {
    return this.library.schedule(station);
  }

  offsetOf(stationId: string): number {
    return this.offsets.get(stationId) ?? 0;
  }

  /** Broadcast time on a programme (wall clock plus its skip offset, minus any time slip). */
  stationNow(stationId = this.stationId): number {
    return this.clock.now() + this.offsetOf(stationId) + (stationId === this.program?.id ? this.appliedShift : 0);
  }

  /** True if this voice segment couldn't be played (music is filling its slot). */
  isFailed(segmentId: string): boolean {
    return this.failed.has(segmentId);
  }

  /** Milliseconds between scheduling audio and hearing it, for caption timing. */
  get latencyMs(): number {
    return (this.mixer?.latency ?? 0) * 1000;
  }

  getAnalyser(): AnalyserNode | null {
    return this.mixer?.analyser ?? null;
  }

  /** The mixer, once powered on (the lab uses it for bus meters). */
  getMixer(): Mixer | null {
    return this.mixer;
  }

  /** The multiverse event in progress (seeded from UTC, or forced in the lab). */
  eventAt(wall = this.clock.now()): ActiveEvent | null {
    return this.overlay ? this.overlay.eventAt(wall) : seededEventAt(wall);
  }

  /** Loads the overlay (events and HUSH). Resolves null if it can't load (offline). */
  loadOverlay(): Promise<Overlay | null> {
    this.overlayLoad ??= import('./overlay').then(
      ({ Overlay }) => {
        const overlay = new Overlay(
          () => this.mixer,
          () => this.cache,
          this.library,
        );
        overlay.levelOverride = this.hushOverride;
        this.overlay = overlay;
        return overlay;
      },
      () => {
        this.overlayLoad = null;
        return null;
      },
    );
    return this.overlayLoad;
  }

  /** Pins HUSH's strangeness (tests, `?hush=`); null follows the session. */
  setHushLevel(level: HushLevel | null): void {
    this.hushOverride = level;
    if (this.overlay) this.overlay.levelOverride = level;
  }

  private shiftAt(wall: number, stationId: string): number {
    return this.overlay?.shiftAt(wall, stationId) ?? 0;
  }

  /** Lab: how far the clock has been warped (ms). */
  get warp(): number {
    return this.warpMs;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs on every heartbeat (about 4/s while playing, 1/s otherwise). */
  onTick(listener: () => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  debug(): DirectorDebug {
    const mixer = this.mixer;
    return {
      ctxTime: mixer?.ctx.currentTime ?? 0,
      ctxState: mixer?.ctx.state ?? 'none',
      outputMode: mixer?.outputMode ?? 'none',
      engine: this.engine ? 'ready' : this.engineFailed ? 'failed' : this.engineLoad ? 'loading' : 'idle',
      stationTime: this.stationNow(),
      offset: this.offsetOf(this.stationId),
      music: this.musicNow,
      musicPending: this.musicPending,
      voices: [...this.voices.keys()],
      failed: [...this.failed.keys()],
      cacheBytes: this.cache?.bytes ?? 0,
      cacheEntries: this.cache?.size ?? 0,
      duck: mixer?.duck.gain.value ?? 1,
      eventDuck: mixer?.eventDuck.gain.value ?? 1,
      latency: mixer?.latency ?? 0,
      frequency: this.frequency,
      signal: this.reception.signal,
      program: this.program?.id ?? null,
      shiftMs: this.appliedShift,
      listenMs: this.overlay?.listenMs ?? 0,
      hushLevel: this.overlay?.level() ?? this.hushOverride ?? 0,
      hushInMs: this.overlay?.hushInMs ?? 0,
      dialNoise: mixer?.dialNoiseActive ?? false,
    };
  }

  // ── Actions (call from user gestures where noted) ─────────────────────────

  /** off → on air, playing ↔ paused, lost → retry. Gesture. */
  togglePlay(): void {
    switch (this.status) {
      case 'playing':
      case 'tuning':
        this.pause();
        return;
      case 'paused':
        void this.start('resume');
        return;
      case 'off':
        void this.start('power');
        return;
      case 'lost':
        void this.start('retry');
        return;
    }
  }

  /**
   * Moves the dial. 'drag' follows the hand: reception changes at once, and the programme
   * changes once the dial rests on a new transmitter. 'jump' retunes straight away, with the
   * channel-change static. Neither powers the radio on.
   */
  setFrequency(mhz: number, mode: 'drag' | 'jump' = 'drag'): void {
    const frequency = Math.round(clampFrequency(mhz) * 1000) / 1000;
    this.frequency = frequency;
    this.reception = receptionAt(frequency);
    this.updateReception();
    const lock = this.reception.lock;
    const target = lock?.id ?? null;
    if (target === (this.program?.id ?? null) || mode === 'jump' || !this.powered) {
      this.cancelSettle();
      if (target !== (this.program?.id ?? null)) this.retune(lock, 'channel');
      return;
    }
    // Keep the countdown running while the dial stays on the same new transmitter.
    if (this.settleTimer !== undefined && this.settleTarget === target) return;
    this.cancelSettle();
    this.settleTarget = target;
    this.settleTimer = setTimeout(() => this.retune(this.reception.lock, 'dial'), SETTLE_MS);
  }

  private cancelSettle(): void {
    clearTimeout(this.settleTimer);
    this.settleTimer = undefined;
    this.settleTarget = undefined;
  }

  /** Tunes to a station or pirate by id (powering on if needed). Gesture. */
  tune(stationId: string): void {
    const station = stationForId(stationId);
    if (!station) return;
    const wasPowered = this.powered || this.status === 'lost';
    const changed = station.id !== this.program?.id;
    this.setFrequency(station.frequency, 'jump');
    void this.library.load(this.stationId);
    if (!wasPowered) void this.start(changed ? 'channel' : this.status === 'off' ? 'power' : 'resume');
  }

  /** Jumps this programme's clock to the end of what's on air. Gesture. */
  skip(): void {
    if (!this.program) return;
    const id = this.stationId;
    this.offsets.set(id, skipOffset(this.schedule(), this.clock.now() + this.appliedShift, this.offsetOf(id)));
    void this.start('skip');
  }

  /** Lab: moves this programme's clock to a broadcast time and rejoins there. */
  seek(stationMs: number): void {
    this.offsets.set(this.stationId, stationMs - this.clock.now() - this.appliedShift);
    void this.start('skip');
  }

  /** Lab: moves the whole clock (events, shows, every station) by `deltaMs`. */
  warpBy(deltaMs: number): void {
    this.warpMs += deltaMs;
    this.note(`time warp ${deltaMs >= 0 ? '+' : ''}${Math.round(deltaMs / 1000)} s (now ${Math.round(this.warpMs / 1000)} s)`);
    if (this.powered) this.rejoin = true;
    this.emit();
  }

  pause(): void {
    if (this.status === 'off' || this.status === 'paused') return;
    this.generation++;
    this.halt(0.15);
    this.overlay?.stop(0.15);
    this.mixer?.stopStatic(0.1);
    this.mixer?.quietDial();
    this.setStatus('paused');
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      if (this.status !== 'paused' || !this.mixer) return;
      this.mixer.sleep();
      this.mixer.suspend();
    }, 1500);
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.mixer?.setVolume(volume, muted);
  }

  /**
   * Labs/tests: replaces the music engine factory and drops the current engine, so the
   * next tune builds a new one (e.g. a failing engine, to exercise voice-only mode).
   */
  setEngineFactory(factory: (ctx: AudioContext) => Promise<MusicEngine>): void {
    this.createEngine = factory;
    this.engine?.dispose();
    this.engine = null;
    this.engineLoad = null;
    this.engineFailed = false;
    this.musicNow = null;
    this.musicPending = null;
  }

  /** Preloads a programme's manifests (no audio). */
  prefetchStation(stationId: string): Promise<void> {
    return this.library.load(stationId);
  }

  // ── The dial ──────────────────────────────────────────────────────────────

  /** Switches the programme to what the dial has locked on to. */
  private retune(lock: Transmitter | null, kind: 'channel' | 'dial'): void {
    this.settleTimer = undefined;
    this.settleTarget = undefined;
    if ((lock?.id ?? null) === (this.program?.id ?? null)) return;
    this.program = lock;
    if (lock && lock.kind !== 'oddity') this.lastStationId = lock.id;
    if (lock) void this.library.load(lock.id);
    this.note(`dial ${this.frequency.toFixed(2)}: ${lock ? lock.id : 'static'}`);
    if (this.powered || this.status === 'lost') void this.start(kind);
    else this.emit();
  }

  /** Shapes reception for the programme at the dial position (signal, bleed, dial noise). */
  private updateReception(): void {
    const mixer = this.mixer;
    if (!mixer || !this.powered) return;
    const p = this.program;
    const f = this.frequency;
    const signal = p ? signalOf(p, f) : 0;
    // The dial noise holds until the new programme is actually sounding (a new track takes a moment).
    const audible = this.live && p && !this.awaitingSound ? signal : 0;
    mixer.setReception({ signal, bleed: p ? bleedOf(p, f) : 0, noise: 1 - audible, detune: p ? Math.min(0.5, Math.abs(f - p.frequency)) : 0.5 });
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  private ensureAudio(): Mixer | null {
    if (this.mixer) return this.mixer;
    try {
      const mixer = new Mixer(this.output);
      mixer.setVolume(this.volume, this.muted);
      mixer.onInterrupted = () => this.interrupted();
      this.cache = new AudioBufferCache(contextDecoder(mixer.ctx));
      this.mixer = mixer;
      this.note(`audio up: ${mixer.ctx.sampleRate} Hz, output via ${mixer.outputMode}`);
      return mixer;
    } catch (error) {
      console.error('[broadcast] Could not create the audio graph:', error);
      return null;
    }
  }

  private loadEngine(): Promise<MusicEngine | null> {
    if (this.engine) return Promise.resolve(this.engine);
    const mixer = this.mixer;
    if (!mixer) return Promise.resolve(null);
    if (!this.engineLoad) {
      this.engineFailed = false;
      this.engineLoad = this.createEngine(mixer.ctx).then(
        (engine) => {
          engine.output.connect(mixer.musicIn);
          this.engine = engine;
          mixer.setHiss(0);
          this.note('music engine ready');
          return engine;
        },
        (error: unknown) => {
          console.error('[broadcast] The music engine failed to start:', error);
          this.engineFailed = true;
          this.engineLoad = null; // try again on the next tune
          this.note('music engine failed: voice only');
          return null;
        },
      );
    }
    return this.engineLoad;
  }

  /** Static, load what the programme needs, then join it live. */
  private async start(kind: StartKind): Promise<void> {
    const mixer = this.ensureAudio();
    if (!mixer) {
      this.message = 'This browser can’t pick up transmissions (Web Audio is unavailable).';
      this.setStatus('lost');
      return;
    }
    mixer.unlock();
    const generation = ++this.generation;
    clearTimeout(this.suspendTimer);
    this.halt(kind === 'dial' ? 0.06 : 0.12);
    this.message = null;
    this.setStatus('tuning');
    this.updateReception();
    if (kind !== 'dial') mixer.startStatic(kind === 'skip' || kind === 'resume' ? 'short' : 'channel');
    if (kind === 'channel') mixer.click();
    // The overlay and its pools: HUSH and the multiverse events.
    const overlayReady = this.loadOverlay();
    void this.library.loadPool(POOLS.events);
    void this.library.loadPool(POOLS.ship);
    const began = performance.now();
    const program = this.program;
    const stationId = this.stationId;
    const skipping = kind === 'skip';
    // A skip lands exactly on the next segment, however long the static takes.
    const skipTarget = skipping ? this.stationNow() : 0;

    if (!program) {
      // Bare static: nothing to load or join.
      await Promise.race([mixer.whenRunning(3000), delay(3000)]);
      if (generation !== this.generation) return;
      const left = MIN_STATIC_MS[kind] - (performance.now() - began);
      if (left > 0) await delay(left);
      if (generation !== this.generation) return;
      if (mixer.ctx.state !== 'running') {
        mixer.stopStatic(0.1);
        this.setStatus('paused');
        return;
      }
      this.appliedShift = 0;
      mixer.setWobble(false);
      this.live = true;
      this.note(`${kind}: static at ${this.frequency.toFixed(2)}`);
      mixer.stopStatic(0.3);
      this.setStatus('playing');
      this.updateReception();
      this.tick();
      return;
    }

    await Promise.race([
      Promise.all([this.library.load(stationId), this.loadEngine(), mixer.whenRunning(3000), overlayReady]),
      delay(6000),
    ]);
    if (generation !== this.generation) return;

    // Make sure the clip on air (if any) is decoded before we join it.
    const wall = this.clock.now();
    const shift = this.shiftAt(wall, stationId);
    const at = skipping ? skipTarget : wall + shift + joinOffset(this.schedule(), wall + shift, this.offsetOf(stationId));
    const onAir = this.schedule().segmentAt(at);
    if (onAir.kind === 'voice' && this.cache) {
      await Promise.race([this.cache.load(resolveAsset(onAir.clip.url)), delay(4000)]);
    }
    const left = Math.max(
      MIN_STATIC_MS[kind] - (performance.now() - began),
      (this.musicQuietUntil - mixer.ctx.currentTime) * 1000,
    );
    if (left > 0) await delay(Math.min(left, 3000));
    if (generation !== this.generation) return;

    if (mixer.ctx.state !== 'running') {
      // Autoplay blocked: wait for another tap.
      mixer.stopStatic(0.1);
      mixer.quietDial();
      this.setStatus('paused');
      return;
    }
    const schedule = this.schedule();
    if (!this.engine && this.engineFailed && !schedule.hasVoice) {
      this.halt(0.1);
      mixer.stopStatic(0.3);
      mixer.quietDial();
      this.message = 'Nothing is coming through from this dimension right now. Try again in a moment.';
      this.setStatus('lost');
      return;
    }

    const now = this.clock.now();
    this.appliedShift = this.shiftAt(now, stationId);
    mixer.setWobble(this.appliedShift !== 0);
    this.offsets.set(
      stationId,
      skipping ? skipTarget - now - this.appliedShift : joinOffset(schedule, now + this.appliedShift, this.offsetOf(stationId)),
    );
    this.live = true;
    this.awaitingSound = performance.now();
    this.joining = true;
    this.lastTick = null;
    mixer.resetDuck();
    mixer.fadeProgramme(1, kind === 'dial' ? 0.15 : 0.3);
    this.updateReception();
    this.note(`${kind}: joined ${stationId} at ${new Date(this.stationNow()).toISOString().slice(11, 19)}`);
    this.tick();
    this.joining = false;
    mixer.stopStatic(0.45);
    this.setStatus('playing');
  }

  /** Stops the programme (not the static or the overlay) and forgets everything scheduled. */
  private halt(fade: number): void {
    this.live = false;
    const mixer = this.mixer;
    if (!mixer) return;
    mixer.fadeProgramme(0, fade);
    for (const { handle } of this.voices.values()) handle.stop(fade);
    this.voices.clear();
    this.failed.clear();
    if (this.engine && (this.musicNow || this.musicPending)) this.engine.stop({ fade });
    if (this.musicPending) this.musicQuietUntil = Math.max(this.musicQuietUntil, this.musicPending.atCtx + 0.9);
    this.musicNow = null;
    this.musicPending = null;
    mixer.setHiss(0);
  }

  private interrupted(): void {
    if (this.status !== 'playing' && this.status !== 'tuning') return;
    this.note('interrupted by the system');
    this.generation++;
    this.halt(0.05);
    this.overlay?.stop(0.05);
    this.mixer?.stopStatic(0.05);
    this.mixer?.quietDial();
    this.setStatus('paused');
  }

  private setStatus(status: PlayStatus): void {
    if (status !== 'lost') this.message = null;
    this.status = status;
    this.updateTickRate();
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private note(text: string): void {
    this.log.push({ at: this.clock.now(), text });
    if (this.log.length > 80) this.log.splice(0, this.log.length - 80);
  }

  // ── The heartbeat ─────────────────────────────────────────────────────────

  private readonly tick = (): void => {
    const mixer = this.mixer;
    if (this.powered && mixer && mixer.ctx.state === 'running') {
      if (this.live && this.program) this.scheduleAudio();
      const wall = this.clock.now();
      const local = localTime(wall, this.tz);
      this.overlay?.tick(wall, {
        schedule: this.live && this.program ? this.schedule() : null,
        now: this.stationNow(),
        stationId: this.program?.id ?? null,
        daypart: daypartForHour(local.hour),
        date: local.date,
      });
    }
    for (const listener of this.tickListeners) listener();
  };

  private scheduleAudio(): void {
    const mixer = this.mixer;
    if (!mixer || mixer.ctx.state !== 'running') return;
    const wall = this.clock.now();
    const ctxNow = mixer.ctx.currentTime;
    const stationId = this.stationId;

    // A frozen tab, system sleep or a stalled audio device: rejoin rather than drift.
    if (this.lastTick && !this.joining) {
      const drift = (wall - this.lastTick.wall) / 1000 - (ctxNow - this.lastTick.ctx);
      if (Math.abs(drift) > 0.75) {
        this.note(`clock jump of ${drift.toFixed(2)} s: rejoining`);
        this.rejoin = true;
      }
    }
    this.lastTick = { wall, ctx: ctxNow };

    // Time slip: the programme drops back half a minute (and later snaps forward again).
    const shift = this.shiftAt(wall, stationId);
    if (shift !== this.appliedShift) {
      this.note(shift ? 'time slip: replaying' : 'time slip: back to live');
      this.overlay?.slipSound(shift !== 0);
      this.appliedShift = shift;
      mixer.setWobble(shift !== 0);
      this.rejoin = true;
    }

    const rejoining = this.rejoin;
    if (rejoining) {
      this.rejoin = false;
      for (const { handle } of this.voices.values()) handle.stop(0.1);
      this.voices.clear();
      this.musicNow = null;
      this.musicPending = null;
      this.engine?.stop({ fade: 0.1 });
      mixer.resetDuck();
      this.offsets.set(stationId, joinOffset(this.schedule(), wall + this.appliedShift, this.offsetOf(stationId)));
      this.joining = true;
    }

    const schedule = this.schedule();
    const now = wall + this.offsetOf(stationId) + this.appliedShift;
    const ctxAt = (ms: number) => ctxNow + (ms - now) / 1000;

    this.scheduleVoices(schedule, now, ctxNow, ctxAt);
    this.scheduleMusic(schedule, now, ctxNow, ctxAt);
    if (this.joining || wall - this.lastPrefetch > 2000) {
      this.lastPrefetch = wall;
      this.prefetch(schedule, now);
    }

    for (const [id, { handle }] of this.voices) if (handle.ended) this.voices.delete(id);
    for (const [id, end] of this.failed) if (end < now - 60_000) this.failed.delete(id);
    if (this.awaitingSound) this.checkSound(mixer);
    mixer.setHiss(!this.engine && this.engineFailed ? 0.035 : 0);
    if (rejoining) this.joining = false;
  }

  /** Once music or a voice is coming through after a join, the dial noise can clear. */
  private checkSound(mixer: Mixer): void {
    const loud = (node: AnalyserNode) => {
      node.getFloatTimeDomainData(this.levelBuffer);
      let sum = 0;
      for (const v of this.levelBuffer) sum += v * v;
      return sum / this.levelBuffer.length > 1e-7; // about -70 dBFS
    };
    if (performance.now() - this.awaitingSound > 2500 || loud(mixer.tap('music')) || loud(mixer.tap('voice'))) {
      this.awaitingSound = 0;
      this.updateReception();
    }
  }

  private scheduleVoices(schedule: StationSchedule, now: number, ctxNow: number, ctxAt: (ms: number) => number): void {
    const mixer = this.mixer!;
    const cache = this.cache!;
    const ambient = this.station.format === 'ambient';
    for (const segment of schedule.segmentsBetween(now, now + VOICE_LOOKAHEAD_MS)) {
      if (segment.kind !== 'voice' || this.voices.has(segment.id) || this.failed.has(segment.id)) continue;
      const url = resolveAsset(segment.clip.url);
      const state = cache.state(url);
      const started = segment.startMs <= now;
      if (state !== 'ready') {
        if (state === 'failed' || started) this.fail(segment, schedule, ctxNow, ctxAt);
        else if (state === 'idle') void cache.load(url);
        continue;
      }
      const buffer = cache.get(url)!;
      let when = ctxAt(segment.startMs);
      let offset = 0;
      const earliest = ctxNow + 0.04;
      if (when < earliest) {
        const late = earliest - when;
        if (!this.joining && late > 0.3) {
          this.fail(segment, schedule, ctxNow, ctxAt);
          continue;
        }
        offset = late;
        when = earliest;
      }
      const end = ctxAt(segment.startMs + segment.durationMs);
      if (end - when < 0.25) continue;
      const handle = mixer.playVoice(buffer, {
        when,
        offset,
        end,
        fadeIn: offset > 0.05 ? 0.15 : 0,
        gain: ambient ? VOICE_GAIN.ambient : VOICE_GAIN.default,
      });
      this.voices.set(segment.id, { handle, segment });
      this.scheduleDuck(segment, schedule, when, end);
      this.note(`voice ${segment.clip.id} (${segment.clip.category}${segment.bed ? ', bed' : ''}) at +${(when - ctxNow).toFixed(2)} s${offset > 0.05 ? `, from ${offset.toFixed(1)} s` : ''}`);
    }
  }

  /**
   * Bed clips duck the music (~150 ms attack, ~600 ms release); clips that air alone take
   * it out entirely. Back-to-back clips hold the duck instead of bobbing between them.
   */
  private scheduleDuck(segment: VoiceSegment, schedule: StationSchedule, when: number, end: number): void {
    const mixer = this.mixer!;
    const duck = this.station.format === 'ambient' ? DUCK.ambient : DUCK.default;
    const level = segment.bed ? duck : 0;
    const prev = schedule.segmentAt(segment.startMs - 1);
    const next = schedule.segmentAt(segment.startMs + segment.durationMs);
    const prevAired = prev.kind === 'voice' && prev.startMs + prev.durationMs === segment.startMs && this.voices.has(prev.id);
    const prevLevel = prevAired ? (prev.bed ? duck : 0) : 1;
    if (prevLevel !== level) {
      if (segment.bed) mixer.duckTo(level, prevAired ? when : when - 0.05, 0.05);
      else mixer.duckTo(0, when - 0.35, 0.08);
    }
    const nextIsVoice = next.kind === 'voice' && next.startMs === segment.startMs + segment.durationMs && !this.failed.has(next.id);
    if (!nextIsVoice) mixer.duckTo(1, end, segment.bed ? 0.2 : 0.05);
  }

  /** A clip that can't air: music fills its slot. */
  private fail(segment: VoiceSegment, schedule: StationSchedule, ctxNow: number, ctxAt: (ms: number) => number): void {
    this.failed.set(segment.id, segment.startMs + segment.durationMs);
    this.note(`voice ${segment.clip.id} unavailable: music fills the slot`);
    // The clip before may have held the duck expecting this one.
    const prev = schedule.segmentAt(segment.startMs - 1);
    if (prev.kind === 'voice' && this.voices.has(prev.id)) {
      this.mixer!.duckTo(1, Math.max(ctxNow, ctxAt(segment.startMs)), 0.2);
    }
  }

  private scheduleMusic(schedule: StationSchedule, now: number, ctxNow: number, ctxAt: (ms: number) => number): void {
    const engine = this.engine;
    if (!engine) return;
    if (this.musicPending && now >= this.musicPending.boundaryMs) {
      this.musicNow = this.musicPending.run;
      this.musicPending = null;
    }
    const failed = new Set(this.failed.keys());
    const runs = schedule.runsBetween(now - 1, now + MUSIC_LOOKAHEAD_MS, failed);
    const desired = runs.find((r) => r.startMs <= now && r.endMs > now) ?? null;

    // Not playing what should be on now (joining, a filled slot, a resync): fix it at once.
    if (!this.musicPending && desired?.id !== this.musicNow?.id) {
      if (desired) {
        const offset = (now - desired.startMs) / 1000;
        engine.play(request(desired), { when: ctxNow + 0.03, offset, fade: this.joining ? 0.05 : 0.8 });
        this.note(`music ${desired.recipe} #${desired.seed} from ${offset.toFixed(1)} s`);
      } else {
        engine.stop({ when: ctxNow, fade: 0.4 });
        this.note('music out');
      }
      this.musicNow = desired;
    }

    // The next change inside the lookahead: a run starting, or the current one ending.
    let boundary = Infinity;
    if (this.musicNow && this.musicNow.endMs <= now + MUSIC_LOOKAHEAD_MS) boundary = this.musicNow.endMs;
    for (const r of runs) if (r.startMs > now && r.startMs < boundary) boundary = r.startMs;
    if (boundary === Infinity) return;
    const after = runs.find((r) => r.startMs <= boundary && r.endMs > boundary) ?? null;
    const pending = this.musicPending;
    if (pending && pending.boundaryMs === boundary && pending.run?.id === after?.id) return;
    if (!pending && after?.id === this.musicNow?.id) return;
    const atCtx = ctxAt(boundary);
    if (after) {
      engine.play(request(after), { when: atCtx, fade: this.musicNow ? 0.8 : 0.3 });
      this.note(`music ${after.recipe} #${after.seed} at +${(atCtx - ctxNow).toFixed(2)} s`);
    } else {
      engine.stop({ when: Math.max(ctxNow, atCtx - 0.5), fade: 0.5 });
      this.note(`music out at +${(atCtx - ctxNow).toFixed(2)} s`);
    }
    this.musicPending = { boundaryMs: boundary, atCtx, run: after };
  }

  /** Decodes the next couple of voice clips ahead of time. */
  private prefetch(schedule: StationSchedule, now: number): void {
    const cache = this.cache;
    if (!cache) return;
    let count = 0;
    for (const segment of schedule.upcoming(now, 30)) {
      if (segment.kind !== 'voice' || segment.startMs <= now) continue;
      const url = resolveAsset(segment.clip.url);
      if (cache.state(url) === 'idle') void cache.load(url);
      if (++count >= PREFETCH_COUNT) break;
    }
  }
}
