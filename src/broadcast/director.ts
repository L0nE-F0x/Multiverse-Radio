// The director: plays the schedule. It joins a station live at the right offset, keeps
// voice clips, music runs and ducking scheduled a few seconds ahead on the AudioContext
// clock, and recovers from missing clips, a missing music engine, clock jumps and OS
// interruptions. The store (./store.ts) is its only client; the lab pokes at it directly.
//
// Timing model: each tick maps station time to context time (`ctxAt`) and schedules
// anything starting within the lookahead. Ticks come from a Worker, but nothing relies on
// them being punctual — a late tick only eats into the lookahead.

import { createMusicEngine, type MusicEngine, type TrackRequest } from '../music';
import { AudioBufferCache, contextDecoder } from './audioCache';
import type { VoiceLibrary } from './library';
import { resolveAsset } from './manifest';
import { Mixer, type OutputMode, type VoiceHandle } from './mixer';
import { joinOffset, skipOffset, type MusicRun, type StationSchedule } from './scheduler';
import { createTicker, type Ticker } from './ticker';
import type { PlayStatus, StationDef, VoiceSegment } from './types';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface DirectorOptions {
  library: VoiceLibrary;
  stations: StationDef[];
  stationId: string;
  clock?: Clock;
  output?: OutputMode;
  createEngine?: (ctx: AudioContext) => Promise<MusicEngine>;
  volume?: number;
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
  latency: number;
}

type StartKind = 'power' | 'channel' | 'skip' | 'resume' | 'retry';

/** Voice clips are scheduled this far ahead (we own those nodes and can cancel them). */
const VOICE_LOOKAHEAD_MS = 4000;
/** Music commands go to the engine this far ahead (kept short: engines may not cancel well). */
const MUSIC_LOOKAHEAD_MS = 1500;
const PREFETCH_COUNT = 2;
const TICK_LIVE_MS = 250;
/** Hidden tabs don't need 4 Hz captions; the lookahead covers the slower beat. */
const TICK_LIVE_HIDDEN_MS = 500;
const TICK_IDLE_MS = 1000;
/** Ducking under bed clips: about -13 dB (ambient stations: a gentler -8 dB). */
const DUCK = { default: 10 ** (-13 / 20), ambient: 10 ** (-8 / 20) };
const VOICE_GAIN = { default: 1, ambient: 0.75 };
const MIN_STATIC_MS: Record<StartKind, number> = { power: 650, channel: 650, retry: 650, skip: 320, resume: 280 };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function request(run: MusicRun): TrackRequest {
  return {
    recipe: run.recipe,
    seed: run.seed,
    durationSeconds: (run.endMs - run.startMs) / 1000,
    ...(run.tweaks ? { tweaks: run.tweaks } : {}),
  };
}

export class Director {
  status: PlayStatus = 'off';
  message: string | null = null;
  stationId: string;
  readonly clock: Clock;
  readonly library: VoiceLibrary;
  readonly log: LogEntry[] = [];

  private readonly stations: StationDef[];
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
  private lastTick: { wall: number; ctx: number } | null = null;
  private lastPrefetch = 0;

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
    this.stationId = options.stationId;
    this.clock = options.clock ?? systemClock;
    this.output = options.output ?? 'auto';
    this.createEngine = options.createEngine ?? createMusicEngine;
    this.volume = options.volume ?? 0.8;
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
    this.halt(0.02);
    this.ticker.dispose();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.updateTickRate);
    this.engine?.dispose();
    void this.mixer?.ctx.close().catch(() => {});
    this.listeners.clear();
    this.tickListeners.clear();
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  get station(): StationDef {
    return this.stations.find((s) => s.id === this.stationId) ?? this.stations[0]!;
  }

  schedule(station: StationDef = this.station): StationSchedule {
    return this.library.schedule(station);
  }

  offsetOf(stationId: string): number {
    return this.offsets.get(stationId) ?? 0;
  }

  /** Broadcast time on a station (wall clock plus that station's skip offset). */
  stationNow(stationId = this.stationId): number {
    return this.clock.now() + this.offsetOf(stationId);
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
      latency: mixer?.latency ?? 0,
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

  /** Tunes to a station (powering on if needed). Gesture. */
  tune(stationId: string): void {
    if (!this.stations.some((s) => s.id === stationId)) return;
    const changed = stationId !== this.stationId;
    this.stationId = stationId;
    void this.library.load(stationId);
    if (!changed && (this.status === 'playing' || this.status === 'tuning')) return;
    void this.start(changed ? 'channel' : this.status === 'off' ? 'power' : 'resume');
  }

  /** Jumps this station's clock to the end of what's on air. Gesture. */
  skip(): void {
    const id = this.stationId;
    this.offsets.set(id, skipOffset(this.schedule(), this.clock.now(), this.offsetOf(id)));
    void this.start('skip');
  }

  /** Lab: moves this station's clock to a broadcast time and rejoins there. */
  seek(stationMs: number): void {
    this.offsets.set(this.stationId, stationMs - this.clock.now());
    void this.start('skip');
  }

  pause(): void {
    if (this.status === 'off' || this.status === 'paused') return;
    this.generation++;
    this.halt(0.15);
    this.mixer?.stopStatic(0.1);
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

  /** Preloads a station's manifests (no audio). */
  prefetchStation(stationId: string): Promise<void> {
    return this.library.load(stationId);
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

  /** Static, load what the station needs, then join it live. */
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
    this.halt(0.12);
    this.message = null;
    this.setStatus('tuning');
    mixer.startStatic(kind === 'skip' || kind === 'resume' ? 'short' : 'channel');
    if (kind === 'channel') mixer.click();
    const began = performance.now();
    const stationId = this.stationId;
    const skipping = kind === 'skip';
    // A skip lands exactly on the next segment, however long the static takes.
    const skipTarget = skipping ? this.stationNow() : 0;

    await Promise.race([
      Promise.all([this.library.load(stationId), this.loadEngine(), mixer.whenRunning(3000)]),
      delay(6000),
    ]);
    if (generation !== this.generation) return;

    // Make sure the clip on air (if any) is decoded before we join it.
    const wall = this.clock.now();
    const at = skipping ? skipTarget : wall + joinOffset(this.schedule(), wall, this.offsetOf(stationId));
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
      this.setStatus('paused');
      return;
    }
    const schedule = this.schedule();
    if (!this.engine && this.engineFailed && !schedule.hasVoice) {
      this.halt(0.1);
      mixer.stopStatic(0.3);
      this.message = 'Nothing is coming through from this dimension right now. Try again in a moment.';
      this.setStatus('lost');
      return;
    }

    const now = this.clock.now();
    this.offsets.set(stationId, skipping ? skipTarget - now : joinOffset(schedule, now, this.offsetOf(stationId)));
    this.live = true;
    this.joining = true;
    this.lastTick = null;
    mixer.resetDuck();
    mixer.fadeProgramme(1, 0.3);
    this.note(`${kind}: joined ${stationId} at ${new Date(this.stationNow()).toISOString().slice(11, 19)}`);
    this.tick();
    this.joining = false;
    mixer.stopStatic(0.45);
    this.setStatus('playing');
  }

  /** Stops the programme (not the static) and forgets everything scheduled. */
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
    this.mixer?.stopStatic(0.05);
    this.setStatus('paused');
  }

  private setStatus(status: PlayStatus): void {
    if (status !== 'lost') this.message = null;
    this.status = status;
    this.updateTickRate();
    for (const listener of this.listeners) listener();
  }

  private note(text: string): void {
    this.log.push({ at: this.clock.now(), text });
    if (this.log.length > 80) this.log.splice(0, this.log.length - 80);
  }

  // ── The heartbeat ─────────────────────────────────────────────────────────

  private readonly tick = (): void => {
    if (this.live) this.scheduleAudio();
    for (const listener of this.tickListeners) listener();
  };

  private scheduleAudio(): void {
    const mixer = this.mixer;
    if (!mixer || mixer.ctx.state !== 'running') return;
    const wall = this.clock.now();
    const ctxNow = mixer.ctx.currentTime;

    // A frozen tab, system sleep or a stalled audio device: rejoin rather than drift.
    if (this.lastTick && !this.joining) {
      const drift = (wall - this.lastTick.wall) / 1000 - (ctxNow - this.lastTick.ctx);
      if (Math.abs(drift) > 0.75) {
        this.note(`clock jump of ${drift.toFixed(2)} s: rejoining`);
        this.rejoin = true;
      }
    }
    this.lastTick = { wall, ctx: ctxNow };
    const rejoining = this.rejoin;
    if (rejoining) {
      this.rejoin = false;
      for (const { handle } of this.voices.values()) handle.stop(0.1);
      this.voices.clear();
      this.musicNow = null;
      this.musicPending = null;
      this.engine?.stop({ fade: 0.1 });
      mixer.resetDuck();
      this.offsets.set(this.stationId, joinOffset(this.schedule(), wall, this.offsetOf(this.stationId)));
      this.joining = true;
    }

    const schedule = this.schedule();
    const now = wall + this.offsetOf(this.stationId);
    const ctxAt = (ms: number) => ctxNow + (ms - now) / 1000;

    this.scheduleVoices(schedule, now, ctxNow, ctxAt);
    this.scheduleMusic(schedule, now, ctxNow, ctxAt);
    if (this.joining || wall - this.lastPrefetch > 2000) {
      this.lastPrefetch = wall;
      this.prefetch(schedule, now);
    }

    for (const [id, { handle }] of this.voices) if (handle.ended) this.voices.delete(id);
    for (const [id, end] of this.failed) if (end < now - 60_000) this.failed.delete(id);
    mixer.setHiss(!this.engine && this.engineFailed ? 0.035 : 0);
    if (rejoining) this.joining = false;
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
