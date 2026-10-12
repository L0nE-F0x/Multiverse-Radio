// Shared contracts for Multiverse Radio v2: endless, procedurally generated stations.
//
// Every workstream builds against these types (see docs/V2-PLAN.md). Treat them as
// frozen: if you truly need a change, make it additive and call it out in your report.

// ── Stations ──────────────────────────────────────────────────────────────────

/**
 * music   – mostly generated music, short idents and occasional host links
 * mixed   – music and talk in roughly equal measure
 * talk    – mostly voice segments, with music beds and stingers between them
 * ambient – continuous soundscape; voices are rare and quiet
 */
export type StationFormat = 'music' | 'mixed' | 'talk' | 'ambient';

/** Generative music recipes implemented in src/music. */
export const RECIPE_IDS = [
  'lofi-hiphop',
  'lofi-rain',
  'lofi-slow',
  'lofi-glass',
  'synthwave',
  'lounge-jazz',
  'muzak',
  'ambient-drift',
  'chiptune',
  'baroque',
  'dub',
  'polka',
  'tropical-marimba',
  'static-lullaby',
  'news-bed',
  'talk-bed',
  'sports-fanfare',
  'numbers-musicbox',
  'documentary',
  // v3: new music genres and concept stations
  'jazz-trio',
  'city-pop',
  'drum-and-bass',
  'ambient-piano',
  'shoegaze',
  'sea-shanty',
  'surf-rock',
  'soft-rock',
  'cat-piano',
  'photosynth',
  'infinite-song',
  // v3: beds for the new talk and community stations
  'cooking-bed',
  'horoscope-bed',
  'noir-bed',
  'quiz-bed',
  'sleep-bed',
  'kids-bed',
  'community-bed',
  'brass-band',
  'trucker-country',
  // v3: oddities found between stations
  'test-tone',
  'distress-beacon',
  'stuck-loop',
  'time-signal',
] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

/** Optional per-station nudges on top of a recipe's defaults. All fields are optional hints. */
export interface RecipeTweaks {
  /** Beats per minute. */
  bpm: number;
  /** 0 = sparse, 1 = busy. */
  density: number;
  /** 0 = clean, 1 = very degraded (tape wobble, crackle, low-pass). */
  grit: number;
  /** 0 = conventional, 1 = clearly from another dimension (detune, odd scales, reversed bits). */
  weirdness: number;
  /** Overall brightness of the mix: 0 = dark/muffled, 1 = bright. */
  brightness: number;
}

/** Animated station scenes implemented in src/scenes. */
export const SCENE_IDS = [
  'study-desk',
  'rain-window',
  'mossy-garden',
  'crystal-cave',
  'neon-grid',
  'cosmic-bar',
  'waiting-room',
  'space-whales',
  'pixel-arcade',
  'robot-salon',
  'moon-soundsystem',
  'mirror-ballroom',
  'comet-beach',
  'crt-snow',
  'newsroom',
  'corkboard',
  'two-booths',
  'radio-booth',
  'stadium',
  'tv-wall',
  'foggy-antenna',
  'tall-grass',
  // v3: the 20 new stations
  'cloud-club',
  'hollow-town',
  'bubble-skyline',
  'future-kitchen',
  'cat-studio',
  'empty-room',
  'evidence-board',
  'observatory',
  'star-chart',
  'ghost-ship',
  'truck-stop',
  'fog-wall',
  'quiz-stage',
  'yesterday-room',
  'black-hole-surf',
  'giant-bedroom',
  'village-fete',
  'tiny-studio',
  'endless-stage',
  'greenhouse',
  // v3: secret stations
  'nightjar-cabin',
  'lighthouse',
  'first-transmitter',
  // v3: pirate stations (one scene kind per pirate, varied by seed)
  'pirate-shed',
  'pirate-van',
  'pirate-rooftop',
  'pirate-boat',
  // v3: oddities between stations
  'oddity-testcard',
  'oddity-beacon',
  'oddity-jukebox',
  'oddity-clock',
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/**
 * HUD phosphor colours. The interface is an amber terminal by default; each station tints it
 * with its own phosphor. Exact hex values live in the UI theme.
 */
export const PHOSPHOR_IDS = ['amber', 'green', 'cyan', 'white', 'red', 'violet', 'rose'] as const;
export type PhosphorId = (typeof PHOSPHOR_IDS)[number];

export interface Persona {
  name: string;
  /** Kokoro voice id, e.g. 'am_michael'. Scripts may use any voice; this is the default. */
  voice: string;
  /** TTS speed multiplier (1 = normal). */
  speed?: number;
  /** Who they are and how they talk. Read by writers; shown in the UI. */
  bio: string;
}

export interface StationDef {
  /** Stable kebab-case id. Used in URLs, localStorage, voice file paths. Never rename. */
  id: string;
  name: string;
  /** Dial position in "MHz". Display only; unique across stations. */
  frequency: number;
  /** Where it broadcasts from. */
  origin: string;
  tagline: string;
  /** Accent hex: scene palette, guide swatches, share cards. */
  color: string;
  /** HUD phosphor while tuned. */
  phosphor: PhosphorId;
  format: StationFormat;
  /** Main music recipe. Talk stations use it for beds and interstitials. */
  recipe: RecipeId;
  /** If set, the director rotates through these recipes instead of always using `recipe`. */
  recipePool?: RecipeId[];
  tweaks?: Partial<RecipeTweaks>;
  scene: SceneId;
  /** One-paragraph art direction for the scene. */
  sceneBrief: string;
  host: Persona;
  /** Recurring characters: co-hosts, reporters, regular callers. */
  cast?: Persona[];
  /** Mood words for writers and music, e.g. ['sleepy', 'warm']. */
  mood: string[];
  /** Hidden from the guide and dial markings until found by tuning to its exact frequency. */
  secret?: boolean;
}

/**
 * A named programme on a station, by the listener's local time. Defined in the station's
 * voice script (`[[show]]`) and compiled into `/voice/_shows.json`.
 */
export interface ShowDef {
  /** Unique within the station, kebab-case. Clips reference it with `show`. */
  id: string;
  name: string;
  /** One line for the guide. */
  blurb: string;
  /** Local start hour, 0–23 (inclusive). */
  start: number;
  /** Local end hour, 1–24 (exclusive). Less than `start` means it wraps past midnight. */
  end: number;
  /** Display name of the presenter, if not the station host. */
  host?: string;
}

/** `/voice/_shows.json`: every station's shows. Stations without shows are absent. */
export interface ShowIndex {
  version: 1;
  shows: Record<string, ShowDef[]>;
}

// ── Voice clips ───────────────────────────────────────────────────────────────

/**
 * id        – station ident, 2–8 s ("You're tuned to…")
 * dj        – host link between tracks, 8–30 s
 * ad        – advertisement, 15–45 s
 * news      – bulletin, 20–90 s
 * weather   – forecast / traffic, 15–60 s
 * psa       – public service announcement, 10–40 s
 * call      – call-in segment, 30–120 s
 * sports    – play-by-play or results, 20–90 s
 * story     – narration, documentary, numbers readings, 30–120 s
 * show      – long-form feature with its own sound design, 45–180 s
 * interrupt – glitch / emergency broadcast / bleed from another station, 3–12 s
 * ship      – HUSH, the relay ship's computer: deadpan system notices over any station, 3–20 s
 * event     – part of a multiverse-wide event heard on every station at once, 5–60 s
 */
export const VOICE_CATEGORIES = [
  'id',
  'dj',
  'ad',
  'news',
  'weather',
  'psa',
  'call',
  'sports',
  'story',
  'show',
  'interrupt',
  'ship',
  'event',
] as const;
export type VoiceCategory = (typeof VOICE_CATEGORIES)[number];

export type Daypart = 'morning' | 'day' | 'evening' | 'night';

export interface CaptionLine {
  speaker: string;
  text: string;
  /** Offset from the start of the clip. */
  startMs: number;
}

export interface VoiceClip {
  /** Unique within its manifest, e.g. 'dj-003'. */
  id: string;
  category: VoiceCategory;
  /** Root-relative URL, e.g. '/voice/void-beats/dj-003.mp3'. Resolve with the Vite base. */
  url: string;
  durationMs: number;
  /** Short display title ("Gary's Hole Emporium"). Optional. */
  title?: string;
  /** Hint: play over a ducked music bed (idents, host links) rather than in silence. */
  overMusic: boolean;
  /** Prefer airing during this part of the listener's local day. */
  daypart?: Daypart;
  /** Shared-pool clips only: restrict to these station ids (default: any station). */
  stations?: string[];
  /**
   * Modular part. The director chains open → 1–3 bodies → close from the same `kit` on the
   * same station, so a few parts make many combinations. Clips without `part` stand alone.
   */
  part?: 'open' | 'body' | 'close';
  /** Which set of parts this belongs to (default: the category). */
  kit?: string;
  /** Show id (ShowDef.id) this clip belongs to: show opens/closes and show-specific links. */
  show?: string;
  /** Serialized storyline: one episode airs per local day, advancing daily. */
  serial?: { id: string; episode: number };
  /** Only air on these local dates, "MM-DD" (e.g. ["10-31"]). Preferred over other clips that day. */
  dates?: string[];
  /** Ship computer only: strangeness 0–3, unlocked as the listening session gets longer. */
  level?: number;
  /** Event clips only: which multiverse event (EVENT_IDS) this clip belongs to. */
  event?: string;
  lines: CaptionLine[];
}

/**
 * Lives at `/voice/<stationId>.json`; shared pools (ads, PSAs, interrupts that any
 * station may air) at `/voice/_shared.json`. A missing manifest means "no clips".
 */
export interface VoiceManifest {
  version: 1;
  station: string;
  clips: VoiceClip[];
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export interface TrackMeta {
  title: string;
  artist: string;
  album?: string;
  /** Free-form flavor line: "Recorded live inside a whale, Year 3 of the Long Tuesday". */
  note?: string;
}

interface SegmentBase {
  /** Stable for a given station + broadcast time, e.g. 'void-beats:493512:4'. */
  id: string;
  stationId: string;
  /** Wall-clock epoch ms at which this segment starts on the broadcast clock. */
  startMs: number;
  durationMs: number;
}

export interface TrackSegment extends SegmentBase {
  kind: 'track';
  recipe: RecipeId;
  seed: number;
  meta: TrackMeta;
}

export interface VoiceSegment extends SegmentBase {
  kind: 'voice';
  clip: VoiceClip;
  /** Keep music playing underneath (ducked) while this clip airs. */
  bed: boolean;
}

export type Segment = TrackSegment | VoiceSegment;

// ── The dial ──────────────────────────────────────────────────────────────────

/**
 * The receiver tunes continuously. The main band holds the roster's stations; beyond it the
 * "deep band" keeps going, thick with pirates and oddities. Main stations sit inside the main
 * band; secret stations can be anywhere.
 */
export const DIAL = {
  min: 76,
  max: 160,
  mainBand: [87.5, 108] as const,
  /** Fine-tuning resolution in MHz. */
  step: 0.05,
} as const;

/** Things that aren't stations, found between them. */
export const ODDITY_IDS = ['test-tone', 'distress-beacon', 'stuck-loop', 'time-signal'] as const;
export type OddityId = (typeof ODDITY_IDS)[number];

/**
 * Multiverse-wide events: seeded from UTC, so every listener hears them at the same instant
 * on every station.
 *   dimensional-storm   – static squalls sweep the band; hosts struggle on through it
 *   emergency-broadcast – an Emergency Multiverse Broadcast System test (or not a test)
 *   the-hum             – everything goes quiet; a low hum; nobody mentions it afterwards
 *   station-swap        – hosts wake up on the wrong station and carry on regardless
 *   signal-from-beyond  – an unknown transmission takes over every frequency for a minute
 *   time-slip           – the last minute replays, slightly wrong
 */
export const EVENT_IDS = [
  'dimensional-storm',
  'emergency-broadcast',
  'the-hum',
  'station-swap',
  'signal-from-beyond',
  'time-slip',
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export interface ActiveEvent {
  id: EventId;
  name: string;
  startMs: number;
  durationMs: number;
}

/** What the dial is picking up at the current frequency. */
export type Tuned =
  /** A roster station (secret stations included: check `station.secret`). */
  | { kind: 'station'; station: StationDef }
  /** A generated pirate station: id `pirate-<frequency>`, not in the roster. */
  | { kind: 'pirate'; station: StationDef }
  | { kind: 'oddity'; oddity: OddityId; label: string; scene: SceneId }
  | { kind: 'static' };

// ── Broadcast store (the UI ↔ engine contract) ────────────────────────────────

/**
 * off     – never powered on (browsers need a gesture before audio)
 * tuning  – static while the station's content loads
 * playing – on air
 * paused  – powered on but paused by the listener or the OS
 * lost    – nothing usable came through; the engine is retrying or offering a retry
 */
export type PlayStatus = 'off' | 'tuning' | 'playing' | 'paused' | 'lost';

export interface BroadcastState {
  /** The roster (secret stations included; hide them until `discovered`). */
  stations: StationDef[];
  /** Id of the tuned station or pirate (the last one, while on an oddity or static). */
  stationId: string;
  /** Exact dial position in MHz. */
  frequency: number;
  /** Reception 0–1 at this frequency: 1 at a station's centre, falling off to static. */
  signal: number;
  tuned: Tuned;
  /** The named show on air now on the tuned station (listener's local time), if any. */
  show: ShowDef | null;
  /** A multiverse-wide event in progress, if any. */
  event: ActiveEvent | null;
  /** Ids of secret and pirate stations this listener has found (persisted). */
  discovered: string[];
  status: PlayStatus;
  /** Human-readable reason while status is 'lost'. */
  signalMessage: string | null;
  /** What's on air right now on the tuned station (kept up to date even while paused). */
  onAir: Segment | null;
  /** The next few segments on the tuned station. */
  upNext: Segment[];
  /** Segments the listener actually heard this session, newest first (max ~30). */
  recent: Segment[];
  /** The line being spoken right now, for captions/subtitles. */
  caption: { speaker: string; text: string } | null;
  volume: number;
  muted: boolean;
}

export interface BroadcastActions {
  /** Power button: off → on air, playing ↔ paused, lost → retry. Call from a user gesture. */
  togglePlay(): void;
  /** Tune to a station by id. Plays the static transition. Call from a user gesture. */
  tune(stationId: string): void;
  /** Next/previous main (non-secret) station along the dial. */
  stepStation(delta: 1 | -1): void;
  /** Tune to an exact frequency in MHz (clamped to the dial). Call from a user gesture. */
  tuneFrequency(mhz: number): void;
  /** Fine-tune by a delta in MHz, e.g. ±DIAL.step. */
  nudge(deltaMhz: number): void;
  /** Jump to a random station ("scan the multiverse"). */
  scan(): void;
  /** Skip ahead to the next segment on this station (the station keeps its own clock offset). */
  skip(): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  /** Live audio analyser (post-mix, pre-volume) for visualizers; null before power-on. */
  getAnalyser(): AnalyserNode | null;
}

export type BroadcastStore = BroadcastState & BroadcastActions;
