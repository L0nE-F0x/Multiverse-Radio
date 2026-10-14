// Track-naming packs for the v4 Outer Band groove stations (writers-groove):
// saturday-night-forever (disco), velvet-collapse (space-funk), substation-null
// (warehouse-techno) and heat-death-afterparty (heat-death-house).
//
// Same shape as the v3 packs (see v3a.ts): title → #main# or #rare#, hand-written `fixed`
// titles in light rotation, an optional `suffix`, and a roster of `resident` artists who play
// about two tracks in five (the music engine gives each artist name its own sound signature,
// and the hosts name-check some of them in content/voice/*.toml, so keep the names stable).
//
// Rule names avoid the common grammar's (`when`, `n`, `where`, `instrument`, ...) so shared
// liner notes keep their own wording.

import type { RecipeId } from '../../broadcast/types';
import { num, type Rule } from '../grammar';
import { TITLE_SHAPE } from './common';
import type { TrackPack } from './types';

/** Two tracks in five go to the station's resident artists. */
const ARTIST_SHAPE: readonly string[] = ['#resident#', '#resident#', '#made#', '#made#', '#made#'];

/** An hour of the endless Saturday night: "3,406,112". */
const bigHour: Rule = (rng) => `3,4${rng.int(0, 1)}${rng.int(0, 9)},${String(rng.int(0, 999)).padStart(3, '0')}`;

/** A reactor-room code: "C-17", "N-4". */
const plantCode: Rule = (rng) => `${rng.pick(['A', 'B', 'C', 'D', 'K', 'N', 'R', 'X'])}-${rng.int(1, 99)}`;

// ── Saturday Night Forever (disco) ────────────────────────────────────────────

export const saturdayNightForever: TrackPack = {
  fallbackTitle: 'Still Saturday',
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#gerund# Under the #overhead#',
      '#gerund# Till #notYet#',
      '#shine# #glam#',
      '#glam# #forever#',
      '#who# #danceNoun#',
      '#glam#, Saturday #satTail#',
      '#shine# Love #loveTail#',
      '#shine# #glam# on Eight Wheels',
      '#shine# #glam# (#mixName#)',
      'Hour #bigHour#',
      '#glam# at the #rinkSpot#',
      '#who#, #gerund#',
    ],
    rare: [
      'Nobody Asks #who#', 'Sunday Is #rumour#', '#glam# (Never Ending)', 'Hour #bigHour#, Still', 'Lemonade for #who#',
      'Love #loveTail#', 'Saturday #satTail#', '#gerund# Counter-Clockwise',
    ],
    rumour: ['a Rumour', 'a Myth', 'a Legend', 'a Story', 'a Fairy Tale', 'a Theory', 'a Ghost', 'Made Up', 'Somewhere Else', 'Not Coming'],
    fixed: [
      'Nobody Asks the Time',
      'The Clock With No Hands',
      'Conga Line, Three Counties North',
      'Brenda and Lou (First Date)',
      'Load Bearing',
      'Size Nine Is Out',
      'Thinking Is for Sundays',
      'The Same Hot Dog Since Hour One',
    ],
    gerund: [
      'Dancing', 'Spinning', 'Gliding', 'Shimmering', 'Rolling', 'Glittering', 'Sparkling', 'Strutting', 'Swaying',
      'Skating', 'Twirling', 'Shining', 'Drifting', 'Floating', 'Turning', 'Circling', 'Grooving', 'Waltzing on Wheels',
    ],
    overhead: [
      'Mirror Ball', 'Strobe', 'Skylight', 'Spotlight', 'Chasing Bulbs', 'Silver Ceiling', 'Glitter Rain', 'Neon Sign',
      'Clock With No Hands', 'Disco Moon', 'Velvet Sky', 'Paper Stars',
    ],
    notYet: [
      'Sunday', 'the Lights Come Up', 'the Clock Gets Hands', 'Hour Four Million', 'the Conga Comes Back',
      'Somebody Asks', 'the Ice Melts', 'Morning Forgets Us', 'the Strings Get Tired', 'the Snack Bar Closes',
      'Somebody Says Goodnight', 'Lou Asks',
    ],
    shine: [
      'Gold', 'Silver', 'Champagne', 'Rose Gold', 'Ivory', 'Peach', 'Candy', 'Lilac', 'Amber', 'Midnight Blue',
      'Satin', 'Sequin', 'Endless', 'Eternal', 'Electric', 'Glitter',
    ],
    glam: [
      'Mirror Ball', 'Saturday', 'Midnight', 'Starlight', 'Satin', 'Sequins', 'Glitter', 'Velvet Rope', 'Roller Rink',
      'Dance Floor', 'Spotlight', 'Moonlight', 'Platform Heels', 'Hairspray', 'Lemonade', 'Lip Gloss', 'Feather Boa',
      'Glow', 'Rhinestones', 'Roller Skates',
    ],
    forever: ['Forever', 'All Night', 'Without End', 'Again', 'Tonight', 'Still', 'for Always', 'Unending', 'Encore', 'Eternity'],
    who: [
      'Snack Bar', 'Rink Guard', 'Car Park', 'Mirror Ball', 'Grandmother', 'Lemonade', 'Skate Hire', 'Conga Line',
      'Fire Door', 'Brenda', 'Lou', 'Rollo', 'Donna', 'Saturday', 'Strings Section', 'Carpet Bench', 'Newcomer',
    ],
    danceNoun: ['Shuffle', 'Glide', 'Strut', 'Spin', 'Bump', 'Sway', 'Promenade', 'Bounce', 'Slide', 'Twirl', 'Shimmy', 'Roll', 'Stomp', 'Swing'],
    satTail: [
      'Again', 'Still', 'in Gold', 'on Wheels', 'Strings', 'Without Sunday', 'Under Glass', 'Never Ends', 'in Slow Motion',
      'Forever and Ever', 'in Satin', 'After Saturday', 'Supreme', 'in the Car Park',
    ],
    loveTail: [
      'Counter-Clockwise', 'at the Snack Bar', 'on Eight Wheels', 'in Hour Six', 'Under the Mirror Ball', 'in Satin',
      'Without a Clock', 'for Three Hundred Years', 'in the Couples Skate', 'by the Fire Doors', 'Never Stops Asking',
      'at the Skate Hire Counter',
    ],
    rinkSpot: [
      'Snack Bar', 'Skate Hire', 'Fire Doors', 'DJ Booth', 'Carpet Benches', 'Centre Circle', 'Rink Gate', 'Car Park',
      'Cloakroom', 'Rollerdrome', 'Photo Booth', 'Coat Check',
    ],
    bigHour,
    mixName: [
      'Twelve-Inch Mix', 'Extended Saturday Mix', 'Rink Edit', 'Couples Skate Version', 'Strings Up Mix', 'Forever Mix',
      'Instrumental', 'Mirror Ball Dub', 'Even Longer Version', 'Hour Mix',
    ],
    suffix: ['#mixName#'],
    artist: ARTIST_SHAPE,
    resident: [
      'Velveteen Moss',
      'The Midnight Hustle Orchestra',
      'Sister Sequin',
      'Lucius Glide',
      'The Rollerettes',
      'Augustus Gold and the Glitter Brass',
      'Champagne Lenore',
      'The Counter-Clockwise Band',
    ],
    made: ['#discoFirst# #discoLast#', '#discoFirst# #discoLast#', '#discoFirst# #discoLast# and the #discoBand#', 'The #discoBand#', '#discoFirst# #shine#'],
    discoFirst: [
      'Rhonda', 'Lorna', 'Carmen', 'Vince', 'Felix', 'Cherie', 'Dolores', 'Ramon', 'Yvette', 'Bettina', 'Clarice', 'Desmond',
      'Inez', 'Lamont', 'Odessa', 'Reggie', 'Thelma', 'Cyril', 'Marisol', 'Delroy',
    ],
    discoLast: [
      'Starr', 'Diamond', 'Shimmer', 'Sheen', 'Silk', 'Lamour', 'Valentine', 'Sparkle', 'Glow', 'Lux', 'Daye', 'Knight',
      'Satin', 'Mirabel', 'Glitter', 'Fontaine',
    ],
    discoBand: [
      'Saturday Strings', 'Satin Orchestra', 'Silk Sound', 'Glitter Section', 'Skate Kings', 'Saturday Brass',
      'Rink Rhythm Section', 'Night Shift Horns', 'Sequin Singers', 'Rollerdrome Players', 'Lemonade Five', 'Snack Bar Soul',
    ],
    album: [
      'Saturday Night Forever, Vol. #vol#',
      'Hour #bigHour#',
      'Starlite Rollerdrome Classics',
      'Counter-Clockwise',
      'Songs for a Night That Never Ended',
      'The Couples Skate Collection',
      'Extended Mixes (Very Extended)',
      '#shine# #glam#',
    ],
    vol: num(1, 40),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'First played in hour #bigHour#. Still being played.',
      'The string section has not stopped since 1977. They take turns sleeping.',
      'Recorded under the mirror ball, which takes a small cut.',
      "Brenda and Lou's song, as of hour six.",
      'Donna Midnight says this one never gets old. Nothing in here does.',
      'The extended mix runs for eleven hours. Nobody has heard the end.',
      'Requested by Bev. She says it is not the one. She danced anyway.',
    ],
  },
};

// ── The Velvet Collapse (space-funk) ──────────────────────────────────────────

export const velvetCollapse: TrackPack = {
  fallbackTitle: 'Four O’Clock Sharp',
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#star# #funkNoun#',
      '#plush# #star# #funkNoun#',
      '#plush# #star#',
      '#funkGerund# at the Edge of #edge#',
      '#bet# on #betOn#',
      '#funkNoun# From the #lounge#',
      '#plush# #funkNoun# (#funkMix#)',
      '#star# in the #lounge#',
      '#funkGerund# Into the #star#',
      '#star# #funkNoun#, Four O’Clock #fourTail#',
    ],
    rare: ['Ruby, #rubyTail#', 'T-Minus #tMinus#', 'Four O’Clock #fourTail#', 'Lightly #exploded#', 'Fireproof #funkNoun#'],
    exploded: ['Exploded', 'Toasted', 'Singed', 'Radiant', 'Scorched', 'Collapsed', 'Rekindled', 'Reassembled'],
    fixed: [
      'Again? (The Insurance Card)',
      'Only Red',
      'Supernova Dust, Lightly Exploded',
      'One More Chorus',
      'Sunglasses On',
      'Breakfast After the End of the World',
      'The Silver Jacket Bet',
      'Do Not Tip the Star',
    ],
    star: [
      'Red Giant', 'Supernova', 'Stardust', 'Solar Flare', 'Corona', 'Photon', 'Neutron', 'Plasma', 'Big Flare',
      'White Dwarf', 'Helium', 'Fusion', 'Afterglow', 'Starfire', 'Cosmic Ray', 'Gamma Burst', 'Red Shift', 'Shockwave',
    ],
    funkNoun: [
      'Groove', 'Strut', 'Shuffle', 'Boogie', 'Slink', 'Jam', 'Bump', 'Stomp', 'Swagger', 'Slide', 'Breakdown',
      'Workout', 'Vamp', 'Sway', 'Shimmy', 'Two-Step',
    ],
    plush: [
      'Velvet', 'Plush', 'Slinky', 'Smooth', 'Satin', 'Silky', 'Swollen', 'Molten', 'Crimson', 'Lush', 'Burgundy',
      'Fireproof', 'Glowing', 'Red Hot', 'Deep Red',
    ],
    funkGerund: ['Slinking', 'Grooving', 'Strutting', 'Sliding', 'Swaying', 'Gliding', 'Shimmying', 'Lounging', 'Bumping', 'Easing'],
    edge: ['the Star', 'Everything', 'the Velvet', 'Four O’Clock', 'the Wheel', 'the Light', 'Ruby', 'the Lounge', 'the World', 'the Window'],
    fourTail: ['Flash', 'Countdown', 'Velvet', 'Sharp', 'Supernova', 'Shades', 'Last Call', 'Funk', 'Whiteout', 'Again'],
    bet: ['All In', 'Even Money', 'Double Down', 'Long Odds', 'Last Bet', 'Side Bet', 'House Money', 'Sure Thing', 'Betting'],
    betOn: ['Red', 'Breakfast', 'the Star', 'Ruby', 'the Flash', 'Tomorrow', 'the Wheel', 'the Band', 'Sunglasses', 'Four O’Clock', 'the Morning After'],
    lounge: [
      'Velvet Lounge', 'Roulette Table', 'Red Window', 'Back Booth', 'Cloakroom', 'Gift Shop', 'Stage Door', 'High Rollers’ Room',
      'Casino Floor', 'Cocktail Bar', 'Observation Deck', 'Powder Room',
    ],
    rubyTail: [
      'You Look Radiant', 'Hold It Together', 'Not Tonight', 'Breathe In', 'We Know', 'Come Back by Breakfast',
      'Take a Bow', 'You’ve Grown', 'Nobody Noticed', 'Stay Red',
    ],
    tMinus: ['Ten', 'Five', 'One', 'Sixty', 'Eleven Years', 'Four O’Clock', 'Funk', 'Forever'],
    funkMix: [
      'Supernova Mix', 'Afterglow Dub', 'Red Shift Mix', 'Extended Collapse', 'Sunglasses Version', 'Lounge Take',
      'Morning-After Mix', 'Instrumental', 'Live in the Velvet Lounge', 'Four O’Clock Edit',
    ],
    suffix: ['#funkMix#'],
    artist: ARTIST_SHAPE,
    resident: [
      'Velour and the Late Expansion',
      'Delphine Starr',
      'Ignatius Bell',
      'Lady Photon',
      'Doctor Afterglow',
      'The Helium Horns',
      'The Crimson Corona',
      'Odette and the Croupiers',
    ],
    made: ['#rank# #cosmicName#', '#rank# #cosmicName#', 'The #star# Collective', '#rank# #cosmicName# and the #star# Band', '#cosmicName# Funk Unit'],
    rank: ['Baron', 'Countess', 'Captain', 'Doctor', 'Lady', 'Sir', 'Professor', 'Count', 'Duchess', 'Major', 'Madame', 'Admiral'],
    cosmicName: [
      'Quasar', 'Velvet', 'Plasma', 'Nova', 'Corona', 'Flare', 'Spectrum', 'Ember', 'Cinder', 'Gravity', 'Comet', 'Orbit',
      'Glow', 'Lumen', 'Parsec', 'Halo',
    ],
    album: [
      'Live at Casino Ultima',
      'Four O’Clock Sharp',
      'Music to Explode By',
      'Red Giant, Velvet Rope',
      'The Collapse Sessions, Vol. #vol#',
      'Afterglow',
      'Fireproof',
      'Even Money',
    ],
    vol: num(1, 11),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded at 03:59. Some of the brass was briefly made of light.',
      'The bassist owns the casino. Nobody has ever asked him to turn down.',
      'Remastered after the supernova. And the next one. And the next.',
      'The roulette wheel can be heard in the left channel. It lands on red.',
      'The band wore sunglasses for this session. They always do.',
      'Odette took bets on how long the solo would run. The house won.',
    ],
  },
};

// ── Substation Null (warehouse-techno) ────────────────────────────────────────

export const substationNull: TrackPack = {
  fallbackTitle: 'Coolant Nominal',
  albumChance: 0.5,
  noteChance: 0.4,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#system# #reading#',
      '#system# #reading#',
      '#reading# #system#',
      '#system# #plantCode#',
      'Deck #deck#, #room#',
      '#oneWord# #plantCode#',
      'Do Not #warnVerb# the #system#',
      'Log #logNum#',
      '#system# (#reading#)',
      'Incident #logNum#',
      '#system# at #tempo#',
      '#oneWord# #logNum#',
    ],
    rare: ['Stop Asking About the #system#', 'Yes (#plantCode#)', 'Too Loud (#reading#)', 'Resolved: #system#', 'Noted, #oneWord#'],
    fixed: [
      'Coolant Is Fine',
      'Stop Asking',
      'The Glow Stick',
      'One Second (Logged)',
      'Muster Station: Dance Floor',
      'Cold Was a Phase',
      'Here Is Anything',
    ],
    system: [
      'Coolant', 'Core', 'Reactor', 'Pump', 'Valve', 'Turbine', 'Catwalk', 'Bulkhead', 'Vent', 'Relay', 'Conduit',
      'Pressure', 'Hull', 'Strobe', 'Hazard', 'Manifold', 'Ballast', 'Gantry', 'Boiler', 'Rivet', 'Hatch', 'Coil',
    ],
    reading: [
      'Nominal', 'Stable', 'Rising', 'Holding', 'Warm', 'Fine', 'Venting', 'Dormant', 'Engaged', 'Offline', 'Steady',
      'Correct', 'Unchanged', 'Pulsing', 'Sealed', 'Humming', 'Loaded', 'Primed',
    ],
    plantCode,
    deck: num(1, 12),
    room: ['Reactor Room', 'Coolant Bay', 'Engine Hall', 'Cargo Hold', 'Pump Room', 'Catwalk', 'Bilge', 'Boiler Room', 'Airlock', 'Muster Station'],
    oneWord: [
      'Null', 'Hum', 'Steam', 'Pressure', 'Strobe', 'Kick', 'Rivet', 'Hull', 'Dormant', 'Ballast', 'Sump', 'Torque',
      'Gauge', 'Flange', 'Isotope', 'Cathode', 'Kelvin', 'Feedback',
    ],
    warnVerb: ['Touch', 'Lean On', 'Drink', 'Tuck In', 'Read To', 'Ask About', 'Open', 'Feed', 'Wake', 'Polish', 'Hug'],
    logNum: num(1000, 9999),
    tempo: num(126, 142),
    nullMix: ['Reactor Mix', 'Dub', 'Coolant Loop', 'Steam Edit', 'Long Version', 'Null Edit', 'Peak Load Mix', 'Hazard Mix', 'Tool', 'Deep Hull Mix'],
    suffix: ['#nullMix#'],
    artist: ARTIST_SHAPE,
    resident: ['Null', 'Bulkhead', 'Pressure Vessel', 'The Diligence Crew', 'Unit Eleven', 'Hazard Light', 'Rivet', 'Dormant'],
    made: ['#handle#', '#handle#', '#handle# #plantCode#', 'Unit #unitNum#', '#handle# vs. #handle2#'],
    handle: [
      'Valve', 'Ferrous', 'Turbine', 'Isotope', 'Manifold', 'Cathode', 'Gantry', 'Flange', 'Sump', 'Ballast', 'Torque',
      'Kelvin', 'Coil', 'Gauge', 'Hatch', 'Conduit', 'Sector Grey', 'Low Bay',
    ],
    handle2: ['The Reactor', 'Coolant', 'Deck Four', 'The Catwalk', 'Steam', 'The Hull', 'Night Crew', 'Strobe'],
    unitNum: num(2, 40),
    album: [
      'Readings, Vol. #vol#',
      'Reactor Room Sessions',
      'Nominal',
      'Incident Reports',
      'Deck #deck#',
      'Cooldown',
      'Peak Load',
      'Maintenance Window (Nothing Maintained)',
    ],
    vol: num(1, 24),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded in the reactor room. The reactor is credited.',
      'Coolant levels during recording: fine.',
      'Sleeve notes for this release, in full: Yes.',
      'Peak load reached at minute four. The catwalk held.',
      'A glow stick is present on this recording. It cannot be heard. It is there.',
      'Mastered at core temperature: warm.',
    ],
  },
};

// ── Afterparty at the Heat Death (heat-death-house) ───────────────────────────

export const heatDeathAfterparty: TrackPack = {
  fallbackTitle: 'Thanks for the Light',
  albumChance: 0.5,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#fading# #warmth#',
      '#fading# #warmth#',
      '#warmth# for #dedicatee#',
      '#stillDoing# for #dedicatee#',
      '#stillDoing# at the End of #endOf#',
      '#stillDoing# in the #darkPlace#',
      '#warmth# in the #darkPlace#',
      '#warmth# (Lorraine Is #lorraine#)',
      '#fading# #warmth# (#slowMix#)',
      '#bpmSlow# BPM and Falling',
      'The #fading# #warmth# in the Universe',
    ],
    rare: ['Everything Ends Up #endsUp#', 'Plenty of Room for #dedicatee#', 'Two Degrees Above #nothing#', 'Mind the #warmth#', 'Lorraine Is #lorraine#'],
    endOf: ['Everything', 'the Universe', 'Time', 'the Night', 'the Dial', 'the Dark', 'the Line', 'the Song', 'All the Stars', 'the Party', 'the Road', 'Forever'],
    endsUp: ['Here', 'Dancing', 'Warm', 'Together', 'in the Long Fade', 'Under the Bulb', 'Slower', 'All Right'],
    fixed: [
      'Three Guys and a Nebula',
      'The Song Getting Comfortable',
      'It Hasn’t Got a Name (The Dov)',
      'Thanks for the Light',
      'The Third Guy Spins',
      'Patience (One More Drop)',
      'Morning, Anyway',
      'You Had a Name All Along',
    ],
    fading: [
      'Last', 'Final', 'Fading', 'Slow', 'Cooling', 'Long', 'Late', 'Little', 'Gentle', 'Distant', 'Remaining',
      'Lingering', 'Faint', 'Quiet', 'Warmest', 'Softest',
    ],
    warmth: [
      'Light', 'Warmth', 'Glow', 'Ember', 'Star', 'Kick Drum', 'Groove', 'Dance', 'Spark', 'Photon', 'Bulb', 'Heartbeat',
      'Hug', 'Chorus', 'Flicker', 'Hum', 'Candle', 'Wave',
    ],
    dedicatee: [
      'Little Wenna', 'Old Corvane', 'Hespera Nine', 'the Twins', 'Gloam', 'Patience', 'Lorraine', 'Dov', 'Wendell',
      'the Third Guy', 'Everyone Who Left', 'the Last Star', 'the Newcomer', 'Anyone Still Out There', 'the Dark',
    ],
    stillDoing: [
      'Dancing', 'Holding On', 'Swaying', 'Glowing', 'Waiting', 'Humming', 'Staying', 'Breathing', 'Slow Dancing', 'Lingering',
      'Smiling', 'Keeping Warm', 'Looking Up', 'Holding Hands', 'Leaning In', 'Staying Up Late', 'Spinning Slowly', 'Still Here',
    ],
    darkPlace: [
      'Dark', 'Quiet Arm', 'Long Spiral', 'Brass Reach', 'Cold', 'Big Empty', 'Last Room', 'Afterglow', 'Final Hour',
      'Long Fade', 'Last Warm Place', 'Middle of Nowhere', 'Slow Hours', 'Outer Dark', 'Corner of the Sky', 'Spare Room',
      'Long Night', 'Small Hours',
    ],
    nothing: ['Nothing', 'Zero', 'the Dark', 'Absolute', 'Goodbye', 'Everything', 'the Floor', 'Freezing'],
    lorraine: ['Pink', 'Blue', 'Swaying', 'Glowing', 'Making a Star', 'Listening', 'Here', 'Forty Light Years Wide', 'Humming'],
    bpmSlow: num(62, 118),
    slowMix: [
      'Slow Mix', 'Long Fade Mix', 'Last Light Dub', 'Minus Ten BPM', 'Afterparty Edit', 'Cooling Version', 'Final Mix',
      'Ambient Ending', 'For Lorraine', 'Warm-Up Mix',
    ],
    suffix: ['#slowMix#'],
    artist: ARTIST_SHAPE,
    resident: [
      'DJ Entropy',
      'Lorraine',
      'The Three Guys',
      'Last Light Ensemble',
      'Kelvin and Ember',
      'The Slow Photons',
      'Little Wenna Sound System',
      'Absolute Zero Social Club',
    ],
    made: ['#endFirst# #endLast#', '#endFirst# #endLast#', '#endFirst# and the #ensemble#', 'The #ensemble#', '#endLast#'],
    endFirst: [
      'Marlowe', 'Ines', 'Teo', 'Wren', 'Juno', 'Ezra', 'Isadora', 'Kip', 'Leontine', 'Rafe', 'Selma', 'Otto', 'Mabel',
      'Cyprian', 'Halcyon', 'Vesper',
    ],
    endLast: [
      'Dimm', 'Lowlight', 'Afterglow', 'Kelvin', 'Stillwater', 'Fadeaway', 'Dusk', 'Hollow', 'Lastly', 'Embers', 'Slowe',
      'Quietly', 'Longwave', 'Coldharbour',
    ],
    ensemble: [
      'Cooling Stars', 'Long Fade Collective', 'Ember Trio', 'Remaining Few', 'Afterglow Club', 'Slow Kicks',
      'Last Bulb Orchestra', 'Warm Hands', 'Final Few', 'Night Without Morning',
    ],
    album: [
      'The Long Fade',
      'Two Degrees Above Zero',
      'Music for the Last Warm Place',
      'Afterparty, Vol. #vol#',
      'Everything Ends Up Here',
      'Morning, Anyway',
      'Dedications',
      'The Lorraine Sessions',
    ],
    vol: num(1, 30),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded a little slower than it was written. Everything is.',
      'Lorraine can be heard swaying on the chorus. She is forty light years wide.',
      'Dedicated to a star that went out during the second verse.',
      'The tempo dropped by four beats a minute during this recording. Nobody minded.',
      'The third guy did a spin during this one. It is not on the recording. It happened.',
      'Played under the last warm bulb in the universe.',
    ],
  },
};

export const V4A_STATION_PACKS: Readonly<Record<string, TrackPack>> = {
  'saturday-night-forever': saturdayNightForever,
  'velvet-collapse': velvetCollapse,
  'substation-null': substationNull,
  'heat-death-afterparty': heatDeathAfterparty,
};

/**
 * Packs for the four groove recipes. As in v3, a recipe borrows its home station's pack, so
 * when a pirate or a rotating station plays disco, the Starlite Rollerdrome's residents turn up
 * there too (with their own sound).
 */
export const V4A_RECIPE_PACKS: Readonly<Partial<Record<RecipeId, TrackPack>>> = {
  disco: saturdayNightForever,
  'space-funk': velvetCollapse,
  'warehouse-techno': substationNull,
  'heat-death-house': heatDeathAfterparty,
};
