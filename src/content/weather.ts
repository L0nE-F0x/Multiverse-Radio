// Local weather in each station's dimension.

import type { StationDef } from '../broadcast/types';
import { expandUntil, merge, num, type Grammar } from './grammar';
import { LIMITS } from './limits';
import { hashSeed, rngFor } from './rng';

const weatherGrammar: Grammar = {
  forecast: ['#generic#', '#generic#', '#local#', '#local#', '#local#'],
  generic: [
    '#precip# of #abstract#, clearing by #when#. #temp#',
    '#sky#. #temp#',
    '#sky#, with #precip.lower# of #abstract# later. #temp#',
    '#sky#. Winds #wind#. #temp#',
  ],
  precip: ['Light drizzle', 'Scattered showers', 'Heavy flurries', 'A gentle mist', 'Patchy outbreaks', 'Occasional gusts', 'A brief downpour', 'Isolated bursts'],
  abstract: ['déjà vu', 'Tuesdays', 'nostalgia', 'small mercies', 'confetti', 'second thoughts', 'moth wings', 'old letters', 'good news', 'mild regret'],
  when: ['Thursday', 'teatime', 'the weekend', 'the end of time', 'mid-afternoon', 'never, probably', 'the next song'],
  sky: [
    'Clear skies, looking back at you',
    'Overcast with a chance of meaning',
    'Mostly sunny, sun mostly present',
    'Partly cloudy, partly not',
    'Bright, with the occasional moon',
    'Fog, with patches of more fog',
    'Grey, but a nice grey',
    'Calm. Too calm',
  ],
  wind: ['light and apologetic', 'from the north, then from the past', 'gusting to forty knots of gossip', 'none, thank you', 'variable, like a cat'],
  temp: ['#deg#°', '#deg#°', '#deg#°, feels like #feels#', '#deg#°, feels like #feels#', '#deg# degrees Feelings', 'Warm, emotionally'],
  // Typographic minus for negatives.
  deg: (rng) => String(rng.int(-12, 34)).replace('-', '−'),
  feels: ['Tuesday', 'a hug', '1987', 'your first flat', 'a library', 'the inside of a mitten', 'the last day of school', 'a good sandwich'],
};

/** A station whose climate never changes: only its own forecasts. */
const ONLY_LOCAL = { forecast: ['#local#'] } as const;

/** Station-local forecasts (rule `local`). */
const LOCAL: Readonly<Record<string, Grammar>> = {
  'static-lullabies': {
    ...ONLY_LOCAL,
    local: [
      'Light snow on the screen, settling. Nightlight steady',
      'Soft static, drifting. Low of #deg#°',
      'Calm. A warm hum moving in from the cupboard',
      'Snow, gentle, all night. The cat approves',
      'Still and dark. A faint glow from the hallway, as promised',
      'Hiss, light and variable. Blankets recommended',
    ],
  },
  'void-beats': {
    local: [
      'Overcast with nothing. Visibility infinite; nothing to see',
      'Planets drifting past at low altitude. #temp#',
      'Dark, cozy, with a chance of tea',
      'The void, as usual. Bring a cardigan',
      'Purple, deep, studious',
    ],
  },
  'every-news': {
    local: [
      'Scattered Tuesdays across the Eastern Overlap, clearing by eleven. It is always eleven',
      'Weather in all timelines: yes',
      'Skip Daley calls it "a beautiful night, mostly". Skip is not to be trusted with "mostly"',
    ],
  },
  'rainfall-fm': {
    ...ONLY_LOCAL,
    local: [
      'Rain. Continuing. Day #day#',
      'Heavy rain, with outbreaks of slightly heavier rain. #temp#',
      'Drizzle until further notice. Further notice: never',
      'Rain, falling upward in Precinct #p#, downward elsewhere',
      'Showers, then rain, then the memory of rain, then rain',
      'Steady rain. A dry spell of four seconds expected around midnight. Do not panic',
      'Mizzle, thickening to drizzle, maturing into rain. #temp#',
      'Rain, warm, the kind you can sleep to',
    ],
    day: (rng) => rng.int(1_000_000, 1_460_000).toLocaleString('en-US'),
    p: num(1, 12),
  },
  'neon-2087': {
    local: [
      'Permanent sunset. 29° and rad',
      'Neon haze over the grid, magenta by midnight',
      'Clear, chrome-plated skies. UV index: ultraviolet',
      'Sunset, then a second sunset, for style',
    ],
  },
  classifieds: {
    local: ['Weather available for purchase. Ask Rex about the bag of weather', 'Sunny, if you pay for the premium package', 'Forecast sold as is'],
  },
  'end-lounge': {
    ...ONLY_LOCAL,
    local: [
      'Warm and dimming. Last light expected around closing',
      'Stars going out gently to the east. #temp#',
      'Cosmic background: lukewarm. Ice in your glass: holding',
      'Heat death, mild, with a pleasant breeze',
      'Twilight, steady, has been for eleven billion years',
      'Low lighting outside, low lighting inside. Perfect',
    ],
  },
  'snail-jams': {
    local: [
      'Dew, then more dew. Wind: none, thank you',
      'Damp and lovely. Mushrooms expected by evening',
      'A single raindrop, falling slowly all afternoon',
      'Mild. Leaf conditions: excellent',
    ],
  },
  'dimension-hop': {
    local: ['Our side: mild. Their side: upside-down drizzle, rising', 'Four seconds of sunshine, arriving early', 'Gravity on the right side: patchy'],
  },
  'crystal-delta': {
    local: [
      'Bright, refracted, bright',
      'Rainbows in seven colours, then in eight',
      'Sparkling. Chance of glinting: high',
      'Crystal clear, technically',
      'Prismatic, with scattered sundogs',
    ],
  },
  'hold-music': {
    ...ONLY_LOCAL,
    local: [
      'Climate controlled at 21°. Always 21°. Since the Bronze Age',
      'Fluorescent, steady. No change expected, ever',
      'Indoor weather: beige',
      'Air conditioning: on. Has been on. Will be on',
      'Outlook: pending. Your forecast has been placed in a queue',
    ],
  },
  'pixel-afterlife': {
    local: ['8-bit drizzle; 16-colour sunset later', 'Pixel snow, chunky. #deg#°', 'Sunny, at a resolution of 256 by 224'],
  },
  'ask-grenda': {
    local: ['Rain on the studio window. The kind of rain you talk through', 'Mild. A good night to call someone', 'Drizzle, warm, with a chance of feeling better'],
  },
  'moon-dub': {
    ...ONLY_LOCAL,
    local: [
      'No weather. Dust, falling slowly. −170° in the shade',
      'Earthrise at the usual time. Earth looks sleepy',
      'Clear, airless, bass heavy',
      'Dust storm, very slow, more of a dust drift',
      'Vacuum, calm. Echo returning in eleven seconds',
      'Sunlit side: 120°. Dark side: do not ask',
    ],
  },
  whalesong: {
    ...ONLY_LOCAL,
    local: [
      'Nebula, light. Visibility: several galaxies',
      'Stellar wind, gentle, from lane 11',
      'Deep space, calm. Whales surfacing occasionally',
      'Cold and quiet and very big',
      'Starlight, scattered. A comet passing on the left',
      'Calm seas between galaxies. Swell of one whale',
    ],
  },
  'impossible-sports': {
    local: ['Sunny, because the ball is a sun', 'Upper atmosphere, brisk. Perfect day for impossible sports', 'Windy at altitude. Kicking with the wind advised, kicking the wind not advised'],
  },
  'baroque-bots': {
    local: ['Candlelit, mild, a 40% chance of powdered wig', 'Draughty, as befits a palace. Oil recommended', 'Overcast with harpsichord', 'Humid. The cello is complaining'],
  },
  'comet-marimba': {
    local: [
      'Sunny. Heading somewhere at seventy kilometres a second',
      'Hot sand, cold space, great tan',
      'Ice tail streaming to the west. Wear a hat; hold the hat',
      'Sunny with a 100% chance of vacation',
    ],
  },
  'channel-surf': { local: ['Weather on channel #ch#. Different weather on channel #ch#'], ch: num(2, 999) },
  'mirror-polka': {
    local: ['Weather reversed: it rains up, it clears down', 'Fair, from the left. #temp#', 'Sunny on this side of the mirror; the other side disagrees'],
  },
  'wild-multiverse': {
    local: ['Golden hour, permanently. Light breeze in the tall grass', 'Warm. Something large is causing a shadow', 'Grass rustling. Probably the wind'],
  },
  'numbers-omega': {
    ...ONLY_LOCAL,
    local: [
      'Fog. Fog. Fog. Visibility: four. Seven',
      'Fog, thick. Red light blinking. The fox is warm enough',
      'Seven degrees. Seven. Four',
      'Fog, rolling in from coordinates withheld',
      'Damp, still, listening',
      'Night. Fog. A distant honk, possibly a goose, possibly a reminder',
    ],
  },
};

/** Local weather in the station's dimension. */
export function dimensionWeather(station: StationDef, seed: number): string {
  const grammar = merge(weatherGrammar, LOCAL[station.id] ?? { local: ['#generic#'] });
  const base = hashSeed(station.id, 'weather', seed);
  return expandUntil(grammar, (a) => rngFor(base, a), '#forecast#', (s) => s.length <= LIMITS.weather, 'Mild, all things considered');
}
