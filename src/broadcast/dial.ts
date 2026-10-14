// The continuous dial: what can be heard at any frequency from 76 to 160 MHz.
//
// Every transmitter has a centre frequency, a reach (the signal falls to nothing this far
// either side, along a raised-cosine curve) and a peak strength. The roster's stations are
// fixed; everything else is placed deterministically by hashing 0.05 MHz slots, so every
// listener finds the same pirate at the same frequency:
//
//   - oddities: a couple of fixed-by-hash frequencies per ODDITY_IDS kind
//   - pirates: sparse in the gaps of the main band (≥ 0.2 MHz from any station), dense in
//     the deep band (108–160) and below 87.5
//   - secret stations: roster stations with `secret`, very narrow, at their exact frequency
//
// v4: the Outer Band (108–118) holds twelve ordinary stations and only a few pirates, and
// the roster's part of the dial follows a *layout* (./secrets.ts): Free Frequency moves
// every night, gated secrets transmit only when on the air or once found, and a patient
// listener's visitor sits wherever they are. Pirates and oddities keep clear of every
// station's frequency, every drift slot and every secret, on the air or not.
//
// Pure and cheap: pirates and oddities are placed once on first use (~1,700 hashes), the
// roster part is merged in again only when the layout changes, and lookups are a binary
// search.

import type { PirateIdentity } from '../content/pirates';
import { STATIONS, stationById } from '../stations/roster';
import { createRng, hash } from './random';
import { DISCOVER_SIGNAL, DRIFT_SLOTS, SECRET_REACH, dialLayout, type DialLayout } from './secrets';
import {
  DIAL,
  ODDITY_IDS,
  PHOSPHOR_IDS,
  type OddityId,
  type RecipeId,
  type SceneId,
  type StationDef,
  type Tuned,
} from './types';

export type TransmitterKind = 'station' | 'pirate' | 'oddity';

export interface Transmitter {
  kind: TransmitterKind;
  /** Roster station id, `pirate-<MHz>` or `oddity-<kind>-<MHz>`. */
  id: string;
  frequency: number;
  /** MHz either side of the centre at which the signal reaches zero. */
  width: number;
  /** Signal strength at the centre, 0–1. */
  peak: number;
  /** The programme the director plays (synthetic for pirates and oddities). */
  readonly station: StationDef;
  oddity?: OddityId;
}

/** Reach of each kind of transmitter (MHz to silence). */
export const REACH = { station: 0.17, secret: SECRET_REACH, pirate: 0.12, oddity: 0.1 } as const;
/** Below this signal the dial reports static (you may still hear faint bleed). */
export const TUNED_MIN = 0.12;
/** Beyond its reach a transmitter still bleeds faintly through the static, out to this distance. */
export const BLEED_RANGE = 0.55;
/** Secrets and pirates count as found after this signal (see ./secrets)… */
export { DISCOVER_SIGNAL };
/** …held for this long. */
export const DISCOVER_MS = 1200;

const SLOT = DIAL.step;
const SLOTS = Math.round((DIAL.max - DIAL.min) / SLOT);

const round2 = (f: number) => Math.round(f * 100) / 100;
export const clampFrequency = (mhz: number): number =>
  Math.min(DIAL.max, Math.max(DIAL.min, Number.isFinite(mhz) ? mhz : DIAL.min));
const slotFrequency = (k: number) => round2(DIAL.min + k * SLOT);
/** Nearest 0.05 MHz slot. */
export const snapFrequency = (mhz: number): number => slotFrequency(Math.round((clampFrequency(mhz) - DIAL.min) / SLOT));
const key = (f: number) => f.toFixed(2);
const unit = (h: number) => h / 4294967296;

// ── Signal ────────────────────────────────────────────────────────────────────

/** Signal from a transmitter at a frequency: `peak` at the centre, 0 at ±width. */
export function signalOf(t: Pick<Transmitter, 'frequency' | 'width' | 'peak'>, mhz: number): number {
  const d = Math.abs(mhz - t.frequency);
  if (d >= t.width) return 0;
  return t.peak * 0.5 * (1 + Math.cos((Math.PI * d) / t.width));
}

/** How much of a transmitter leaks through the static beyond its reach: 1 at the edge, 0 at BLEED_RANGE. */
export function bleedOf(t: Pick<Transmitter, 'frequency' | 'width'>, mhz: number): number {
  const d = Math.abs(mhz - t.frequency);
  if (d <= t.width) return 1;
  if (d >= BLEED_RANGE) return 0;
  return (1 - (d - t.width) / (BLEED_RANGE - t.width)) ** 1.5;
}

// ── Pirates ───────────────────────────────────────────────────────────────────

const PIRATE_RECIPES: RecipeId[] = [
  'lofi-hiphop', 'lofi-rain', 'lofi-slow', 'lofi-glass', 'synthwave', 'lounge-jazz', 'muzak', 'ambient-drift',
  'chiptune', 'baroque', 'dub', 'polka', 'tropical-marimba', 'jazz-trio', 'city-pop', 'drum-and-bass',
  'ambient-piano', 'shoegaze', 'sea-shanty', 'surf-rock', 'soft-rock', 'trucker-country', 'brass-band',
];
const PIRATE_SCENES: SceneId[] = ['pirate-shed', 'pirate-van', 'pirate-rooftop', 'pirate-boat'];
const PIRATE_SCENE_BRIEFS: Partial<Record<SceneId, string>> = {
  'pirate-shed': 'A garden shed full of second-hand transmitter parts, a desk lamp and a kettle. The aerial is a washing line.',
  'pirate-van': 'A parked van with a mast on the roof, curtains drawn, a warm light inside and a cable running into the dark.',
  'pirate-rooftop': 'A rooftop at night: a lashed-together mast, a tarp, a folding chair and the city humming below.',
  'pirate-boat': 'A small boat at anchor with a radio mast, a lantern swinging and the shore lights far away.',
};
const PIRATE_COLORS = [
  '#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#b5e48c', '#ff9f1c', '#c77dff', '#90e0ef', '#e9c46a',
  '#f4a261', '#80ffdb',
];
const PIRATE_VOICES = ['am_puck', 'af_bella', 'bm_fable', 'am_echo', 'af_kore', 'bf_isabella', 'am_fenrir', 'af_sarah', 'bm_daniel', 'am_michael'];
const PIRATE_MOODS = ['scrappy', 'defiant', 'nocturnal', 'homemade', 'devoted', 'crackly', 'secretive', 'cheerful'];

const pirateCache = new Map<string, StationDef>();

// Pirate names come from a grammar in its own chunk, loaded the first time a pirate is
// needed. Until it arrives a pirate goes by its frequency, and nothing is cached.
let identity: ((seed: number) => PirateIdentity) | null = null;
let identityLoad: Promise<void> | null = null;
const namesListeners = new Set<() => void>();

/** Loads the pirate-name grammar. Never rejects. */
export function loadPirateNames(): Promise<void> {
  identityLoad ??= import('../content/pirates').then(
    (m) => {
      identity = m.pirateIdentity;
      pirateCache.clear();
      for (const listener of namesListeners) listener();
    },
    () => {
      identityLoad = null;
    },
  );
  return identityLoad;
}

/** True once pirates have their real names. */
export const pirateNamesReady = (): boolean => identity !== null;

/** Called once pirate names arrive (anything showing a pirate should look it up again). */
export function onPirateNames(listener: () => void): () => void {
  namesListeners.add(listener);
  return () => namesListeners.delete(listener);
}

function provisionalIdentity(frequency: number): PirateIdentity {
  return {
    name: `Unlicensed ${frequency.toFixed(2)}`,
    slogan: 'Unlicensed. Unrepentant. Mostly in tune.',
    origin: 'Somewhere it would rather not say',
    host: { name: 'The DJ', bio: 'Broadcasting without permission.' },
  };
}

/** The generated station of a pirate at `frequency` (assumes one is there; see `pirateAt`). */
export function pirateStation(frequency: number): StationDef {
  const k = key(frequency);
  const cached = pirateCache.get(k);
  if (cached) return cached;
  const seed = hash('pirate', k);
  if (!identity) void loadPirateNames();
  const who = identity ? identity(seed) : provisionalIdentity(frequency);
  const rng = createRng(hash(seed, 'def'));
  const pick = <T>(list: readonly T[]) => list[rng.int(0, list.length - 1)]!;
  const scene = pick(PIRATE_SCENES);
  const station: StationDef = {
    id: `pirate-${k}`,
    name: who.name,
    frequency: round2(frequency),
    origin: who.origin,
    tagline: who.slogan,
    color: pick(PIRATE_COLORS),
    phosphor: pick(PHOSPHOR_IDS),
    format: rng.chance(0.62) ? 'music' : 'mixed',
    recipe: pick(PIRATE_RECIPES),
    tweaks: { grit: round2(rng.range(0.25, 0.7)), weirdness: round2(rng.range(0.05, 0.45)) },
    scene,
    sceneBrief: PIRATE_SCENE_BRIEFS[scene] ?? '',
    host: { name: who.host.name, voice: pick(PIRATE_VOICES), bio: who.host.bio },
    mood: ['unlicensed', pick(PIRATE_MOODS)],
  };
  if (identity) pirateCache.set(k, station);
  return station;
}

// ── Oddities ──────────────────────────────────────────────────────────────────

/** How many of each oddity are hidden along the dial. */
const ODDITY_COPIES = 2;
/** This one's first copy sits in the main band. */
const MAIN_BAND_ODDITY: OddityId = 'stuck-loop';

export const ODDITY_INFO: Record<OddityId, { label: string; tagline: string; scene: SceneId; phosphor: StationDef['phosphor'] }> = {
  'test-tone': {
    label: 'Test tone',
    tagline: 'Line-up tone from a transmitter that has been warming up for some time.',
    scene: 'oddity-testcard',
    phosphor: 'white',
  },
  'distress-beacon': {
    label: 'Distress beacon',
    tagline: 'A faint beacon, repeating. Nobody has answered it yet.',
    scene: 'oddity-beacon',
    phosphor: 'red',
  },
  'stuck-loop': {
    label: 'Stuck loop',
    tagline: 'Four bars of a 1974 single, looping since 1974.',
    scene: 'oddity-jukebox',
    phosphor: 'rose',
  },
  'time-signal': {
    label: 'Time signal',
    tagline: 'Pips on the second, from a clock that is very sure of itself.',
    scene: 'oddity-clock',
    phosphor: 'green',
  },
};

function oddityStation(oddity: OddityId, frequency: number): StationDef {
  const info = ODDITY_INFO[oddity];
  return {
    id: `oddity-${oddity}-${key(frequency)}`,
    name: info.label,
    frequency,
    origin: 'Unknown',
    tagline: info.tagline,
    color: '#c9cfd6',
    phosphor: info.phosphor,
    format: 'ambient',
    recipe: oddity,
    scene: info.scene,
    sceneBrief: '',
    host: { name: 'Unknown transmitter', voice: 'am_onyx', bio: 'Nobody knows who runs it.' },
    mood: ['strange'],
  };
}

// ── The table ─────────────────────────────────────────────────────────────────

class Tx implements Transmitter {
  private def: StationDef | undefined;
  constructor(
    readonly kind: TransmitterKind,
    readonly id: string,
    readonly frequency: number,
    readonly width: number,
    readonly peak: number,
    private readonly build: () => StationDef,
    readonly oddity?: OddityId,
  ) {}
  get station(): StationDef {
    // Pirates are cached by pirateStation itself (once they have their names).
    if (this.kind === 'pirate') return this.build();
    return (this.def ??= this.build());
  }
}

interface Base {
  pirates: Tx[];
  oddities: Tx[];
}

interface Table extends Base {
  layout: DialLayout;
  all: Tx[];
  byId: Map<string, Tx>;
  /** Roster stations by id, at their current frequency (on the air or not). */
  roster: Map<string, StationDef>;
}

let base: Base | null = null;
let table: Table | null = null;
let layout: DialLayout | null = null;

/** Chance that an Outer Band slot is a pirate candidate (main band 0.3, deep band 0.6). */
const OUTER_PIRATE_CHANCE = 0.16;

/** Pirates and oddities: placed for good, clear of every frequency a roster station may use. */
function buildBase(): Base {
  const [mainLo, mainHi] = DIAL.mainBand;
  const [outerLo, outerHi] = DIAL.outerBand;
  const mainFreqs = [...STATIONS.filter((s) => !s.secret).map((s) => s.frequency), ...DRIFT_SLOTS];
  const secretFreqs = STATIONS.filter((s) => s.secret).map((s) => s.frequency);
  const near = (f: number, list: number[], d: number) => list.some((x) => Math.abs(x - f) < d - 1e-9);
  const inOuter = (f: number) => f > outerLo && f <= outerHi;

  // Oddities first: a couple of each, away from stations and each other. One lives in the
  // main band, so casual listeners have a chance of stumbling on something strange.
  const oddities: Tx[] = [];
  const oddFreqs: number[] = [];
  for (const oddity of ODDITY_IDS) {
    for (let n = 0; n < ODDITY_COPIES; n++) {
      const inMainBand = oddity === MAIN_BAND_ODDITY && n === 0;
      let k = hash('oddity', oddity, n) % (SLOTS + 1);
      for (let tries = 0; tries <= SLOTS; tries++, k = (k + 7) % (SLOTS + 1)) {
        const f = slotFrequency(k);
        if (inMainBand && (f < mainLo || f > mainHi)) continue;
        if (near(f, mainFreqs, 0.3) || near(f, secretFreqs, 0.3) || near(f, oddFreqs, 0.5)) continue;
        const peak = round2(0.82 + unit(hash('oddity-peak', key(f))) * 0.13);
        oddities.push(new Tx('oddity', `oddity-${oddity}-${key(f)}`, f, REACH.oddity, peak, () => oddityStation(oddity, f), oddity));
        oddFreqs.push(f);
        break;
      }
    }
  }

  // Pirates: candidate slots by hash, thinned so no two sit within `sep` slots. Sparse in the
  // main band, sparser still in the Outer Band (it has stations of its own), dense elsewhere.
  const candidate = new Float64Array(SLOTS + 1).fill(NaN);
  for (let k = 0; k <= SLOTS; k++) {
    const f = slotFrequency(k);
    if (near(f, mainFreqs, 0.2) || near(f, secretFreqs, 0.25) || near(f, oddFreqs, 0.25)) continue;
    const inMain = f >= mainLo && f <= mainHi;
    const roll = unit(hash('pirate-slot', key(f)));
    if (roll < (inMain ? 0.3 : inOuter(f) ? OUTER_PIRATE_CHANCE : 0.6)) candidate[k] = roll;
  }
  const pirates: Tx[] = [];
  for (let k = 0; k <= SLOTS; k++) {
    const roll = candidate[k]!;
    if (Number.isNaN(roll)) continue;
    const f = slotFrequency(k);
    const sep = f >= mainLo && f <= mainHi ? 5 : inOuter(f) ? 8 : 6;
    let best = true;
    for (let j = Math.max(0, k - sep); j <= Math.min(SLOTS, k + sep) && best; j++) {
      if (j !== k && !Number.isNaN(candidate[j]!) && (candidate[j]! < roll || (candidate[j] === roll && j < k))) best = false;
    }
    if (!best) continue;
    const peak = round2(0.86 + unit(hash('pirate-peak', key(f))) * 0.14);
    pirates.push(new Tx('pirate', `pirate-${key(f)}`, f, REACH.pirate, peak, () => pirateStation(f)));
  }
  return { pirates, oddities };
}

function buildTable(current: DialLayout): Table {
  const fixed = (base ??= buildBase());
  const stations = current.onAir.map(
    (s) => new Tx('station', s.id, s.frequency, s.secret ? REACH.secret : REACH.station, 1, () => s),
  );
  const all = [...stations, ...fixed.oddities, ...fixed.pirates].sort((a, b) => a.frequency - b.frequency);
  return {
    ...fixed,
    layout: current,
    all,
    byId: new Map(all.map((t) => [t.id, t])),
    roster: new Map(current.roster.map((s) => [s.id, s])),
  };
}

/** The layout in force (until the director sets one: now, with nothing found yet). */
export function currentLayout(): DialLayout {
  return (layout ??= dialLayout({ ms: Date.now(), discovered: [] }));
}

/**
 * v4: puts the roster on the dial as a layout describes (drift, gated secrets, a visitor).
 * The director sets it whenever the layout's key changes. Returns true if anything changed.
 */
export function setDialLayout(next: DialLayout): boolean {
  if (layout?.key === next.key) return false;
  layout = next;
  return true;
}

function getTable(): Table {
  const current = currentLayout();
  if (!table || table.layout !== current) table = buildTable(current);
  return table;
}

/** Every transmitter on the dial right now, by frequency. */
export function transmitters(): readonly Transmitter[] {
  return getTable().all;
}

export function pirates(): readonly Transmitter[] {
  return (base ??= buildBase()).pirates;
}

export function oddities(): readonly Transmitter[] {
  return (base ??= buildBase()).oddities;
}

export function transmitterById(id: string): Transmitter | undefined {
  return getTable().byId.get(id);
}

/** v4: every roster station at its current frequency (Free Frequency at tonight's), by frequency. */
export function dialStations(): readonly StationDef[] {
  return currentLayout().roster;
}

/** v4: the main (non-secret) stations at their current frequencies, by frequency. */
export function mainStations(): StationDef[] {
  return currentLayout().roster.filter((s) => !s.secret);
}

/** The pirate centred on this frequency (to the 0.05 MHz slot), if there is one. */
export function pirateAt(mhz: number): StationDef | null {
  const t = getTable().byId.get(`pirate-${key(snapFrequency(mhz))}`);
  return t?.kind === 'pirate' ? t.station : null;
}

/** A roster station (at its current frequency), a pirate (`pirate-<MHz>`) or an oddity's programme, by id. */
export function stationForId(id: string): StationDef | undefined {
  const t = getTable();
  return t.roster.get(id) ?? stationById(id) ?? t.byId.get(id)?.station;
}

// ── Reception ─────────────────────────────────────────────────────────────────

export interface Reception {
  frequency: number;
  /** Best signal at this frequency, 0–1. */
  signal: number;
  /** What the receiver locks on to: the strongest signal, else the nearest transmitter within bleed range. */
  lock: Transmitter | null;
  tuned: Tuned;
}

/** Transmitters within `range` MHz of a frequency. */
function around(mhz: number, range: number): Tx[] {
  const all = getTable().all;
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid]!.frequency < mhz - range) lo = mid + 1;
    else hi = mid;
  }
  const out: Tx[] = [];
  for (let i = lo; i < all.length && all[i]!.frequency <= mhz + range; i++) out.push(all[i]!);
  return out;
}

export function tunedFor(t: Transmitter | null, signal: number): Tuned {
  if (!t || signal < TUNED_MIN) return { kind: 'static' };
  if (t.kind === 'oddity') {
    const info = ODDITY_INFO[t.oddity!];
    return { kind: 'oddity', oddity: t.oddity!, label: info.label, scene: info.scene };
  }
  return t.kind === 'pirate' ? { kind: 'pirate', station: t.station } : { kind: 'station', station: t.station };
}

export function receptionAt(mhz: number): Reception {
  const frequency = clampFrequency(mhz);
  let lock: Tx | null = null;
  let best = 0;
  let nearest = Infinity;
  for (const t of around(frequency, BLEED_RANGE)) {
    const s = signalOf(t, frequency);
    if (s > best) {
      best = s;
      lock = t;
    } else if (best === 0) {
      const edge = Math.abs(frequency - t.frequency) - t.width;
      if (edge < nearest) {
        nearest = edge;
        lock = t;
      }
    }
  }
  return { frequency, signal: best, lock, tuned: tunedFor(lock, best) };
}

/**
 * Bleed below this is lost under the static (its level is ≥ 30 dB under the dial noise), so
 * it doesn't count as hearing anything.
 */
export const QUIET_BLEED = 0.3;

/** v4: pure static: no signal at all, and no bleed you could hear. */
export function pureStatic(r: Reception): boolean {
  return r.signal === 0 && (r.lock === null || bleedOf(r.lock, r.frequency) < QUIET_BLEED);
}

/**
 * The next (+1) or previous (−1) main station along the dial from a frequency, wrapping:
 * main band and Outer Band alike, at their current frequencies.
 */
export function stepFrom(mhz: number, delta: 1 | -1): StationDef {
  const list = mainStations();
  if (delta > 0) return list.find((s) => s.frequency > mhz + 1e-6) ?? list[0]!;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.frequency < mhz - 1e-6) return list[i]!;
  return list[list.length - 1]!;
}
