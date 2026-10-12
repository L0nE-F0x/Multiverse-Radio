// Generative music engine — public API.
//
// Tracks are composed from a recipe (genre) + seed, entirely in the browser: the same
// TrackRequest gives the same notes on every machine. The heavy code is lazy-loaded by
// createMusicEngine so the main bundle stays small.
//
//   recipes/*.ts   pure, seeded composers: TrackRequest → Score (notes + automation)
//   theory.ts      scales, roman-numeral progressions, voice leading
//   dsp/*.ts       instruments synthesized into AudioBuffers on demand (no samples,
//                  no network): keys, plucks, mallets, basses, drums, textures, and
//                  synth patches pre-rendered as looping wavetable zones
//   engine/*.ts    plays a Score on the AudioContext clock: worker-ticked lookahead
//                  scheduling, crossfades, one shared reverb, glue compressor and a
//                  −1 dBFS soft ceiling. Output sits around −18 LUFS (beds −19).
//
// Semantics the director relies on: play() may be given a future `when`; a later
// play()/stop() cancels any play that hasn't started yet; stop() without `when` fades
// immediately; every track (and its reverb) ends inside durationSeconds.

import type { RecipeId, RecipeTweaks } from '../broadcast/types';
import type { TrackInfo } from './score';

export type { TrackInfo } from './score';

export interface TrackRequest {
  recipe: RecipeId;
  /** Same recipe + seed + tweaks ⇒ the same piece of music, on every machine. */
  seed: number;
  /** The engine shapes an intro and an ending to fit this length. */
  durationSeconds: number;
  tweaks?: Partial<RecipeTweaks>;
}

export interface PlayOptions {
  /** AudioContext time to start at (default: now). */
  when?: number;
  /** Seconds into the track to start from, for joining a broadcast mid-song (default 0). */
  offset?: number;
  /** Crossfade from whatever is playing, in seconds (default 0.5). */
  fade?: number;
}

export interface MusicEngine {
  /** Connect this to the mixer. */
  readonly output: AudioNode;
  /** Starts a track, replacing (crossfading) any current one. */
  play(track: TrackRequest, options?: PlayOptions): void;
  /** Fades out and stops whatever is playing. */
  stop(options?: { when?: number; fade?: number }): void;
  /** Releases every node. The engine is unusable afterwards. */
  dispose(): void;
}

export interface RecipeInfo {
  label: string;
  description: string;
}

/** Human-readable info for every recipe (used by the music lab and the UI). */
export const RECIPE_INFO: Partial<Record<RecipeId, RecipeInfo>> = {
  'lofi-hiphop': {
    label: 'Lo-fi hip-hop',
    description: 'Jazzy ninth chords on a warm electric piano, lazy swung boom-bap, round bass and vinyl dust.',
  },
  'lofi-rain': {
    label: 'Lo-fi rain',
    description: 'Melancholy felt piano and soft beats with rain tapping on the window. Leans minor.',
  },
  'lofi-slow': {
    label: 'Lo-fi slow',
    description: 'Half-asleep lo-fi under 70 bpm: long chords, half-time drums, a warm pad and lots of air.',
  },
  'lofi-glass': {
    label: 'Lo-fi glass',
    description: 'Crystalline lo-fi: glass harp, celesta and bright keys over lydian chords, rim clicks and shakers.',
  },
  synthwave: {
    label: 'Synthwave',
    description: 'Gated snares, octave-bouncing bass, sixteenth-note arps and a soaring saw lead, in minor.',
  },
  'lounge-jazz': {
    label: 'Lounge jazz',
    description: 'Walking upright bass, brushed swing, ii–V–I piano comping and a vibraphone head.',
  },
  muzak: {
    label: 'Muzak',
    description: 'Inoffensive easy listening: soft bossa groove, strings, electric piano and a flute that means well.',
  },
  'ambient-drift': {
    label: 'Ambient drift',
    description: 'Slow-breathing pads, a low drone, distant bells and long gliding calls. No drums.',
  },
  chiptune: {
    label: 'Chiptune',
    description: 'Pulse-wave leads, a stepped triangle bass, noise drums and fast tracker arpeggios.',
  },
  baroque: {
    label: 'Baroque',
    description: 'Harpsichord counterpoint over a walking continuo, circle-of-fifths sequences and proper cadences.',
  },
  dub: {
    label: 'Dub',
    description: 'One-drop drums, deep sub bass, offbeat skanks and long tape echoes that throw and fade.',
  },
  polka: {
    label: 'Polka',
    description: 'Oom-pah tuba, accordion and clarinet in a brisk two-step. The trio goes to the subdominant.',
  },
  'tropical-marimba': {
    label: 'Tropical marimba',
    description: 'Marimba and steel drum over tresillo bass, congas and shakers. Sunny, with waves.',
  },
  'static-lullaby': {
    label: 'Static lullaby',
    description: 'A music-box waltz drifting through radio static, slightly out of tune and very sleepy.',
  },
  'news-bed': {
    label: 'News bed',
    description: 'A ticking, pulsing bed for bulletins: urgent but calm, with space for the voice.',
  },
  'talk-bed': {
    label: 'Talk bed',
    description: 'A light, bouncy groove that sits under conversation without getting in the way.',
  },
  'sports-fanfare': {
    label: 'Sports fanfare',
    description: 'Brass stabs, timpani and a marching snare: heroic, then politely backs off for commentary.',
  },
  'numbers-musicbox': {
    label: 'Numbers music box',
    description: 'A short, eerie music-box phrase that repeats through shortwave hiss, with the odd pip.',
  },
  documentary: {
    label: 'Documentary',
    description: 'Hushed strings, a patient piano ostinato and swelling horns, for majestic narration.',
  },
  // v3 recipes: info first; composers arrive with the music v3 workstream.
  'jazz-trio': {
    label: 'Jazz trio',
    description: 'Late-night piano trio: brushed drums, walking upright bass, rubato ballads and medium swing.',
  },
  'city-pop': {
    label: 'City pop',
    description: 'Glossy mid-80s city pop: chorus-drenched electric piano, slap bass, gated drums and a bright synth hook.',
  },
  'drum-and-bass': {
    label: 'Drum and bass',
    description: 'Fast breakbeats at ~172 bpm, rolling sub bass, atmospheric pads and the odd reese growl.',
  },
  'ambient-piano': {
    label: 'Ambient piano',
    description: 'Sparse solo piano in a big room: slow phrases, long sustain, silence as an instrument.',
  },
  'shoegaze': {
    label: 'Shoegaze',
    description: 'Walls of reverse-reverb guitar, buried melodies, steady drums and a wash of noise.',
  },
  'sea-shanty': {
    label: 'Sea shanty',
    description: 'Accordion, fiddle and stamping feet in a rolling six-eight; a call-and-response melody.',
  },
  'surf-rock': {
    label: 'Surf rock',
    description: 'Twangy spring-reverb guitar, tremolo picking, driving drums and a bouncing bass.',
  },
  'soft-rock': {
    label: 'Soft rock',
    description: 'Golden-hour seventies soft rock: electric piano, warm bass, gentle backbeat and a lazy guitar lead.',
  },
  'cat-piano': {
    label: 'Cat piano',
    description: 'Sleepy lo-fi with long silences, interrupted by enthusiastic notes from a cat walking on the keys.',
  },
  'photosynth': {
    label: 'Photosynth',
    description: 'Very slow, sunny ambient drones and plucks for houseplants. Changes at the speed of growth.',
  },
  'infinite-song': {
    label: 'The Infinite Song',
    description: 'One song that never ends: the same key and refrain forever, with every verse a little different.',
  },
  'cooking-bed': {
    label: 'Cooking bed',
    description: 'Jaunty kitchen-show bed: pizzicato strings, marimba and a light shuffle.',
  },
  'horoscope-bed': {
    label: 'Horoscope bed',
    description: 'Mystic harp and glassy pads with a slow shimmer, for readings.',
  },
  'noir-bed': {
    label: 'Noir bed',
    description: 'Tense late-night noir: muted trumpet, brushed snare, upright bass and rain.',
  },
  'quiz-bed': {
    label: 'Quiz bed',
    description: 'Game-show tension bed with a ticking clock, stabs and a cheesy organ.',
  },
  'sleep-bed': {
    label: 'Sleep bed',
    description: 'The softest possible pads and a music-box lull, for bedtime stories.',
  },
  'kids-bed': {
    label: 'Kids bed',
    description: "Bouncy children's-TV bed: ukulele, glockenspiel and hand claps.",
  },
  'community-bed': {
    label: 'Community bed',
    description: 'Homely local-radio bed: acoustic guitar, light piano and a friendly shaker.',
  },
  'brass-band': {
    label: 'Brass band',
    description: 'A village brass band: cornets, euphonium and a bass drum, slightly out of time.',
  },
  'trucker-country': {
    label: 'Trucker country',
    description: 'Late-night trucker country: pedal-steel swells, a boom-chicka rhythm and a lonesome harmonica.',
  },
  'test-tone': {
    label: 'Test tone',
    description: 'Line-up tones and pips, as found between stations.',
  },
  'distress-beacon': {
    label: 'Distress beacon',
    description: 'A faint, repeating morse beacon through the noise.',
  },
  'stuck-loop': {
    label: 'Stuck loop',
    description: 'Four bars of a forgotten 1974 soft-rock single, looping forever.',
  },
  'time-signal': {
    label: 'Time signal',
    description: 'Precise pips on the second, from a clock that is very sure of itself.',
  },
};

/**
 * Creates the engine on an existing AudioContext. May lazy-load heavy code, hence async.
 * Must not start any sound until `play` is called.
 */
export async function createMusicEngine(ctx: AudioContext): Promise<MusicEngine> {
  const { Engine } = await import('./engine/engine');
  return new Engine(ctx);
}

/** Composition details for a request (key, tempo, form, chords), without audio. */
export async function getTrackInfo(track: TrackRequest): Promise<TrackInfo> {
  const [{ compose }, { trackInfo }] = await Promise.all([import('./recipes'), import('./score')]);
  return trackInfo(compose(track));
}

/** Renders a track to an AudioBuffer offline (lab WAV export, tests in the browser). */
export async function renderTrack(
  track: TrackRequest,
  seconds: number,
  options: { sampleRate?: number; offset?: number; solo?: number[] } = {},
): Promise<AudioBuffer> {
  const { renderOffline } = await import('./engine/engine');
  return renderOffline(track, seconds, options);
}
