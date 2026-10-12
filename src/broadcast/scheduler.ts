// The programme scheduler: a pure function from (station, clip library, wall-clock time)
// to what's on air. Every listener tuned to a station hears the same thing at the same
// moment, tuning away and back finds the show has moved on, and nothing is stored.
//
// Structure
//   - Broadcast time is cut into UTC hours. Each hour is a self-contained programme block,
//     seeded by hash(stationId, hourIndex), that starts exactly on the hour and is filled
//     to end exactly on the next one (the last track is fitted so the hour lands on time).
//   - Each format has its own clock (see the builders below).
//   - Clip choice is "least recently used, with a little shuffle", simulated from the start
//     of each UTC day so it stays deterministic: within a day a clip doesn't come back
//     until most of its category has aired. Clips tagged with a daypart only air in it.
//   - Music runs (`runsInHour`) describe what the music engine plays: a track plus any
//     voice clips that air over its intro on a ducked bed.

import { trackMeta } from '../content';
import { createRng, hash, weightedPick, type Rng } from './random';
import type {
  Daypart,
  RecipeId,
  RecipeTweaks,
  Segment,
  StationDef,
  TrackSegment,
  VoiceCategory,
  VoiceClip,
  VoiceSegment,
} from './types';

export const HOUR_MS = 3_600_000;
const MIN = 60_000;
const SEC = 1000;

/** A station's voice library: its own manifest and the shared pool (filtered here). */
export interface StationClips {
  own: VoiceClip[];
  shared: VoiceClip[];
}

export interface ScheduleOptions {
  /** The listener's daypart at a wall-clock time. Default: the browser's local time. */
  daypartOf?: (ms: number) => Daypart;
}

export function daypartForHour(hour: number): Daypart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Daypart in the listener's local time zone. */
export function localDaypart(ms: number): Daypart {
  return daypartForHour(new Date(ms).getHours());
}

// ── Music runs ────────────────────────────────────────────────────────────────

export interface MusicRun {
  /** Stable for a given schedule: changes if the run's shape changes. */
  id: string;
  startMs: number;
  endMs: number;
  recipe: RecipeId;
  seed: number;
  tweaks?: Partial<RecipeTweaks>;
}

// ── Clip picking ──────────────────────────────────────────────────────────────

/** Clips heard within this long are avoided while anything fresher fits. */
const REPEAT_AVOID_MS = 3 * HOUR_MS;
/** Clips heard within this long never air again; music fills instead. Idents may come round sooner. */
const REPEAT_FLOOR_MS = 45 * MIN;
const IDENT_REPEAT_FLOOR_MS = 10 * MIN;

/** Least-recently-used picker with a seeded per-day shuffle for never-aired clips. */
class ClipPicker {
  private readonly lastUsed = new Map<string, number>();
  private readonly ranks = new Map<string, number>();

  constructor(
    private readonly stationId: string,
    private readonly day: number,
  ) {}

  private rank(clip: VoiceClip): number {
    let r = this.ranks.get(clip.url);
    if (r === undefined) this.ranks.set(clip.url, (r = hash(this.stationId, this.day, clip.url)));
    return r;
  }

  /**
   * The stalest clip that fits in `maxMs`, preferring the daypart. With `allowRepeat`
   * false, gives up rather than air something heard in the last few hours.
   */
  pick(
    rng: Rng,
    candidates: readonly VoiceClip[],
    daypart: Daypart,
    atMs: number,
    maxMs: number,
    allowRepeat = true,
  ): VoiceClip | undefined {
    let eligible = candidates.filter((c) => c.durationMs <= maxMs);
    if (eligible.length === 0) return undefined;
    const inDaypart = eligible.filter((c) => !c.daypart || c.daypart === daypart);
    if (inDaypart.length > 0) eligible = inDaypart;
    const last = (c: VoiceClip) => this.lastUsed.get(c.url) ?? -1;
    const age = (c: VoiceClip) => (last(c) < 0 ? Infinity : atMs - last(c));
    eligible = eligible.filter((c) => age(c) >= (c.category === 'id' ? IDENT_REPEAT_FLOOR_MS : REPEAT_FLOOR_MS));
    if (eligible.length === 0) return undefined;
    const fresh = eligible.filter((c) => age(c) > REPEAT_AVOID_MS);
    if (fresh.length > 0) eligible = fresh;
    else if (!allowRepeat) return undefined;
    eligible.sort((a, b) => last(a) - last(b) || this.rank(a) - this.rank(b));
    // Choose among the stalest quarter so the order doesn't become a fixed rotation.
    const window = Math.max(1, Math.floor(eligible.length / 4));
    const clip = eligible[rng.int(0, window - 1)]!;
    this.lastUsed.set(clip.url, atMs);
    return clip;
  }
}

// ── Hour building ─────────────────────────────────────────────────────────────

const CONTENT_CATEGORIES: VoiceCategory[] = ['dj', 'news', 'weather', 'psa', 'call', 'sports', 'story', 'show', 'ad'];
const LINK_EXTRAS: VoiceCategory[] = ['weather', 'psa', 'news', 'story', 'call', 'sports'];

interface Pools {
  idents: VoiceClip[];
  ads: VoiceClip[];
  interrupts: VoiceClip[];
  dj: VoiceClip[];
  extras: VoiceClip[];
  /** Talk content by category, with weights favouring the station's own clips. */
  content: Map<VoiceCategory, { clips: VoiceClip[]; weight: number }>;
  ambientVoices: VoiceClip[];
  any: boolean;
}

function buildPools(stationId: string, clips: StationClips): Pools {
  const shared = clips.shared.filter((c) => !c.stations?.length || c.stations.includes(stationId));
  const own = clips.own;
  const of = (list: VoiceClip[], ...cats: VoiceCategory[]) => list.filter((c) => cats.includes(c.category));
  // Shared idents only if a station explicitly claims them.
  const sharedIdents = of(shared, 'id').filter((c) => c.stations?.includes(stationId));
  const content = new Map<VoiceCategory, { clips: VoiceClip[]; weight: number }>();
  for (const cat of CONTENT_CATEGORIES) {
    const mine = of(own, cat);
    // Ads air in ad breaks; only stations whose own content is ads (classifieds) talk in ads.
    const theirs = cat === 'ad' ? [] : of(shared, cat);
    const weight = mine.length + theirs.length * 0.25;
    if (weight > 0) content.set(cat, { clips: [...mine, ...theirs], weight });
  }
  return {
    idents: [...of(own, 'id'), ...sharedIdents],
    ads: of([...own, ...shared], 'ad'),
    interrupts: of([...own, ...shared], 'interrupt'),
    dj: of([...own, ...shared], 'dj'),
    extras: of([...own, ...shared], ...LINK_EXTRAS),
    content,
    ambientVoices: of(own, 'dj', 'story', 'weather', 'psa', 'news', 'show'),
    any: own.length + shared.length > 0,
  };
}

/** Accumulates one hour's segments and keeps it contiguous and on time. */
class HourWriter {
  readonly segments: Segment[] = [];
  readonly start: number;
  readonly end: number;
  t: number;
  private trackIndex = 0;
  private readonly recipeOffset: number;

  constructor(
    private readonly station: StationDef,
    private readonly hourIndex: number,
    private readonly rng: Rng,
    private readonly picker: ClipPicker,
    readonly daypart: Daypart,
    /** Voice clips must leave at least this much of the hour for the closing track. */
    private readonly minTail: number,
  ) {
    this.start = this.t = hourIndex * HOUR_MS;
    this.end = this.start + HOUR_MS;
    this.recipeOffset = hash(station.id, hourIndex, 'recipes');
  }

  get remaining(): number {
    return this.end - this.t;
  }

  get elapsed(): number {
    return this.t - this.start;
  }

  private nextId(): string {
    return `${this.station.id}:${this.hourIndex}:${this.segments.length}`;
  }

  /** A generated track. If too little of the hour would be left after it, it stretches to the hour. */
  track(lengthMs: number, stretchBelow: number): number {
    let length = Math.min(lengthMs, this.remaining);
    if (this.remaining - length < stretchBelow) length = this.remaining;
    if (length <= 0) return 0;
    const pool = this.station.recipePool;
    const recipe = pool?.length ? pool[(this.recipeOffset + this.trackIndex) % pool.length]! : this.station.recipe;
    const id = this.nextId();
    const seed = hash(id, 'track');
    const segment: TrackSegment = {
      kind: 'track',
      id,
      stationId: this.station.id,
      startMs: this.t,
      durationMs: length,
      recipe,
      seed,
      meta: trackMeta(this.station, seed),
    };
    this.segments.push(segment);
    this.trackIndex++;
    this.t += length;
    return length;
  }

  /** Picks and airs a clip from `candidates` if one fits. Returns its duration (0 if none). */
  voice(candidates: readonly VoiceClip[], allowRepeat = true): number {
    if (candidates.length === 0) return 0;
    const clip = this.picker.pick(this.rng, candidates, this.daypart, this.t, this.remaining - this.minTail, allowRepeat);
    if (!clip) return 0;
    const segment: VoiceSegment = {
      kind: 'voice',
      id: this.nextId(),
      stationId: this.station.id,
      startMs: this.t,
      durationMs: clip.durationMs,
      clip,
      bed: this.station.format === 'ambient' ? true : clip.overMusic,
    };
    this.segments.push(segment);
    this.t += clip.durationMs;
    return clip.durationMs;
  }

  /** 1–n ads back to back. */
  adBreak(ads: readonly VoiceClip[], count: number): number {
    let total = 0;
    for (let i = 0; i < count; i++) total += this.voice(ads);
    return total;
  }

  /**
   * A talk clip from the station's content, choosing the category by weight. Categories
   * with something fresh that fits are tried first; repeats only if nothing else will do.
   */
  talk(pools: Pools): number {
    const maxMs = this.remaining - this.minTail;
    let entries = [...pools.content.values()]
      .map(({ clips, weight }): [VoiceClip[], number] => [clips.filter((c) => c.durationMs <= maxMs), weight])
      .filter(([clips]) => clips.length > 0);
    for (const allowRepeat of [false, true]) {
      while (entries.length > 0) {
        const clips = weightedPick(this.rng, entries);
        if (!clips) break;
        const length = this.voice(clips, allowRepeat);
        if (length) return length;
        entries = entries.filter(([c]) => c !== clips);
      }
      entries = [...pools.content.values()]
        .map(({ clips, weight }): [VoiceClip[], number] => [clips.filter((c) => c.durationMs <= maxMs), weight])
        .filter(([clips]) => clips.length > 0);
    }
    return 0;
  }
}

/** Minute marks within the hour at which something is due; `due` pops every passed mark. */
class Marks {
  private readonly marks: number[];
  constructor(minutes: number[]) {
    this.marks = minutes.map((m) => m * MIN).sort((a, b) => a - b);
  }
  due(elapsed: number): boolean {
    let hit = false;
    while (this.marks.length && elapsed >= this.marks[0]!) {
      this.marks.shift();
      hit = true;
    }
    return hit;
  }
}

function musicClock(w: HourWriter, rng: Rng, pools: Pools): void {
  const ads = new Marks([rng.range(17, 23), rng.range(43, 50)]);
  const idents = new Marks([15 + rng.range(0, 2), 30 + rng.range(0, 2), 45 + rng.range(0, 2)]);
  let interrupts = rng.chance(0.3) ? 1 : 0;
  let sinceLink = 0;
  let linkEvery = rng.int(2, 3);
  w.voice(pools.idents);
  while (w.remaining > 0) {
    w.track(rng.int(150, 270) * SEC, 90 * SEC);
    if (w.remaining <= 0) break;
    // Track boundary: ads first (music out), then ident and host link over the next intro.
    if (ads.due(w.elapsed)) w.adBreak(pools.ads, rng.int(1, 2));
    if (interrupts > 0 && rng.chance(0.25) && w.voice(pools.interrupts)) interrupts--;
    if (idents.due(w.elapsed)) w.voice(pools.idents);
    if (++sinceLink >= linkEvery) {
      sinceLink = 0;
      linkEvery = rng.int(2, 3);
      const extra = rng.chance(0.25) && pools.extras.length > 0;
      if (!(extra && w.voice(pools.extras))) w.voice(pools.dj);
    }
  }
}

function mixedClock(w: HourWriter, rng: Rng, pools: Pools): void {
  const ads = new Marks([rng.range(18, 24), rng.range(44, 50)]);
  const idents = new Marks([15 + rng.range(0, 2), 30 + rng.range(0, 2), 45 + rng.range(0, 2)]);
  let music = 0;
  let talk = w.voice(pools.idents);
  while (w.remaining > 0) {
    music += w.track(rng.int(150, 270) * SEC, 90 * SEC);
    if (w.remaining <= 0) break;
    if (ads.due(w.elapsed)) talk += w.adBreak(pools.ads, rng.int(1, 2));
    if (idents.due(w.elapsed)) talk += w.voice(pools.idents);
    // Talk until the hour is roughly balanced again.
    for (let i = 0; i < 4 && talk < music - 20 * SEC; i++) {
      const length = w.talk(pools);
      if (!length) break;
      talk += length;
    }
  }
}

function talkClock(w: HourWriter, rng: Rng, pools: Pools): void {
  if (pools.content.size === 0) return musicClock(w, rng, pools);
  const ads = new Marks([rng.range(17, 23), rng.range(43, 50)]);
  const idents = new Marks([15 + rng.range(0, 2), 30 + rng.range(0, 2), 45 + rng.range(0, 2)]);
  const interstitial = () => w.track(rng.int(20, 60) * SEC, 75 * SEC);
  if (w.voice(pools.idents)) interstitial();
  while (w.remaining > 0) {
    let aired = 0;
    const block = rng.int(1, 3);
    for (let i = 0; i < block; i++) {
      const length = w.talk(pools);
      if (!length) break;
      aired += length;
    }
    if (w.remaining <= 0) break;
    if (ads.due(w.elapsed)) aired += w.adBreak(pools.ads, rng.int(1, 3));
    if (idents.due(w.elapsed)) aired += w.voice(pools.idents);
    // Nothing fit: let the music carry the rest of the hour.
    if (!aired) w.track(w.remaining, 0);
    else interstitial();
  }
}

function ambientClock(w: HourWriter, rng: Rng, pools: Pools): void {
  // At most two quiet voices an hour: the top-of-hour ident and maybe one more.
  let extra = rng.chance(0.6) ? 1 : 0;
  const extraAfter = rng.range(18, 40) * MIN;
  w.voice(pools.idents);
  while (w.remaining > 0) {
    w.track(rng.int(360, 720) * SEC, 180 * SEC);
    if (w.remaining <= 0) break;
    if (extra > 0 && w.elapsed >= extraAfter) {
      extra = 0;
      w.voice(pools.ambientVoices);
    }
  }
}

const MIN_TAIL: Record<StationDef['format'], number> = {
  music: 60 * SEC,
  mixed: 60 * SEC,
  talk: 20 * SEC,
  ambient: 120 * SEC,
};

// ── The schedule ──────────────────────────────────────────────────────────────

/** Hours of one UTC day, simulated in order so clip rotation carries across hours. */
class DaySim {
  readonly hours: Segment[][] = [];
  readonly picker: ClipPicker;
  constructor(
    readonly day: number,
    stationId: string,
  ) {
    this.picker = new ClipPicker(stationId, day);
  }
}

const CACHED_DAYS = 3;

export class StationSchedule {
  private readonly pools: Pools;
  private readonly daypartOf: (ms: number) => Daypart;
  private readonly days = new Map<number, DaySim>();
  private readonly runCache = new Map<number, MusicRun[]>();

  constructor(
    readonly station: StationDef,
    clips: StationClips | VoiceClip[] = { own: [], shared: [] },
    options: ScheduleOptions = {},
  ) {
    this.pools = buildPools(station.id, Array.isArray(clips) ? { own: clips, shared: [] } : clips);
    this.daypartOf = options.daypartOf ?? localDaypart;
  }

  /** True if the library has any clips at all (otherwise the schedule is music only). */
  get hasVoice(): boolean {
    return this.pools.any;
  }

  /** The complete programme for one UTC hour, contiguous from :00 to the next :00. */
  hour(hourIndex: number): Segment[] {
    const day = Math.floor(hourIndex / 24);
    let sim = this.days.get(day);
    if (sim) {
      this.days.delete(day);
      this.days.set(day, sim);
    } else {
      sim = new DaySim(day, this.station.id);
      this.days.set(day, sim);
      for (const old of this.days.keys()) {
        if (this.days.size <= CACHED_DAYS) break;
        this.days.delete(old);
      }
    }
    const target = hourIndex - day * 24;
    while (sim.hours.length <= target) sim.hours.push(this.buildHour(day * 24 + sim.hours.length, sim.picker));
    return sim.hours[target]!;
  }

  private buildHour(hourIndex: number, picker: ClipPicker): Segment[] {
    const rng = createRng(hash(this.station.id, hourIndex));
    const daypart = this.daypartOf(hourIndex * HOUR_MS + HOUR_MS / 2);
    const w = new HourWriter(this.station, hourIndex, rng, picker, daypart, MIN_TAIL[this.station.format]);
    switch (this.station.format) {
      case 'music':
        musicClock(w, rng, this.pools);
        break;
      case 'mixed':
        mixedClock(w, rng, this.pools);
        break;
      case 'talk':
        talkClock(w, rng, this.pools);
        break;
      case 'ambient':
        ambientClock(w, rng, this.pools);
        break;
    }
    return w.segments;
  }

  /** Segments overlapping [fromMs, toMs), in order. */
  segmentsBetween(fromMs: number, toMs: number): Segment[] {
    const out: Segment[] = [];
    for (let h = Math.floor(fromMs / HOUR_MS); h * HOUR_MS < toMs; h++) {
      for (const s of this.hour(h)) if (s.startMs < toMs && s.startMs + s.durationMs > fromMs) out.push(s);
    }
    return out;
  }

  /** The segment on air at `ms`. */
  segmentAt(ms: number): Segment {
    const segments = this.hour(Math.floor(ms / HOUR_MS));
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid]!.startMs <= ms) lo = mid;
      else hi = mid - 1;
    }
    return segments[lo]!;
  }

  /** The segment on air at `ms` and the `count` after it. */
  upcoming(ms: number, count: number): Segment[] {
    const out = [this.segmentAt(ms)];
    while (out.length < count + 1) {
      const last = out[out.length - 1]!;
      out.push(this.segmentAt(last.startMs + last.durationMs));
    }
    return out;
  }

  /**
   * What the music engine should play during an hour. A track's run starts early when
   * bed clips (idents, host links) air over its intro; bed clips with no track after them
   * get a short bed of their own. Clips in `failed` are filled with music instead.
   */
  runsInHour(hourIndex: number, failed?: ReadonlySet<string>): MusicRun[] {
    const cacheable = !failed || failed.size === 0;
    const cached = cacheable ? this.runCache.get(hourIndex) : undefined;
    if (cached) return cached;
    const runs = computeRuns(this.station, this.hour(hourIndex), failed);
    if (cacheable) {
      this.runCache.set(hourIndex, runs);
      if (this.runCache.size > 6) this.runCache.delete(this.runCache.keys().next().value!);
    }
    return runs;
  }

  /** Music runs overlapping [fromMs, toMs). */
  runsBetween(fromMs: number, toMs: number, failed?: ReadonlySet<string>): MusicRun[] {
    const out: MusicRun[] = [];
    for (let h = Math.floor(fromMs / HOUR_MS); h * HOUR_MS < toMs; h++) {
      for (const r of this.runsInHour(h, failed)) if (r.startMs < toMs && r.endMs > fromMs) out.push(r);
    }
    return out;
  }
}

function computeRuns(station: StationDef, segments: Segment[], failed?: ReadonlySet<string>): MusicRun[] {
  const runs: MusicRun[] = [];
  let pending: VoiceSegment[] = [];
  const tweaksFor = (recipe: RecipeId) => (recipe === station.recipe ? station.tweaks : undefined);
  const flushBed = () => {
    const first = pending[0];
    const last = pending[pending.length - 1];
    if (!first || !last) return;
    runs.push({
      id: `bed:${first.id}@${first.startMs}`,
      startMs: first.startMs,
      endMs: last.startMs + last.durationMs,
      recipe: station.recipe,
      seed: hash(first.id, 'bed'),
      tweaks: station.tweaks,
    });
    pending = [];
  };
  for (const s of segments) {
    if (s.kind === 'track') {
      const startMs = pending[0]?.startMs ?? s.startMs;
      runs.push({
        id: `${s.id}@${startMs}`,
        startMs,
        endMs: s.startMs + s.durationMs,
        recipe: s.recipe,
        seed: s.seed,
        tweaks: tweaksFor(s.recipe),
      });
      pending = [];
    } else if (s.bed || failed?.has(s.id)) {
      pending.push(s);
    } else {
      flushBed();
    }
  }
  flushBed();
  return runs;
}

// ── Convenience (pure) ────────────────────────────────────────────────────────

/** Segments overlapping [fromMs, toMs) for a station and clip library. */
export function segmentsBetween(
  station: StationDef,
  clips: StationClips | VoiceClip[],
  fromMs: number,
  toMs: number,
  options?: ScheduleOptions,
): Segment[] {
  return new StationSchedule(station, clips, options).segmentsBetween(fromMs, toMs);
}

/** The segment on air at `ms`. */
export function segmentAt(
  station: StationDef,
  clips: StationClips | VoiceClip[],
  ms: number,
  options?: ScheduleOptions,
): Segment {
  return new StationSchedule(station, clips, options).segmentAt(ms);
}

/** Clock offset that moves a station's broadcast time to the end of what's on air now. */
export function skipOffset(schedule: StationSchedule, wallMs: number, offsetMs: number): number {
  const at = wallMs + offsetMs;
  const segment = schedule.segmentAt(at);
  return offsetMs + (segment.startMs + segment.durationMs - at);
}

/**
 * Clock offset to use when joining a station live: if a voice clip is about to finish
 * (less than `minRemainingMs` left), start cleanly at the next segment instead.
 */
export function joinOffset(schedule: StationSchedule, wallMs: number, offsetMs: number, minRemainingMs = 3000): number {
  const at = wallMs + offsetMs;
  const segment = schedule.segmentAt(at);
  const left = segment.startMs + segment.durationMs - at;
  return segment.kind === 'voice' && left < minRemainingMs ? offsetMs + left : offsetMs;
}
