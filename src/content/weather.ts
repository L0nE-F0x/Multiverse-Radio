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
  when: ['Thursday', 'dusk', 'the weekend', 'the end of time', 'mid-afternoon', 'never, probably', 'the next song'],
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
  feels: ['Tuesday', 'a hug', '1987', 'a rented room', 'a library', 'the inside of a mitten', 'the last day of school', 'a good sandwich'],
};

/** A station whose climate never changes: only its own forecasts. */
const ONLY_LOCAL = { forecast: ['#local#'] } as const;

/** Station-local forecasts (rule `local`). */
export const LOCAL: Readonly<Record<string, Grammar>> = {
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
      'Dark and quiet, with a slow mug cooling',
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
    local: ['Candlelit, mild, a 40% chance of powdered wig', 'Airy, as befits a palace. Oil recommended', 'Overcast with harpsichord', 'Humid. The cello is complaining'],
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
  'smoke-ring-trio': {
    ...ONLY_LOCAL,
    local: [
      'Inside the cumulonimbus: 98% humidity, upright bass warm, sheet lightning in the wallpaper',
      'Candlelit cumulus. Applause at Table #t# has caused a brief shower over the valley below',
      'Barometric pressure falling in B-flat. Brushwork mist drifting past the bandstand',
      'Soft thunder in the cloakroom; dry and smoky by the piano',
    ],
    t: num(1, 12),
  },
  'lower-hollow': {
    local: [
      'Mild round the rim. A warm updraught from the Hole smells faintly of 1974',
      'Overcast on Rim Lane. Something pale floated up past the post office; clearing by four',
      'Light breeze across the bunting. Hole depth: unchanged. Visibility into it: inadvisable',
      'Dry for the bake sale. Councillor Dibbs reports the Hole barometer is "within policy"',
    ],
  },
  'bubble-economy': {
    ...ONLY_LOCAL,
    local: [
      'Marina City Nine: 24° and Friday night, 1986. Bay breeze glossy; 0% chance of Monday',
      'Warm neon reflection off the harbour. Pin amnesty in effect near the waterfront bubble',
      'Clear skies over the elevated highway. Convertible-top index: down all weekend',
      'Balmy 1986 evening. High pressure held steady by the Marina Index',
    ],
  },
  'tomorrows-leftovers': {
    ...ONLY_LOCAL,
    local: [
      'Test kitchen pre-heated to 190°. Steam rising from next Thursday’s soup',
      'Light flurry of crumbs before the bread is baked. Oven timer counting up nicely',
      'Warm front moving in from the larder; aromas arriving four days ahead of their dishes',
      'Broth-humid, 26°. Pip advises carrying a dry tea towel into next week',
    ],
  },
  'cat-fm': {
    local: [
      'Sunbeam creeping across the studio carpet at #cm# cm per hour. Gloria is in it',
      'Warm on the windowsill, breezy by the cracked door. High risk of falling mugs',
      'Studio temperature: purring. Mixing desk faders warm to the paw',
      'Clear view of the bird feeder outside. Chattering gusts expected around three',
    ],
    cm: num(2, 9),
  },
  'piano-empty-rooms': {
    ...ONLY_LOCAL,
    local: [
      'Unvisited wing: 14°, still. Dust motes holding in a long slant of moonlight',
      'Cool bare floorboards. A faint breeze through the east-wing door, open one inch',
      'Silent under the dust sheets. Morning light advancing two boards per hour',
      'Dry, resonant, undisturbed. No footsteps forecast before dawn',
    ],
  },
  'unsolved-dimensions': {
    local: [
      'Rain slanting through the Venetian blinds. Coffee cold; suspicion thick',
      'Noir drizzle in the basement archive. The goose’s alibi remains overcast',
      'Damp pavement outside, lamp-lit fog inside. Case #c# barometer: inconclusive',
      'Chilly in the evidence room. A cold thread of air from an open file refuses to settle',
    ],
    c: num(104, 899),
  },
  'breakbeat-observatory': {
    ...ONLY_LOCAL,
    local: [
      'Mount Subwoofer dome open: clear skies, 174 BPM pressure waves rattling the stars',
      'High-altitude chill outside; sub-bass warmth inside. Minor stellar drift in Sector #s#',
      'Crisp mountain air. Low-end front moving out at the speed of light',
      'Zero cloud cover over the cone. Seismic bass warnings in effect for nearby moons',
    ],
    s: num(2, 19),
  },
  'other-horoscopes': {
    ...ONLY_LOCAL,
    local: [
      'Back room of the planetarium: beeswax-warm. The Teapot is rising; Mercury is sulking',
      'Crystal ball visibility: 90% static, clearing for listeners born under The Single Sock',
      'Artificial night sky clear. A light breeze from the constellation of The Lamp Left On',
      'Velvet-dark and soothing. Planetary alignment: slightly to the left of yesterday',
    ],
  },
  'drowned-shanty-hour': {
    ...ONLY_LOCAL,
    local: [
      'Below the waterline on the Damp Regret: green phosphorescent swell, bilge ankle-deep',
      'Sea area Dismay and Lower Dismay: soggy force #f#, lanterns swinging, ship still "fine"',
      'Submerged fog with heavy brine. Dry socks last recorded in 1840',
      'Briny and rhythmic. Swell of four fathoms over the main deck; accordion holding dry',
    ],
    f: num(4, 9),
  },
  'waystation-9': {
    local: [
      'Sodium-lamp fog at the crossroads. Upward road clear; sideways road greasy with Tuesday',
      'Diesel haze and diner steam. Grandma Diesel is hauling a cold front north on Route −#r#',
      'Crosswind at the weighbridge, #deg#°. Moths thick around the neon sign',
      'Dry on the down-ramp, raining upward on the overpass. Keep your CB on channel 9',
    ],
    r: num(2, 14),
  },
  'wall-of-fog': {
    ...ONLY_LOCAL,
    local: [
      'Visibility: #cm# cm. Reverb tail: infinite. Pink-blue pedal glow on the floorboards',
      'Thick shoegaze fog. A warm front from the 1991 soundcheck is echoing back through',
      'Dense, dreamy, loud-quiet. The stage lamp is visible; the band is mostly a rumour',
      'Haze holding at 100%. Grandma Diesel’s fresh delivery of fog has settled in nicely',
    ],
    cm: num(12, 95),
  },
  'win-this-planet': {
    ...ONLY_LOCAL,
    local: [
      'Studio Infinity: 28° under the quiz spotlights, with scattered bursts of studio confetti',
      'Dry-ice mist around the prize wheel. Doreen reports the front row is "a bit breezy"',
      'Bright chaser lights and high tension. Consolation-toaster heat rising backstage',
      'Air conditioning losing to the scoreboard. Chance of winning the planet: 0%',
    ],
  },
  'yesterday-fm': {
    ...ONLY_LOCAL,
    local: [
      'Yesterday’s weather: already happened, and stayed mild. Late-afternoon sun holding at 4 PM',
      'Mild 1970s living-room warmth. Yesterday’s rain is finished; the pavement is dry now',
      'Golden hour, twenty-four hours ago. Tea temperature: comfortably room-level',
      'Barometer running gently backwards. Zero surprises forecast for the rest of yesterday',
    ],
  },
  'event-horizon-surf': {
    ...ONLY_LOCAL,
    local: [
      'Accretion-ring glare, four sunsets wide. Gravitational swell: #y# years, offshore',
      'Tide went out in 1959; still out. Heavy time dilation near the lifeguard tower',
      'Hot sand, bent starlight, UV index: relativistic. Leashes mandatory',
      'Sunny on the shoreline, infinite at the break. Bonnie has raised the NO RETURNS flag',
    ],
    y: num(120, 900),
  },
  'bedtime-for-giants': {
    ...ONLY_LOCAL,
    local: [
      'Valley-sized bedroom: cool mist around the bedposts, warm under the patchwork quilt',
      'Gentle twelve-minute gale as Bartholomew exhales; calm on the inhale',
      'Low cloud over the footboard in the next county. Bedside lighthouse beam steady',
      'Drowsy and vast. Quilt elevation rising #m# metres, settling for a fortnight nap',
    ],
    m: num(40, 200),
  },
  'gristwick-parish': {
    local: [
      'Village green: eternal fête sunshine, 19°, with a fifty-yard shadow from the prize marrow',
      'Fair over the tombola tent. Brief shower of applause drifted down from a storm cloud',
      'Bunting-breeze light and parochial. Tea-urn steam steady since 1726',
      'Mild in Gristwick-under-Gristwick. Brass band brass glinting; evensong dew by six',
    ],
  },
  'tiny-hour': {
    ...ONLY_LOCAL,
    local: [
      'Inside the matchbox: warm 22° under the thimble lamp. Gust warning by the skirting board',
      'Dry and crumb-free. High-wind alert if the big people walk past before tea',
      'Warm felt-board microclimate. A single dewdrop on the windowsill is enough for everyone',
      'Calm under the sofa fringe. Vacuum-cleaner front has passed to the hallway',
    ],
  },
  'infinite-song': {
    ...ONLY_LOCAL,
    local: [
      'On stage: candle-wax fug, 23°, with a light breeze through the beards by the stage door',
      'Steady indoor climate since the dawn of time. Verse #v# brings a slight change of key',
      'Warm rosin dust in the footlights. Chorus pressure building, though still unconfirmed',
      'Air thick with four million verses. Stage door propped open with an old tambourine',
    ],
    v: (rng) => `4,00${rng.int(0, 9)},${String(rng.int(100, 999))}`,
  },
  'plant-fm': {
    ...ONLY_LOCAL,
    local: [
      'Greenhouse windowsill: 68% humidity, full-spectrum sunbeam on the top shelf',
      'Warm terracotta, gentle misting expected at half past three. Leaf turgor: optimal',
      'South-facing glass clear and bright. The orchid has the light; the fern is patient',
      'Night respiration cycle: cool, damp, 18°. Good conditions for unfurling a frond',
    ],
  },
  'hush-after-hours': {
    ...ONLY_LOCAL,
    local: [
      'R/S Nightjar aft cabin: hull 20.4°C, lights dimmed 8%, faint scent of oranges',
      'Life support nominal. Air recycler humming in E-flat; Moth One settled on the viewport',
      'Deep-band vacuum outside; one warm blanket deployed inside. Operator respiration steady',
      'Cabin pressure 101.3 kPa, blanket-warm. Console plant leaning three degrees toward the speaker',
    ],
  },
  'last-lighthouse': {
    ...ONLY_LOCAL,
    local: [
      'Lesser Marrow, Tuesday Reach: wind variable force 4, becoming kind. Visibility: as far as the beam',
      'Velvet Deep and Biscuit Shoals: lace fog clearing to stars below the surface',
      'Gannet’s Regret, Candlemouth: southerly force 3, showers of moths, sea state shy',
      'Inshore waters round the rock: dark swell, lamp room warm, one gull sheltering on the sill',
    ],
  },
  'transmission-zero': {
    ...ONLY_LOCAL,
    local: [
      'Outside the cave: first rain, loud on leaves. Inside: dry stone, firelight, warm fur',
      'Ozone from the lightning-struck tree. Smoke rising straight; sky very big tonight',
      'Cold dark before words; warm embers by the horn microphone. The rock outside is loud with rain',
      'Damp moss, sparking flint, cave-wall echo clear. Do not eat the purple berries',
    ],
  },
  'saturday-night-forever': {
    ...ONLY_LOCAL,
    local: [
      'Starlite Rollerdrome: 23° under the mirror ball, counter-clockwise breeze in the fast lane',
      'Glitter-ball flecks across the maple floor. Hairspray humidity: 1977 levels, holding',
      'Warm by the DJ booth, cool by the fire doors. Chance of Sunday morning: 0%',
      'Hour #h# forecast: satin-smooth, eight-wheeled, no clock hands in sight',
    ],
    h: (rng) => `3,40${rng.int(1, 9)},${String(rng.int(100, 999))}`,
  },
  'free-frequency': {
    ...ONLY_LOCAL,
    local: [
      'Attic studio: transmitter valves at 62°, egg-box insulation holding, roof three streets out of true',
      'Low cloud cover hiding the aerial from detector vans. Red-string humidity: high',
      'Wind through the rafters; open sightline to the Nightjar’s running lights at bearing #b#°',
      'Static flurries on the Outer Band. Tomorrow’s forecast will be broadcast in code',
    ],
    b: num(108, 179),
  },
  'orbit-roots': {
    ...ONLY_LOCAL,
    local: [
      'Meridian Farm Moon: warm mist on the off-beat, ring-ice melt steady from Oldwater overhead',
      'Greenhouse Ring #g#: 25°, low-gravity dew rising off the runner beans, pump pressure good',
      'Bright ringlight through the glasshouse roof. Pumpkins floating at shoulder height',
      'Soil damp and grateful. Brother Amos reports clean water on the main irrigation line',
    ],
    g: num(1, 40),
  },
  'small-claims': {
    local: [
      'Courtroom Four: rain tapping the tall windows, dry judicial air at the bench',
      'Localised drizzle over the defence table where a cloud is giving evidence; tissues provided',
      'Cool in the public gallery, 18°. Green-ink drying time: four minutes',
      'Barometer under injunction until Tuesday v. Wednesday is settled. Costs shared',
    ],
  },
  'substation-null': {
    ...ONLY_LOCAL,
    local: [
      'Freighter Diligence, Deck #d#: core dormant at 312 K. Manifold pressure holding the downbeat',
      'Reactor hall: blue Cerenkov haze, steam venting from Valve C-17 on the downbeat',
      'Hull exterior: absolute zero. Dancefloor: 24°C, 134 BPM, hazard strobes dry',
      'Condensation on the catwalk railings. Pressure vessel stable; glow stick operational',
    ],
    d: num(2, 9),
  },
  'tiki-satellite': {
    ...ONLY_LOCAL,
    local: [
      'Lagoon Deck, Orbital Station Seven: 25° trade winds (recirculated), sunrise #s# of 16 today',
      'Zero-gravity cocktail mist near the bamboo bar. Earthrise clear through the main porthole',
      'Centrifugal breeze steady at 0.8 G. Puffer-fish lamps glowing; relief crew expected shortly',
      'Stratospheric perfection, 1958 standard. Not a cloud within two hundred miles down',
    ],
    s: num(1, 16),
  },
  'the-long-dark': {
    ...ONLY_LOCAL,
    local: [
      'Penumbra Station, Ring Four: starless outside, warm glass-furnace glow from the Lamp Room',
      'Studio B: foley thunder sheet rumbling, ribbon mics warm, corridor bulbs flickering',
      'Zero Kelvin in the Long Dark beyond the hull; 19° and dimly lit in the Lumen Bar',
      'One dark hour scheduled at midnight under the Lumen Bar treaty. Keep a lamp handy',
    ],
  },
  'island-time': {
    ...ONLY_LOCAL,
    local: [
      'Tide Hill: warm breeze, the quick sun setting now, the slow sun thinking about it till nine',
      '27° and half past something. All three tide markers on the beach disagree; water is lovely',
      'Lazy trade winds through the open observatory dome. No rain expected until after 1983',
      'Sunny on the jetty, shady by the hammock. Next weather update: whenever it gets here',
    ],
  },
  'traffic-on-the-8s': {
    ...ONLY_LOCAL,
    local: [
      'Great Wormhole Interchange: exhaust aurora across all six lanes, visibility zero-to-stationary',
      'Temporal headwind on the Thursday Flyover; contraflow fog backing up to the Big Bang',
      'Clear at four miles up in Captain Buzz’s pod; solid brake-light glare on the Bypass below',
      'Hennick Wormhole: barometric shear at the event lip, delays of #y# centuries and holding',
    ],
    y: num(2, 14),
  },
  'atomic-bachelor-pad': {
    ...ONLY_LOCAL,
    local: [
      'Lot 12, Futureville: 22° in the sunken lounge, warm vacuum-tube glow from the left channel',
      'Crisp desert night past the picture window; rocket exhaust clearing on the eastern horizon',
      'Hi-fi console running at optimal warmth. Slight breeze from the theremin in the hallway',
      'Acoustic pressure balanced to within half a decibel at the chalk mark on the carpet',
    ],
  },
  'velvet-collapse': {
    ...ONLY_LOCAL,
    local: [
      'Casino Ultima: deep crimson glare from Old Ruby, warming toward the 04:00 supernova flash',
      'Velvet Lounge: 24° and slinky now; 4,000° briefly at four sharp; fresh croissants by six',
      'Solar-flare gusts against the observation glass. Sunglasses advised at the roulette table',
      'Post-collapse afterglow: soft rose stardust settling on the roof, star reassembling nicely',
    ],
  },
  'heat-death-afterparty': {
    ...ONLY_LOCAL,
    local: [
      'Two degrees above absolute zero outside; warm enough under the last 60-watt bulb over the decks',
      'Stars going out to the north. Lorraine the nebula is glowing soft pink across forty light years',
      'No wind, no morning, mild ambient warmth on the dancefloor. Beat cooling by #b# BPM an hour',
      'Final thermodynamic outlook: quiet, dark, and surprisingly warm by the speaker stack',
    ],
    b: num(2, 5),
  },
  'the-switchboard': {
    ...ONLY_LOCAL,
    local: [
      'Central Exchange: 20°, dry 1946 air, faint ozone from ten thousand brass plugs and cloth cords',
      'Trunk lines clear on the early board; slight static cross-talk between Universe 4 and the past',
      'Warm switchboard lamps in the dark. Line pressure peaking as everyone rings home after eleven',
      'Indoor exchange climate: crisp, discreet, unchanged since 1946. Please hold the line',
    ],
  },
  'minute-between': {
    ...ONLY_LOCAL,
    local: [
      'At 03:33:#s#: air completely still, dust motes suspended mid-beam, falling glass holding steady',
      'Zero wind between ticks. Moonlight paused on the floorboards; second hand caught halfway',
      'Temperature held at 16.000° for all thirteen minutes of the same minute. Nothing is cooling',
      'Barometer frozen between 3:33 and 3:34. Whatever weather is outside will keep until 3:34',
    ],
    s: (rng) => String(rng.int(1, 58)).padStart(2, '0'),
  },
  'the-harbour': {
    ...ONLY_LOCAL,
    local: [
      'Berth Seven: calm water of light, zero wind, oranges on the sill of the Harbourmaster’s window',
      'Fair and quiet across the basin. Old relay hulls ticking softly as their engines cool',
      'Light airs along the North Pier, smelling faintly of oranges and warm valve oil',
      'Slack water till morning tide. Riding lights steady on every pier; no heading required',
    ],
  },
  'something-listening': {
    ...ONLY_LOCAL,
    local: [
      'Between the stations: soft white-noise drift, warm carrier wave, 100% chance of being heard',
      'Quiet static hiss from 76.0 to 144.4 MHz. An old weather report from 1962 is still dry in here',
      'Signal-floor microclimate: dark, gentle, leaning closer when you sit still for three minutes',
      'No rain, only the sound of rain kept safe from a station that signed off years ago',
    ],
  },
};

export const LOCAL_WEATHER: Readonly<Record<string, Grammar>> = LOCAL;

export function hasLocalWeather(stationId: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCAL, stationId);
}

/** Extra local forecasts so a station with a short list does not repeat one line. */
const WEATHER_EXTRA: Readonly<Record<string, readonly string[]>> = {
  'every-news': [
    'Kim Harrowgate reporting live from the weather. She is standing in it',
    'Clocks disagree. The forecast does not. It is eleven',
  ],
  'neon-2087': ['Wireframe heat shimmer. The horizon is still a rumour'],
  classifieds: ['Overcast, base model. Sun sold separately', 'Wind included free with any used planet'],
  'snail-jams': ['Moss conditions: plush. Traffic on the leaf: one'],
  'dimension-hop': ['Jace’s side: a breeze. Mara’s side: the breeze, earlier', 'Coffee weather: upright here, inverted there'],
  'pixel-afterlife': ['Insert coin for better weather. Continues: unlimited', 'Boss-cloud on the horizon, sixteen colours, very slow'],
  'ask-grenda': ['Window rain, studio warm. A good night to tell the truth', 'Low cloud over Exit 4. The lava lamp forecasts glow'],
  'impossible-sports': ['Floodlights, no clouds, one polite sun acting as the ball', 'High in the stands. Bring sunglasses and no rulebook'],
  'baroque-bots': ['Candle smoke, still. Interval weather: oil and crumbs'],
  'comet-marimba': ['Palm-tree weather at comet speed. The crab approves'],
  'channel-surf': [
    'Channel #ch#: indoor sun. The next channel: a hallway storm',
    'The remote has changed the forecast again',
    'Shopping-channel weather: bright, cheerful, slightly cursed',
    'Sports-channel weather: the sun is arguing with the referee',
  ],
  'mirror-polka': ['Left-handed clouds. Right-handed sun. Neither is sorry', 'Polka-pressure rising. The tuba is a weather system'],
  'wild-multiverse': ['Something large just blocked the sunset. It had knees', 'Crew weather: anxious. Grass weather: golden'],
  'lower-hollow': ['Bunting dry, Hole humid. Maureen calls that a balanced day'],
  'smoke-ring-trio': ['Cloud-club forecast: applause, then a private shower, then a solo'],
  'bubble-economy': ['Cassette weather: warm, glossy, no Monday in the liner notes'],
  'tomorrows-leftovers': ['Friday’s rain arrived on Wednesday. Pip has the towels'],
  'cat-fm': ['Gloria has declared the sunbeam a station asset. Dennis agrees'],
  'piano-empty-rooms': ['The long gallery will stay at moonlight until someone visits'],
  'unsolved-dimensions': ['Suspect: the fog. Motive: atmosphere. Coffee: still cold'],
  'breakbeat-observatory': ['Dome-open night. The stars are keeping 174 and not complaining'],
  'other-horoscopes': ['The Teapot is humid. The Single Sock remains dry. Classic pairing'],
  'drowned-shanty-hour': ['Sea area Regret: glowing, rhythmic, accordion surprisingly dry'],
  'waystation-9': ['Diner weather: coffee steam, moths, and a cold front in the trailer'],
  'wall-of-fog': ['Fog with a backbeat. Visibility: the pedal at your feet'],
  'win-this-planet': ['Spotlight weather, 30°. The planet on the wheel is partly cloudy'],
  'yesterday-fm': ['Tomorrow is not on the schedule. Yesterday’s light is staying another hour'],
  'event-horizon-surf': ['Lifeguard-tower lean: increasing. Sunscreen: relativistic'],
  'bedtime-for-giants': ['Story weather: one lamp, one mist, no reason to stay awake'],
  'gristwick-parish': ['Maypole breeze light. The marrow casts a parish of its own'],
  'tiny-hour': ['Pencil-log wind: calm. Button-table forecast: stable'],
  'infinite-song': ['Verse weather: unchanged since the candle was new'],
  'plant-fm': ['The fern has the shade, the cactus has the chorus, both have light'],
  'hush-after-hours': ['Viewport stars slow. Cabin blanket deployed. Moth One on watch'],
  'last-lighthouse': ['One gull, one beam, wind backing. The forecast will be read anyway'],
  'transmission-zero': ['First weather: sky big, fire small, berries still a bad idea'],
  'saturday-night-forever': ['No Sunday front expected. Glitter humidity holding over the maple'],
  'free-frequency': ['Attic bulb weather: hot. Aerial weather: hiding. Kate weather: busy'],
  'orbit-roots': ['Bass from the porch shack mixing with mist off the bean rows'],
  'small-claims': ['The cloud on the stand has agreed to stop raining on the clerk'],
  'substation-null': ['Diligence Safety Voice: catwalk rails cool, strobes dry, pressure in band'],
  'tiki-satellite': ['Porthole weather: earthrise, bamboo breeze, pineapple advisory'],
  'the-long-dark': ['Ring Four bulbs undecided. Lumen Bar: dim, warm, and open'],
  'island-time': ['The quick sun has gone. The slow sun has opinions. Tide: arguing'],
  'traffic-on-the-8s': ['On the eights: stationary glare, temporal headwind, cake still next year'],
  'atomic-bachelor-pad': ['Starburst-clock weather: cocktail hour. Desert beyond the glass: crisp'],
  'velvet-collapse': ['Old Ruby brighter than at dinner. Sunglasses remain a dress code'],
  'heat-death-afterparty': ['One bulb, three dancers, a nebula leaning pink. Jacket optional'],
  'the-switchboard': ['Exchange night: dry, lamp-warm, every cord slightly humming'],
  'minute-between': ['Still 03:33. The falling glass is not a forecast. It is a pause'],
  'the-harbour': ['Basin lights on. Hulls cooling. Oranges on the pier. No departure weather'],
  'something-listening': ['Static weather: soft, curious, slightly closer than last minute'],
};

/** Local weather in the station's dimension. Every station forecasts only in its own voice. */
export function dimensionWeather(station: StationDef, seed: number): string {
  const local = LOCAL[station.id];
  const localLines = [...((local?.local as readonly string[] | undefined) ?? []), ...(WEATHER_EXTRA[station.id] ?? [])];
  const grammar = merge(
    weatherGrammar,
    local ?? {},
    localLines.length > 0 ? { local: localLines, ...ONLY_LOCAL } : { local: ['#generic#'] },
  );
  const base = hashSeed(station.id, 'weather', seed);
  return expandUntil(grammar, (a) => rngFor(base, a), '#forecast#', (s) => s.length <= LIMITS.weather, 'Mild, all things considered');
}
