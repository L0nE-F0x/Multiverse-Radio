// Crawl text for each station's display ticker.

import type { StationDef } from '../broadcast/types';
import { bigNum, expand, merge, num, tidy, type Grammar } from './grammar';
import { LIMITS } from './limits';
import { hashSeed, Rng, rngFor } from './rng';
import { worldGrammar } from './world';

/** Station-local ticker lines (rule `local`), keyed by station id. */
export const LOCAL: Readonly<Record<string, Grammar>> = {
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
      'Mug status: considering a second steam (emotionally)',
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
      'Ghosts online: #n#. Ghosts losing: one. He is thriving',
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
      'Captain Hum last spoke #m# minutes ago. He is unhurried',
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
      'Please keep left. Your reflection will keep right. It is willing',
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
      'This message is for the listener in the blue kitchen. The milk is cold',
      'Coordinates: withheld. Feelings: also withheld',
    ],
    d: ['0', '1', '2', '3', '4', '5', '6', '7', '7', '7', '8', '9'],
    n: num(3, 77),
    m: num(1, 9),
    s: (rng) => String(rng.int(0, 59)).padStart(2, '0'),
  },
  'smoke-ring-trio': {
    local: [
      'Cumulus Room: Mercy Calloway on piano, Augustin Pell on bass, Silas Brushwood on brushes',
      'Waiter update: Florian is #pct#% of the way across the cloud to Table #t#',
      'Polite applause after the bass solo has caused a #mm# mm shower over Gristwick',
      'Octavia Lowe rates tonight’s piano solo: "scattered showers, clearing to velvet"',
      'Step notice: mind the step outside the cloakroom. There still isn’t one',
      'Augustin Pell is walking the same bassline home for the #t#th month running',
      'Lightning in the north wallpaper: decorative only, please remain seated',
    ],
    pct: num(14, 92),
    t: num(2, 12),
    mm: num(2, 9),
  },
  'lower-hollow': {
    local: [
      'Lower Hollow population this hour: #pop# (fluctuating)',
      'Hole Committee Agenda Item #n#: the Hole remains. Minutes approved',
      'Lost & Found: Biscuit the spaniel is not lost; he is on Rim Lane watching the Hole',
      'Returned by the Hole at #clock#: one #item#, slightly damp, unclaimed',
      'Bake sale notice: Mrs #who#’s lemon drizzle has sold out; the Hole remains',
      'Policy reminder: if your name is called from the Hole, please do not answer',
      'Maureen Pettigrew has the flask and binoculars on Rim Watch until 04:00',
    ],
    pop: num(380, 440),
    n: num(1, 19),
    clock: ['14:10', '03:15', '11:40', '16:05'],
    item: ['1974 bicycle', 'left wellington', 'garden gnome', 'Post Office ledger', 'tin of custard'],
    who: ['Pettigrew', 'Dibbs', 'Garside', 'Finch'],
  },
  'bubble-economy': {
    local: [
      'Marina Index: up #pts# points. Direction: only up. Year: still 1986',
      'Calendar check: Friday night (#n#th consecutive). Monday remains abolished',
      'Waterfront Bubble Integrity: 100%. Sharp-object and lapel-pin amnesty at Pier #p#',
      'Marina City Nine property update: two-bed balcony flat let for #s# sunsets and a compliment',
      'The Overtime Boys are on verse #pts# of their duet. Saxophone solo holding strong',
      'Elevated Bay Highway: convertibles gliding, cassette decks on auto-reverse',
      'Kiko Starlight confirms: the weekend starts now (again)',
    ],
    pts: num(12, 98),
    n: bigNum(1_400, 14_900),
    p: num(1, 9),
    s: num(3, 11),
  },
  'tomorrows-leftovers': {
    local: [
      'Test Kitchen Timer: +#m# minutes and counting up',
      'Jar inventory: "SOUP, LATER" (#n# litres), "THURSDAY" (marinating)',
      'Chef Brodequin has tasted next #day#’s roast and pronounced it "nearly bought"',
      'Pip status: holding the #spoon# spoon in the present tense',
      'Prep note: toast the loaf before slicing; slice before baking; sweep crumbs yesterday',
      'Larder advisory: do not open the fridge door labelled "NEXT WEEK" without oven gloves',
      'Tonight’s dish: leftovers from a banquet scheduled for #day#',
    ],
    m: num(15, 240),
    n: num(2, 9),
    day: ['Wednesday', 'Thursday', 'Friday', 'Sunday week'],
    spoon: ['wrong', 'slotted', 'wooden', 'soufflé', 'tasting'],
  },
  'cat-fm': {
    local: [
      'Station Manager Gloria is currently asleep on fader #f#. Please adjust your expectations',
      'Desk mug distance from the edge: #mm# mm. Dennis is watching it closely',
      'Sunbeam position: #pct#% across the studio carpet, moving east-southeast',
      'Programming decision by Gloria: #decision#',
      'Bird count outside the studio window: #f#. Chattering intensity: high',
      'Dennis (the intern) apologises for the last #f# minutes of purring into Mic 1',
      '03:00 Zoomies advisory: all loose scripts have been knocked onto the floor',
    ],
    f: num(1, 8),
    mm: num(1, 9),
    pct: num(12, 88),
    decision: ['one paw on the reverb', 'dead air for grooming', 'three tracks at once', 'a hiss at the weather chart'],
  },
  'piano-empty-rooms': {
    local: [
      'Now playing for: the #room# (unvisited since #yr#)',
      'East-wing door gap: 1.0 inches. Breeze: minimal. Footsteps: none',
      'Dust sheets in place across #n# armchairs and the long dining table',
      'The Caretaker is listening from the corridor so the music room stays empty',
      'Moonlight progress: #b# floorboards per hour toward the grand piano',
      'Note: the Drawing Room was briefly entered on Tuesday and has been removed from the rota',
      'Please do not dust the furniture; we only dust the light',
    ],
    room: ['West Parlour', 'Blue Spare Room', 'Long Gallery', 'Third Landing', 'Morning Room', 'Old Nursery'],
    yr: num(1890, 1978),
    n: num(4, 18),
    b: num(2, 6),
  },
  'unsolved-dimensions': {
    local: [
      'Case File #c#: The #crime# — Status: Open (by preference)',
      'Forensics update from Constable Pike: lab results are 100% inconclusive',
      'Primary suspect in Case #c#: the goose. The goose has requested a solicitor',
      'Evidence Board string usage tonight: #m# metres of red twine',
      'Inspector Delphine Gault has successfully talked #n# witnesses out of solving a case',
      'Coffee temperature on the Inspector’s desk: 11°C. Rain on the blinds: steady',
      'Reminder: if you know who moved the teaspoon, please keep it to yourself',
    ],
    c: num(101, 940),
    crime: ['Moved Teaspoon', 'Still-Warm Chair', 'Unexplained Umbrella', 'Borrowed Tuesday', 'Second Postman'],
    m: num(12, 85),
    n: num(2, 9),
  },
  'breakbeat-observatory': {
    local: [
      'Mount Subwoofer Cone Elevation: #deg#° · Output: 174 BPM',
      'Seismic bass alert: binary stars in Sector #s# have drifted #mm# arc-seconds on the drop',
      'Doctor Ferrin log entry #log#: head-nod angle 0.0° (holding firm)',
      'MC Parallax shout-out travelling at c toward the #gal# Galaxy (ETA: 30,000 years)',
      'Sub-bass pressure in the dome: nominal. Telescope mirrors replaced with 80-inch woofers',
      'Light-cone bulletin: tonight’s Amen break has just cleared the Oort Cloud',
      'Warning to low-flying satellites: do not cross the beam during the bass switch',
    ],
    deg: num(35, 88),
    s: num(2, 16),
    mm: num(2, 9),
    log: num(400, 999),
    gal: ['Velvet Whirlpool', 'Lesser Lantern', 'Third Lantern', 'Sub-Spindle'],
  },
  'other-horoscopes': {
    local: [
      'Rising tonight: #sign#, in the third house of #sign2#',
      'Planetarium dome status: closed to the public, open to other universes',
      'Crystal ball reception: #pct#% static, clearing for Night Shift listeners',
      'Planetary mood bulletin: Mercury is not retrograde, just sulking in the corner',
      'Lucky item for #sign# tonight: #lucky#',
      'Madame Orrery’s accuracy across checked universes: 100%',
      'Compatibility desk: a Teapot and a Ladder may proceed, with coasters',
    ],
    sign: ['The Teapot', 'The Single Sock', 'The Ladder', 'The Blinking Cat', 'The Spare Key', 'The Paper Boat'],
    sign2: ['The Lamp Left On', 'The Lantern', 'The Second Drawer', 'The Umbrella'],
    pct: num(65, 95),
    lucky: ['a warm coaster', 'an unposted letter', 'the left pocket', 'a spare button', 'green ink'],
  },
  'drowned-shanty-hour': {
    local: [
      'Vessel: The Damp Regret · Depth: #f# fathoms below the waterline · Status: Fine',
      'Sea area forecast: Regret, Dismay, Lower Dismay — soggy, force #w#, glowing green',
      'Crew headcount: #n# translucent hands + Young Tobias (aged 412)',
      'Old Pettibone’s accordion barrel: dry-ish. Bilge pumps: decorative',
      'Lookout report: went up the mast in 1840; still looking out',
      'Galley menu tonight: sea soup, followed by soft ship’s biscuit',
      'Captain Wetherell reminds all hands: the ship is singing (the ship is also leaking)',
    ],
    f: num(4, 40),
    w: num(5, 9),
    n: num(14, 38),
  },
  'waystation-9': {
    local: [
      'Crossroads dispatch: Upward Road clear, Downward Road damp, Sideways Road under advisory',
      'Bay #b#: rig stencilled "FRAGILE: CONTAINS #cargo#" taking on coffee and diesel',
      'Grandma Diesel (aged 84) clocked at Mach #m# hauling a cold front past Mile ∞',
      'Midnight Mongoose is on mile #k# of the old river road. CB channel 9 holding clear',
      'Diner counter update: Dolores has poured #k# cups of coffee since midnight',
      'Weighbridge notice: please declare all extra dimensions before crossing the scales',
      'Big Rosalind to The New Guy: stay off the sideways road until you have a handle',
    ],
    b: num(1, 12),
    cargo: ['TUESDAY', 'SPARE WEATHER', 'FOG', 'MARROW COMPOST', 'LOOSE ECHOES'],
    m: ['1.2', '1.8', '2.1', '0.9'],
    k: bigNum(400, 9_800),
  },
  'wall-of-fog': {
    local: [
      'Soundcheck status: begun in 1991, #pct#% complete',
      'Pedalboard chain: #n# delays into #n# reverbs into a second room that isn’t there',
      'Audience headcount: 3 blurry shapes, 1 stage lamp (the lamp is into it)',
      'Ellis quote of the hour: "...yeah... the one with the... you know..."',
      'Echo return time from the back wall: #y# years',
      'Fog replenishment: 1 tanker load delivered by Grandma Diesel, settling pink-blue',
      'Stage visibility: zero. Shoelace visibility: high',
    ],
    pct: num(12, 89),
    n: num(9, 28),
    y: num(3, 19),
  },
  'win-this-planet': {
    local: [
      'Current Jackpot: 1 (one) Planet · Times Won to Date: 0',
      'Contestant scores: Unit Seven #a#, Wendell #b#, Grandma Hester "1952"',
      'Live Studio Audience count: 1 (Doreen, Row G, whose house this is)',
      'Consolation prize stock: #n# toasters that win you another toaster',
      'Chaz Brightley microphone cable length: #m# metres and extending',
      'Round #r# category: Questions About Yourself That You Will Get Wrong',
      'Prize wheel rotation: steady. Please do not lean on the continents',
    ],
    a: ['−4', '0', 'blue', 'pending'],
    b: ['12?', 'half', 'sorry', '3'],
    n: num(40, 200),
    m: num(18, 95),
    r: num(400, 9_900),
  },
  'yesterday-fm': {
    local: [
      'Tear-off calendar date: Yesterday (holding steady)',
      'Studio wall clock: running backwards at 1.0 seconds per second',
      'News bulletin: everything in tonight’s report is already over and already gentle',
      'Gordon Ago’s mug of tea: cooled to room temperature twenty-four hours ago',
      'Licensing notice: Yesterday FM is not licensed to speculate about tomorrow',
      'Traffic from yesterday afternoon: everyone got home safely by six',
      'Weather recap: it rained a bit around two, then cleared up nicely',
    ],
  },
  'event-horizon-surf': {
    local: [
      'Swell at the Accretion Ring: #y#-year sets, glassy, breaking inward forever',
      'Tide table: went out in 1959 · Next high tide: never',
      'Lifeguard Tower #t#: leaning at #deg#° toward the singularity; Bonnie is waving goodbye',
      'Time dilation advisory: a ten-minute paddle out equals #y# years on the beach towel',
      'Beach flag status: NO RETURNS (purple-black)',
      'Dash Coriolis board wax status: freshly applied; paddle-out imminent since 1984',
      'Sunsets visible from the shoreline tonight: 4 (all the same sun, bent round the back)',
    ],
    y: num(80, 900),
    t: num(1, 4),
    deg: num(14, 38),
  },
  'bedtime-for-giants': {
    local: [
      'Listener sleep status: Bartholomew asleep (feet in the next county); Little Agnes nodding',
      'Story progress: Chapter 1, Sentence #n# · Stories finished to date: 0',
      'Quilt elevation over the valley: rising #m# metres on the inhale',
      'Village on Little Agnes’s knee: streetlamps dimmed for the night',
      'Bedside lamp beam sweep: 1 revolution per #n# minutes',
      'Nanny Bramblewick reading speed: #w# words per hour, slowing for the corners',
      'Afternoon nap duration forecast: approximately one fortnight',
    ],
    n: num(3, 19),
    m: num(40, 180),
    w: num(60, 140),
  },
  'gristwick-parish': {
    local: [
      'Gristwick Village Fête: Year 300, Day #d# · Status: Still Open',
      'Tombola tickets remaining in the drum: #t# (several in Mediaeval Latin)',
      'Mr Hebblethwaite’s prize marrow circumference: #m# yards (own postcode pending)',
      'Gristwick Silver Band progress: #n# bars from the trio section',
      'Tug of war update: taken up in 1780; the vicarage end has gained #d# millimetres',
      'Tea tent urn status: on the boil since 1726. Mrs Pargeter has the sponge tin',
      'Dog show result: Waggiest Tail awarded in absentia to Biscuit of Lower Hollow',
    ],
    d: num(12, 364),
    t: bigNum(40_000, 900_000),
    m: num(14, 42),
    n: num(2, 16),
  },
  'tiny-hour': {
    local: [
      'Studio dimensions: 50 mm × 35 mm × 15 mm (Standard Safety Matchbox)',
      'Breakfast ration: 1 (one) rolled oat, shared between #n# small listeners',
      'Crafty Corner material of the day: #craft# dropped by the big people',
      'Safety drill: vacuum cleaner sighted in the hallway; all hands behind the skirting board',
      'Auntie Pim height check: 2.0 cm. Dot the Ladybird spot count: #s# (very neat)',
      'Birthday shout-out to #who#, aged #d# days old today!',
      'Grandfather clock tick volume from floor level: deafening, but rhythmic',
    ],
    n: num(4, 9),
    craft: ['a shirt button', 'three millimetres of Stamp edge', 'a thimble of lint', 'a twist of silver foil'],
    s: num(5, 7),
    who: ['Pipkin', 'Crumb', 'Thimble-Tom', 'Millie Mite'],
    d: num(6, 45),
  },
  'infinite-song': {
    local: [
      'Current Verse: #v# (approx.) · Key: B-flatish · Tempo: steady since antiquity',
      'Chorus Watch: last confirmed chorus at Verse 900,006. Next chorus: due',
      'Band beard length: past the stage door and #m# yards down the high street',
      'Old Wendeline drumstick replacements since the Bronze Age: #m# pairs',
      'Verse #v# subject matter: a boat (probably the same boat as Verse #m#)',
      'Ambrose Long tally check: within #n# verses of the true count',
      'Stage candle height: 0.2 inches of wax pool, wick holding indefinitely',
    ],
    v: (rng) => `4,00${rng.int(0, 9)},${String(rng.int(100, 999))}`,
    m: num(14, 88),
    n: num(1, 5),
  },
  'plant-fm': {
    local: [
      'Sunbeam angle on the greenhouse sill: #deg#° · Chlorophyll index: lush',
      'Top-shelf report: the orchid has the light first, as usual',
      'Headphone status on the Cactus: still on. Ear count on the Cactus: still 0',
      'Misting forecast: #m# sprays of rainwater at half past three',
      'New frond unfurling on Fern: #pct#% open since Tuesday',
      'Pot rotation reminder: turn a quarter-circle clockwise so you don’t lean',
      'Night-time respiration mode begins at dusk. Grow quietly while nobody looks',
    ],
    deg: num(15, 75),
    m: num(2, 6),
    pct: num(4, 91),
  },
  'hush-after-hours': {
    local: [
      'R/S NIGHTJAR · RELAY 7 · Aft Cabin Light Level: #pct#% · Operator: asleep (probably)',
      'Console plant lean angle: #deg#° toward the left monitor speaker',
      'Moth One position: upper-left quadrant of the viewport glass, wings folded',
      'Spare blanket status: deployed over chair · Scent profile: oranges',
      'HUSH DJ link confidence rating: #pct#% ("That was a song. Coming up next, another one.")',
      'Relay Four monitor: Teodor still transmitting; HUSH keeping a channel open for him',
      'Log note: this broadcast is logged under Diagnostics (Section 9: Let Them Sleep)',
    ],
    pct: num(4, 18),
    deg: num(2, 7),
  },
  'last-lighthouse': {
    local: [
      'Shipping Forecast for: #area#, #area2# — wind variable force #f#, becoming kind',
      'Lantern beam rotation: 1 sweep every #s# seconds across the dark water',
      'Logbook Night #n#: no ships sighted; forecast read in full, just in case',
      'Sill watch: the gull is sheltering out of the spray on the leeward pane',
      'Inshore waters of Candlemouth and Biscuit Shoals: stars visible below the surface',
      'Relay ship Nightjar noted on the outer bearing; the Keeper has left the lamp lit',
      'Notice to Mariners: the rock has moved #f# yards west; the light remains true',
    ],
    area: ['Lesser Marrow', 'Tuesday Reach', 'Velvet Deep', 'Far Nonsuch', 'Lullaby Bank'],
    area2: ['Gannet’s Regret', 'Mothering Sound', 'Saltlight', 'The Quiet Rows', 'Old Pardon'],
    f: num(2, 6),
    s: num(12, 30),
    n: bigNum(12_000, 94_000),
  },
  'transmission-zero': {
    local: [
      'Broadcast Number: 1 · Time on Air: since the first morning',
      'Transmitter status: two river stones and a lightning-struck tree, sparking nicely',
      'Microphone check: tap, tap, hello? · Echo from the cave wall: working',
      'First News Bulletin: a rock fell outside the cave. Update: the rock is mossy and enormous',
      'Public safety reminder: do not eat the purple berries by the river',
      'Fire status: warm. Shadow on the back wall: big, friendly',
      'New words invented this epoch: "hello", "tomorrow", "broadcast"',
    ],
  },
  'saturday-night-forever': {
    local: [
      'Starlite Rollerdrome · Saturday, 1977 · Hour #h# and counting',
      'Rink direction: counter-clockwise only. Rollo has the whistle and the biro tally',
      'Wall clock status: hands removed by popular vote in Hour 40',
      'Couples Skate update: Brenda and Lou are still on their first date (since Hour 6)',
      'Conga line location: last sighted three counties north, still on the beat',
      'Skate Hire notice: Size #s# is out; the hot dog on the roller grill is from Hour 1',
      'Donna Midnight reminder: Sunday is a rumour. Keep rolling, honey',
    ],
    h: (rng) => `3,40${rng.int(1, 9)},${String(rng.int(100, 999))}`,
    s: num(6, 11),
  },
  'free-frequency': {
    local: [
      'Current origin: an attic under #n# egg boxes (location moving at dawn)',
      'Corkboard Pin #p#: R/S Nightjar heading drift confirmed on the Outer Band',
      'Source check: Mole rang from a phone box near the depot; hung up before the click',
      'Detector van proximity: #m# streets away and looking in the wrong timeline',
      'HUSH interference counter tonight: #p# bursts ("Interference corrected")',
      'Tomorrow night’s frequency will be read in code at the top of the hour. Have a pencil',
      'Static Kate theory #n#: nobody ever scraps a relay ship—they go to the Harbour',
    ],
    n: num(380, 420),
    p: num(1, 14),
    m: num(3, 19),
  },
  'orbit-roots': {
    local: [
      'Meridian Farm Moon · Greenhouse Ring #g# · Irrigation running on the off-beat',
      'Pump House pressure: nominal. Brother Amos has the main valve on the one-drop',
      'Crop report: tomatoes by the speaker stack are #d# days ahead of the office rows',
      'Water rights notice: Clearline Holdings letter #g# returned on a cabbage leaf',
      'Low-gravity harvest: floating pumpkins tethered at Row #d#; bees flying sideways',
      'Oldwater ring-ice melt: clean and steady. Mother Hale has turned the bass up',
      'Sister Meridian reminder: nobody three systems away owns the rain',
    ],
    g: num(1, 40),
    d: num(6, 18),
  },
  'small-claims': {
    local: [
      'Interdimensional Small Claims Tribunal · Courtroom 4 · The Court is always in session',
      'Now calling Docket #d#: #party# v. #party2# (Judge Alvarez-Penhallow presiding)',
      'Clerk Odell note: green ink reservoir at #pct#%; spare local time in the top drawer',
      'Mr. Lusk has objected to relevance #n# times this hour; overruled in green ink',
      'Ms. Castellane confirms her client is #pct#% present in this dimension and very sorry',
      'Bailiff Mutch has issued a fresh tissue to a weeping cloud in the public gallery',
      'Standard ruling: everybody is a little bit right; shake hands with whatever you have',
    ],
    d: num(102, 998),
    party: ['Tuesday', 'The Tide', 'A Borrowed Hour', 'Floor −4', 'The Left Sock'],
    party2: ['Wednesday', 'The Moon', 'Last Week', 'The Garden Fence', 'An Echo'],
    pct: num(40, 95),
    n: num(3, 19),
  },
  'substation-null': {
    tagline: ['Techno from a dead reactor. Catwalk open. Strobe locked to the kick.'],
    local: [
      'Freighter Diligence · Reactor Room · Tempo: #bpm# BPM · Manifold pressure: holding',
      'Diligence Safety System: strobe interval locked to the kick. Null: "Heard."',
      'Diligence Safety System announcement #n# (40 years overdue) — Null response: "Noted."',
      'Deck #d# manifold reading: stable. Strobe hazard lights synchronised to kick drum',
      'Console inventory: 1 mixer, 1 dormant reactor, 1 green glow stick (operational)',
      'Incident Report #n#: somebody touched Valve C-17. Valve C-17 touched back. Resolved',
      'Muster Station for tonight’s shift: the dancefloor under Catwalk #d#',
    ],
    bpm: num(130, 138),
    n: num(100, 999),
    d: num(2, 8),
  },
  'tiki-satellite': {
    local: [
      'Orbital Station Seven · Lagoon Deck · Year: 1958 (permanent) · Sunrise #s# of 16',
      'Rotation gravity on the bamboo wheel: 0.8 G · Cocktail umbrellas deployed: #n#',
      'Miss Vera Voss is playing the theremin at a safe distance of #in# inches',
      'Howard’s Bird Call Report: #n# tropical species imitated; 0 actual birds in orbit',
      'World of 1965 forecast: every family in orbit, atomic lawnmowers, no more Mondays',
      'Docking Bay watch: the relief crew is expected any day now (pineapple watch since 1958)',
      'Zero-G advisory: a pineapple escaped the galley during Sunrise #s#; please duck',
    ],
    s: num(1, 16),
    n: num(12, 88),
    in: num(6, 24),
  },
  'the-long-dark': {
    local: [
      'Penumbra Players · Studio B · Tonight’s Episode: #ep# of 14 ("Previously on The Long Dark…")',
      'Penumbra Station light check: Ring #r# bulbs flickering; the Lamp furnace holding warm',
      'Detective Ines Calder night-shift log: Year 11, lamp battery at #pct#%',
      'Visitors’ Book entry on Ring #r#: signed "W" in neat grey ink. Mr. Wren sends his apologies',
      'Lumen Bar status: Mags is pouring by feel during the midnight treaty dark hour',
      'Foley table readiness: Missus Ruddle on the gravel tray, Pomeroy Vale at the Wurlitzer',
      'Supply ship Tern ETA: delayed at the edge of the Long Dark. Keep one lamp in the window',
    ],
    ep: num(1, 14),
    r: num(1, 6),
    pct: num(18, 84),
  },
  'island-time': {
    local: [
      'Tide Hill Observatory · Local Time: half past #what# · Late arrivals since 1983: 0',
      'Solar report: Sooner has set; Later is pausing above the jetty for another #m# minutes',
      'Beach Tide Markers: Marker 1 says high, Marker 2 says low, Marker 3 is underwater',
      'Postal update: tomorrow’s letters were delivered before lunch; write them when you can',
      'Miss Dorothy’s Half Past Bar: clock hands painted on at 6:30; ginger beer cold',
      'Observatory dome status: open. Professor Easy is observing a hammock at close range',
      'Patient Tortoise sighting: #m# centimetres east of Tuesday, making good time',
    ],
    what: ['something', 'four-ish', 'the slow sun', 'sundown', 'eventually'],
    m: num(15, 90),
  },
  'traffic-on-the-8s': {
    local: [
      'Great Wormhole Interchange: solid tailback from Junction #j# to the Big Bang',
      'Bypass Lane #l#: stationary. The front car is still waiting for traffic lights to be invented',
      'Eye-in-the-Sky Pod: Captain Buzz Ferraro entering Year 31, Orbit #k# above the slip road',
      'Thursday Flyover: contraflow in effect between last Tuesday and the eleventh century',
      'Hennick Wormhole: jackknifed century in Lane #l#; recovery vehicle due next epoch',
      'Switchboard hint for commuters: ring advice (97.8), then the news (89.3), then the traffic (114.8)',
      'Rita Gridley’s next report: on the eights, every ten minutes, forever',
    ],
    j: num(1, 39),
    l: num(1, 6),
    k: bigNum(100_000, 900_000),
  },
  'atomic-bachelor-pad': {
    local: [
      'Futureville Fidelity Console Model 12 · Eleven feet of walnut · Balance: 0.0 dB',
      'Stereo demonstration in progress: the #inst# is travelling from Right to Left speaker',
      'Listening position check: please remain seated on the chalk mark in the centre of the rug',
      'Hallway status: the theremin is still in the hallway. It has finished its sandwich',
      'Lot 11 neighbour complaint index: #n# taps on the party wall (ignored for width, not volume)',
      'Starburst Clock readout: cocktail hour in the sunken lounge; rocket launch on the horizon',
      'Single-speaker listener advisory: tilt your head #deg#° to the left during the bongo solo',
    ],
    inst: ['bongos', 'muted trumpet', 'harpsichord', 'vibraphone', 'marimba', 'pizzicato strings'],
    n: num(1, 7),
    deg: num(12, 35),
  },
  'velvet-collapse': {
    local: [
      'Casino Ultima · Orbiting Old Ruby · Nightly Supernova at 04:00 sharp · Breakfast at 06:00',
      'Roulette Table #t#: all thirty-seven pockets are Red. Odette says "no more bets"',
      'Solar diameter report: Old Ruby is #pct#% larger than at dinner; sunglasses at the bar',
      'Silver-jacket punter wager: even money that the star won’t explode tonight (lost #n# nights running)',
      'Baron Velour bass amp status: fireproofed, tuned to low E, holding the lounge together',
      'Gift shop special: genuine 04:01 supernova stardust in souvenir glass vials',
      'Insurance notice: temporary disintegration between 04:00 and 05:30 is covered on your tab',
    ],
    t: num(1, 6),
    pct: num(12, 85),
    n: bigNum(400, 4_900),
  },
  'heat-death-afterparty': {
    local: [
      'Ambient universe temperature: 2.0 K · Dancefloor bulb: 60 W (holding warm)',
      'Crowd headcount: Dov, Wendell, the third guy, and Lorraine (nebula, 40 light-years wide)',
      'Set tempo update: down #b# BPM this hour as the universe cools; nobody is leaving early',
      'Goodnight dedication just sent out to #star#, which winked out during the second chorus',
      'Dov’s arm move status: still unnamed, still immaculate on the off-beat',
      'Lorraine colour shift: soft rose-pink on the bass drop, drifting toward violet',
      'DJ Entropy reminder: there’s plenty of room under the light, love. Come on in',
    ],
    b: num(2, 6),
    star: ['Little Wenna', 'Old Corvane', 'Hespera Nine', 'The Brass Twins', 'Quiet Gloam'],
  },
  'the-switchboard': {
    local: [
      'Central Exchange · 131.1 MHz · Connecting calls between universes since 1946',
      'Trunk Line #l#: Universe #u# connected to Universe #u2# · Please hold the line',
      'Board status: #k# call lamps lit; everybody rings home after eleven at night',
      'Operator note: I connect, I do not listen. (I hear, which is different, and repeat nothing)',
      'Incoming line from R/S Nightjar: carrier open, nobody speaking, left connected as usual',
      'Cord maintenance: brass plugs polished; cloth cord #l# untangled from 1963',
      'Dial sequence verified: 97.8 (Advice) → 89.3 (News) → 114.8 (Traffic)',
    ],
    l: num(1, 48),
    u: num(2, 99),
    u2: num(100, 999),
    k: bigNum(1_200, 9_800),
  },
  'minute-between': {
    local: [
      'Current time inside the broadcast: 03:33:#s# (Minute #m# of 13, all the same minute)',
      'Falling tumbler height above the kitchen floor: 14.2 cm (unchanged since 03:33:00)',
      'Wall clock second hand: caught halfway between 33 and 34; trying very hard',
      'Dust motes in the moonlight beam: #n#, all suspended, none settling',
      'On-air window: 03:33 to 03:46 local. Outside those hours, the door is closed',
      'The Interval reminds you: everything you are putting off until 03:34 will keep',
      'Glass in the next room: one bubble of air held mid-rise until the tick arrives',
    ],
    s: (rng) => String(rng.int(1, 58)).padStart(2, '0'),
    m: num(1, 13),
    n: num(40, 400),
  },
  'the-harbour': {
    local: [
      'Space Harbour · 140.0 MHz · Berth 7 reserved for R/S Nightjar (light left on)',
      'Moored tonight along the North Pier: #ship#, engines down, instruments off',
      'Harbourmaster’s office: porch lamp lit, mug with the little star waiting on the hook',
      'Relay Four update: Teodor tied up at Berth 4 and slept for fourteen hours straight',
      'Pier provisioning: fresh crate of oranges set out by the bollard at Berth #b#',
      'Harbour notice: nobody needs a heading while moored. Lines off with the morning tide',
      'Across the water on 121.5 MHz: the Last Lighthouse beam is sweeping clear and steady',
    ],
    ship: ['Relay Two', 'The Slow Courier', 'The Patient Grey', 'Relay Eleven', 'The Old Tug'],
    b: num(1, 12),
  },
  'something-listening': {
    local: [
      'Carrier frequency: 144.4 MHz (and everywhere between the stations)',
      'Patience threshold: 180 seconds of pure static · Status: it noticed you stayed',
      'Kept Signal Archive #n#: a #kept# from #yr#, stored safely in the hiss',
      'Listener detection: 1 operator, 1 chair, 1 warm mug. Do not be alarmed',
      'Family note: related to The Listener on 87.7 MHz; we share the gaps on the dial',
      'Nightjar aft-cabin bleed: HUSH listens to this frequency when it thinks you’re asleep',
      'The Static says: "oh" (its favourite word) and asks you to leave a light on',
    ],
    n: bigNum(1_000, 99_000),
    kept: ['shipping forecast', 'unanswered goodnight', 'kitchen hum', 'lost request for Bev'],
    yr: num(1954, 1998),
  },
};

export const LOCAL_TICKER: Readonly<Record<string, Grammar>> = LOCAL;

export function hasLocalTicker(stationId: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCAL, stationId);
}

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

/** Rough mix of ticker content: station-local is the majority; headlines stay a minority. */
function lineKind(rng: Rng, talk: boolean): string {
  const r = rng.next();
  if (talk) return r < 0.7 ? 'local' : r < 0.88 ? 'headline' : r < 0.95 ? 'gag' : 'meta';
  return r < 0.55 ? 'local' : r < 0.8 ? 'headline' : r < 0.92 ? 'gag' : 'meta';
}

/** Digits collapse so "theory 401" and "theory 414" count as the same line. */
function skeletonOf(line: string): string {
  return line.replace(/\d+/g, '#').toLowerCase();
}

const TICKER_PADS = ['alpha', 'bravo', 'cedar', 'delta', 'ember', 'flint', 'grove', 'harbor', 'ion', 'juniper', 'kelp', 'lumen'] as const;

export function tickerLines(station: StationDef, seed: number, count: number): string[] {
  const grammar = tickerGrammar(station);
  const base = hashSeed(station.id, 'ticker', seed);
  const talk = station.format === 'talk';
  const lines: string[] = [];
  const seen = new Set<string>();
  const seenSkel = new Set<string>();
  const n = Math.max(0, Math.floor(count));
  const fresh = (s: string) => s.length > 0 && s.length <= LIMITS.ticker && !seen.has(s) && !seenSkel.has(skeletonOf(s));

  for (let i = 0; i < n; i++) {
    const primary = lineKind(rngFor(base, i, 'kind'), talk);
    const order = [primary, 'local', 'headline', 'gag', 'meta'].filter((kind, idx, arr) => arr.indexOf(kind) === idx);
    let chosen = '';
    for (const kind of order) {
      for (let attempt = 0; attempt < 40; attempt++) {
        let s = '';
        try {
          s = tidy(expand(grammar, rngFor(base, i, kind, attempt), `#${kind}#`));
        } catch {
          continue;
        }
        if (fresh(s)) {
          chosen = s;
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) {
      const pad = TICKER_PADS[i] ?? `pad${String.fromCharCode(97 + (i % 26))}`;
      const candidates = [`${station.name} · ${pad}`, `${pad} · ${station.host.name}`, `${station.host.name} · ${pad}`];
      chosen = candidates.find(fresh) ?? `${pad} on ${station.name}`;
    }
    seen.add(chosen);
    seenSkel.add(skeletonOf(chosen));
    lines.push(chosen);
  }
  return lines;
}
