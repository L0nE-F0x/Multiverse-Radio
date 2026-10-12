// The music engine: composes tracks from recipes and plays them with crossfades,
// one shared reverb and a gentle master bus (glue compressor + soft ceiling).

import type { MusicEngine, PlayOptions, TrackRequest } from '../index';
import { compose } from '../recipes';
import { sectionAt, type Score, type Section } from '../score';
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
    // One shared reverb: a mono convolution (cheap), widened by sending the return to the
    // left as-is and to the right a few milliseconds later through an all-pass.
    const reverbIn = g(1);
    const verb = ctx.createConvolver();
    verb.channelCount = 1;
    verb.channelCountMode = 'explicit';
    verb.normalize = false;
    verb.buffer = reverbImpulse(ctx.sampleRate);
    this.nodes.push(verb);
    const verbHp = ctx.createBiquadFilter();
    verbHp.type = 'highpass';
    verbHp.frequency.value = 180;
    this.nodes.push(verbHp);
    reverbIn.connect(verbHp);
    verbHp.connect(verb);
    const merger = ctx.createChannelMerger(2);
    this.nodes.push(merger);
    const left = g(0.55);
    verb.connect(left);
    left.connect(merger, 0, 0);
    const haas = ctx.createDelay(0.05);
    haas.delayTime.value = 0.013;
    this.nodes.push(haas);
    const allpass = ctx.createBiquadFilter();
    allpass.type = 'allpass';
    allpass.frequency.value = 700;
    allpass.Q.value = 0.5;
    this.nodes.push(allpass);
    const right = g(0.55);
    verb.connect(haas);
    haas.connect(allpass);
    allpass.connect(right);
    right.connect(merger, 0, 1);
    merger.connect(master);

    this.buses = { ctx, dryIn, reverbIn, bank: new SampleBank(ctx.sampleRate), offline };
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
    // The new track supersedes everything: tracks still waiting for their start time are
    // cancelled outright (never heard); the one on air crossfades out from `when`.
    for (const t of this.tracks) {
      if (t.when > now + 0.005) t.stop(now, 0.02);
      else t.stop(when, fade);
    }
    const fadeIn = offset > 0 ? Math.max(0.35, fade) : Math.max(0.02, fade);
    const player = new TrackPlayer(score, this.buses, { when, offset, fadeIn });
    if (this.solo) player.solo(this.solo);
    this.tracks.push(player);
    player.schedule(this.offline ? this.horizon : now + LOOKAHEAD);
    this.ticker?.start();
  }

  stop({ when, fade = 0.5 }: { when?: number; fade?: number } = {}): void {
    const now = this.ctx.currentTime;
    for (const t of this.tracks) {
      // A pending play is cancelled; what's on air fades from `when` (default: now).
      if (t.when > now + 0.005) t.stop(now, 0.02);
      else t.stop(Math.max(when ?? now, now), fade);
    }
  }

  /** What's playing now (the most recent unstopped track), for displays. */
  nowPlaying(): NowPlaying | null {
    const t = [...this.tracks].reverse().find((p) => !p.stopped && this.ctx.currentTime < p.endCtx);
    if (!t) return null;
    const position = Math.max(0, t.offset + (this.ctx.currentTime - t.when));
    return { score: t.score, position, section: sectionAt(t.score, position) };
  }

  /** Scheduler health, for the lab and diagnostics. */
  readonly stats = { ticks: 0, busyMs: 0, maxTickMs: 0, lateTicks: 0, lastTickAt: 0 };

  private tick(): void {
    const t0 = performance.now();
    const now = this.ctx.currentTime;
    const st = this.stats;
    // A tick arriving later than half the lookahead means the clock was throttled.
    if (st.lastTickAt && now - st.lastTickAt > LOOKAHEAD / 2) st.lateTicks++;
    st.lastTickAt = now;
    for (const t of this.tracks) t.schedule(now + LOOKAHEAD);
    const alive: TrackPlayer[] = [];
    for (const t of this.tracks) {
      if (now >= t.disposeAt) t.dispose();
      else alive.push(t);
    }
    this.tracks = alive;
    if (!alive.length) this.ticker?.stop();
    const ms = performance.now() - t0;
    st.ticks++;
    st.busyMs += ms;
    st.maxTickMs = Math.max(st.maxTickMs, ms);
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
