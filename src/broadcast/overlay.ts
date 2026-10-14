// The overlay: what the receiver hears on top of (or instead of) whatever it's tuned to.
//
//   - Multiverse events (./events.ts): seeded from UTC, so every listener hears them at the
//     same instant on every frequency, static included. Each has a sound treatment and may
//     carry `event` clips from /voice/_events.json.
//   - HUSH (./hush.ts): the ship's computer, every 10–20 minutes of listening, ducked like a
//     host, waiting for a gap in the station's talk, and never near an event.
//   - v4: the Convergence's shared open and close, and between them the tuned station's own
//     reaction (each station's once per Convergence, so tuning around hears several); HUSH's
//     arc steps (reported through `onArc`); and HUSH jamming Free Frequency (`jam`, called by
//     the director, which cuts the station itself).
//
// The director calls `tick` on every heartbeat while the radio is on; audio is scheduled a
// few seconds ahead on the context clock, like the station's own clips.

import { SHIP } from '../stations/ship';
import type { AudioBufferCache } from './audioCache';
import { alert, beyond, burst, hum, squalls, sweep, type Treatment } from './eventfx';
import { convergenceReaction, eventAt, makeEvent, nextEvent, planEvent, type EventPlan } from './events';
import { HushPicker, hushLevel, nextHushDelay, type ArcProgress, type HushLevel } from './hush';
import { POOLS, type VoiceLibrary } from './library';
import { resolveAsset } from './manifest';
import type { Mixer, VoiceHandle } from './mixer';
import { hash } from './random';
import type { StationSchedule } from './scheduler';
import type { ActiveEvent, Daypart, EventId, VoiceClip } from './types';

const LOOKAHEAD_MS = 4000;
/** HUSH ducks the station like a host (about −13 dB). */
const HOST_DUCK = 10 ** (-13 / 20);
/** HUSH keeps this far clear of events. */
const EVENT_CLEARANCE_MS = 75_000;
/** If the station never stops talking, HUSH gives up waiting for a gap after this long. */
const MAX_WAIT_MS = 6 * 60_000;
const MIN = 60_000;

export interface ProgramView {
  /** The programme's schedule (null on bare static). */
  schedule: StationSchedule | null;
  /** Broadcast time on the programme now. */
  now: number;
  stationId: string | null;
  daypart: Daypart;
  /** Local "MM-DD". */
  date: string;
  /** v4: local weekday (0 = Sunday). */
  weekday?: number;
}

/** v4: what HUSH knows about the listener's shifts (for arc steps). */
export interface ShiftView {
  shifts: number;
  aired: ArcProgress;
}

interface Airing {
  key: string;
  kind: 'event' | 'ship';
  clip: VoiceClip;
  /** Wall-clock start. */
  startMs: number;
  handle: VoiceHandle;
}

interface DuckSpan {
  key: string;
  from: number;
  to: number;
  level: number;
  attack: number;
  release: number;
}

export class Overlay {
  /** The lab's "force event": overrides the seeded timeline while it lasts. */
  forced: ActiveEvent | null = null;
  /** Pins HUSH's level (tests, the lab, `?hush=`). */
  levelOverride: HushLevel | null = null;
  /** Listening time this session (only while the radio is on). */
  listenMs = 0;
  /** v4: the listener's shifts and the arc steps aired so far. */
  shiftView: () => ShiftView = () => ({ shifts: 0, aired: {} });
  /** v4: called when an arc step actually goes out. */
  onArc: ((arc: NonNullable<VoiceClip['arc']>, clip: VoiceClip) => void) | null = null;

  private lastWall: number | null = null;
  private nextHushMs: number;
  private readonly picker = new HushPicker();
  private pending: { clip: VoiceClip; since: number } | null = null;
  private hushCount = 0;
  private airings: Airing[] = [];
  private readonly plans = new Map<string, EventPlan>();
  private treatment: { key: string; parts: Treatment[]; quietStatic: boolean } | null = null;
  private spans: DuckSpan[] = [];
  private duckUntil = -Infinity;
  /** Convergence reactions already aired (`<event key>:react:<station>`), for the event on now. */
  private reacted = new Set<string>();
  private jamCount = 0;

  constructor(
    private readonly mixer: () => Mixer | null,
    private readonly cache: () => AudioBufferCache | null,
    private readonly library: VoiceLibrary,
    private readonly random: () => number = Math.random,
  ) {
    this.nextHushMs = nextHushDelay(this.random, true);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /** The event in progress (forced or seeded). */
  eventAt(wall: number): ActiveEvent | null {
    const forced = this.forced;
    if (forced) {
      if (wall >= forced.startMs && wall < forced.startMs + forced.durationMs) return forced;
      if (wall >= forced.startMs + forced.durationMs) this.forced = null;
    }
    return eventAt(wall);
  }

  /** The next event to start after `wall` (forced or seeded). */
  nextEventAfter(wall: number): ActiveEvent {
    const seeded = nextEvent(wall);
    const forced = this.forced;
    return forced && forced.startMs > wall && forced.startMs < seeded.startMs ? forced : seeded;
  }

  plan(event: ActiveEvent, stationId: string | null): EventPlan {
    const key = `${event.id}@${event.startMs}`;
    let plan = this.plans.get(key);
    if (!plan) {
      plan = planEvent(event, this.library.pool(POOLS.events), stationId ?? undefined);
      // Plan again once the clips arrive (until then, the treatment alone).
      if (this.library.manifest(POOLS.events)) this.plans.set(key, plan);
      if (this.plans.size > 6) this.plans.delete(this.plans.keys().next().value!);
    }
    return plan;
  }

  /** Time-slip: how far behind live the programme runs at this moment (0 or negative ms). */
  shiftAt(wall: number, stationId: string | null): number {
    const event = this.eventAt(wall);
    if (event?.id !== 'time-slip') return 0;
    const slip = this.plan(event, stationId).slip;
    return slip && wall >= slip.fromMs && wall < slip.toMs ? slip.shiftMs : 0;
  }

  level(): HushLevel {
    return this.levelOverride ?? hushLevel(this.listenMs);
  }

  /** Listening time until HUSH next speaks (0 if it's waiting for a gap). */
  get hushInMs(): number {
    return Math.max(0, this.nextHushMs - this.listenMs);
  }

  /** What the overlay is saying at a wall-clock moment (the newest clip wins). */
  speaking(wall: number, latencyMs = 0): { kind: 'event' | 'ship'; clip: VoiceClip; speaker: string; text: string } | null {
    const at = wall - latencyMs;
    for (let i = this.airings.length - 1; i >= 0; i--) {
      const a = this.airings[i]!;
      if (a.handle.ended || at < a.startMs || at >= a.startMs + a.clip.durationMs) continue;
      const into = at - a.startMs;
      let line: VoiceClip['lines'][number] | undefined;
      for (const l of a.clip.lines) {
        if (l.startMs > into) break;
        line = l;
      }
      if (!line) return null;
      return { kind: a.kind, clip: a.clip, speaker: a.kind === 'ship' ? SHIP.computer.name : line.speaker, text: line.text };
    }
    return null;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Lab: starts an event in a moment, on top of whatever the timeline says. */
  force(id: EventId, wall: number, durationMs?: number): ActiveEvent {
    this.forced = makeEvent(id, wall + 1500, durationMs);
    return this.forced;
  }

  /** The tape rewinding as a time slip begins (`back`), or a whoosh as it snaps forward. */
  slipSound(back: boolean): void {
    const mixer = this.mixer();
    if (mixer) sweep(mixer.ctx, mixer.overlayBus, mixer.noiseBuffer, mixer.ctx.currentTime, back ? 'rewind' : 'whoosh');
  }

  /** Lab: HUSH speaks at the next gap. */
  hushNow(): void {
    this.nextHushMs = this.listenMs;
  }

  /** Stops everything at once (pause, power off). The session clock stops too. */
  stop(fade = 0.12): void {
    this.lastWall = null;
    for (const a of this.airings) a.handle.stop(fade);
    this.airings = [];
    this.endTreatment(fade);
    this.spans = [];
    this.duckUntil = -Infinity;
    const mixer = this.mixer();
    if (mixer) {
      const param = mixer.eventDuck.gain;
      const now = mixer.ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(1, now, 0.05);
    }
  }

  // ── The heartbeat ─────────────────────────────────────────────────────────

  tick(wall: number, program: ProgramView): void {
    const mixer = this.mixer();
    const cache = this.cache();
    if (!mixer || !cache || mixer.ctx.state !== 'running') return;
    if (this.lastWall !== null) this.listenMs += Math.min(2000, Math.max(0, wall - this.lastWall));
    this.lastWall = wall;
    const ctxNow = mixer.ctx.currentTime;
    const ctxAt = (ms: number) => ctxNow + (ms - wall) / 1000;

    // Events: treatment, clips, and the station's level underneath.
    const event = this.eventAt(wall);
    const plan = event ? this.plan(event, program.stationId) : null;
    const key = event ? `${event.id}@${event.startMs}` : null;
    if (this.treatment && this.treatment.key !== key) this.endTreatment(1.2);
    if (plan && key && !this.treatment) this.startTreatment(plan, key, mixer, wall, ctxAt);
    if (plan && key) {
      plan.clips.forEach((planned, i) => this.air(`${key}:${i}`, 'event', planned.clip, planned.startMs, plan.underClip, wall, ctxAt));
      if (plan.convergence) this.react(plan, key, program.stationId, wall, ctxAt);
    } else if (this.reacted.size) {
      this.reacted.clear();
    }
    const upcoming = this.nextEventAfter(wall);
    if (upcoming.startMs - wall < 45_000) {
      for (const { clip } of this.plan(upcoming, program.stationId).clips) this.prefetch(clip);
    }

    this.tickHush(wall, program, event, upcoming, ctxAt);

    this.scheduleDuck(wall, ctxNow, ctxAt);
    this.airings = this.airings.filter((a) => !a.handle.ended);
    this.spans = this.spans.filter((s) => s.to > wall - 5000);
  }

  /**
   * The Convergence: the tuned station's reaction to this week's topic, once per station,
   * between the open and the close, whenever nothing else from the event is speaking.
   */
  private react(plan: EventPlan, key: string, stationId: string | null, wall: number, ctxAt: (ms: number) => number): void {
    const c = plan.convergence!;
    if (!stationId || stationId.startsWith('pirate-') || stationId.startsWith('oddity-')) return;
    const reactKey = `${key}:react:${stationId}`;
    if (this.reacted.has(reactKey)) return;
    const clip = convergenceReaction(this.library.pool(stationId), c.topic, plan.event.startMs);
    if (!clip) return;
    this.prefetch(clip);
    const start = Math.max(c.fromMs, wall + 1200);
    if (start + clip.durationMs > c.toMs) return;
    const busy = this.airings.some((a) => !a.handle.ended && a.startMs < start + clip.durationMs + 800 && a.startMs + a.clip.durationMs + 800 > start);
    if (busy) return;
    if (this.air(reactKey, 'event', clip, start, plan.underClip, wall, ctxAt)) this.reacted.add(reactKey);
  }

  /** True while anything from the overlay is speaking (or about to). */
  get speakingSoon(): boolean {
    return this.airings.some((a) => !a.handle.ended);
  }

  /**
   * v4: HUSH jams the programme (Free Frequency): a burst of static now, then the jam clip.
   * The director has already cut the station. Returns the wall time the clip ends, or null
   * if the clip isn't decoded yet (it starts loading).
   */
  jam(clip: VoiceClip, wall: number): number | null {
    const mixer = this.mixer();
    const cache = this.cache();
    if (!mixer || !cache || mixer.ctx.state !== 'running') return null;
    const url = resolveAsset(clip.url);
    if (!cache.get(url)) {
      if (cache.state(url) === 'idle') void cache.load(url);
      return null;
    }
    const ctxNow = mixer.ctx.currentTime;
    const ctxAt = (ms: number) => ctxNow + (ms - wall) / 1000;
    burst(mixer.ctx, mixer.overlayBus, mixer.noiseBuffer, ctxNow + 0.02, 0.7, hash('jam', wall));
    const start = wall + 750;
    return this.air(`jam:${++this.jamCount}`, 'ship', clip, start, 1, wall, ctxAt) ? start + clip.durationMs : null;
  }

  /** Starts decoding a clip ahead of time. */
  warm(clip: VoiceClip): void {
    if (this.cache()) this.prefetch(clip);
  }

  private prefetch(clip: VoiceClip): void {
    const cache = this.cache();
    const url = resolveAsset(clip.url);
    if (cache?.state(url) === 'idle') void cache.load(url);
  }

  /** Schedules an overlay clip if it's due within the lookahead and decoded. */
  private air(
    key: string,
    kind: Airing['kind'],
    clip: VoiceClip,
    startMs: number,
    duck: number,
    wall: number,
    ctxAt: (ms: number) => number,
  ): boolean {
    if (this.airings.some((a) => a.key === key)) return true;
    const end = startMs + clip.durationMs;
    if (startMs > wall + LOOKAHEAD_MS || end < wall + 500) return false;
    const mixer = this.mixer()!;
    const cache = this.cache()!;
    const url = resolveAsset(clip.url);
    const buffer = cache.get(url);
    if (!buffer) {
      if (cache.state(url) === 'idle') void cache.load(url);
      return false;
    }
    const earliest = mixer.ctx.currentTime + 0.04;
    let when = ctxAt(startMs);
    let offset = 0;
    if (when < earliest) {
      offset = earliest - when;
      when = earliest;
    }
    const handle = mixer.playVoice(buffer, { when, offset, end: ctxAt(end), fadeIn: offset > 0.05 ? 0.2 : 0, gain: 1 }, 'overlay');
    this.airings.push({ key, kind, clip, startMs, handle });
    if (duck < 1) this.addSpan({ key, from: startMs, to: end, level: duck, attack: 0.06, release: 0.35 }, wall, ctxAt);
    return true;
  }

  private startTreatment(plan: EventPlan, key: string, mixer: Mixer, wall: number, ctxAt: (ms: number) => number): void {
    const { event } = plan;
    const { ctx } = mixer;
    const bus = mixer.overlayBus;
    const now = ctx.currentTime;
    const start = Math.max(now + 0.02, ctxAt(event.startMs));
    const end = ctxAt(event.startMs + event.durationMs);
    const late = wall - event.startMs;
    const seed = hash(event.id, event.startMs);
    const parts: Treatment[] = [];
    let quietStatic = false;
    switch (event.id) {
      case 'dimensional-storm':
        parts.push(squalls(ctx, bus, mixer.noiseBuffer, start, end, seed));
        break;
      case 'the-hum':
        parts.push(hum(ctx, bus, start, end, late > 1500 ? 0.6 : 3));
        break;
      case 'signal-from-beyond':
        parts.push(beyond(ctx, bus, start, end, seed));
        quietStatic = true;
        break;
      case 'emergency-broadcast':
        if (late < 2500) parts.push(alert(ctx, bus, start, 'open'));
        if (end - 3.4 > now) parts.push(alert(ctx, bus, end - 3.4, 'close'));
        quietStatic = true;
        break;
      case 'station-swap':
        if (late < 1500) parts.push(sweep(ctx, bus, mixer.noiseBuffer, start, 'whoosh'));
        break;
      case 'time-slip':
        // The director rewinds the station; the overlay only marks the moment.
        break;
    }
    if (quietStatic) mixer.setStaticLevel(0.25, 1);
    this.treatment = { key, parts, quietStatic };
    if (plan.base < 1) {
      this.addSpan(
        {
          key,
          from: event.startMs,
          to: event.startMs + event.durationMs,
          level: plan.base,
          attack: event.id === 'the-hum' ? 1.2 : 0.06,
          release: 0.8,
        },
        wall,
        ctxAt,
      );
    }
  }

  private endTreatment(fade: number): void {
    const t = this.treatment;
    if (!t) return;
    this.treatment = null;
    for (const part of t.parts) part.stop(fade);
    if (t.quietStatic) this.mixer()?.setStaticLevel(1, 1);
    this.spans = this.spans.filter((s) => s.key !== t.key);
  }

  // ── HUSH ──────────────────────────────────────────────────────────────────

  private tickHush(wall: number, program: ProgramView, event: ActiveEvent | null, upcoming: ActiveEvent, ctxAt: (ms: number) => number): void {
    if (this.listenMs < this.nextHushMs) return;
    if (event || upcoming.startMs - wall < EVENT_CLEARANCE_MS) return;
    if (this.airings.some((a) => a.kind === 'ship')) return;
    const cache = this.cache()!;
    if (!this.pending) {
      const pool = this.library.pool(POOLS.ship);
      void this.library.loadPool(POOLS.ship);
      const view = this.shiftView();
      const clip = this.picker.pick(
        pool,
        this.level(),
        { date: program.date, daypart: program.daypart, weekday: program.weekday, shifts: view.shifts, aired: view.aired },
        this.random,
      );
      if (!clip) {
        // Nothing to say yet (the pool may still be loading, or not exist): ask again later.
        this.nextHushMs = this.listenMs + (pool.length ? 5 : 1) * MIN;
        return;
      }
      this.pending = { clip, since: wall };
      this.prefetch(clip);
    }
    const { clip, since } = this.pending;
    const url = resolveAsset(clip.url);
    const state = cache.state(url);
    if (state === 'failed') {
      this.pending = null;
      this.nextHushMs = this.listenMs + 5 * MIN;
      return;
    }
    if (state !== 'ready') return;
    const start = wall + 1200;
    if (upcoming.startMs < start + clip.durationMs + 30_000) return;
    // Wait for a moment when the station isn't talking.
    if (program.schedule && wall - since < MAX_WAIT_MS) {
      const from = program.now + 1200 - 1500;
      const to = program.now + 1200 + clip.durationMs + 1500;
      if (program.schedule.segmentsBetween(from, to).some((s) => s.kind === 'voice')) return;
    }
    this.pending = null;
    if (this.air(`ship:${++this.hushCount}`, 'ship', clip, start, HOST_DUCK, wall, ctxAt)) {
      this.nextHushMs = this.listenMs + nextHushDelay(this.random);
      if (clip.arc) this.onArc?.(clip.arc, clip);
    } else {
      this.nextHushMs = this.listenMs + MIN;
    }
  }

  // ── Ducking ───────────────────────────────────────────────────────────────

  private levelAt(t: number): number {
    let level = 1;
    for (const s of this.spans) if (t >= s.from && t < s.to) level = Math.min(level, s.level);
    return level;
  }

  private addSpan(span: DuckSpan, wall: number, ctxAt: (ms: number) => number): void {
    this.spans.push(span);
    // Re-plan the automation from now with the new span included.
    const mixer = this.mixer()!;
    const param = mixer.eventDuck.gain;
    const now = mixer.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(this.levelAt(wall), now, span.from <= wall ? 0.15 : 0.05);
    this.duckUntil = wall;
    this.scheduleDuck(wall, now, ctxAt);
  }

  /** Writes duck automation for span edges inside the lookahead that aren't scheduled yet. */
  private scheduleDuck(wall: number, ctxNow: number, ctxAt: (ms: number) => number): void {
    const horizon = wall + LOOKAHEAD_MS;
    if (this.spans.length === 0) {
      this.duckUntil = horizon;
      return;
    }
    const edges: { at: number; attack: number; release: number }[] = [];
    for (const s of this.spans) {
      for (const at of [s.from, s.to]) if (at > this.duckUntil && at <= horizon) edges.push({ at, attack: s.attack, release: s.release });
    }
    edges.sort((a, b) => a.at - b.at);
    const param = this.mixer()!.eventDuck.gain;
    let before = this.levelAt(this.duckUntil);
    for (const edge of edges) {
      const after = this.levelAt(edge.at);
      if (after !== before) {
        const falling = after < before;
        param.setTargetAtTime(after, Math.max(ctxNow, ctxAt(edge.at) - (falling ? 0.08 : 0)), falling ? edge.attack : edge.release);
      }
      before = after;
    }
    this.duckUntil = horizon;
  }
}
