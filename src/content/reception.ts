// Funny reception status lines: "73% — a moth has landed on the antenna".

import type { StationDef } from '../broadcast/types';
import { expandUntil, merge, num, type Grammar } from './grammar';
import { LIMITS } from './limits';
import { hashSeed, rngFor } from './rng';

const receptionGrammar: Grammar = {
  // Excuses for a weak signal.
  low: [
    'a moth has landed on the antenna',
    'an owl with opinions is using the antenna as a perch',
    'someone in Dimension 6 is vacuuming',
    'the signal is passing through a very large duvet',
    'a cloud is sitting directly on the transmitter',
    'a neighbouring reality is microwaving soup',
    'a ghost is leaning on the dial',
    'the signal stopped for a snack',
    'three dimensions share this frequency and are being polite about it',
    'the moon is in the way, and knows it',
    'the transmitter is on hold with the Bureau',
    'the signal is coming in sideways',
    'a goose is sitting on the relay. It says you know why',
    'someone upstairs in reality is moving furniture',
    'a passing comet is borrowing the bandwidth',
    'the signal is mostly here. The rest is on its way',
    'your radio is dreaming',
    'Greg is standing in front of the dish again',
    'Teodor at Relay Four is asking if anyone can hear him, on our frequency',
    'the antenna has been bent into a heart shape by an admirer',
    'a whale is singing on this frequency, and it was here first',
    'the signal took the scenic route',
    'a #critter# is #critterDoing# the antenna',
    'a #critter# is #critterDoing# the antenna',
    'the signal is passing through #medium#',
    'the signal is passing through #medium#',
    '#weatherEvent# over the relay',
  ],
  // Reasons the signal is suspiciously good.
  high: [
    'clear as a bell. The bell is slightly cracked',
    'perfect, suspiciously',
    'you are standing in exactly the right spot. Do not move',
    'spotless. Worryingly spotless',
    'the antenna has been complimented and is showing off',
    'a cat is sitting on the warm part of the receiver, helping',
    'the static has stepped out for a minute',
    'excellent. Someone in another dimension is holding the antenna up for you',
    'crisp. The relay has been dusted for the first time since the Bronze Age',
    'strong. The fox at the mast is keeping an eye on it',
    'superb. Every dimension has gone quiet to let you listen',
    'flawless, apart from the occasional distant cheer',
    'outstanding. The antenna has been given a little scarf',
    'very good. The relay had a nap and feels much better',
    'strong. Someone has finally stopped standing in front of it',
  ],
  mid: [
    'solar wind, light breeze, nothing personal',
    'the static is trying its best',
    'decent, but the aerial is sulking',
    'the aerial is up. The sky is wobbly',
    'good, apart from a faint smell of toast',
    'steady. A small hum has moved in and is paying rent',
    'acceptable. The satellite is distracted',
    'decent. Some of this signal is from next Tuesday',
    'holding. Somebody keeps saying "testing" in a parallel booth',
    'mostly here. A few words are stuck in a hedge',
    'a #critter# is #critterDoing# the antenna, gently',
    'fair. The signal is wearing odd socks',
    'reasonable. A cloud is thinking about moving',
    'adequate, by human standards',
    'okay. The dial is a little homesick',
    'not bad. A neighbouring station is humming along',
    'stable. Mostly. Do not look directly at it',
    'pretty good. Some echo, courtesy of the moon',
  ],
  critter: ['moth', 'pigeon', 'snail', 'crow', 'small bat', 'beetle in a tiny hat', 'squirrel', 'frog', 'very old wasp', 'ladybird'],
  critterDoing: ['sitting on', 'napping on', 'chewing', 'decorating', 'proposing to', 'climbing', 'judging', 'reading near', 'building a nest in'],
  medium: [
    'a very old tree',
    'four kilometres of fog',
    'a wedding in the next reality',
    "somebody's dream",
    'a cupboard full of tinsel',
    'a brass band rehearsal',
    'the inside of a cloud',
    'a library, quietly',
    'a lot of geese',
    'next week, briefly',
  ],
  weatherEvent: ['scattered Tuesdays', 'a light drizzle of déjà vu', 'heavy fog of forgetting', 'a sudden calm', 'gusts of nostalgia', 'a stray aurora'],
};

/** Station-local reception telemetry (rule `local`), keyed by station id. */
export const LOCAL: Readonly<Record<string, Grammar>> = {
  'static-lullabies': {
    local: [
      'the three-eyed cat on the CRT is grounding the aerial with her tail',
      'carrier wave tucked in under a warm layer of television snow',
      'nightlight hum locked at 60 Hz; the static is being very polite',
    ],
  },
  'void-beats': {
    local: [
      'a slow planet drifted across the Room 0 window and attenuated the bass',
      'the void borrowed 3 dB of gain and will not be returning it',
      'desk-lamp ballast humming in key with DJ Eventually’s turntable',
    ],
  },
  'every-news': {
    local: [
      'seven overlapping timelines are filing copy on the same carrier',
      'Skip Daley’s scattered Tuesdays are refracting off the newsroom dish',
      'Kim Harrowgate is holding the relay cable in a localized downpour',
    ],
  },
  'rainfall-fm': {
    local: [
      'four thousand years of Precinct 9 rain acting as a liquid dipole',
      'water in the coaxial feedline; Drizzle says it warms the midrange',
      'a floating umbrella brushed the mast on Lantern Street',
    ],
  },
  'neon-2087': {
    local: [
      'scanline shimmer over the wireframe grid; chrome reflection nominal',
      'palm tree elbow #n# is bouncing the FM carrier down the highway',
      'Velocity Jones turned the transmitter up to "rad"',
    ],
    n: num(2, 19),
  },
  classifieds: {
    local: [
      'Rex Bellows sold half our bandwidth to a guy with a used moon',
      'signal subject to small print read at 300 words per minute by Linda',
      'corkboard pushpin acting as a makeshift loading coil',
    ],
  },
  'end-lounge': {
    local: [
      'background radiation from the dying universe adding a warm tube glow',
      'the octopus bartender is polishing the transmitter valves with eight cloths',
      'eleven billion years of line loss, compensated by velvet curtains',
    ],
  },
  'snail-jams': {
    local: [
      'a snail in tiny headphones is inching up the dipole at #n# cm per hour',
      'heavy dew on the moss is slowing the carrier wave to 62 BPM',
      'the signal is taking the long way round a single leaf',
    ],
    n: num(1, 4),
  },
  'dimension-hop': {
    local: [
      'right channel arriving four seconds early from Mara’s side of the rift',
      'upside-down coffee in Booth B is dripping onto the patch bay',
      'garage-to-garage rift impedance holding steady at 50 ohms',
    ],
  },
  'crystal-delta': {
    local: [
      'carrier wave refracted through #n# chandeliers at Point Seven',
      'prismatic multipath: every modulation peak arrives with a twin',
      'a tiny miner hung his lantern on the feedhorn for tea break',
    ],
    n: num(7, 44),
  },
  'hold-music': {
    local: [
      'your signal is #n#th in the queue on Floor −4; please hold',
      'fluorescent ballast on Floor −4 providing a steady beige carrier',
      'the waiting-room rubber plant has grown around the coaxial riser',
    ],
    n: num(400, 9999),
  },
  'pixel-afterlife': {
    local: [
      '8-bit square-wave harmonic leaking from cabinet #n#',
      'a blinking ghost is eating the dots along the antenna lead',
      'RF modulator switched to Channel 3; blow on the cartridge if noisy',
    ],
    n: num(1, 32),
  },
  'ask-grenda': {
    local: [
      'heavy haulage exiting Hyperspace Exit 4 above the Studio B roof',
      'switchboard caller lamps drawing extra current on line #n#',
      'the creature inside Grenda’s lava lamp is leaning toward the mic',
    ],
    n: num(1, 9),
  },
  'moon-dub': {
    local: [
      'earth-moon-earth bounce returning with an 11.0-second dub delay',
      'lunar dust levitating in low-G arcs around the Tranquility bass bins',
      'sub-bass coupled directly to the regolith; earthrise sitting in the sidechain',
    ],
  },
  whalesong: {
    local: [
      'a translucent whale in Lane 12 is harmonising with the pilot tone',
      'nebula ionization softening the high frequencies across three parsecs',
      'Captain Hum turned the transmitter down so as not to startle the calf',
    ],
  },
  'impossible-sports': {
    local: [
      'solar flare from the ball (a small polite sun) saturating the limiter',
      'Coliseum Zero floodlights buzzing in seven-four time at upper altitude',
      'scoreboard changed its mind mid-packet and dropped 4 dB',
    ],
  },
  'baroque-bots': {
    local: [
      'powdered wig static discharging across Maestro Unit Seven’s baton spoon',
      'clockwork mainspring winding noise audible on the 19 kHz stereo pilot',
      'the oil portrait of a toaster is reflecting the studio link beam',
    ],
  },
  'comet-marimba': {
    local: [
      'Doppler shift at 70 km/s compensated by the crab on the decks',
      'ionized ice-tail plasma acting as a five-million-mile trailing wire',
      'hammock rope fouled on the directional yagi; nobody is getting up',
    ],
  },
  'channel-surf': {
    local: [
      'infrared bursts from the floating remote cross-modulating the IF stage',
      'sixteen CRT flyback transformers singing in slightly different keys',
      'somebody sat on the remote and engaged picture-in-picture on the audio',
    ],
  },
  'mirror-polka': {
    local: [
      'sidebands inverted: upper sideband is on the left, lower on the right',
      'phase cancellation from Ynnhoj agreeing 0.5 seconds behind the carrier',
      'left-handed accordion bellows inducing a reverse Faraday rotation',
    ],
  },
  'wild-multiverse': {
    local: [
      'the mostly-neck giraffe is grazing on the top element of the mast',
      'a deer made of coiled springs just bounced through the microwave link',
      'field microphone muffled by tall golden grass and hushed reverence',
    ],
  },
  'numbers-omega': {
    local: [
      'red mast light blinking at 0.#n# Hz in thick coordinates-withheld fog',
      'the fox at the base of the tower is sitting on the earth strap',
      'carrier modulated by #n# unaccounted geese in the radiation pattern',
    ],
    n: num(4, 7),
  },
  'smoke-ring-trio': {
    local: [
      'sheet lightning inside the Cumulus Room walls adding warm crackle',
      'Florian the waiter is tiptoeing past the dipole with a tray of martinis',
      'cumulonimbus moisture condensing on the upright bass pickup',
    ],
  },
  'lower-hollow': {
    local: [
      'gravitational lensing round the rim of the Hole bending the groundwave',
      'Biscuit the spaniel is barking at an echo coming up from the Hole',
      'Hole Committee policy prohibits measuring signal reflections below rim level',
    ],
  },
  'bubble-economy': {
    local: [
      '1986 chrome-tape bias locked in; Marina Index boosting the carrier',
      'signal bouncing off the inside of the Marina City waterfront bubble',
      'convertible ignition noise from the elevated bay highway (very glossy)',
    ],
  },
  'tomorrows-leftovers': {
    local: [
      'pre-echo from next Thursday’s broadcast arriving four days ahead of carrier',
      'steam from a pot of "SOUP, LATER" misting the test-kitchen transmitter',
      'Pip accidentally stirred the antenna tuner with the wrong spoon',
    ],
  },
  'cat-fm': {
    local: [
      'Station Manager Gloria is asleep on the compressor-limiter knob',
      'rhythmic 28 Hz purr overmodulating the left channel',
      'Dennis is afraid to adjust the aerial in case he wakes the cat',
    ],
  },
  'piano-empty-rooms': {
    local: [
      'long natural decay from twenty-two unvisited rooms in the east wing',
      'dust sheets over the furniture absorbing all frequencies above 8 kHz',
      'the east-wing door is open one inch, letting the carrier slip into the hall',
    ],
  },
  'unsolved-dimensions': {
    local: [
      'red evidence twine wrapped twice around the basement leaky-feeder cable',
      'rain on the Venetian blinds slicing the signal into noir stripes',
      'the suspect goose is standing on the coaxial junction box and won’t speak',
    ],
  },
  'breakbeat-observatory': {
    local: [
      '174 BPM sub-bass from the dome cone shaking the ionosphere into alignment',
      'Doctor Ferrin’s telemetry dish is locked onto a breakbeat in Sector #n#',
      'minor gravitational wobble from the last bass drop; AFC holding',
    ],
    n: num(2, 12),
  },
  'other-horoscopes': {
    local: [
      'The Teapot is in opposition to our relay dish; Madame Orrery advised patience',
      'crystal ball static coupled inductively to the planetarium copper dome',
      'Mercury is sulking in the third house and refusing to bounce shortwave',
    ],
  },
  'drowned-shanty-hour': {
    local: [
      'transmitting through #n# fathoms of glowing green brine; the ship is singing',
      'barnacles on the whip aerial singing a fifth above the crew',
      'bilge water in the tuning condenser; Old Pettibone is pumping in 6/8 time',
    ],
    n: num(6, 40),
  },
  'waystation-9': {
    local: [
      'skip-shoot bleed from a big rig hauling Tuesday up the sideways road',
      'Grandma Diesel’s linear amplifier rattling the diner coffee cups as she passes',
      'sodium-lamp ballast hum from the crossroads weighbridge',
    ],
  },
  'wall-of-fog': {
    local: [
      'a guitar chord from the 1991 soundcheck is still reverberating in the coax',
      'fourteen daisy-chained reverb pedals between the mic and the mast',
      'the stage lamp is the only thing keeping the carrier in phase',
    ],
  },
  'win-this-planet': {
    local: [
      'prize-wheel chaser lights clicking on every half-rotation of the planet',
      'Grandma Hester pressed her buzzer early and grounded the studio exciter',
      'Doreen’s applause from Row G is the only load on the studio limiter',
    ],
  },
  'yesterday-fm': {
    local: [
      'carrier wave delayed by 86,400 seconds; everything has already happened gently',
      'wood-panelled 1970s receiver warmth; wall clock ticking gently backwards',
      'yesterday’s atmospheric static has already cleared up nicely',
    ],
  },
  'event-horizon-surf': {
    local: [
      'carrier wave lensed four times around the accretion ring before reaching you',
      'extreme gravitational redshift near the leaning lifeguard tower',
      'tide went out in 1959 and took 6 dB of the lower sideband with it',
    ],
  },
  'bedtime-for-giants': {
    local: [
      'signal rises and falls every twelve minutes with Bartholomew’s quilt',
      'bedside lighthouse lamp sweeping the valley once per paragraph',
      'Nanny Bramblewick has engaged the low-pass filter so nobody wakes up',
    ],
  },
  'gristwick-parish': {
    local: [
      'diffraction shadow behind Mr Hebblethwaite’s motor-coach-sized marrow',
      'the tea-tent urn (on since 1726) is sharing a mains socket with the rig',
      'bunting wrapped three hundred times round the maypole acting as a helix',
    ],
  },
  'tiny-hour': {
    local: [
      'transmitting at 0.002 milliwatts from a sewing-needle dipole in the matchbox',
      'brief fade while the big people walked past the skirting board',
      'Dot the ladybird is keeping the paperclip loading coil very neat',
    ],
  },
  'infinite-song': {
    local: [
      'the band’s beards have grown round the antenna mast and damped the sway',
      'continuous carrier locked since the dawn of time (currently Verse #n#)',
      'candle-wax build-up on the stage monitor adding a warm second harmonic',
    ],
    n: num(4_000_100, 4_009_999),
  },
  'plant-fm': {
    local: [
      'every houseplant on the greenhouse sill is leaning toward the dipole',
      'the Cactus is wearing headphones plugged into the monitor jack',
      '68% greenhouse misting humidity giving the carrier a lush green roll-off',
    ],
  },
  'hush-after-hours': {
    local: [
      'internal Nightjar bus: 0.4 metres from aft cabin to console; lights dimmed 8%',
      'HUSH has lowered the gain so as not to wake the operator in the chair',
      'Moth One is resting on the waveguide flange; HUSH will not disturb it',
    ],
  },
  'last-lighthouse': {
    local: [
      'salt spray on the lantern-room insulator; beam sweeping Lesser Marrow clear',
      'ground-wave propagation over Velvet Deep and Tuesday Reach: steady and kind',
      'a gull on the lighthouse sill is sheltering behind the VHF whip',
    ],
  },
  'transmission-zero': {
    local: [
      'spark-gap carrier from a lightning-struck tree and two wet river stones',
      'twelve billion years of free-space path loss; cave-wall echo still crisp',
      'someone in furs is tapping the horn microphone to see if it is on',
    ],
  },
  'saturday-night-forever': {
    local: [
      'mirror-ball facets scattering the 108.4 MHz carrier in counter-clockwise specks',
      'static charge from eight hundred polyurethane roller-skate wheels on maple',
      'locked onto Saturday night, 1977 (Hour #n#); Sunday filters engaged',
    ],
    n: num(3_400_100, 3_419_999),
  },
  'free-frequency': {
    local: [
      'directional yagi aimed out of a moving attic window by protractor',
      'four hundred egg boxes providing 18 dB of acoustic isolation from the street',
      'HUSH is monitoring this frequency and preparing an interference correction',
    ],
  },
  'orbit-roots': {
    local: [
      'ice crystals in Oldwater’s rings bouncing the 109.3 MHz beam across three systems',
      'irrigation pump-house rhythm pulsing on the off-beat down the ground wire',
      'a floating low-G pumpkin brushed against the porch speaker stack',
    ],
  },
  'small-claims': {
    local: [
      'interdimensional docket multiplex: plaintiff in Left, defendant partly in Right',
      'a weeping cloud on the witness stand is causing light drizzle in the coax',
      'Clerk Odell has logged this signal strength in green ink for the record',
    ],
  },
  'substation-null': {
    local: [
      'Freighter Diligence hull acting as a 400-metre parasitic radiator',
      'dormant reactor core Cerenkov hum phase-locked to the 134 BPM kick',
      'catwalk rail humming on the kick; Diligence Safety Voice counting the strobes',
    ],
  },
  'tiki-satellite': {
    local: [
      '0.8 G station rotation sweeping the Lagoon Deck dipole past Earth every 90 s',
      'Miss Vera Voss’s hands-off theremin field is tickling the RF stage',
      '1958 vacuum-tube telemetry transmitter running at 100% optimism',
    ],
  },
  'the-long-dark': {
    local: [
      'ribbon microphone in Studio B picking up Missus Ruddle’s foley thunder sheet',
      'Penumbra Station Ring 4 lights flickering; Lamp furnace keeping the valves warm',
      'Mr. Wren is standing politely near the transmitter and apologising for the hum',
    ],
  },
  'island-time': {
    local: [
      'carrier arriving at half past something; both suns setting on the antenna',
      'three beach tide markers disagree on the ground conductivity; nobody minds',
      'observatory dome open to the trade wind; timepiece drift since 1983: optional',
    ],
  },
  'traffic-on-the-8s': {
    local: [
      'relayed via Captain Buzz Ferraro’s traffic pod, 4 miles above the Interchange',
      'Hawking-radiation hash from six lanes of stationary wormhole tailbacks',
      'doppler flutter from the Thursday Flyover contraflow backing up to the Big Bang',
    ],
  },
  'atomic-bachelor-pad': {
    local: [
      'calibrated for the chalk mark on Lot 12’s rug; bongos hard-panned Left',
      'eleven feet of walnut console warming the twin-lead 300-ohm ribbon cable',
      'slight capacitance drift whenever the theremin moves in the hallway',
    ],
  },
  'velvet-collapse': {
    local: [
      'solar-flare flux from Old Ruby warming the Casino Ultima dish to crimson',
      'roulette wheel in the left channel; supernova limiter armed for 04:00 sharp',
      'fireproofed coaxial feed coated in yesterday morning’s stardust',
    ],
  },
  'heat-death-afterparty': {
    local: [
      'Lorraine (a 40-light-year nebula) is swaying through the Fresnel zone',
      'powered by the last 60-watt bulb at two degrees above absolute zero',
      'carrier tempo cooling by #n# BPM an hour alongside the universe',
    ],
    n: num(2, 5),
  },
  'the-switchboard': {
    local: [
      'patched through Central Exchange via a 1946 brass plug and cloth cord',
      'faint trunk-line cross-talk from three universes ringing home after dark',
      'sequence lock 97.8 → 89.3 → 114.8 verified by the Operator',
    ],
  },
  'minute-between': {
    local: [
      'phase-locked to 03:33:#s#; the second hand is caught halfway on the wall',
      'dust motes suspended in the moonlight beam are keeping the wave still',
      'thirteen minutes of airtime compressed into the gap before 03:34',
    ],
    s: (rng) => String(rng.int(1, 58)).padStart(2, '0'),
  },
  'the-harbour': {
    local: [
      'Berth Seven homing beacon at 140.0 MHz: calm water, light left on for you',
      'old relay ships snoring at the North Pier with their instruments off',
      'warm carrier from the Harbourmaster’s window, smelling faintly of oranges',
    ],
  },
  'something-listening': {
    local: [
      'you sat in pure static for three minutes; the static leaned in to listen back',
      'assembled from kept signals and old weather reports between the stations',
      'carrier floor at 144.4 MHz: gentle, curious, and glad you stayed',
    ],
  },
};

export const LOCAL_RECEPTION: Readonly<Record<string, Grammar>> = LOCAL;

const RECEPTION_BANDS: Readonly<Record<string, { low: readonly string[]; mid: readonly string[]; high: readonly string[] }>> = {
  "static-lullabies": {
    low: ["the nightlight hum is buried under a thick drift of snow", "the cat shifted and the bedroom aerial went thin", "carrier barely there, like a whisper from the cupboard"],
    mid: ["soft television snow, listenable if you lean toward the set", "the static is polite but a little far from the pillow", "nightlight hum present, with a faint wardrobe rustle"],
    high: ["tucked-in carrier, warm and close on the bedroom aerial", "the CRT snow has settled into a solid lock", "full hush: the nightlight and the signal agree"],
  },
  "void-beats": {
    low: ["a slow planet crossed the window and the bass dropped out", "the void borrowed the gain and has not given it back", "desk-lamp ballast sputtering; the beat is mostly hiss"],
    mid: ["lo-fi and listenable, planets drifting past the glass", "the mug is steaming; the signal is a little shy", "Room 0 carrier present, a touch woolly in the low end"],
    high: ["sub-bass locked to the desk lamp, planets keeping time", "the void is studying quietly and the signal is strong", "full coupling through the purple window"],
  },
  "every-news": {
    low: ["seven timelines are talking over the newsroom dish", "Skip's scattered Tuesdays are scattering the carrier", "Kim is standing in a downpour and the cable is soaked"],
    mid: ["copy is getting through, with a little crosstalk at eleven", "the anchor's papers are rustling on the carrier", "usable, though one clock on the wall is early"],
    high: ["newsroom dish locked; every timeline filed in order", "Dale's carrier is unflappable and very strong", "full strength into the newsroom, clocks and all"],
  },
  "rainfall-fm": {
    low: ["four thousand years of rain sitting on the aerial", "the coax is full of Precinct 9 water", "signal dripping, more puddle than programme"],
    mid: ["wet and listenable; Drizzle is still in there", "rain on the dipole, totals coming through", "a damp carrier, warm enough to follow"],
    high: ["the rainfall totals are coming in whole", "Precinct 9 rain lifting the midrange", "full wet signal, lightning far enough away"],
  },
  "neon-2087": {
    low: ["the grid sunset flared and washed the carrier out", "too many wheels between you and the mast", "magenta haze eating the top end of the signal"],
    mid: ["synthwave coming through with a scanline wobble", "usable neon, a little glare on the horizon", "the car still has not arrived, but the signal has"],
    high: ["chrome-bright carrier, full sunset, no dropout", "grid lock: Velocity is loud and very close", "strong signal across the whole wireframe"],
  },
  "classifieds": {
    low: ["a corkboard pin fell out and took the aerial with it", "Rex is shouting over a very thin carrier", "tear-off tabs rustling; most of the words fell off"],
    mid: ["the deal is audible, small print slightly fuzzy", "Linda is fast and the signal is almost keeping up", "usable, with a pushpin wobble on the consonants"],
    high: ["strip-mall mast locked; every flyer is legible", "Rex's close is coming through at full volume", "strong carrier. Even the small print showed up"],
  },
  "end-lounge": {
    low: ["the ending universe outside is muffling the booth", "the octopus paused and the aerial went dim", "last-call carrier, mostly velvet and distance"],
    mid: ["lounge signal listenable, ice still clinking", "a heartbreaker getting through, a little late", "warm booth audio with a faint cosmic hiss"],
    high: ["full velvet lock from the last booth", "the octopus polished the aerial; it shows", "strong and close, a very long last call"],
  },
  "snail-jams": {
    low: ["the snails have not reached the aerial yet", "a single raindrop is sitting on the leaf dipole", "signal moving at leaf speed, mostly dew"],
    mid: ["slow and listenable, dew on the consonants", "Shelley is arriving, unhurried, mostly here", "usable moss-level signal, no need to rush"],
    high: ["the leaf dipole is finally in the sun", "full slow lock; both snails are nodding", "dew-bright carrier, chorus on its way"],
  },
  "dimension-hop": {
    low: ["the rift hiccuped and half the words stayed behind", "Mara's side is early and the carrier is late", "upside-down coffee landed on the shared aerial"],
    mid: ["both booths audible, one of them sideways", "four-second delay, still possible to follow", "usable rift audio, gravity patchy on the right"],
    high: ["rift balanced; Jace and Mara equally loud", "full lock on both realities at once", "the garage aerial is behaving in both directions"],
  },
  "crystal-delta": {
    low: ["a prism beam missed the aerial and dazzled the dial", "the miner's lantern is brighter than the carrier", "signal split into too many thin copies"],
    mid: ["glass beats coming through, a little tinkly", "one sentence arriving, its twin just behind", "usable sparkle, with a soft chandelier rattle"],
    high: ["full prism lock, both versions of the sentence", "cavern aerial singing in eight colours", "bold refraction, miner unbothered"],
  },
  "hold-music": {
    low: ["your signal is waiting behind another signal", "Floor minus 4 hum is louder than Pam", "the number ticket buzzed and the carrier sat down"],
    mid: ["hold music present, beige, almost enough", "Pam is audible between the courtesy phrases", "usable waiting-room signal, plant still growing"],
    high: ["the carrier jumped the queue, politely", "full beige lock, Pam unusually close", "the handless clock and the signal finally agree"],
  },
  "pixel-afterlife": {
    low: ["the continue screen ate three bars of signal", "a ghost sighed on the cabinet and the aerial blinked", "8-bit carrier, mostly missing sprites"],
    mid: ["chiptune coming through with a sprite flicker", "Player Two audible, Player One still absent", "usable arcade hiss, coin slot ticking"],
    high: ["full 8-bit lock, high-score table lit", "cabinet aerial peaked; the ghosts are dancing", "strong continue signal, lead line intact"],
  },
  "ask-grenda": {
    low: ["rain on the booth window is louder than the caller", "a switchboard lamp died and took a syllable", "the lava lamp gurgled over a thin carrier"],
    mid: ["Grenda is audible through the rain on the glass", "advice getting through, a little husky", "usable booth signal, ON AIR sign humming"],
    high: ["booth aerial warm, Grenda close and unhurried", "full late-night lock, caller light bright", "the microphone and the rain have made peace"],
  },
  "moon-dub": {
    low: ["moon dust settled on the stack and dulled the bass", "the echo left and has not come back yet", "low-gravity dropout, signal drifting off the rim"],
    mid: ["dub coming through, echo a little late", "eleven-second return, mostly intact", "usable bass, dust bouncing off the cone"],
    high: ["full stack lock, earthrise in the sidechain", "selector loud, echo returning on eleven", "strong lunar carrier, dust moving in time"],
  },
  "whalesong": {
    low: ["a whale crossed the lane and shadowed the carrier", "deep-space hiss swallowing Captain Hum", "signal thin between galaxies, lane 12 quiet"],
    mid: ["a slow whalesong arriving with some hiss", "Captain Hum audible if you wait for him", "usable drift, nebula a little thick"],
    high: ["full lane lock, whales keeping the carrier", "vast and strong, one galaxy wide", "the blink reached the dish and the signal rose"],
  },
  "impossible-sports": {
    low: ["the polite sun flared and blanked the booth", "the crowd wave knocked the stadium aerial sideways", "play-by-play buried under nonsense cheering"],
    mid: ["Chip is audible, the rules still are not", "usable floodlight signal, scoreboard humming", "Doug's aside getting through between the roar"],
    high: ["stadium lock, sun-ball and all", "full-strength commentary from Coliseum Zero", "the wave and the carrier are finally in sync"],
  },
  "baroque-bots": {
    low: ["a powdered wig slipped over the salon aerial", "candle smoke sitting on the harpsichord carrier", "the conducting spoon tapped the cable loose"],
    mid: ["counterpoint coming through, a little waxy", "Maestro audible, feelings still simulated", "usable salon signal, one robot slightly flat"],
    high: ["full candlelit lock, cello and harpsichord", "clockwork carrier precise and loud", "the toaster portrait approves the signal"],
  },
  "comet-marimba": {
    low: ["the hammock swung into the beach aerial", "comet-tail ice crackling over the marimba", "signal streaking, hard to hold at this speed"],
    mid: ["tropical mallets coming through, a bit breezy", "Coco audible over the streaking stars", "usable vacation signal, hat still on"],
    high: ["full beach lock at comet speed", "the crab's deck and the carrier are both sunny", "strong marimba, palm tree holding still"],
  },
  "channel-surf": {
    low: ["the remote changed channel in the middle of a word", "twelve televisions arguing on one thin carrier", "somebody sat on the clicker and the signal fled"],
    mid: ["one channel mostly here, the next one leaking", "usable couch signal between button presses", "an egg is being folded, audibly, for now"],
    high: ["the remote paused; this channel is locked", "full wall-of-screens strength on the current show", "no button pressed for a whole sentence"],
  },
  "mirror-polka": {
    low: ["the reflection arrived and the signal did not", "a tuba bell is covering the mirror-side aerial", "oom-pah reversed and mostly missing"],
    mid: ["polka coming through, half a second late", "Ynnhoj audible just after Johnny", "usable ballroom signal, one shoe still lost"],
    high: ["both sides of the mirror locked together", "full oom-pah, accordion proudly left-handed", "the reflection and the carrier finally agree"],
  },
  "wild-multiverse": {
    low: ["tall grass swallowed the dish and a crew member", "something mostly neck stood between you and the mast", "hushed narration buried in rustling"],
    mid: ["Sir Reginald audible, the creature slightly less so", "usable documentary signal at grass height", "a spring-deer bounced the carrier and it returned"],
    high: ["full golden-hour lock across the grassland", "crew all present, narration close and hushed", "the horizon creature is in frame and in signal"],
  },
  "numbers-omega": {
    low: ["fog thick enough to hide the mast light and the carrier", "the fox sat on the feedline and will not discuss it", "numbers arriving with digits missing"],
    mid: ["a flat voice getting through the fog", "usable sequence, one goose unaccounted for", "red mast light blinking in time with the numbers"],
    high: ["full fog-mast lock, every digit present", "the fox approves; the carrier is loud", "sequence strength high, coordinates still withheld"],
  },
  "smoke-ring-trio": {
    low: ["thunder in the wallpaper dropped the piano mic", "Florian and the signal are both lost in cloud", "the bass solo rained out before it reached you"],
    mid: ["trio audible through a light interior shower", "usable club signal, mind the missing step", "brushes coming through, piano a little misty"],
    high: ["full cloud-club lock, candle flames upright", "Mercy's piano arriving dry and close", "the storm stayed outside the song"],
  },
  "lower-hollow": {
    low: ["something floated up the Hole and across the aerial", "Rim Lane mist sitting on the community mast", "Maureen's words thinning toward the edge"],
    mid: ["bake-sale audio getting through the bunting", "usable rim signal, Hole barometer muttering", "Councillor Dibbs audible, policy slightly fuzzy"],
    high: ["full village lock around the rim", "the noticeboard and the carrier are both upright", "strong community signal, spaniel accounted for"],
  },
  "bubble-economy": {
    low: ["harbour glare flaring the marina aerial", "a cassette jam just as the chorus lifted", "neon reflection louder than the carrier"],
    mid: ["city-pop coming through, top still down", "Kiko audible over the bay traffic", "usable 1986 signal, a little glossy"],
    high: ["full marina lock, Friday night holding", "elevated-highway strength, no Monday in the mix", "the bay and the carrier are both shining"],
  },
  "tomorrows-leftovers": {
    low: ["steam from next Thursday fogged the kitchen mic", "the timer counted up over the carrier", "Pip dropped a spoon and the signal ducked"],
    mid: ["future stew audible, salt still undecided", "Chef Brodequin coming through from four days ahead", "usable test-kitchen signal, oven warm"],
    high: ["full larder lock, aromas and audio together", "the glowing pot and the carrier are both ready", "strong future signal, spoon finally the right one"],
  },
  "cat-fm": {
    low: ["Gloria sat on the fader and the carrier went out", "a mug is one paw from the edge and the aerial", "purr louder than the programme"],
    mid: ["cat-piano coming through between grooming", "Dennis audible, apologising, mostly", "usable windowsill signal, sunbeam advancing"],
    high: ["full desk lock, one paw riding the fader", "Gloria's mix arriving warm and close", "the bird feeder and the carrier are both busy"],
  },
  "piano-empty-rooms": {
    low: ["the east-wing door sighed and the piano mic thinned", "a dust sheet over the aerial, room still unvisited", "signal careful and very far down the corridor"],
    mid: ["solo piano arriving, a little distant", "the caretaker's hush is listenable", "usable empty-room signal, moonlight slow"],
    high: ["full gallery lock, sustain pedal close", "the unvisited wing is loud in its quiet way", "strong bare-floor carrier, no footsteps"],
  },
  "unsolved-dimensions": {
    low: ["rain on the blinds washing out the detective carrier", "red string snagged the archive aerial", "the goose honked on frequency and the words fled"],
    mid: ["noir bed coming through, coffee still cold", "Inspector Gault audible, case still open", "usable basement signal, lamp a little dim"],
    high: ["full evidence-board lock, string taut", "grave and strong from the archive desk", "the teaspoon's whereabouts are coming in whole"],
  },
  "breakbeat-observatory": {
    low: ["the cone coughed a bass hit and the carrier ducked", "stellar drift between you and Mount Subwoofer", "174 arriving as a thin rattle"],
    mid: ["drum and bass getting through the open dome", "MC Parallax audible, galaxies slightly late", "usable mountain signal, mirrors still woofers"],
    high: ["full cone lock, stars shivering on the beat", "Doctor Ferrin's notes and the drop together", "strong observatory carrier, sector held"],
  },
  "other-horoscopes": {
    low: ["candle smoke over the planetarium aerial", "the crystal ball is showing hiss, not the show", "Mercury sulked into the feedline"],
    mid: ["a reading getting through, a little hazy", "Madame Orrery audible under the closed dome", "usable constellation signal, one sock rising"],
    high: ["full dome lock, teapot and ladder both loud", "the cards and the carrier agree tonight", "strong mystic signal, beeswax warm"],
  },
  "drowned-shanty-hour": {
    low: ["green brine over the deck aerial, words gone salty", "the accordion slipped a fathom and the carrier followed", "bilge-pump rhythm drowning the shanty"],
    mid: ["shanty coming through, a little underwater", "Captain Wetherell audible from the barrel", "usable drowned signal, lanterns swinging"],
    high: ["full below-deck lock, crew stamping in time", "the Damp Regret's carrier is loud and briny", "strong green swell, every hand on the chorus"],
  },
  "waystation-9": {
    low: ["sideways-road grease on the diner aerial", "a rig's horn sat on the channel and stayed", "moths on the neon thicker than the carrier"],
    mid: ["CB chatter getting through the diesel haze", "Big Rosalind audible between the coffee pours", "usable crossroads signal, Tuesday cargo rattling"],
    high: ["full channel-9 lock at the weighbridge", "Grandma Diesel's rig and the carrier both flying", "strong truck-stop signal, upward road open"],
  },
  "wall-of-fog": {
    low: ["reverb ate the words and has not returned them", "the stage lamp is on; the band is not in the carrier", "fog so thick the signal sat down"],
    mid: ["shoegaze coming through, edges smeared", "Ellis almost audible, which is traditional", "usable haze, pedals glowing, sentences not"],
    high: ["full fog-wall lock, loud and then quiet", "the tiny pedal city is in the signal", "strong reverb, the lamp nodding along"],
  },
  "win-this-planet": {
    low: ["the prize wheel spun across the studio aerial", "chaser lights chopping the carrier to bits", "Doreen's applause sat on the host mic"],
    mid: ["quiz audio getting through the dry ice", "Chaz audible, the answer still wrong", "usable spotlight signal, one contestant buzzing"],
    high: ["full podium lock, planet still on the wheel", "Studio Infinity loud and extremely confident", "strong buzzer signal, Grandma Hester ready"],
  },
  "yesterday-fm": {
    low: ["yesterday's hiss is still hanging about the aerial", "the backwards clock ticked over the lead", "a cold cup of tea closer than the carrier"],
    mid: ["soft rock from yesterday, a little worn", "Gordon audible, the news already over", "usable living-room signal, dog still asleep"],
    high: ["full yesterday lock, four o'clock light", "the wood-panel radio is loud and close", "strong golden-hour carrier, nothing left pending"],
  },
  "event-horizon-surf": {
    low: ["gravitational swell bent the beach aerial", "the NO RETURNS sign flapped over the mic", "time-stretched dropout, chorus still in 1959"],
    mid: ["surf guitar coming through, a little stretched", "Dash audible from the leaning tower", "usable shoreline signal, leash on"],
    high: ["full accretion-ring lock, four sunsets wide", "the break and the carrier are both enormous", "strong sunny-doomed signal, tide still out"],
  },
  "bedtime-for-giants": {
    low: ["a giant exhale blew the valley aerial over", "quilt-shadow sitting on the story mic", "signal tiny at the foot of the bed"],
    mid: ["a slow sentence getting through the mist", "Nanny Bramblewick audible, unhurried", "usable bedtime signal, bedside lamp warm"],
    high: ["full valley lock, quilt rising in time", "the story arriving gently and very close", "strong enormous-room carrier, toes tucked"],
  },
  "gristwick-parish": {
    low: ["the prize marrow is shading the fete aerial", "brass glare bouncing the carrier off the tent", "tombola tickets rustling over the vicar"],
    mid: ["fete coverage getting through the bunting", "Reverend Ashby audible between the tuba", "usable green signal, applause in the distance"],
    high: ["full parish lock, marrow and maypole", "the silver band and the carrier in the same bar", "strong fete signal, urn humming since morning"],
  },
  "tiny-hour": {
    low: ["a big person walked past and the matchbox aerial hid", "button-table scrape louder than Auntie Pim", "signal beetle-sized and easily lost"],
    mid: ["tiny songs getting through the felt board", "Auntie Pim audible if you lean all the way in", "usable matchbox signal, thimble lamp warm"],
    high: ["full skirting-board lock, everyone behind it", "the ladybird puppet is loud and close", "strong very-small carrier, please lean in"],
  },
  "infinite-song": {
    low: ["a late verse coughed and the mic lead slipped", "a beard grew over the stage-door aerial", "signal patient, thin, possibly still in the intro"],
    mid: ["the same song getting through, verse uncertain", "Ambrose audible, counting, mostly sure", "usable endless-stage signal, candle low"],
    high: ["full footlight lock, chorus still rumoured", "Old Wendeline's tempo arriving rock-solid", "strong endless carrier, door held by a tambourine"],
  },
  "plant-fm": {
    low: ["a fern leaned on the greenhouse aerial", "the misting cycle beaded the feedline", "signal slow, green, and partly shaded"],
    mid: ["photosynth coming through the glass", "Fern audible, which is rare and welcome", "usable windowsill signal, cactus in headphones"],
    high: ["full sunbeam lock on the top shelf", "the monstera and the carrier both unfurled", "strong greenhouse signal, humidity gentle"],
  },
  "hush-after-hours": {
    low: ["Moth One settled on the viewport and on the gain", "an aft-cabin blanket muffling the glass line", "HUSH's link arriving as a very small light"],
    mid: ["after-hours glass coming through the console", "the chair aerial listenable, oranges faint", "usable Nightjar signal, operator possibly asleep"],
    high: ["full aft-cabin lock, amber and close", "HUSH's carrier warm against the viewport", "strong private signal, plant leaning toward it"],
  },
  "last-lighthouse": {
    low: ["spray over the lantern-room insulator", "the gull shifted and the rock aerial dipped", "forecast thin across the dark water"],
    mid: ["a careful voice getting through the swell", "the Keeper audible, beam still turning", "usable inshore signal, moths in the lamp"],
    high: ["full rock lock, beam and carrier together", "shipping forecast arriving whole", "strong lamp-room signal, sill gull settled"],
  },
  "transmission-zero": {
    low: ["cave-wall echo eating the horn microphone", "wet leaves loud, the first carrier very small", "flint-spark crackle over the tapping"],
    mid: ["a primordial hello getting through the smoke", "the horn mic listenable, fur and ember", "usable cave signal, berries not involved"],
    high: ["full cave-mouth lock, lightning tree singing", "the first broadcast arriving bone-close", "strong stone carrier, echo behaving"],
  },
  "saturday-night-forever": {
    low: ["mirror-ball flecks chopping the rink aerial", "a whistle blew and the carrier skated off", "signal lost somewhere counter-clockwise"],
    mid: ["disco coming through, a little hairspray-thick", "Donna audible between the laps", "usable maple-floor signal, clock still handless"],
    high: ["full rollerdrome lock, hour still climbing", "the mirror ball and the carrier in the same sparkle", "strong Saturday signal, no sign of Sunday"],
  },
  "free-frequency": {
    low: ["egg-box insulation swallowing the attic carrier", "a detector van passed and the signal ducked", "protractor shadow across a very thin pirate wave"],
    mid: ["Static Kate getting through the rafters", "usable conspiratorial signal, red string humming", "Mole's tip audible, then the click"],
    high: ["full attic lock on tonight's hiding place", "the Nightjar's lights and the carrier aligned", "strong pirate signal, pencil ready for the code"],
  },
  "orbit-roots": {
    low: ["ring-ice mist beading the greenhouse aerial", "a floating pumpkin bumped the porch stack", "off-beat irrigation louder than the selector"],
    mid: ["roots coming through, soil still in the mix", "Sister Meridian audible from the shack", "usable farm-moon signal, beans climbing"],
    high: ["full greenhouse lock, bass on the one-drop", "pump pressure and carrier pressure both good", "strong ringlight signal, the water still ours"],
  },
  "small-claims": {
    low: ["rain on the tall windows drumming the bench mic", "a weeping cloud dampened the gallery aerial", "green ink not dry, and the carrier smudged"],
    mid: ["court audio getting through, gavel a little soft", "the judge audible, the objection slightly fuzzy", "usable bench signal, tissues in circulation"],
    high: ["full courtroom lock, crest and lamp", "Clerk Odell's voice arriving whole", "strong tribunal signal, dignity intact"],
  },
  "substation-null": {
    low: ["steam off Valve C-17 fogging the catwalk mic", "hazard strobes chopping the reactor-hall carrier", "manifold hiss louder than Null's one word"],
    mid: ["warehouse kick getting through the pressure hum", "Diligence Safety Voice audible and out of date", "usable catwalk signal, glow stick in the mix"],
    high: ["full reactor-hall lock, pressure holding the kick", "strobe and kick arriving as one hit", "Diligence Safety Voice loud, thorough, and late"],
  },
  "tiki-satellite": {
    low: ["a loose pineapple crossed the Lagoon Deck aerial", "centrifuge flutter wobbling the bamboo carrier", "sixteen sunrises and a very thin theremin"],
    mid: ["exotica coming through the porthole hiss", "Lyle audible, relief crew still theoretical", "usable orbital signal, cocktail umbrellas spinning"],
    high: ["full Lagoon Deck lock, earthrise in the window", "1958 carrier bright and courteous", "strong tiki signal, puffer-fish lamps in tune"],
  },
  "the-long-dark": {
    low: ["a bulb on Ring Four died and took a line with it", "foley gravel louder than the ribbon mic", "the Long Dark pressing on a thin episode carrier"],
    mid: ["radio-play audio getting through the organ", "the Announcer audible, previously-on included", "usable Studio B signal, script rustle present"],
    high: ["full Penumbra lock, ON AIR lamp red", "Ines Calder's night shift arriving close", "strong theatrical carrier, one lamp in the window"],
  },
  "island-time": {
    low: ["two suns setting at different speeds over the dish", "tide marker three is underwater, and so is the gain", "hammock squeak sitting on the observatory mic"],
    mid: ["slow reggae coming through, half past something", "Professor Easy audible, unhurried", "usable jetty signal, ginger beer not included"],
    high: ["full Tide Hill lock, dome open", "the slow sun and the carrier both taking their time", "strong island signal, nobody late since 1983"],
  },
  "traffic-on-the-8s": {
    low: ["brake-light glare washing out the traffic pod", "a jackknifed century sitting on the bypass aerial", "signal stationary, same as the lanes"],
    mid: ["Rita getting through between the eights", "usable interchange signal, visibility low", "Captain Buzz audible from four miles up"],
    high: ["full pod lock above the wormhole jam", "the eights arriving exactly on the eights", "strong traffic carrier, nothing actually moving"],
  },
  "atomic-bachelor-pad": {
    low: ["the theremin wandered and detuned the hallway aerial", "walnut-console warmth, carrier a little shy", "Lot 11 knocked and the left speaker ducked"],
    mid: ["hi-fi demo coming through, bongos en route", "Monty audible from the chalk mark", "usable sunken-lounge signal, balance nearly zero"],
    high: ["full console lock, left and right accounted for", "the chalk mark is exactly in the signal", "strong pad carrier, rocket on the horizon"],
  },
  "velvet-collapse": {
    low: ["Old Ruby flared and the casino dish went crimson-blind", "a roulette ball skipped across the aerial", "the limiter chewing the funk carrier"],
    mid: ["velvet funk getting through the red glare", "Baron Velour audible, unbothered", "usable lounge signal, sunglasses recommended"],
    high: ["full Casino Ultima lock, bass holding the room", "Odette's wheel and the carrier both on red", "strong pre-flash signal, breakfast still planned"],
  },
  "heat-death-afterparty": {
    low: ["another star went out and took a bar of signal", "the last bulb flickered and the beat thinned", "nebula sway muffling the only speaker"],
    mid: ["a slowing kick getting through the dark", "DJ Entropy audible, calling everyone in", "usable last-rave signal, three dancers present"],
    high: ["full last-light lock under the bulb", "Lorraine and the carrier both rose-gold", "strong final signal, room for one more"],
  },
  "the-switchboard": {
    low: ["a brass plug pulled and the trunk line sighed", "cloth-cord tangle sitting on the exchange aerial", "three universes apologising over a thin carrier"],
    mid: ["the Operator getting through between clicks", "usable 1946 signal, please continue to hold", "a lamp lit on the board, words mostly here"],
    high: ["full exchange lock, headset close", "trunk line open and properly loud", "strong switchboard carrier, nothing repeated"],
  },
  "minute-between": {
    low: ["the second hand twitched and the carrier froze wrong", "dust in the moonbeam thicker than the signal", "thirteen minutes pressed into a very small wave"],
    mid: ["a suspended voice getting through the gap", "the Interval audible, nothing due yet", "usable between-tick signal, glass still aloft"],
    high: ["full 03:33 lock, dust held in the beam", "the minute and the carrier equally still", "strong gap signal, the door held open"],
  },
  "the-harbour": {
    low: ["a moored hull shadowing Berth Seven's beacon", "pier light flickering, carrier coming in slow", "basin hush, the words not quite ashore"],
    mid: ["harbour piano getting through the rigging", "the Harbourmaster audible, unhurried", "usable berth signal, oranges faint on the air"],
    high: ["full Berth Seven lock, light left on", "old relay ships quiet, carrier warm", "strong homecoming signal, no heading required"],
  },
  "something-listening": {
    low: ["the static leaned in and muffled its own carrier", "an old forecast rustling over the voice", "signal shy, waiting to see if you stay"],
    mid: ["a gentle voice getting through the hiss", "the Static audible, curious, not frightening", "usable between-stations signal, mug still warm"],
    high: ["full attention lock; it noticed you stayed", "kept signals arriving soft and whole", "strong curious carrier, hello returned"],
  },
};

for (const id of Object.keys(LOCAL)) {
  const bands = RECEPTION_BANDS[id];
  if (!bands) throw new Error(`missing reception bands for ${id}`);
  Object.assign(LOCAL[id] as object, bands);
}


export function hasLocalReception(stationId: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCAL, stationId);
}

function hasBands(grammar: Grammar | undefined): grammar is Grammar {
  if (!grammar) return false;
  const ok = (rule: Grammar[string] | undefined) => Array.isArray(rule) && rule.length >= 3;
  return ok(grammar.low) && ok(grammar.mid) && ok(grammar.high);
}

const LOW_CLAIM = /\b(clear|steady|kind|vacuum propagation)\b/i;

/** Funny reception status, e.g. "73% — a moth has landed on the antenna". */
export function receptionReport(seed: number, station?: StationDef | string): string;
export function receptionReport(station: StationDef | string, seed: number): string;
export function receptionReport(
  stationOrSeed: StationDef | string | number,
  maybeSeedOrStation?: number | StationDef | string,
): string {
  let seed: number;
  let stationId: string | undefined;
  if (typeof stationOrSeed === 'number') {
    seed = stationOrSeed;
    if (typeof maybeSeedOrStation === 'string') stationId = maybeSeedOrStation;
    else if (maybeSeedOrStation && typeof maybeSeedOrStation === 'object') stationId = maybeSeedOrStation.id;
  } else {
    stationId = typeof stationOrSeed === 'string' ? stationOrSeed : stationOrSeed.id;
    seed = typeof maybeSeedOrStation === 'number' ? maybeSeedOrStation : 0;
  }

  const localGrammar = stationId ? LOCAL[stationId] : undefined;
  const base = stationId ? hashSeed(stationId, 'reception', seed) : hashSeed('reception', seed);
  const r = rngFor(base, 'band');
  const roll = r.next();
  // Percentage and copy stay in the same band: weak under 40, usable under 85, strong after.
  const band = roll < 0.4 ? 'low' : roll < 0.75 ? 'mid' : 'high';
  const pct = band === 'low' ? r.int(8, 39) : band === 'mid' ? r.int(40, 84) : r.int(85, 100);
  const prefix = `${pct}% — `;
  const grammar = hasBands(localGrammar) ? merge(receptionGrammar, localGrammar) : receptionGrammar;
  const reason = expandUntil(
    grammar,
    (a) => rngFor(base, 'reason', a),
    `#${band}#`,
    (s) => prefix.length + s.length <= LIMITS.reception && (band !== 'low' || !LOW_CLAIM.test(s)),
    'the static is trying its best',
  );
  return prefix + reason;
}
