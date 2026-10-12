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
//     until at least half of its rotation has aired. Clips tagged with a daypart only air
//     in it.
//   - Music runs (`runsInHour`) describe what the music engine plays: a track plus any
//     voice clips that air over its intro on a ducked bed.
//
// v3, the living schedule (all by the listener's local time):
//   - Shows: a show's opener (`show` + `part: 'open'`) replaces the ident at its start, and
//     clips tagged with a show air only during it (and are preferred then).
//   - Serials: one episode per local day per serial (day index mod episode count), aired
//     two or three times that day at seeded local times. Serial clips never air otherwise.
//   - Dates: clips with `dates` air only on those days and are preferred on them.
//   - Modular parts: clips with `part` chain open → 1–3 bodies → close from one kit.

import { trackMeta } from '../content/tracks';
import { createRng, hash, weightedPick, type Rng } from './random';
import { browserTzOffset, localMinuteToMs, localTime, showAtHour, type TzOffset } from './time';
import type {
  Daypart,
  RecipeId,
  RecipeTweaks,
  Segment,
  ShowDef,
  StationDef,
  TrackMeta,
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
  /** The station's named shows (from `/voice/_shows.json`). */
  shows?: ShowDef[];
}

export interface ScheduleOptions {
  /** The listener's daypart at a wall-clock time. Default: from `tzOffset`. */
  daypartOf?: (ms: number) => Daypart;
  /** The listener's UTC offset in minutes; shows, serials and dated clips follow it. Default: the browser's. */
  tzOffset?: TzOffset;
  /** 'oddity': long stretches of the oddity's own sound with the occasional announcement. */
  clock?: 'oddity';
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

/** Local minutes-of-day at which a serial airs on a local day: two or three, seeded. */
export function serialMinutes(serialId: string, localDay: number): number[] {
  const rng = createRng(hash('serial', serialId, localDay));
  const count = rng.int(2, 3);
  // Between 08:00 and 22:59, one airing per window, a few minutes past the hour.
  const span = 15;
  const width = Math.floor(span / count);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const hour = 8 + i * width + rng.int(0, width - 1);
    out.push(hour * 60 + rng.int(5, 40));
  }
  return out;
}

/** The episode of a serial on a local day: the day index mod the number of episodes. */
export function serialEpisode(episodes: readonly number[], localDay: number): number | undefined {
  if (episodes.length === 0) return undefined;
  const sorted = [...episodes].sort((a, b) => a - b);
  return sorted[((localDay % sorted.length) + sorted.length) % sorted.length];
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
  /** Artist signature seed (hash of the track's artist); absent for beds. */
  artist?: number;
}

// ── Clip picking ──────────────────────────────────────────────────────────────

/** Clips heard within this long are avoided while anything fresher fits. */
const REPEAT_AVOID_MS = 3 * HOUR_MS;
/** Clips heard within this long never air again; music fills instead. Idents may come round sooner. */
const REPEAT_FLOOR_MS = 45 * MIN;
const IDENT_REPEAT_FLOOR_MS = 10 * MIN;

/** What the listener's clock says when a clip is chosen. */
interface PickContext {
  daypart: Daypart;
  /** The show on air (id), if any. */
  show: string | null;
  /** Local "MM-DD". */
  date: string;
}

/** Idents and the opens/closes of modular parts are short and meant to come round often. */
const floorFor = (c: VoiceClip) =>
  c.category === 'id' || c.part === 'open' || c.part === 'close' ? IDENT_REPEAT_FLOOR_MS : REPEAT_FLOOR_MS;

/** Can this clip air at all right now? (Its date and show, if it has them.) */
const available = (c: VoiceClip, ctx: PickContext) =>
  (!c.dates || c.dates.includes(ctx.date)) && (!c.show || c.show === ctx.show);

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

  use(clip: VoiceClip, atMs: number): void {
    this.lastUsed.set(clip.url, atMs);
  }

  /**
   * The stalest clip that fits in `maxMs` (without marking it used). Prefers the daypart,
   * today's dated clips and the show's own clips. A clip that has aired waits until at
   * least half of its rotation has aired since. With `allowRepeat` false, gives up rather
   * than air something heard in the last few hours.
   */
  choose(
    rng: Rng,
    candidates: readonly VoiceClip[],
    ctx: PickContext,
    atMs: number,
    maxMs: number,
    allowRepeat = true,
  ): VoiceClip | undefined {
    const now = candidates.filter((c) => available(c, ctx));
    if (now.length === 0) return undefined;
    const inDaypart = now.filter((c) => !c.daypart || c.daypart === ctx.daypart);
    const rotation = inDaypart.length > 0 ? inDaypart : now;
    const last = (c: VoiceClip) => this.lastUsed.get(c.url) ?? -1;
    const age = (c: VoiceClip) => (last(c) < 0 ? Infinity : atMs - last(c));
    // Rotation: only the stalest half may come round again.
    const times = rotation.map(last).sort((a, b) => a - b);
    const threshold = times[Math.ceil(times.length / 2) - 1]!;
    let eligible = rotation.filter((c) => last(c) <= threshold && c.durationMs <= maxMs && age(c) >= floorFor(c));
    if (eligible.length === 0) return undefined;
    const dated = eligible.filter((c) => c.dates);
    if (dated.length > 0) {
      eligible = dated;
    } else {
      const fresh = eligible.filter((c) => age(c) > REPEAT_AVOID_MS);
      if (fresh.length > 0) eligible = fresh;
      else if (!allowRepeat) return undefined;
      if (ctx.show) {
        const ours = eligible.filter((c) => c.show === ctx.show);
        if (ours.length > 0) eligible = ours;
      }
    }
    eligible.sort((a, b) => last(a) - last(b) || this.rank(a) - this.rank(b));
    // Choose among the stalest quarter so the order doesn't become a fixed rotation. Parts
    // choose from everything eligible, or opens and closes would pair up in lockstep.
    const window = eligible[0]!.part ? eligible.length : Math.max(1, Math.floor(eligible.length / 4));
    return eligible[rng.int(0, window - 1)]!;
  }

  pick(
    rng: Rng,
    candidates: readonly VoiceClip[],
    ctx: PickContext,
    atMs: number,
    maxMs: number,
    allowRepeat = true,
  ): VoiceClip | undefined {
    const clip = this.choose(rng, candidates, ctx, atMs, maxMs, allowRepeat);
    if (clip) this.use(clip, atMs);
    return clip;
  }
}

// ── Pools ─────────────────────────────────────────────────────────────────────

const CONTENT_CATEGORIES: VoiceCategory[] = ['dj', 'news', 'weather', 'psa', 'call', 'sports', 'story', 'show', 'ad'];
const LINK_EXTRAS: VoiceCategory[] = ['weather', 'psa', 'news', 'story', 'call', 'sports'];
const AMBIENT_VOICES: VoiceCategory[] = ['dj', 'story', 'weather', 'psa', 'news', 'show'];

/** A set of modular parts that chain: open → 1–3 bodies → close. */
export interface Kit {
  /** `own:<kit>` or `shared:<kit>`: parts only chain within one manifest. */
  key: string;
  /** The category the chain stands in for (its parts' most common category). */
  category: VoiceCategory;
  opens: VoiceClip[];
  bodies: VoiceClip[];
  closes: VoiceClip[];
}

interface ContentEntry {
  clips: VoiceClip[];
  kits: Kit[];
  weight: number;
}

interface Pools {
  idents: VoiceClip[];
  ads: VoiceClip[];
  adKits: Kit[];
  interrupts: VoiceClip[];
  dj: VoiceClip[];
  djKits: Kit[];
  extras: VoiceClip[];
  extraKits: Kit[];
  /** Talk content by category, with weights favouring the station's own clips. */
  content: Map<VoiceCategory, ContentEntry>;
  ambientVoices: VoiceClip[];
  ambientKits: Kit[];
  /** Show id → its openers. */
  showOpeners: Map<string, VoiceClip[]>;
  /** Serial id → episode → its clips, in order. */
  serials: Map<string, Map<number, VoiceClip[]>>;
  any: boolean;
}

/** Splits clips into standalone ones, kits of parts, show openers and serial episodes. */
function sortClips(list: readonly VoiceClip[], owner: string, pools: Pick<Pools, 'showOpeners' | 'serials'>) {
  const standalone: VoiceClip[] = [];
  const kits = new Map<string, Kit & { votes: Map<VoiceCategory, number> }>();
  for (const c of list) {
    if (c.serial) {
      let episodes = pools.serials.get(c.serial.id);
      if (!episodes) pools.serials.set(c.serial.id, (episodes = new Map()));
      const clips = episodes.get(c.serial.episode) ?? [];
      clips.push(c);
      clips.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      episodes.set(c.serial.episode, clips);
    } else if (c.show && c.part === 'open') {
      // A show's opener airs at the show's start, never inside a chain.
      const openers = pools.showOpeners.get(c.show) ?? [];
      openers.push(c);
      pools.showOpeners.set(c.show, openers);
    } else if (c.part) {
      const key = `${owner}:${c.kit ?? c.category}`;
      let kit = kits.get(key);
      if (!kit) kits.set(key, (kit = { key, category: c.category, opens: [], bodies: [], closes: [], votes: new Map() }));
      (c.part === 'open' ? kit.opens : c.part === 'close' ? kit.closes : kit.bodies).push(c);
      kit.votes.set(c.category, (kit.votes.get(c.category) ?? 0) + 1);
    } else {
      standalone.push(c);
    }
  }
  const usable: Kit[] = [];
  for (const { votes, ...kit } of kits.values()) {
    if (kit.bodies.length === 0) continue;
    kit.category = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    usable.push(kit);
  }
  return { standalone, kits: usable };
}

function buildPools(stationId: string, clips: StationClips): Pools {
  const meta: Pick<Pools, 'showOpeners' | 'serials'> = { showOpeners: new Map(), serials: new Map() };
  const sharedRaw = clips.shared.filter((c) => !c.stations?.length || c.stations.includes(stationId));
  const mine = sortClips(clips.own, 'own', meta);
  const theirs = sortClips(sharedRaw, 'shared', meta);
  const own = mine.standalone;
  const shared = theirs.standalone;
  const of = (list: VoiceClip[], ...cats: VoiceCategory[]) => list.filter((c) => cats.includes(c.category));
  const kitsOf = (list: Kit[], ...cats: VoiceCategory[]) => list.filter((k) => cats.includes(k.category));
  const allKits = [...mine.kits, ...theirs.kits];
  // Shared idents only if a station explicitly claims them.
  const sharedIdents = of(shared, 'id').filter((c) => c.stations?.includes(stationId));
  const content = new Map<VoiceCategory, ContentEntry>();
  const kitWeight = (kits: Kit[]) => kits.reduce((n, k) => n + Math.min(k.bodies.length, 8), 0);
  for (const cat of CONTENT_CATEGORIES) {
    const ownClips = of(own, cat);
    const ownKits = kitsOf(mine.kits, cat);
    // Ads air in ad breaks; only stations whose own content is ads (classifieds) talk in ads.
    const sharedClips = cat === 'ad' ? [] : of(shared, cat);
    const sharedKits = cat === 'ad' ? [] : kitsOf(theirs.kits, cat);
    const weight = ownClips.length + kitWeight(ownKits) + (sharedClips.length + kitWeight(sharedKits)) * 0.25;
    if (weight > 0) content.set(cat, { clips: [...ownClips, ...sharedClips], kits: [...ownKits, ...sharedKits], weight });
  }
  return {
    idents: [...of(own, 'id'), ...sharedIdents],
    ads: of([...own, ...shared], 'ad'),
    adKits: kitsOf(allKits, 'ad'),
    interrupts: of([...own, ...shared], 'interrupt'),
    dj: of([...own, ...shared], 'dj'),
    djKits: kitsOf(allKits, 'dj'),
    extras: of([...own, ...shared], ...LINK_EXTRAS),
    extraKits: kitsOf(allKits, ...LINK_EXTRAS),
    content,
    ambientVoices: of(own, ...AMBIENT_VOICES),
    ambientKits: kitsOf(mine.kits, ...AMBIENT_VOICES),
    ...meta,
    any: clips.own.length + sharedRaw.length > 0,
  };
}

// ── Hour building ─────────────────────────────────────────────────────────────

/** Something due at a fixed time in the hour: a show's opener or a serial episode. */
interface Special {
  atMs: number;
  clips: VoiceClip[];
  /** Set for show openers. */
  show?: string;
}

/** Oddities don't have songs; their "tracks" are named after what they are. */
const ODDITY_TITLES: Partial<Record<RecipeId, string>> = {
  'test-tone': 'Line-up tone',
  'distress-beacon': 'Beacon, repeating',
  'time-signal': 'Time signal',
};

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
    private readonly tz: TzOffset,
    private readonly shows: readonly ShowDef[] | undefined,
    private readonly specials: Special[],
    private readonly oddity: boolean,
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

  private context(at = this.t): PickContext {
    const local = localTime(at, this.tz);
    return { daypart: this.daypart, show: showAtHour(this.shows, local.hour)?.id ?? null, date: local.date };
  }

  private meta(seed: number, recipe: RecipeId): TrackMeta {
    if (!this.oddity) return trackMeta(this.station, seed, recipe);
    const title = ODDITY_TITLES[recipe];
    if (title) return { title, artist: 'Unknown transmitter' };
    return { ...trackMeta(this.station, seed, 'soft-rock'), note: 'On loop since 1974.' };
  }

  /** A generated track. If too little of the hour would be left after it, it stretches to the hour. */
  track(lengthMs: number, stretchBelow: number): number {
    let length = Math.min(lengthMs, this.remaining);
    if (this.remaining - length < stretchBelow) length = this.remaining;
    if (length <= 0) return 0;
    const pool = this.station.recipePool;
    const recipe = pool?.length ? pool[(this.recipeOffset + this.trackIndex) % pool.length]! : this.station.recipe;
    const id = this.nextId();
    // A stuck loop is the same four bars, forever.
    const seed = this.oddity && recipe === 'stuck-loop' ? hash(this.station.id, 'loop') : hash(id, 'track');
    const segment: TrackSegment = {
      kind: 'track',
      id,
      stationId: this.station.id,
      startMs: this.t,
      durationMs: length,
      recipe,
      seed,
      meta: this.meta(seed, recipe),
    };
    this.segments.push(segment);
    this.trackIndex++;
    this.t += length;
    return length;
  }

  private push(clip: VoiceClip, bed: boolean): number {
    const segment: VoiceSegment = {
      kind: 'voice',
      id: this.nextId(),
      stationId: this.station.id,
      startMs: this.t,
      durationMs: clip.durationMs,
      clip,
      bed,
    };
    this.segments.push(segment);
    this.t += clip.durationMs;
    return clip.durationMs;
  }

  private bedFor(clip: VoiceClip): boolean {
    return this.station.format === 'ambient' ? true : clip.overMusic;
  }

  /** Picks and airs a clip from `candidates` if one fits. Returns its duration (0 if none). */
  voice(candidates: readonly VoiceClip[], allowRepeat = true): number {
    if (candidates.length === 0) return 0;
    const clip = this.picker.pick(this.rng, candidates, this.context(), this.t, this.remaining - this.minTail, allowRepeat);
    return clip ? this.push(clip, this.bedFor(clip)) : 0;
  }

  /**
   * A modular segment from a kit: an open (if the kit has any), one to three different
   * bodies and a close (if it has any), back to back. Returns its duration (0 if none fits).
   */
  chain(kit: Kit, allowRepeat = true): number {
    const ctx = this.context();
    const max = this.remaining - this.minTail;
    const at = this.t;
    const open = kit.opens.length ? this.picker.choose(this.rng, kit.opens, ctx, at, max) : undefined;
    if (kit.opens.length && !open) return 0;
    const closeMin = kit.closes.length ? Math.min(...kit.closes.map((c) => c.durationMs)) : 0;
    let used = open?.durationMs ?? 0;
    const bodies: VoiceClip[] = [];
    const want = this.rng.int(1, 3);
    for (let i = 0; i < want; i++) {
      const left = kit.bodies.filter((b) => !bodies.includes(b));
      const body = this.picker.choose(this.rng, left, ctx, at + used, max - used - closeMin, allowRepeat);
      if (!body) break;
      bodies.push(body);
      used += body.durationMs;
    }
    if (bodies.length === 0) return 0;
    const close = kit.closes.length ? this.picker.choose(this.rng, kit.closes, ctx, at + used, max - used) : undefined;
    if (kit.closes.length && !close) return 0;
    const parts = [open, ...bodies, close].filter((c): c is VoiceClip => c !== undefined);
    const bed = this.bedFor(parts[0]!);
    let total = 0;
    for (const part of parts) {
      this.picker.use(part, this.t);
      total += this.push(part, bed);
    }
    return total;
  }

  /** A standalone clip or a modular chain, in proportion to what the station has. */
  air(clips: readonly VoiceClip[], kits: readonly Kit[], allowRepeat = true): number {
    if (kits.length === 0) return this.voice(clips, allowRepeat);
    const chainWeight = kits.reduce((n, k) => n + Math.min(k.bodies.length, 8), 0);
    const kit = kits[this.rng.int(0, kits.length - 1)]!;
    if (this.rng.next() * (clips.length + chainWeight) >= clips.length) {
      return this.chain(kit, allowRepeat) || this.voice(clips, allowRepeat);
    }
    return this.voice(clips, allowRepeat) || this.chain(kit, allowRepeat);
  }

  /** 1–n ads back to back. */
  adBreak(pools: Pools, count: number): number {
    let total = 0;
    for (let i = 0; i < count; i++) total += this.air(pools.ads, pools.adKits);
    return total;
  }

  /** Airs whatever fixed-time items have come due: show openers and serial episodes. */
  specialsDue(): number {
    let total = 0;
    while (this.specials.length > 0 && this.specials[0]!.atMs <= this.t) {
      const special = this.specials.shift()!;
      if (special.show) {
        total += this.voice(special.clips);
        continue;
      }
      // A serial episode airs whole or not at all.
      const length = special.clips.reduce((n, c) => n + c.durationMs, 0);
      if (length > this.remaining - this.minTail) continue;
      for (const clip of special.clips) {
        this.picker.use(clip, this.t);
        total += this.push(clip, this.bedFor(clip));
      }
    }
    return total;
  }

  /** The top-of-hour ident, or the opener of a show starting now. */
  ident(pools: Pools): number {
    const opener = this.specials[0]?.show !== undefined && this.specials[0].atMs <= this.t;
    const special = this.specialsDue();
    return opener && special ? special : special + this.voice(pools.idents);
  }

  /**
   * A talk item from the station's content, choosing the category by weight. Categories
   * with something fresh that fits are tried first; repeats only if nothing else will do.
   */
  talk(pools: Pools): number {
    const maxMs = this.remaining - this.minTail;
    // Pass whole categories on: the picker's rotation needs to see every clip, not just those that fit.
    const entries = () =>
      [...pools.content.values()]
        .filter((e) => e.kits.length > 0 || e.clips.some((c) => c.durationMs <= maxMs))
        .map((e): [ContentEntry, number] => [e, e.weight]);
    for (const allowRepeat of [false, true]) {
      let list = entries();
      while (list.length > 0) {
        const entry = weightedPick(this.rng, list);
        if (!entry) break;
        const length = this.air(entry.clips, entry.kits, allowRepeat);
        if (length) return length;
        list = list.filter(([e]) => e !== entry);
      }
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
  w.ident(pools);
  while (w.remaining > 0) {
    w.track(rng.int(150, 270) * SEC, 90 * SEC);
    if (w.remaining <= 0) break;
    w.specialsDue();
    // Track boundary: ads first (music out), then ident and host link over the next intro.
    if (ads.due(w.elapsed)) w.adBreak(pools, rng.int(1, 2));
    if (interrupts > 0 && rng.chance(0.25) && w.voice(pools.interrupts)) interrupts--;
    if (idents.due(w.elapsed)) w.voice(pools.idents);
    if (++sinceLink >= linkEvery) {
      sinceLink = 0;
      linkEvery = rng.int(2, 3);
      const extra = rng.chance(0.25) && pools.extras.length + pools.extraKits.length > 0;
      if (!(extra && w.air(pools.extras, pools.extraKits))) w.air(pools.dj, pools.djKits);
    }
  }
}

function mixedClock(w: HourWriter, rng: Rng, pools: Pools): void {
  const ads = new Marks([rng.range(18, 24), rng.range(44, 50)]);
  const idents = new Marks([15 + rng.range(0, 2), 30 + rng.range(0, 2), 45 + rng.range(0, 2)]);
  let music = 0;
  let talk = w.ident(pools);
  while (w.remaining > 0) {
    music += w.track(rng.int(150, 270) * SEC, 90 * SEC);
    if (w.remaining <= 0) break;
    talk += w.specialsDue();
    if (ads.due(w.elapsed)) talk += w.adBreak(pools, rng.int(1, 2));
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
  if (w.ident(pools)) interstitial();
  while (w.remaining > 0) {
    let aired = w.specialsDue();
    const block = rng.int(1, 3);
    for (let i = 0; i < block; i++) {
      const length = w.talk(pools);
      if (!length) break;
      aired += length;
    }
    if (w.remaining <= 0) break;
    if (ads.due(w.elapsed)) aired += w.adBreak(pools, rng.int(1, 3));
    if (idents.due(w.elapsed)) aired += w.voice(pools.idents);
    // Nothing fresh fits right now: a track, then try again (clips free up as time passes).
    if (!aired) w.track(rng.int(90, 180) * SEC, 75 * SEC);
    else interstitial();
  }
}

function ambientClock(w: HourWriter, rng: Rng, pools: Pools): void {
  // At most two quiet voices an hour: the top-of-hour ident and maybe one more.
  let extra = rng.chance(0.6) ? 1 : 0;
  const extraAfter = rng.range(18, 40) * MIN;
  w.ident(pools);
  while (w.remaining > 0) {
    w.track(rng.int(360, 720) * SEC, 180 * SEC);
    if (w.remaining <= 0) break;
    w.specialsDue();
    if (extra > 0 && w.elapsed >= extraAfter) {
      extra = 0;
      w.air(pools.ambientVoices, pools.ambientKits);
    }
  }
}

/** Oddities: their own sound, mostly, with an announcement now and then if they have any. */
function oddityClock(w: HourWriter, rng: Rng, pools: Pools): void {
  const voices = [...pools.ambientVoices, ...pools.extras, ...pools.interrupts];
  w.ident(pools);
  while (w.remaining > 0) {
    w.track(rng.int(150, 420) * SEC, 120 * SEC);
    if (w.remaining <= 0) break;
    if (rng.chance(0.5)) w.voice(rng.chance(0.5) ? pools.idents : voices);
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
  private readonly tz: TzOffset;
  private readonly oddity: boolean;
  /** The station's shows, by the listener's local time. */
  readonly shows: readonly ShowDef[];
  private readonly days = new Map<number, DaySim>();
  private readonly runCache = new Map<number, MusicRun[]>();

  constructor(
    readonly station: StationDef,
    clips: StationClips | VoiceClip[] = { own: [], shared: [] },
    options: ScheduleOptions = {},
  ) {
    const library = Array.isArray(clips) ? { own: clips, shared: [] } : clips;
    this.pools = buildPools(station.id, library);
    this.shows = library.shows ?? [];
    this.tz = options.tzOffset ?? browserTzOffset;
    const tz = this.tz;
    this.daypartOf = options.daypartOf ?? (options.tzOffset ? (ms) => daypartForHour(localTime(ms, tz).hour) : localDaypart);
    this.oddity = options.clock === 'oddity';
  }

  /** The show on air at a moment (listener's local time), if any. */
  showAt(ms: number): ShowDef | null {
    return showAtHour(this.shows, localTime(ms, this.tz).hour);
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

  /** Show openers and serial airings that fall due during an hour, in order. */
  private specialsIn(hourIndex: number): Special[] {
    const { showOpeners, serials } = this.pools;
    if (showOpeners.size === 0 && serials.size === 0) return [];
    const start = hourIndex * HOUR_MS;
    const end = start + HOUR_MS;
    const out: Special[] = [];
    if (showOpeners.size > 0) {
      // The first local o'clock in this UTC hour (usually its start).
      const at = start + ((60 - (localTime(start, this.tz).minuteOfDay % 60)) % 60) * MIN;
      const hour = localTime(at, this.tz).hour;
      for (const show of this.shows) {
        const clips = showOpeners.get(show.id);
        if (at < end && show.start === hour && clips?.length) out.push({ atMs: at, clips, show: show.id });
      }
    }
    const days = new Set([localTime(start, this.tz).day, localTime(end - 1, this.tz).day]);
    for (const [serialId, episodes] of serials) {
      for (const day of days) {
        const episode = serialEpisode([...episodes.keys()], day);
        const clips = episode === undefined ? undefined : episodes.get(episode);
        if (!clips) continue;
        for (const minute of serialMinutes(serialId, day)) {
          const at = localMinuteToMs(day, minute, this.tz);
          if (at >= start && at < end) out.push({ atMs: at, clips });
        }
      }
    }
    return out.sort((a, b) => a.atMs - b.atMs);
  }

  private buildHour(hourIndex: number, picker: ClipPicker): Segment[] {
    const rng = createRng(hash(this.station.id, hourIndex));
    const daypart = this.daypartOf(hourIndex * HOUR_MS + HOUR_MS / 2);
    const w = new HourWriter(
      this.station,
      hourIndex,
      rng,
      picker,
      daypart,
      MIN_TAIL[this.station.format],
      this.tz,
      this.shows,
      this.specialsIn(hourIndex),
      this.oddity,
    );
    if (this.oddity) {
      oddityClock(w, rng, this.pools);
      return w.segments;
    }
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
        artist: hash(s.meta.artist),
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
