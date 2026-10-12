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
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

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
  /** Accent hex. Tints the whole UI while tuned. */
  color: string;
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
  stations: StationDef[];
  stationId: string;
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
  /** Next/previous station along the dial. */
  stepStation(delta: 1 | -1): void;
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
