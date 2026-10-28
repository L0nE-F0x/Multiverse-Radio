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
/** `TrackRequest.artist` for an artist's name (case and spacing don't matter). */
export { artistSeed } from './recipes/artist';

export interface TrackRequest {
  recipe: RecipeId;
  /** Same recipe + seed + tweaks ⇒ the same piece of music, on every machine. */
  seed: number;
  /** The engine shapes an intro and an ending to fit this length. */
  durationSeconds: number;
  tweaks?: Partial<RecipeTweaks>;
  /**
   * Artist signature seed (v3): a hash of the artist's name. Tracks by the same artist share
   * a sound (palette, tempo range, a motif) while `seed` still makes each song different.
   */
  artist?: number;
  /**
   * v5: seconds at the start of the run during which a host/ident speaks over the intro
   * ("hitting the post"). The engine keeps the intro vamp warm and ducked until `talkoverSeconds`,
   * then opens the filter and drops in the main hook right as the host finishes.
   */
  talkoverSeconds?: number;
  /** v5: weave a short melodic station call-sign jingle motif into the opening bars. */
  jingle?: boolean;
  /** v5: station id used to seed the melodic station call-sign jingle motif. */
  stationId?: string;
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
  /** v5: what's playing right now (score, position in seconds, current section), if anything. */
  nowPlaying?(): {
    score: { duration: number; barDur: number; bars: number; sections: { name: string; startBar: number; bars: number; t: number }[] };
    position: number;
    section: { name: string; startBar: number; bars: number; t: number } | undefined;
  } | null;
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
    description: 'Pulse-wave leads, a stepped triangle bass, noise drums and tracker arpeggios: verses, a chorus hook, a half-time bridge and a last chorus a step up.',
  },
  baroque: {
    label: 'Baroque',
    description: 'Harpsichord counterpoint over a walking continuo, circle-of-fifths sequences and proper cadences.',
  },
  dub: {
    label: 'Dub',
    description: 'One-drop drums, a round bass over the sub, guitar-and-piano skanks, and the ends of phrases thrown into a long, dark tape echo.',
  },
  polka: {
    label: 'Polka',
    description: 'Oom-pah tuba, accordion and clarinet in a brisk two-step, with walk-ups and stop-time breaks. The trio goes to the subdominant.',
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
    description: 'Orchestral brass: a horn call and answering trumpets over timpani, then soft horns and a light side drum under the commentary.',
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
    description: 'Jaunty kitchen-show bed: pizzicato bass and strings, a rolling marimba, a brushed shuffle and a timer bell to finish.',
  },
  'horoscope-bed': {
    label: 'Horoscope bed',
    description: 'Mystic harp arpeggios and glissandi over glassy pads and a low drone, for readings. Stranger skies get stranger scales.',
  },
  'noir-bed': {
    label: 'Noir bed',
    description: 'Late-night noir: a minor line cliché on upright bass and low piano, brushes, rain on the window and a muted trumpet in the gaps.',
  },
  'quiz-bed': {
    label: 'Quiz bed',
    description: 'Game-show tension: a ticking clock, pulse bass, a cheesy organ and brass stabs, climbing a semitone every round.',
  },
  'sleep-bed': {
    label: 'Sleep bed',
    description: 'The softest pads, breathing slowly, and a music box that has almost finished winding down.',
  },
  'kids-bed': {
    label: 'Kids bed',
    description: "Bouncy children's-TV bed: ukulele strums, a glockenspiel hook, hand claps and the occasional slide whistle.",
  },
  'community-bed': {
    label: 'Community bed',
    description: 'Homely local-radio bed: fingerpicked acoustic guitar, a little light piano, a friendly shaker.',
  },
  'brass-band': {
    label: 'Brass band',
    description: 'A village brass band: marches, hymns and fête waltzes on cornets, horns, euphonium and basses, each player slightly in their own time.',
  },
  'trucker-country': {
    label: 'Trucker country',
    description: 'Late-night trucker country: boom-chicka two-steps and waltzes, pedal-steel swells and a lonesome harmonica.',
  },
  'test-tone': {
    label: 'Test tone',
    description: 'A line-up tone with the left channel interrupted, groups of pips, stretches of hiss and the odd level change.',
  },
  'distress-beacon': {
    label: 'Distress beacon',
    description: 'A faint call sign keyed in morse, then a long carrier, drifting in pitch and fading through shortwave noise.',
  },
  'stuck-loop': {
    label: 'Stuck loop',
    description: 'Four bars of a forgotten 1974 soft-rock single on a worn tape loop: wow, flutter, dropouts and a splice click every time round.',
  },
  'time-signal': {
    label: 'Time signal',
    description: 'A pip on every second and a long one on the minute, over a faint carrier. Each dimension has its own idea of a second.',
  },
  // v4 world recipes and talk beds (music-world workstream, recipes/v4-world.ts)
  'roots-reggae': {
    label: 'Roots reggae',
    description: 'One-drop drums, a guitar-and-piano skank, an organ bubble and a deep singing bass in minor and dorian keys. A melodica sings the verses, trumpet and trombone take the chorus, a spring-reverb snare marks the phrase ends.',
  },
  'island-reggae': {
    label: 'Island reggae',
    description: 'Lovers rock and rocksteady at a lazy tilt: major sevenths on chorused guitar and electric piano, a sweet vibraphone, steel pan or whistler behind the beat, soft strings and hand drums.',
  },
  exotica: {
    label: 'Exotica',
    description: 'Vibraphone, bongos and congas in a bolero, cha-cha or jungle beat, lush sevenths on a soft organ or celesta, upright bass, a gliding theremin, a tam-tam and the odd jungle bird.',
  },
  'space-age-pop': {
    label: 'Space-age pop',
    description: 'A bachelor-pad orchestra in hard-panned stereo: "pa-pa" singers call from one speaker, muted brass answers from the other, xylophone runs bounce between them and the bongos take a demonstration trip across the room.',
  },
  'court-bed': {
    label: 'Court bed',
    description: 'A stately processional for low strings and a chapel organ, walking pizzicato basses, a horn in the gaps, timpani at the cadences and the occasional rap of the gavel.',
  },
  'theatre-organ': {
    label: 'Theatre organ',
    description: 'A cinema organ with its tremulant: swelling suspense chords over a pedal, noir stings, a melodramatic minor theme between scenes and a "dun, dun, DUNNN" to finish.',
  },
  'traffic-bed': {
    label: 'Traffic bed',
    description: 'A brisk traffic-desk pulse: a rolling eighth-note bass, a ticking turn signal, a light arpeggio and a five-note station jingle at the top. Busy without nagging.',
  },
  'pirate-bed': {
    label: 'Pirate bed',
    description: 'A hand-made mono beat from an attic: boom-bap played by hand, a sneaky chromatic bassline, keys never quite in tune, crackle, and wobbly tape that sometimes stops.',
  },
  // v4 groove recipes (music-groove workstream).
  disco: {
    label: 'Disco',
    description: 'Four on the floor with open hats on the off-beats, an octave-jumping bass, guitar chicks, lush strings with runs into every chorus, horns and congas. A breakdown, a snare roll, and the floor comes back.',
  },
  'space-funk': {
    label: 'Space funk',
    description: 'Minor-ninth vamps on a slap or Moog bass riff, clavinet and wah clav, tight sixteenth hats with ghost notes, Rhodes, a horn section and a gliding synth lead. Some nights, a big build-up and a collapse.',
  },
  'warehouse-techno': {
    label: 'Warehouse techno',
    description: 'A rumbling kick at 130–135 bpm, an acid line whose filter travels in long arcs, metal on cross-rhythms, a minimal stab in a long echo and a dark drone. Hypnotic, never shrill.',
  },
  'heat-death-house': {
    label: 'Heat-death house',
    description: 'Deep house with warm minor-ninth chords, a soft round kick, shuffled hats, a melancholy pad and a wordless vocal in the echo. As the tempo falls it thins out and opens up.',
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
