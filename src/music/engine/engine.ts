// The music engine: composes tracks from recipes and plays them with crossfades,
// one shared reverb and a gentle master bus (glue compressor + soft ceiling).

import type { MusicEngine, PlayOptions, TrackRequest } from '../index';
import { compose } from '../recipes';
import { sectionAt, type Score, type Section } from '../score';
import { Noise } from '../dsp/core';
import { SampleBank } from './bank';
import { Ticker } from './clock';
import { reverbImpulse, softClipCurve } from './fx';
import { TrackPlayer, type EngineBuses } from './track';

/** How far ahead (seconds) notes are scheduled. Generous, to ride out throttled ticks. */
const LOOKAHEAD = 1.6;
const TICK_MS = 100;

export interface NowPlaying {
  score: Score;
  /** Seconds into the track. */
  position: number;
  section: Section | undefined;
}

export class Engine implements MusicEngine {
  readonly output: GainNode;
  private readonly buses: EngineBuses;
  private readonly ticker: Ticker | null;
  private tracks: TrackPlayer[] = [];
  private disposed = false;
  /** Offline renders only schedule this far (seconds of context time). */
  horizon = Infinity;
  /** Debug: only these instrument indices are audible. */
  solo: number[] | null = null;
  private readonly nodes: AudioNode[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly offline = false,
  ) {
    const g = (v: number) => {
      const n = ctx.createGain();
      n.gain.value = v;
      this.nodes.push(n);
      return n;
    };
    this.output = g(1);
    // Master: sum → glue compressor → soft ceiling (never above −1 dBFS).
    const master = g(1);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.3;
    this.nodes.push(comp);
    const pre = g(0.5);
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    this.nodes.push(clip);
    master.connect(comp);
    comp.connect(pre);
    pre.connect(clip);
    clip.connect(this.output);

    const dryIn = g(1);
    dryIn.connect(master);
    const reverbIn = g(1);
    const verb = ctx.createConvolver();
    verb.normalize = false;
    verb.buffer = reverbImpulse(ctx.sampleRate);
    this.nodes.push(verb);
    const verbHp = ctx.createBiquadFilter();
    verbHp.type = 'highpass';
    verbHp.frequency.value = 180;
    this.nodes.push(verbHp);
    reverbIn.connect(verbHp);
    verbHp.connect(verb);
    const verbOut = g(0.5);
    verb.connect(verbOut);
    verbOut.connect(master);

    const noise = new AudioBuffer({ length: Math.floor(ctx.sampleRate * 2), numberOfChannels: 1, sampleRate: ctx.sampleRate });
    const data = new Float32Array(noise.length);
    const rng = new Noise(12345);
    for (let i = 0; i < data.length; i++) data[i] = rng.next();
    noise.copyToChannel(data, 0);

    this.buses = { ctx, dryIn, reverbIn, bank: new SampleBank(ctx.sampleRate), noise, offline };
    this.ticker = offline ? null : new Ticker(() => this.tick(), TICK_MS);
  }

  play(track: TrackRequest, options: PlayOptions = {}): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    let when = options.when ?? now + 0.03;
    let offset = options.offset ?? 0;
    // A start time already in the past: join late rather than bunching notes up.
    if (!this.offline && when < now) {
      offset += now + 0.03 - when;
      when = now + 0.03;
    }
    const fade = options.fade ?? 0.5;
    const score = compose(track);
    for (const t of this.tracks) t.stop(when, fade);
    const fadeIn = offset > 0 ? Math.max(0.35, fade) : Math.max(0.02, fade);
    const player = new TrackPlayer(score, this.buses, { when, offset, fadeIn });
    if (this.solo) player.solo(this.solo);
    this.tracks.push(player);
    player.schedule(this.offline ? this.horizon : now + LOOKAHEAD);
    this.ticker?.start();
  }

  stop({ when = this.ctx.currentTime, fade = 0.5 }: { when?: number; fade?: number } = {}): void {
    for (const t of this.tracks) t.stop(Math.max(when, this.ctx.currentTime), fade);
  }

  /** What's playing now (the most recent unstopped track), for displays. */
  nowPlaying(): NowPlaying | null {
    const t = [...this.tracks].reverse().find((p) => !p.stopped && this.ctx.currentTime < p.endCtx);
    if (!t) return null;
    const position = Math.max(0, t.offset + (this.ctx.currentTime - t.when));
    return { score: t.score, position, section: sectionAt(t.score, position) };
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    for (const t of this.tracks) t.schedule(now + LOOKAHEAD);
    const alive: TrackPlayer[] = [];
    for (const t of this.tracks) {
      if (now >= t.disposeAt) t.dispose();
      else alive.push(t);
    }
    this.tracks = alive;
    if (!alive.length) this.ticker?.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ticker?.dispose();
    for (const t of this.tracks) t.dispose();
    this.tracks = [];
    for (const n of this.nodes) n.disconnect();
    this.buses.bank.clear();
  }
}

/** Renders a track offline (for WAV export and measurements). */
export async function renderOffline(
  track: TrackRequest,
  seconds: number,
  options: { sampleRate?: number; offset?: number; solo?: number[] } = {},
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const engine = new Engine(ctx, true);
  engine.horizon = seconds + 0.5;
  if (options.solo) engine.solo = options.solo;
  engine.output.connect(ctx.destination);
  engine.play(track, { when: 0, offset: options.offset ?? 0, fade: 0.01 });
  return ctx.startRendering();
}
