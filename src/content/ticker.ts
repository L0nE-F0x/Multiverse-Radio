// Crawl text for each station's display ticker.

import type { StationDef } from '../broadcast/types';
import { bigNum, expandUntil, merge, num, type Grammar } from './grammar';
import { LIMITS } from './limits';
import { hashSeed, Rng, rngFor } from './rng';
import { worldGrammar } from './world';

/** Station-local ticker lines (rule `local`), keyed by station id. */
const LOCAL: Readonly<Record<string, Grammar>> = {
  'static-lullabies': {
    local: [
      'Snow on channel #ch#: soft, #n# inches, settling',
      'The cat on the television has rolled over (to the left)',
      'Nightlight status: on. It will stay on.',
      'Something under the bed is also asleep. Please keep your voice down',
      'The static wishes you sweet dreams, specifically',
      'Test card update: still testing. Results expected by morning',
      'The screen smiled at #clock#. It has since forgotten',
      'Moths at the window: #n#. All behaving',
      'Bedtime story postponed; the story fell asleep first',
    ],
    ch: num(2, 99),
    n: num(2, 9),
    clock: ['2:14', '3:03', '1:47', '4:12', 'midnight'],
  },
  'void-beats': {
    local: [
      'The void has finished chapter #n#. No spoilers',
      'Kettle status: about to boil (emotionally)',
      'Study timer: 25 minutes. Break: forever',
      'Pages read tonight: #n# (the same page)',
      'The void says hi. The void is lying. Sort of.',
      'Planets drifting past the window: #n#. Waving: one',
      'Pet on the notes: probably a cat. Still asleep',
      'DJ Eventually is about to start a sentence',
      'Room 0 reminder: there is no door. Please stop knocking',
      'The void has borrowed a pencil and will not be returning it',
    ],
    n: num(3, 14),
  },
  'every-news': {
    local: [
      'Markets: #commodity# #change#, #commodity2# #change#',
      'Kim Harrowgate is standing in it. Someone has handed her #handed#',
      "Skip Daley's traffic: scattered Tuesdays on the Eastern Overlap",
      "Dale Quarterly remains unflappable. Sources say 'concerningly so'",
      'Top story at eleven. It is always eleven',
      'Correction: yesterday did not happen. We regret the error',
    ],
    handed: ['a soup', 'a lamb', 'a trophy', 'a smaller microphone', 'a map of a different city', 'an umbrella', 'a baby (since returned)'],
  },
  'rainfall-fm': {
    local: [
      'Rainfall tonight: #inches# inches. Season total: four thousand years',
      'Umbrella advisory: carry two. One for you, one for the umbrella',
      'Puddle depth on Lantern Street: #depth#',
      'Sun sighting reported in Precinct #p#; confirmed to be a streetlamp',
      'Kettles on across the precinct: #k#. Steam levels: cosy',
      'Lightning very far away. Not our problem. Lovely, though',
      'Lost umbrella #u# has been found. It was flying',
      'Drizzle Montgomery reads the totals at the top of the hour. Bring a towel',
    ],
    inches: (rng) => `${rng.int(1, 9)}.${rng.int(0, 9)}`,
    depth: ['ankle', 'shin', 'knee', 'emotional', 'unknown; send a duck'],
    p: num(1, 12),
    k: bigNum(1_000, 90_000),
    u: num(40, 4096),
  },
  'neon-2087': {
    local: [
      'Traffic on the grid: one car, many wheels, never arriving',
      'Sunset forecast: permanent. Sunglasses: mandatory',
      'Palm tree elbow count: rising',
      "Today's tax forms have been rated RAD by Velocity Jones",
      'Speed limit on the grid: yes',
      'Horizon status: still ahead',
      'Synth temperature: hot. Feelings temperature: hotter',
      "Velocity Jones has called #n# things 'rad' this hour, including a stapler",
      'Timeline 2087-B reminder: the future already happened. Act natural',
    ],
    n: num(14, 90),
  },
  classifieds: {
    local: [
      "Today's deal: #product# at #price#",
      'All sales final. Finality negotiable',
      'Linda from Accounts has read the small print. Linda would like to lie down',
      'Rex Bellows has made #n# deals this hour. All of them final',
      'Wanted: a tall, dark stranger, to stand at the end of a bed. Must be patient',
    ],
    product: ['a used planet', 'a portable hole', 'a second moon', 'a haunted mirror', 'a spare Tuesday', 'a gently used comet', 'a bag of weather'],
    price: ['a song', 'two Tuesdays', 'one firstborn cloud', 'whatever you have', 'a steal (literally)', 'eleven shiny buttons'],
    n: num(12, 99),
  },
  'end-lounge': {
    local: [
      'Last call: eleven billion years and counting',
      'Stars remaining: fewer than earlier. Still pretty',
      'The octopus is polishing glass #g# of 8',
      'Tab status: open. Has always been open',
      'The universe is ending out of the big window. Booths with a view available',
      "Barnaby Velvet has called the next song 'a real heartbreaker'. It is",
      "Tonight's special: the last olive in existence, shared",
      'Empty microphone on stage: still waiting for its singer',
    ],
    g: num(1, 8),
  },
  'snail-jams': {
    local: [
      'Leaf traffic: Shelley at #cm# cm, holding steady',
      'Dew advisory in effect until the dew decides',
      'Next song in: eventually',
      'Live update: the mushroom is still there. Great work, mushroom',
      'Raindrop falling in slow motion: #pct#% of the way down',
      'Snail headphones: on. Snails: on. Everything: on its way',
      'Leaf completion forecast: next Tuesday, weather permitting',
      'Slime trail visibility: glittery',
    ],
    cm: num(2, 30),
    pct: num(3, 97),
  },
  'dimension-hop': {
    local: [
      'Mara is four seconds ahead. Jace is catching up',
      'Rift status: open. Coffee status: upside-down',
      "Today's topic: #topic#. Preparation: none",
      'Gravity on the left side: normal. Gravity on the right side: having a moment',
    ],
    topic: ['legs', 'breakfast', 'stairs', 'dogs', 'the concept of uphill', 'listener mail'],
  },
  'crystal-delta': {
    local: [
      'Refraction index: high (high)',
      'Chandelier weather: tinkling, then tinkling',
      'Tiny miner on tea break #n# of 3',
      'Beams crossing the cave: #b#. Rainbows: #r#',
      'Prism reminds you that every sentence has a twin',
      'Please do not tap on the crystals. They tap back',
      'Light levels: dazzling, with a chance of gleaming',
    ],
    n: ['1', '2', '3', '4 (unauthorised)'],
    b: num(7, 77),
    r: num(2, 7),
  },
  'hold-music': {
    local: [
      'Now serving: #queue#',
      'Your position in the queue: #queue#. Your patience has been noted',
      'Estimated wait: #estimate#',
      'Please have Form #form# ready, plus a copy of the copy',
      'The waiting room plant has grown #cm# cm since you started holding',
      'Pam (Automated) has been on hold herself since the Bronze Age',
      'Your call is important to us in every reality simultaneously',
      'Press 9 to be transferred to someone who will press 9',
      'Queue etiquette: please do not age loudly',
    ],
    queue: bigNum(10_000, 99_999_999),
    estimate: ['soon', 'an epoch', 'eleven minutes (geological)', 'pending', 'not long now', 'yes'],
    form: ['27-B', '9', '4-Q (revised)', '11/11', 'Zero', '88-Ω'],
    cm: num(3, 140),
  },
  'pixel-afterlife': {
    local: [
      'HI SCORE: #initials# #score#',
      'HI SCORE: #initials# #score#',
      'Player One: still has not pressed start',
      'Ghosts online: #n#. Ghosts losing: one. He is fine',
      'Continues remaining: ∞',
      'Now respawning: an old game nobody finished',
      'Coin slots blinking: all of them',
      'Tip: lose 99 times to unlock losing 100 times',
      'Player Two has been waiting since 1987. Press start, someone',
    ],
    initials: ['AAA', 'ZZZ', 'GHO', 'BOO', 'P2!', 'YOU', 'MOM', 'ACE', 'ZAP', 'LOL', 'WHO'],
    score: (rng) => String(rng.int(1, 999_999)).padStart(6, '0'),
    n: num(5, 64),
  },
  'ask-grenda': {
    local: [
      'Lines are open. Grenda has heard it twice',
      'Caller lights blinking: #n#. Lava lamp occupant: awake',
      "Tonight's advice: #advice#",
    ],
    n: num(2, 12),
    advice: ['drink some water', 'call your shadow', 'it will look different tomorrow, literally', 'be kind to your future self', 'sleep on it'],
  },
  'moon-dub': {
    local: [
      'Echo delay: 11.0 seconds',
      'Gravity: 16% of normal. Bass: 400% of normal',
      'Earth is rising. Earth looks sleepy',
      'Moon dust airborne: lots. Settling: in about a week',
      'Shout-outs returning shortly. Please hold for echo',
      'Lone astronaut nodding along: one',
      'Selector Crater has said #n# words tonight. He meant all of them',
      'Speaker stack status: pointed at Earth',
    ],
    n: num(4, 31),
  },
  whalesong: {
    local: [
      'Lane 12: #n# whales, all accounted for (mostly)',
      'Captain Hum last spoke #m# minutes ago. He is fine',
      'Nebula density: soft',
      'A whale has turned and blinked. Please blink back',
      'Galaxies passed tonight: #g#. All waved',
      'The whales are fine. Do not ask the whales',
      'Cruising speed: one galaxy per century',
    ],
    n: num(3, 40),
    m: num(11, 59),
    g: num(2, 9),
  },
  'impossible-sports': {
    local: [
      'Score: Home #n#, Away a colour',
      'The ball, a small polite sun, has asked for a moment',
      'Chip Thunderbuckle still has not understood the rules. Still unstoppable',
      'The crowd is doing the wave. The wave is doing the crowd',
      'Doug Steadman: "Technically, that was illegal. Beautifully."',
    ],
    n: num(0, 99),
  },
  'baroque-bots': {
    local: [
      'Now tuning: the harpsichord (again)',
      "Conductor's spoon: polished",
      'Feelings simulated tonight: #n#. Feelings felt: pending',
      'The portrait of the toaster has been rehung, slightly to the left',
      "Maestro Unit Seven rates this evening 'adequate'",
      'Powdered wigs in use: #n#. Dust motes: countless',
      'Please silence your clockwork during the performance',
      'Interval in #n# minutes. Oil will be served',
    ],
    n: num(3, 40),
  },
  'comet-marimba': {
    local: [
      'Surf report: waves of pure time, #a# to #b# minutes',
      'Comet speed: seventy kilometres per second. Hammock: stable',
      'Sunscreen advisory: factor four thousand',
      'The crab with sunglasses is on the decks. Do not make requests',
      'Tide: going out. Also going very, very fast',
      'Stars streaking past: #n# a minute',
      'Coco Halley is on vacation. Coco Halley is always on vacation',
    ],
    a: num(2, 4),
    b: num(5, 9),
    n: num(40, 900),
  },
  'channel-surf': {
    local: [
      'Channel #ch#: an egg is being folded',
      'Channel #ch#: a hallway is being proposed to',
      'The remote has pressed #n# buttons this minute',
      'Now showing on channel #ch#: #showing#',
      'Who has the remote? Seriously. Who has the remote',
    ],
    ch: bigNum(2, 9_999),
    n: num(30, 400),
    showing: ['a chair being interviewed', 'a cooking show for clouds', 'the same advert, but sadder', 'a sport with no ball', 'a sunset, live'],
  },
  'mirror-polka': {
    local: [
      'Reflections out of sync tonight: #n#',
      'Accordion handedness: left',
      '.ecnad ot ydaer srecnaD',
      'Ynnhoj agrees. (0.5 seconds later)',
      'Reflection doing a different dance entirely: table #n#',
      'Please keep left. Your reflection will keep right. It is fine',
      'Lost in the mirror: one left shoe, property of the reflection of a guest',
      'Johnny Mirror reminds you: clockwise is a rumour',
    ],
    n: num(2, 19),
  },
  'wild-multiverse': {
    local: [
      'Sightings today: #creature# (#n#), crew (#crew# of 3)',
      'Please do not feed the #creature#',
      'Crew headcount: #crew# of 3. Search underway',
      'The giraffe that is mostly neck is still walking past',
      'Sir Reginald has wept #n# times today. All justified',
      'Tall grass height: tall. Visibility: grass',
      'The deer made of springs was last seen bouncing #direction#',
    ],
    creature: ['folding elk', 'pocket bison', 'lantern badger', 'glass hare', 'humming crab', 'velvet tortoise', 'many-kneed stork', 'wandering armchair'],
    crew: ['2', '3', '2', '4 (unexplained)'],
    direction: ['north', 'upward', 'in place', 'into next week', 'toward the crew'],
    n: num(2, 14),
  },
  'numbers-omega': {
    local: [
      '#d# #d# #d# · #d# #d# · #d#',
      '#d# #d# #d# · #d# #d# · #d#',
      'Geese owed: #n#',
      'Fox status: listening',
      'Next sequence in: 00:0#m#:#s#',
      'Fog: thick. Red light: blinking. Everything: as it should be',
      'This message is for the listener in the blue kitchen. The milk is fine',
      'Coordinates: withheld. Feelings: also withheld',
    ],
    d: ['0', '1', '2', '3', '4', '5', '6', '7', '7', '7', '8', '9'],
    n: num(3, 77),
    m: num(1, 9),
    s: (rng) => String(rng.int(0, 59)).padStart(2, '0'),
  },
};

function stationGrammar(station: StationDef): Grammar {
  return {
    stationName: [station.name],
    freq: [station.frequency.toFixed(1)],
    // "broadcasting from a strip mall…", but keep proper nouns like "Tranquility Base Annex".
    origin: [station.origin.replace(/^(The|A|An|Between|Coordinates|Sub-basement)\b/, (w) => w.toLowerCase())],
    tagline: [station.tagline],
    host: [station.host.name],
    meta: [
      'Now on #freq# MHz: #stationName#, broadcasting from #origin#',
      '#stationName#: #tagline#',
      'On air: #host#',
      'You are tuned to #freq# MHz. Please do not touch the dial; the dial is sleeping',
      '#stationName#, #freq#. Reception may vary by reality',
    ],
  };
}

export function tickerGrammar(station: StationDef): Grammar {
  return merge(worldGrammar, stationGrammar(station), LOCAL[station.id] ?? { local: ['#headline#'] });
}

/** Rough mix of ticker content: station-local, multiverse headlines, running gags, station meta. */
function lineKind(rng: Rng, talk: boolean): string {
  const r = rng.next();
  if (talk) return r < 0.25 ? 'local' : r < 0.75 ? 'headline' : r < 0.9 ? 'gag' : 'meta';
  return r < 0.42 ? 'local' : r < 0.72 ? 'headline' : r < 0.88 ? 'gag' : 'meta';
}

export function tickerLines(station: StationDef, seed: number, count: number): string[] {
  const grammar = tickerGrammar(station);
  const base = hashSeed(station.id, 'ticker', seed);
  const talk = station.format === 'talk';
  const lines: string[] = [];
  const seen = new Set<string>();
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i++) {
    const kind = lineKind(rngFor(base, i, 'kind'), talk);
    const line = expandUntil(
      grammar,
      (attempt) => rngFor(base, i, attempt),
      `#${kind}#`,
      (s) => s.length <= LIMITS.ticker && !seen.has(s),
      `${station.name} · ${station.frequency.toFixed(1)} MHz`,
      40,
    );
    seen.add(line);
    lines.push(line);
  }
  return lines;
}
