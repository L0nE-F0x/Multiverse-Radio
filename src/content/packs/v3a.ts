// Track-naming packs for v3 stations (writers-new-a): smoke-ring-trio, lower-hollow, bubble-economy, breakbeat-observatory, piano-empty-rooms, wall-of-fog, drowned-shanty-hour, event-horizon-surf, gristwick-parish, waystation-9.
//
// Same shape as the v2 packs (see common.ts): title → #main# or #rare#, hand-written `fixed`
// titles in light rotation, an optional `suffix`. New in v3: every pack has a small roster of
// `resident` artists who play about two tracks in five, so listeners get to know them (the
// music engine gives each artist name its own sound signature). Everyone else is `made`.
//
// Rule names avoid the common grammar's (`when`, `n`, `where`, ...) so shared liner notes
// keep their own wording.

import type { RecipeId } from '../../broadcast/types';
import { num, type Rule } from '../grammar';
import { TITLE_SHAPE } from './common';
import type { TrackPack } from './types';

/** Two tracks in five go to the station's resident artists. */
const ARTIST_SHAPE: readonly string[] = ['#resident#', '#resident#', '#made#', '#made#', '#made#'];

/** "1st", "22nd", "113th". */
const ordinal =
  (min: number, max: number): Rule =>
  (rng) => {
    const n = rng.int(min, max);
    const teen = n % 100 >= 11 && n % 100 <= 13;
    const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    return `${n}${suffix}`;
  };

/** A late-night log time, "23:51" or "02:07". */
const logTime: Rule = (rng) => `${rng.pick(['20', '21', '22', '23', '00', '01', '02', '03', '04'])}:${String(rng.int(0, 59)).padStart(2, '0')}`;

// ── Smoke Ring Trio (jazz-trio) ───────────────────────────────────────────────

export const smokeRingTrio: TrackPack = {
  fallbackTitle: 'Low Pressure, High Hopes',
  albumChance: 0.55,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#forecast# Over #spot#',
      '#forecast# for #who#',
      '#forecast#, #hour#',
      '#weatherNoun# Over #spot#',
      '#hour# in the #room#',
      '#who.cap# in the #room#',
      'A #chance# Chance of #what#',
      '#dance# for #thing.a#',
      '#playing# on #surface#',
      '#who.cap# Waits Until the #ending#',
      '#weatherNoun# in #key#',
      '#hour#, #weatherNoun#',
      'Blues for #who# (#hour#)',
    ],
    rare: ['Blues for #who#', 'Low Pressure, #feeling#', 'Until the #ending#', 'Ballad for #thing.a#'],
    playing: ['Brushes', 'Piano', 'Rain', 'Footsteps', 'Fingers', 'Candlelight', 'Moonlight', 'Raindrops', 'Slippers', 'Hailstones', 'Teaspoons', 'Thunder'],
    fixed: [
      "Mind the Step (There Isn't One)",
      "Please Don't Applaud",
      'Florian Crosses the Room',
      'The Long Walk Home',
      'Table Nine Has Drifted',
      'Silas Is Only a Rumour',
      'A Quartet, Briefly',
      'Snapping Is Drizzle',
    ],
    forecast: [
      'Scattered Showers', 'Light Drizzle', 'Brief Sunshine', 'A Low Front', 'A Warm Front', 'Soft Thunder',
      'Patchy Fog', 'Sea Mist', 'Hail Showers', 'Clearing Skies', 'A Cold Snap', 'Sheet Lightning', 'Rain Later',
      'Mild Spells', 'Persistent Mist', 'Sunny Intervals', 'Fair Weather', 'Heavy Dew', 'High Cloud', 'Distant Thunder',
    ],
    spot: [
      'Table Nine', 'the Bandstand', 'the Bar', 'the Cloakroom', 'Table Six', 'the Cumulus Room', 'the Coat Check',
      'the Stage Door', 'the Last Booth', 'the Piano Lid', 'the Valley', 'the Farms Below', 'the Lit Windows',
      'Table Ten', 'the Dance Floor', 'the Kitchen Door', 'the Fire Escape', 'the Front Row',
    ],
    who: [
      'the Waiter', 'the Bassist', 'Silas', 'Mercy', 'Augustin', 'Table Nine', 'the Coat Check', 'the Last Customer',
      'Florian', 'the Lightning', 'Somebody Who Never Came', 'the Cleaner', 'the Valley Below', 'the Night Shift',
      'the Rain', 'Late Arrivals', 'the Cloud', 'the Doorman',
    ],
    hour: [
      'Ten to Four', 'Quarter Past Two', 'Half Past Late', 'Ten Past Midnight', 'Twenty to Three',
      'Three in the Morning', 'Last Orders', 'After Hours', 'Five to Five', 'Closing Time', 'Nearly Dawn',
      'Second Set', 'Third Set', 'Eleven Fifty', 'One-Fifteen', 'The Small Hours',
    ],
    room: [
      'Cumulus Room', 'Nimbus Lounge', 'Drizzle Bar', 'Upper Air', 'Thunderhead Room', 'Fog Bank', 'Low Ceiling Club',
      'Green Room', 'Weather Room', 'Stratus Bar', 'Rainshadow Room', 'Cloakroom',
    ],
    chance: ['Slight', 'Fair', 'Good', 'Small', 'Ninety Percent', 'Remote', 'Reasonable', 'Strong', 'Faint', 'Lovely', 'Sudden', 'Late'],
    what: [
      'You', 'Rain', 'Romance', 'Brushes', 'Showers Later', 'Piano', 'Thunder', 'Another Chorus', 'Lightning',
      'Rain on the Valley', 'Last Orders', 'Dancing', 'Something Blue', "Applause (Please Don't)", 'Fog by Morning',
      'Table Nine', 'Bass', 'Morning',
    ],
    thing: [
      'Floating Table', 'Empty Chair', 'Wet Umbrella', 'Cold Coffee', 'Candle Stub', 'Lost Glove', 'Shy Lightning Bolt',
      'Upright Bass', 'Waiter in No Hurry', 'Cloud With a View', 'Late Train', 'Folded Napkin', 'Unopened Letter',
      'Open Window', 'Melted Ice Cube', 'Slow Barometer',
    ],
    dance: ['Slow Waltz', 'Slow Dance', 'Lullaby', 'Nocturne', 'Serenade', 'Soft Shoe', 'Lament', 'Last Dance', 'Rumba', 'Blues'],
    surface: [
      'a Cloud', 'Wet Pavement', 'the Rain', 'a Tin Roof', 'Velvet', 'Snare and Fog', 'a Window', 'the Bar Top',
      'Wet Leaves', 'a Puddle', 'Linen', 'Low Cloud', 'the Skylight', 'Soft Felt', 'a Biscuit Tin', 'Polished Wood',
    ],
    ending: [
      'Lightning Stops', 'Candles Go Out', 'Rain Lets Up', 'Waiter Arrives', 'Fog Lifts', 'Bass Gets Home',
      'Morning Finds Us', 'Last Table Leaves', 'Cloud Moves On', 'Thunder Says Goodnight', 'Ice Melts', 'Drummer Wakes Up',
    ],
    weatherNoun: ['Drizzle', 'Thunder', 'Fog', 'Rain', 'Mist', 'Hail', 'Lightning', 'Dew', 'Low Cloud', 'Sleet', 'Weather', 'Squall', 'Overcast', 'Downpour'],
    key: ['B-flat', 'E-flat', 'F Minor', 'C Minor', 'D-flat', 'G Minor', 'A-flat', 'Low Pressure', 'Three Flats', 'the Key of Rain', 'F', 'Five Flats'],
    feeling: [
      'High Hopes', 'Low Lights', 'Warm Hands', 'No Hurry', 'Soft Landing', 'Open Arms', 'Long Night', 'Cold Feet',
      'Clear Heart', 'Wet Shoes', 'Good Company', 'Slow Burn', 'Kind Eyes', 'Last Call',
    ],
    suffix: [
      'Take Two', 'Live at Altitude', 'Alternate Take', 'Rehearsal Take', 'Third Set', 'Brushes Version', 'Ballad Tempo',
      'Live in the Cumulus Room', 'Morning After Take', 'For Table Nine',
    ],
    artist: ARTIST_SHAPE,
    resident: [
      'The Smoke Ring Trio',
      'The Mercy Calloway Trio',
      'Augustin Pell',
      'Silas Brushwood and the Quiet Hours',
      'Ida Fairweather',
      'The Low Pressure System',
      'The Lyle Overcast Trio',
      'Nimbus Jones',
    ],
    made: ['#first# #last# Trio', '#first# #last# Trio', '#first# #last#', 'The #first# #last# Trio, Live', '#first# #last# and the #forecast#'],
    first: [
      'Ada', 'Dorothea', 'Florence', 'Ines', 'Jasper', 'Marguerite', 'Percy', 'Rosamund', 'Theo', 'Winifred', 'Vernon',
      'Odile', 'Agnes', 'Bertram', 'Maxine', 'Ottoline', 'Rufus', 'Sybil', 'Wendell', 'Hattie',
    ],
    last: [
      'Rainsford', 'Coldwell', 'Ashgrove', 'Halloway', 'Dewhurst', 'Fairbairn', 'Thornbury', 'Wetherby', 'Cloudesley',
      'Pellham', 'Nightingale', 'Brightwater', 'Overbury', 'Stormont', 'Gale', 'Lowmoor',
    ],
    album: [
      'Live at the Cumulus Room',
      'Late Sets From Inside a Cloud',
      'Brushes and Barometers',
      'Mind the Step',
      'Music for Floating Tables, Vol. #vol#',
      '#forecast#: The #hour# Sessions',
      'The #room# Tapes',
      'Snapping Is Drizzle',
      'Low Pressure, High Hopes',
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded live. The applause has been removed, for the safety of the valley below.',
      'The bassist closed his eyes for the whole of the second chorus. Nobody has asked him to open them.',
      'Octavia Lowe calls the piano solo "a warm front, arriving early".',
      'Table nine requested this. Table nine has since drifted.',
      'Florian crossed the room twice during this take. He did not spill a drop.',
      'The drummer is on this recording. Probably. Listen very closely.',
      'The lightning in the walls sat in on this one. It cannot read music. It just knows when.',
    ],
  },
};

// ── Bubble Economy FM (city-pop) ──────────────────────────────────────────────

export const bubbleEconomy: TrackPack = {
  fallbackTitle: 'Friday Forever',
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#place# #glossNoun#',
      '#flutter# on the #highway#',
      '#tint# #object#',
      '#tint# #object# on the #highway#',
      "Don't #verbPhrase# Until Monday, #darling#",
      'Your #object# in My #object2#',
      '#clock# #vehicle#',
      '#clock# at the #place# #venue#',
      '#flutter# at the #place# #venue#',
      '#tint# #glossNoun# (#mix#)',
      '#glossNoun# on the #highway#',
      '#place# #glossNoun#, #year#',
    ],
    rare: ["Don't #verbPhrase# Until Monday", 'The Weekend Starts #startsWhen#', 'Friday #fridayTail#', 'Love Is #market#', 'Overtime #love#'],
    darling: ['Baby', 'Darling', 'Honey', 'Sweetheart', 'My Love', 'Okay?', 'Please', 'Kiko', 'Lisa', 'Tomo'],
    venue: ['Lounge', 'Disco', 'Hotel', 'Arcade', 'Karaoke Bar', 'Cafe', 'Ballroom', 'Pool Bar', 'Roller Rink', 'Skybar'],
    fixed: [
      'The Weekend Starts Now',
      'Contains No Mondays',
      'Pin Amnesty (Keep the Bubble Beautiful)',
      'Fourteen Thousand Six Hundred Fridays',
      'The Duet (One More Time)',
      'Sunglasses at Breakfast',
    ],
    place: [
      'Marina', 'Bayside', 'Harbour Lights', 'Pier Five', 'Golden Tower', 'Lagoon', 'Uptown', 'Sky Lounge', 'Rooftop',
      'Waterfront', 'Downtown', 'Penthouse', 'Escalator', 'Ninth Street', 'Neon Bay', 'Boulevard',
    ],
    glossNoun: [
      'Overtime', 'Romance', 'Mirage', 'Champagne', 'Paradise', 'Weekend', 'Rendezvous', 'Sunset', 'Daydream', 'Fever',
      'Cruise', 'Telephone', 'Heartbeat', 'Holiday', 'Silhouette', 'Moonlight', 'Bonus', 'Reflection',
    ],
    flutter: [
      'Heartbeat', 'Daydream', 'Shiver', 'Crush', 'Butterflies', 'Goosebumps', 'Slow Motion', 'Static', 'Glitter', 'Fever',
      'Feelings', 'Pulse', 'Blushing', 'Ripples',
    ],
    highway: ['Bay Expressway', 'Ring Road', 'Coast Highway', 'Elevated Line', 'Harbour Bridge', 'Last Train', 'Monorail', 'Seaside Loop', 'Top Floor', 'Escalator'],
    tint: ['Pink', 'Champagne', 'Pastel', 'Silver', 'Neon', 'Peach', 'Turquoise', 'Lilac', 'Gold', 'Chrome', 'Coral', 'Lavender', 'Ice Blue', 'Tangerine'],
    object: [
      'Pager', 'Cassette', 'Convertible', 'Telephone', 'Cocktail Umbrella', 'Shoulder Pads', 'Sunglasses', 'Elevator',
      'Business Card', 'Swimming Pool', 'Wristwatch', 'Polaroid', 'Jukebox', 'Neon Sign', 'Yacht', 'Answering Machine',
      'Briefcase', 'Lip Gloss',
    ],
    object2: ['Car Stereo', 'Heart', 'Briefcase', 'Tape Deck', 'Diary', 'Address Book', 'Glovebox', 'Penthouse', 'Daydreams', 'Walk-In Closet'],
    verbPhrase: [
      'Fall in Love', 'Say Goodbye', 'Look at the Calendar', 'Cash That Cheque', 'Call Me', 'Wake Me', 'Stop Dancing',
      'Take the Last Train', 'Grow Up', 'Check the Market', 'Leave the Party', 'Take Off Your Sunglasses',
    ],
    clock: [
      'Eleven Fifty-Nine', 'Midnight', 'Two A.M.', 'Last Train', 'Ten Past Ten', 'Half Past Friday', 'Rush Hour',
      'Happy Hour', 'Quarter to Twelve', 'After Hours', 'Payday', 'Bonus Day',
    ],
    vehicle: ['Convertible', 'Monorail', 'Yacht Party', 'Taxi', 'Elevator', 'Speedboat', 'Night Bus', 'Limousine', 'Sports Car', 'Cable Car'],
    year: ['1986', "'86", 'Forever', 'Again', 'Still', 'Friday'],
    market: ['Up Again', 'a Sound Investment', 'Tax Deductible', 'Up Twelve Points', 'Bullish', 'Overvalued', 'a Blue Chip', 'Never Down', 'Compound Interest'],
    startsWhen: ['Now', 'Now (Again)', 'Right Now', 'Tonight', 'Now, Baby', 'Now Forever'],
    fridayTail: ['Forever', 'Again', 'Never Ends', 'Is a Feeling', 'Payday', 'Afterglow', '(No Monday)', 'Overtime'],
    love: ['Romance', 'Lovers', 'Heartbreak', 'Darling', 'Sweetheart', 'Rendezvous', 'Valentine'],
    mix: ['Extended Mix', 'Friday Night Version', 'Bay Expressway Edit', 'Twelve-Inch Mix', 'Cassette Dub', 'Lagoon Lounge Live', 'Instrumental', 'After Hours Mix'],
    suffix: ['#mix#'],
    artist: ARTIST_SHAPE,
    resident: [
      'Sayuri Seaside',
      'The Overtime Boys',
      'Lisa Lagoon',
      'Marina Nine',
      'Tomo Velvet and the Shoulder Pads',
      'Junichi Bonus',
      'Ellie Escalator',
      'The Golden Parachutes',
    ],
    made: ['#firstE# #lastE#', '#firstE# #lastE#', '#firstE# and the #band#', 'The #band#'],
    firstE: ['Yumi', 'Kenji', 'Mari', 'Rina', 'Hiro', 'Sachi', 'Dana', 'Nico', 'Toshi', 'Kay', 'Lulu', 'Mika', 'Jun', 'Reiko', 'Sam', 'Vivi'],
    lastE: [
      'Sunset', 'Champagne', 'Boulevard', 'Moonlight', 'Pastel', 'Paradise', 'Harbour', 'Neon', 'Silver', 'Friday',
      'Chrome', 'Rendezvous', 'Mirage', 'Daydream', 'Bayside', 'Overtime',
    ],
    band: [
      'Expressways', 'Shoulder Pads', 'Pagers', 'Answering Machines', 'Neon Signs', 'Escalators', 'Happy Hours',
      'Golden Handshakes', 'Bull Markets', 'Cocktail Umbrellas', 'Penthouse Lights', 'Late Trains',
    ],
    album: [
      'Always Friday',
      'The Weekend Starts Now',
      '#tint# #object#',
      'Marina City Nights, Vol. #vol#',
      'Nineteen Eighty-Six (Forever Edition)',
      'Bonus Season',
      'Up Again',
      '#place# #glossNoun#',
    ],
    vol: num(1, 12),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded on a Friday night in 1986. They all were.',
      'Taped off the radio by the man on the forty-second floor. Tape fourteen thousand and something.',
      'The Marina Index rose four points during the guitar solo.',
      'Please do not bring this record near anything sharp.',
      'Mixed in a convertible on the Bay Expressway, top down.',
      'Contains no Mondays.',
      'Comes with a tiny paper umbrella. Do not lose the umbrella.',
    ],
  },
};

// ── Breakbeat Observatory (drum-and-bass) ─────────────────────────────────────

export const breakbeatObservatory: TrackPack = {
  fallbackTitle: 'Bass Detected',
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#body# #dnbNoun#',
      '#body# #dnbNoun#',
      '#shift# #science#',
      '#phenom# Over #body#',
      '#dnbNoun# for #body#',
      '#lightYears# Light Years From #body#',
      'Bass Detected at #logTime#',
      '#body# #dnbNoun# (#mix#)',
      '#shift# Over #body#',
    ],
    rare: ['Dark Matter #dnbNoun#', 'Woofer Pointed at #body#', 'Big Up #body#', "#body# Doesn't Know Yet", '#lightYears# Light Years'],
    fixed: [
      'Bass Detected',
      'The Nod (Observed Once)',
      'Calibrate With Me',
      'Secure Your Loose Moons',
      'Big Up the Sun',
      'Never Stopping (Noted)',
    ],
    body: [
      'Lesser Teacup Cluster', 'Velvet Spiral', "Gorbel's Nebula", 'Cassius Minor', 'Brantley System', 'Andra Reach',
      'Soft Nebula', 'Kettle Drift', 'Hollow Pulsar', 'Mount Subwoofer', 'Bert', 'Far Spiral', 'Quiet Quasar',
      'Ninth Moon', 'Long Comet', 'Little Bear Minor', 'Pale Dwarf', 'Outer Halo', 'Dust Lane', 'Wobbling Star',
      'Thursday Cluster', 'Second Sun', 'Kuiper Fringe', 'Slow Galaxy',
    ],
    dnbNoun: ['Roller', 'Step', 'Dubplate', 'Rinse', 'Bassline', 'Riddim', 'Pressure', 'Drop', 'Break', 'Stepper', 'Halftime', 'Reese', 'Sub Pressure', 'Shuffle'],
    shift: ['Redshift', 'Blueshift', 'Parallax', 'Perihelion', 'Aphelion', 'Doppler', 'Eclipse', 'Light Cone', 'Zenith', 'Nadir', 'Transit', 'Syzygy'],
    science: [
      'Rollers', 'Pressure', 'Business', 'Dub', 'Theory', 'Science', 'Warning', 'Weather', 'Rinse', 'Bassline', 'Signal',
      'Drift', 'Heat', 'Motion', 'Mechanics', 'Data',
    ],
    phenom: [
      'Solar Wind', 'Star Shiver', 'Gravity', 'Dark Matter', 'Cosmic Dust', 'Meteor Shower', 'Background Radiation',
      'Stellar Drift', 'A Tremor', 'The Big Woofer', 'Moonquake', 'Supernova', 'Light Pollution', 'A Comet Tail',
    ],
    lightYears: num(2, 990),
    logTime,
    mix: [
      'VIP', 'Dubplate', 'Telescope Mix', 'Light Year Edit', 'Redshifted', 'Doctor Ferrin Remix', 'Sub Only', 'Dome Open Mix',
      'Observatory Dub', 'Calibration Mix',
    ],
    suffix: ['#mix#'],
    artist: ARTIST_SHAPE,
    resident: [
      'Blueshift',
      'Kuiper Belt Sound System',
      'Parsec Lou',
      'Halo Frequency',
      'Nebula Nell',
      'The Lens Caps',
      'Perihelion',
      'Doctor Ferrin (Field Recordings)',
    ],
    made: ['#djName#', 'DJ #djName#', '#djName# and MC #mcName#', '#djName# Sound System', '#djName# vs. #djName2#'],
    djName: [
      'Quasar', 'Lightspeed', 'Orbit', 'Zenith', 'Corona', 'Ion', 'Vector', 'Apogee', 'Spectra', 'Umbra', 'Penumbra',
      'Comet', 'Meridian', 'Albedo', 'Azimuth', 'Magnitude',
    ],
    djName2: ['Gravity Well', 'The Dome', 'Big Woofer', 'Orbit', 'Starfield', 'Low End Theory Club', 'Tidal Lock', 'Dust Lane'],
    mcName: ['Telescope', 'Wobble', 'Starshine', 'Dustlane', 'Eyepiece', 'Lens', 'Tripod', 'Gravity', 'Clear Skies', 'Big Dipper'],
    album: [
      'Observations, Vol. #vol#',
      'Logbook #vol#',
      'Notes From the Dome',
      'Seeing Conditions: Excellent',
      '#shift# Sessions',
      'Mount Subwoofer Live',
      'Light Years Per Verse',
    ],
    vol: num(1, 30),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Doctor Ferrin logged this drop at #logTime#. A star moved. It moved back.',
      'Mastered for subwoofers the size of a dome.',
      'Will reach the Velvet Spiral in roughly thirty thousand years. They will like it.',
      'Moved the Brantley sun four inches to the left. Our apologies.',
      'Recorded with the dome open. Several stars can be heard on the chorus.',
      'Doctor Ferrin did not nod during this track. She came close.',
    ],
  },
};

// ── Piano for Empty Rooms (ambient-piano) ─────────────────────────────────────

export const pianoEmptyRooms: TrackPack = {
  fallbackTitle: 'for the guest room',
  albumChance: 0.45,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      'for the #room#, #whenP#',
      'the #room#, #whenP#',
      '#piece# for the #room#',
      '#light# on #surface#',
      '#light# on #surface#, #whenP#',
      'the #room# has never #never#',
      'dust in the #light#, #whenP#',
      'the #room# (#unvisited#)',
      'what the #room# hears #whenP#',
      'a #quiet# #piece# for the #room#',
    ],
    rare: ['#piece# for #windows# windows', 'the door at the back (#ajar#)', 'nobody is here, #whenP#'],
    fixed: [
      'the door at the back (an inch)',
      'dusting the light',
      'a visited room now',
      'the guest has not come (the room is fine)',
      'small ghosts having a meeting',
      'agreeing with the clock',
      'it does not know it plays brighter',
    ],
    room: [
      'linen room on the third floor', 'guest room', 'ballroom on the fourth floor', 'box room', 'room behind the bookcase',
      'waiting room', 'attic of a new house', 'conservatory with no plants yet', 'second-best parlour',
      'lift lobby on floor nineteen', 'east wing', 'room at the end of the corridor', 'spare room', 'room under the stairs',
      'drawing room', 'library nobody reads in', 'music room', 'hotel room nobody has booked', 'new flat on the top floor',
      'unopened classroom', 'empty gallery', 'west corridor', 'back stairs', 'show home', 'chapel with no wedding yet',
      'cellar', 'unpacked study', 'sunroom', 'ballroom', 'gatehouse',
    ],
    whenP: [
      'before anyone', 'at three in the morning', 'in the afternoon', 'after the builders left', 'with the door ajar',
      'while nobody listens', 'in moonlight', 'first thing', 'all winter', 'just in case', 'for now', 'quietly',
      'on a sunday', 'later',
    ],
    light: [
      'moonlight', 'morning light', 'streetlight', 'a stripe of sun', 'lamplight from next door', 'dust light', 'grey light',
      'late sun', 'the last of the light', 'blue hour', 'winter light', 'borrowed candlelight', 'a sliver of hall light',
      'light through a keyhole',
    ],
    surface: [
      'unwalked floorboards', 'a covered chair', 'the piano lid', 'a bare wall', 'the window seat', 'a folded dust sheet',
      'new carpet', 'a made bed', 'the skirting board', 'the banister', 'a stopped clock', 'the empty fireplace',
      'the parquet', 'a closed door', 'the mantelpiece', 'a waiting chair',
    ],
    never: [
      'been slept in', 'been danced in', 'had a visitor', 'heard its own echo', 'been told what it is for',
      'had its curtains drawn', 'had a birthday', 'been lonely, exactly', 'had a key turned', 'heard a kettle',
      'been photographed', 'felt a footstep', 'held a party', 'been sung in',
    ],
    piece: ['nocturne', 'lullaby', 'study', 'prelude', 'waltz', 'small song', 'air', 'reverie', 'hymn', 'interlude'],
    quiet: ['quiet', 'slow', 'small', 'patient', 'unhurried', 'soft', 'still', 'careful', 'tender', 'dusty', 'polite', 'gentle'],
    unvisited: ['unvisited', 'still unvisited', 'nobody yet', 'empty, for now', 'door ajar', 'lights off', 'dust sheets on', 'ready', 'waiting', 'not yet'],
    windows: ['two', 'three', 'four', 'six', 'eight', 'eleven', 'twelve', 'fourteen', 'twenty', 'forty'],
    ajar: ['an inch', 'a draught', 'an invitation', 'both', 'still', 'kindly', 'just in case', 'as ever', 'for now', 'listening'],
    suffix: ['unvisited', 'first light', 'dust sheets', 'take two', 'from the corridor', 'room tone', 'door ajar', 'three in the morning'],
    artist: ARTIST_SHAPE,
    resident: [
      'a piano, alone',
      'agnes dustsheet',
      'the east wing',
      'felt hammers',
      'room tone',
      'honora vacant',
      'mabel ajar',
      "the caretaker's piano",
    ],
    made: ['#firstP# #lastP#', '#firstP# #lastP#', 'the #quiet# #roomWord#', '#quiet# #roomWord# ensemble'],
    firstP: ['ada', 'edith', 'otto', 'ines', 'hugo', 'mira', 'lorna', 'aurelie', 'pim', 'esme', 'tobias', 'vera', 'clement', 'wren'],
    lastP: ['vacant', 'stillwater', 'dustworth', 'quietly', 'unlit', 'lintel', 'eaves', 'sill', 'fernleaf', 'longhallow', 'keyhole', 'floorboard'],
    roomWord: ['hallway', 'landing', 'parlour', 'stairwell', 'attic', 'corridor', 'drawing room', 'box room', 'cellar', 'ballroom'],
    album: [
      'music for the unvisited wing',
      'rooms nobody has entered yet, vol. #vol#',
      'dust sheets',
      'first light in the east wing',
      'the unvisited hours',
      "please, don't get up",
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      'Recorded from the corridor. The piano played itself; the caretaker listened at the door.',
      'Nobody was in the room. That was the point.',
      'The door at the back was open about an inch throughout.',
      'The light was dusted before and after this recording.',
      'Dedicated to a room that has never been told what it is for.',
      'The footsteps at the very end are not on the recording. Probably.',
    ],
  },
};

// ── Wall of Fog (shoegaze) ────────────────────────────────────────────────────

export const wallOfFog: TrackPack = {
  fallbackTitle: 'pink static',
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#haze# #fogNoun#',
      '#haze# #fogNoun#',
      '#gerund# through #through#',
      '#fogNoun# in the #fogPlace#',
      'when the #echoThing# comes back #later#',
      'you were #verbing# #fogWhere#',
      '#haze# #fogNoun# for #fogWho#',
      '#fogNoun#, #fogWhere#',
    ],
    rare: ["i can't hear you, it's #cantHear#", 'still echoing from #echoYear#', '#fogNoun# (#version#)'],
    fixed: [
      'drink water, call the people you love, back up your files',
      'is this thing on (1991)',
      'the one went home, the two is still out there',
      'hello, lamp',
      'that one is a spoon',
      'turn it sideways',
    ],
    haze: [
      'soft', 'pink', 'blurred', 'slow', 'drowned', 'velvet', 'tidal', 'faded', 'humming', 'reversed', 'pale', 'dissolving',
      'glowing', 'distant', 'sleeping', 'washed-out', 'endless', 'half-remembered', 'shimmering', 'underwater',
    ],
    fogNoun: [
      'halo', 'static', 'lamp', 'cathedral', 'pedal', 'ocean', 'feedback', 'daylight', 'snowfall', 'chorus', 'mirror',
      'satellite', 'perfume', 'heartbeat', 'glow', 'cloud', 'signal', 'sweater', 'carousel', 'swimming pool', 'motorway',
      'streetlight', 'echo', 'radiator',
    ],
    gerund: ['drifting', 'sinking', 'falling', 'floating', 'wading', 'dissolving', 'spinning', 'humming', 'sleeping', 'wandering', 'melting', 'swimming', 'rising', 'turning'],
    through: [
      'pink static', 'the reverb', 'your sleeve', 'seventeen pedals', 'the lamp', 'warm feedback', 'the fog machine',
      'last tuesday', 'a slow chord', 'the monitors', 'the wall', 'the soundcheck', 'a long sustain', 'blue light',
      'the snare', 'nineteen ninety one', 'a crowd of three', 'velvet noise', 'the hum', 'the bit after the song',
    ],
    fogPlace: [
      'reverb', 'fog', 'monitors', 'back of the room', 'pedalboard', 'long hallway', 'swimming pool', 'shallow end',
      'last train', 'empty car park', 'snow globe', 'cathedral', 'radiator', 'blue hour',
    ],
    echoThing: [
      'chord', 'spoon', 'first gig', 'chorus', 'one', 'two', 'boo', 'soundcheck', 'feedback', 'applause', 'snare', 'lamp',
      'whisper', 'last song', 'goodbye', 'hello',
    ],
    later: ['eventually', 'in a year or two', 'tomorrow', 'in winter', 'at four', 'softer', 'louder', 'again', 'forever', 'someday', 'too late', 'sideways'],
    verbing: [
      'glowing', 'out of focus', 'underwater', 'humming', 'very far away', 'in reverse', 'dissolving', 'on fire, quietly',
      'louder than the lamp', 'asleep', 'a chord', 'mostly reverb', 'the loud bit', 'beautiful',
    ],
    fogWhere: [
      'at the back', 'in the fog', 'by the lamp', 'on the monitors', 'all night', 'in nineteen ninety three',
      'through the wall', 'under the pedals', 'in the soundcheck', 'in every echo', 'on the stairs', 'somewhere pink',
      'last tuesday', 'for a while',
    ],
    fogWho: ['the lamp', 'the three of you', 'ellis', 'the drummer', 'whoever', 'the night shift', 'the fog', 'you, probably', 'nobody in particular', 'the audience'],
    cantHear: ['beautiful', 'the fog', 'too loud', 'perfect', 'the reverb', 'fine', 'a feeling', 'the lamp'],
    echoYear: num(1989, 1999),
    version: ['reverb version', 'demo', 'live in the fog', 'slowed', 'soundcheck take', 'the loud bit', 'the quiet bit', 'still echoing', 'lamp mix', 'reversed'],
    suffix: ['#version#'],
    artist: ARTIST_SHAPE,
    resident: [
      'pale lamp',
      'the indistinct',
      'velvet reverse',
      'seventeen pedals',
      'hazel drone',
      'dim cathedral',
      'softer than concrete',
      'the three blurry shapes',
    ],
    made: ['#haze# #fogNoun#', '#haze# #fogNoun#', '#fogNoun# #bandTail#', 'the #haze# #bandTail#'],
    bandTail: ['choir', 'machine', 'garden', 'club', 'twins', 'society', 'collective', 'district', 'parade', 'weather'],
    album: [
      'music for a room made of reverb',
      'everything echoes',
      '#haze# #fogNoun#',
      'the loud quiet',
      'fogbound',
      "it's all of it, really",
      'still echoing from #echoYear#',
    ],
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Ellis introduced this as "...them... the ones with the... yeah." He is correct.',
      'Some of this recording is from last Tuesday. Some of it is from 1991. It all arrives eventually.',
      "Recorded with seventeen pedals. One of them does nothing. It is everyone's favourite.",
      'The lyrics are unknown, even to the singer. Everybody agrees with them.',
      'The lamp in the audience was present for this recording.',
      'Turn it up. No, more. No. Yes. That.',
    ],
  },
};

// ── The Drowned Shanty Hour (sea-shanty) ──────────────────────────────────────

export const drownedShanty: TrackPack = {
  fallbackTitle: 'The Ship Is Fine',
  albumChance: 0.5,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      'The Wreck of the #ship# (#futureYear#)',
      '#shantyVerb# the #ship#',
      '#crewman.cap# of the #ship#',
      '#ship#, Bound for #destination#',
      'The #ship# Is #shipState#',
      '#crewman.cap# Is #shipState#',
      "We'll #action# in the #watchTime#",
      'Ballad of #crewman#, Who #did#',
      '#call# for #reason#',
      '#call#, #crewman.cap#',
    ],
    rare: ['Bound for #destination#', 'Song for #futureEvent#', '#seaWeather# in #seaArea#', 'The Sea Area Forecast (#seaArea#)'],
    fixed: [
      'The Ship Is Fine',
      'Sea Soup (Seconds All Around)',
      'The Lookout (Still Looking)',
      'Before There Was Water',
      'Shanties Work Best With More Ghosts',
      "Promotion's Slow at Sea",
    ],
    ship: [
      'Damp Regret', 'Margaret Ann', 'Second Thoughts', 'Leaky Promise', 'Brave Intention', 'Sincere Apology', 'Mild Concern',
      'Unsinkable Mabel', 'Fair Warning', 'Long Calm', 'Wet Blanket', 'Sudden Doubt', 'Last Biscuit', 'Polite Request',
      'Sinking Feeling', 'Good Intentions', 'Patience Grey', 'Half Measure', 'Low Expectations', 'Slow Reply',
    ],
    futureYear: num(2031, 2399),
    crewman: [
      'Old Pettibone', 'Young Tobias', 'the Bosun', 'the Cook', 'the Lookout', 'Captain Wetherell', 'Long Agnes',
      'Mister Fathom', 'One-Boot Tom', 'the Cabin Boy', 'Wet Willa', "the Ship's Cat", 'Barnacle Bess', 'Soggy Dan',
      'Dry Martin', 'the Drowned Fiddler',
    ],
    shantyVerb: ['Bail Out', 'Pump Out', 'Sing to', 'Leave', 'Haul', 'Mend', 'Row Home', 'Raise', 'Lower', 'Bless', 'Name', 'Paint', 'Steer', 'Wake'],
    shipState: [
      'Fine', 'Fine, Mostly', 'Lower Than Before', 'Taking On Water', 'Absolutely Fine', 'Doing Her Best', 'Humming',
      'Below the Waterline', 'Afloat, in Spirit', 'Damp but Proud', 'Ahead of Schedule', 'Sinking Slowly',
    ],
    destination: [
      'the Bottom', 'Lower Dismay', 'Dismay', 'Regret', 'the Long Calm', 'Tuesday', 'the Year Two Thousand and Ninety',
      'Dry Land (Rumoured)', 'Fathom Nine', 'the Edge of the Map', 'Next Week', 'the Other Sea', 'Home, Eventually',
      'Somewhere Damp', 'the Margaret Ann', 'Low Tide',
    ],
    action: [
      'Bail', 'Sing', 'Row Home', 'Dry Off', 'Mend the Nets', 'Find the Lookout', 'Sight Land', 'Raise Her',
      'Wring Our Socks', 'Swab the Sea', 'Sail at Dawn', 'Have Soup', 'Be Fine', 'Turn Back',
    ],
    watchTime: ['Morning', 'Forenoon', 'Dog Watch', 'Long Calm', 'Year Three Thousand', 'Spring', 'Next Life', 'Low Tide', 'Dark', 'Fog'],
    did: [
      'Went to Look Out', 'Married the Sea', 'Lost a Boot', 'Saw Dry Land Once', 'Sang Too Early', 'Drank the Soup',
      'Bailed for a Century', 'Chased the Stick', 'Never Said Goodbye', 'Mended Every Net', 'Was Early',
      'Owned a Dry Sock', 'Whistled in the Fog', 'Sat on the Barrel',
    ],
    call: ['Haul Away', 'Heave Ho', 'Bail Away', 'Pull Away', 'Row Away', 'Sing Away', 'Roll On', 'Stamp Away', 'Bail Again', 'Hold Fast', 'Sing Out', 'Wring Out'],
    reason: [
      'the Bottom', 'the Margaret Ann', 'Next Tuesday', "the Cook's Soup", 'a Dry Sock', 'the Lookout', 'Old Pettibone',
      'the Long Calm', 'the Other Sea', 'Lower Dismay', 'the Barrel', 'the Lantern', 'the Fog', 'Home',
      'the Year Two Thousand', 'the Damp Regret',
    ],
    futureEvent: ['Next Tuesday', 'a Storm in 2140', 'the Margaret Ann (2091)', "a Wedding That Hasn't Happened", 'the Last Dry Day', 'the Year the Sea Goes Out'],
    seaWeather: ['Fog', 'Fog Later', 'Damp', 'Wet', 'Very Wet', 'Calm', 'Mist'],
    seaArea: ['Regret', 'Dismay', 'Lower Dismay', 'the Bottom'],
    suffix: [
      'A Song About Next Tuesday', 'Below the Waterline', 'Low Tide Version', 'Dog Watch', 'All Hands', 'Ghost Chorus',
      'Accordion Only', 'Live on the Barrel', 'Damp Take',
    ],
    artist: ARTIST_SHAPE,
    resident: [
      'The Crew of the Damp Regret',
      'Old Pettibone (Accordion)',
      'The Barnacle Choir',
      'Bosun Agnes Gale',
      'The Bilge Pump Boys',
      'The Low Waterline Singers',
      'Mister Fathom and the Wet Feet',
      'Young Tobias (Aged 412)',
    ],
    made: ['The #ship# Shantymen', 'The Crew of the #ship#', '#crewman.cap#', 'The #seaFolk# of #seaArea#'],
    seaFolk: ['Drowned Choir', 'Shantymen', 'Bailers', 'Wet Fiddlers', 'Damp Brothers', 'Ghost Crew', 'Night Watch', 'Fog Singers'],
    album: [
      'Songs From Below the Waterline',
      'Shanties for Things That Have Not Happened Yet, Vol. #vol#',
      'The Ship Is Fine',
      'Before There Was Water',
      'Low Tide Sessions',
      'Sea Area Forecasts',
      'Live From the Barrel',
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      'Recorded below the waterline. The bubbles are applause.',
      'This shanty describes the events of the year 2091. Bring a coat.',
      'Old Pettibone plays a leaking accordion on this track. So does everything.',
      'The lookout does not appear on this recording. He is still looking out.',
      'The ship is fine.',
      'Sung by a crew that has been at sea since before there was water.',
    ],
  },
};

// ── Event Horizon Surf Report (surf-rock) ─────────────────────────────────────

export const eventHorizonSurf: TrackPack = {
  fallbackTitle: 'No Returns',
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#surfDance# at the #beachSpot#',
      '#horizonAdj# #surfDance#',
      '#waveYears# Years to Shore',
      '#waveYears#-Year Wave at the #beachSpot#',
      '#product# for #forWhom#',
      "#surfer.cap#'s #surfDance#",
      '#horizonAdj# #surfDance# (#reverbMix#)',
      '#horizonAdj# #surfDance# at the #beachSpot#',
    ],
    rare: ['Paddle Out #paddleWhen#', 'The Long #longThing#', 'Hang #hang#'],
    fixed: [
      'No Returns',
      'Lesson Two (Wave Goodbye)',
      'Steve Is Just Further',
      'Four Sunsets for the Price of One',
      'The Tide Went Out in 1959',
      'Holding the Board',
    ],
    surfDance: ['Stomp', 'Stroll', 'Shuffle', 'Twist', 'Bop', 'Wobble', 'Slide', 'Hop', 'Drift', 'Swing', 'Stagger', 'Slouch', 'Lean', 'Spin'],
    beachSpot: [
      'Accretion Disk', 'Event Horizon', 'Point', 'Leaning Tower', 'Lifeguard Tower', 'Pier', 'Snack Shack', 'Breakwater',
      'Tide Line', 'Edge', 'Ring', 'Shoreline', 'Time Rip', 'Car Park', 'Last Wave', 'Boardwalk',
    ],
    horizonAdj: [
      'Singularity', 'Spaghettification', 'Gravitational', 'Redshift', 'Tidal', 'Time-Dilated', 'Event Horizon',
      'Black Hole', 'No-Return', 'Slow-Motion', 'Infinite', 'Lensing', 'Orbital', 'Accretion', 'Bent-Light', 'Undertow',
    ],
    waveYears: num(2, 999),
    product: ['Board Wax', 'Sun Cream', 'Flip-Flops', 'A Towel', 'A Smoothie', 'A Postcard', 'A Long Leash', 'A Little Wave', 'A Spare Fin', 'A Snow Cone', 'One Last Look', 'A Goodbye Wave'],
    surfer: [
      'Kai', 'Bonnie', 'Dash', 'Steve', 'the Lifeguard', 'the Dawn Patrol', 'the Ghost Surfers', 'the Night Shift',
      'the Tower', 'the Board', 'the Surf School', 'the Lineup', 'the Sun',
    ],
    forWhom: ['#surfer#', '#surfer#', '#surfer#', 'Everyone Who Went In', 'Whoever Comes Back'],
    paddleWhen: ['Tomorrow', 'Any Minute Now', 'After This One', 'Totally', 'Next Year', 'For Real This Time', 'Soon', 'In a Bit'],
    longThing: ['Sunset', 'Pour', 'Ride', 'Paddle', 'Wait', 'Wave', 'Lean', 'Tide'],
    hang: ['Eleven', 'Eleven Dimensions', 'Twelve', 'On', 'Loose', 'Forever'],
    reverbMix: [
      'Reverb Tank Version', 'Slowed by Gravity', 'Live on North Beach', 'No Returns Mix', 'Dawn Patrol Take', 'Redshifted',
      'Single Fin Version', 'Still Playing', 'Long Sunset Edit',
    ],
    suffix: ['#reverbMix#'],
    artist: ARTIST_SHAPE,
    resident: [
      'The Accretion Discs',
      'The Tidal Locks',
      'The No Returns',
      'Redshift Riders',
      'Bonnie and the Lifeguards',
      'The Spaghettifiers',
      'Kai Longride',
      'The Leaning Towers',
    ],
    made: ['The #bandA# #bandB#s', 'The #bandA# #bandB#s', '#surfName# and the #bandB#s'],
    bandA: ['Gravity', 'Orbit', 'Horizon', 'Tidal', 'Undertow', 'Event', 'Lensing', 'Singularity', 'Shoreline', 'Pier', 'Ring', 'Comber'],
    bandB: ['Waver', 'Rider', 'Stomper', 'Twanger', 'Drifter', 'Surfer', 'Paddler', 'Lifeguard', 'Shaker', 'Leaner'],
    surfName: ['Dusty', 'Rip', 'Sandy', 'Chip', 'Skip', 'Lani', 'Del', 'Rocky', 'Coral', 'Marlo', 'Tad', 'Wendy'],
    album: [
      'No Returns',
      'Riding the Horizon',
      'Four Sunsets',
      'Tide Times (Discontinued)',
      'Waves Measured in Years, Vol. #vol#',
      'Live at the Snack Shack',
      'Gravitational Twang',
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      'Recorded on a seven-year wave. This is the radio edit.',
      'Dash Coriolis held the board for the whole session. He did not paddle out.',
      'Contains spaghettification on the inside. Experienced listeners only.',
      'The guitarist is still finishing the last chord. It arrives in about nine hundred years.',
      'Mastered in the lifeguard tower, which was leaning slightly at the time.',
      'Waxed for the event horizon. No returns.',
    ],
  },
};

// ── Waystation 9 CB (trucker-country) ─────────────────────────────────────────

export const waystation9: TrackPack = {
  fallbackTitle: 'Keep the Shiny Side Up',
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#cargo.cap# in the #truckPart#',
      '#road# #songWord#',
      "The #road# Don't #roadVerb#",
      "#handle#'s #runType#",
      'Hauling #cargo# to #destination#',
      'Mile Marker #mile#',
      '#roadTime# on the #road#',
      'She #did# on the #road#',
      '#roadTime# at #destination#',
      '#road# #songWord# (#handle#)',
    ],
    rare: ['Twenty-Two Wheels and #thing#', 'Fragile: Contains #cargo#', 'Ten-Four, #handle#', 'Dolores Pours the Coffee for #handle#'],
    fixed: [
      'The Road Picks Your Handle',
      'Keep the Shiny Side Up',
      'Fragile: Contains Tuesday',
      "Don't Let It Choose the Station",
      'Since It Was a River',
      'I Left the Light On',
    ],
    cargo: [
      'Tuesday', 'Weather', 'Thunder', 'a Sunrise', 'First Impressions', 'Fog', 'Loose Echoes', 'Thursday', 'Anniversaries',
      'Horizons', 'a Full Moon', 'Compost', "Somebody's Birthday", 'Forty Tonne of Quiet', 'Spare Seasons', 'Old Lullabies',
      'Second Chances', "Yesterday's Mail", 'Frozen Rain', 'a Marrow',
    ],
    road: ['Up Road', 'Down Road', 'Sideways Road', 'Old River Road', 'Loop', 'Crossroads', 'County Line', 'Long Way', 'Interchange', 'Back Road', 'Bypass', 'Service Road'],
    truckPart: ['Trailer', 'Back', 'Cab', 'Sleeper', 'Glovebox', 'Load Bed', 'Tanker', 'Flatbed'],
    songWord: ['Blues', 'Lullaby', 'Waltz', 'Ramble', 'Two-Step', 'Lament', 'Breakdown', 'Serenade', 'Hymn', 'Shuffle', 'Prayer', 'Rag'],
    roadVerb: ['Care', 'Sleep', 'Forgive', 'Go Straight', 'Lie', 'Lead Home', 'Wait for Nobody', 'Like Me', 'End', 'Know My Name'],
    handle: [
      'Midnight Mongoose', 'Grandma Diesel', 'Thursday', 'Big Rosalind', 'Dolores', 'Old Gearbox', 'Mudflap Annie',
      'Ten-Ton Teddy', 'Lonesome Axle', 'Cold Coffee Carl', 'Night Owl Nan', 'Two-Lane Tess', 'Sleepy Jake',
      'Tailgate Tom', 'Low-Gear Lou', 'The New Guy',
    ],
    runType: ['Last Run', 'First Haul', 'Long Night', 'Wide Load', 'Detour', 'Coffee Stop', 'Night Run', 'Short Cut', 'Big Delivery', 'Breakdown'],
    destination: [
      'Gristwick', 'the Hill Country', 'the Eastern Counties', 'Last Thursday', 'Tomorrow', 'the Coast', 'the County Line',
      'the Shoegaze Place', 'Lower Hollow', 'the Edge of the Map', 'Nowhere Special', "Mama's House", 'the Next Town',
      'the Crossroads', 'Somewhere Warm', 'the Other Side',
    ],
    mile: num(1, 999),
    roadTime: [
      'Three A.M.', 'Midnight', 'Sundown', 'Daybreak', 'Graveyard Shift', 'Supper Time', 'Last Light', 'Four in the Morning',
      'Half Past Lonesome', 'Bacon Time', 'Closing Time', 'Rush Hour',
    ],
    did: [
      'Passed Me Knitting', 'Waved', 'Took the Exit', 'Left Me', 'Hauled the Weather', 'Did a Hundred and Twelve',
      'Never Looked Back', 'Found Her Way', 'Got Her Handle', 'Turned Sideways', 'Sang Along', 'Kept the Light On',
    ],
    thing: ['a Thunderstorm', 'Forty Tonne of Tuesday', 'a Cardigan', 'One Marrow', 'a Fox', 'a Cup of Coffee'],
    suffix: ['Live at Waystation Nine', 'CB Version', 'Truck Stop Jukebox Mix', 'Long-Haul Edit', 'Graveyard Shift Take', 'Radio Edit', 'Sideways Version', 'Pedal Steel Mix'],
    artist: ARTIST_SHAPE,
    resident: [
      'Grandma Diesel',
      'Midnight Mongoose',
      'The Jackknife Sisters',
      'Dusty Odometer',
      'Clem Mudflap',
      'Rhonda Overpass',
      'The Mile Marker Boys',
      'Velma Low-Gear',
    ],
    made: ['#firstC# #lastC#', '#firstC# #lastC#', '#firstC# #lastC# and the #bandC#', 'The #bandC#'],
    firstC: ['Dusty', 'Earl', 'Darlene', 'Wanda', 'Boyd', 'Junie', 'Vern', 'Lula', 'Royce', 'Faye', 'Cletus', 'Mavis', 'Nell', 'Wade', 'Opal', 'Hollis'],
    lastC: [
      'Overpass', 'Gearbox', 'Mudflap', 'Tailgate', 'Axle', 'Weighbridge', 'Turnpike', 'Low-Gear', 'Truckstop',
      'Roadhouse', 'Diesel', 'Cattleguard', 'Milepost', 'Hubcap', 'Kingpin', 'Sleeper',
    ],
    bandC: [
      'Long Haulers', 'Night Convoy', 'Weigh Station Choir', 'Interchange', 'Flatbeds', 'Sideways Road Band',
      'Graveyard Shift', 'Mile Markers', 'Coffee Pot Trio', 'Dispatchers', 'Rumble Strips', 'Wide Loads',
    ],
    album: [
      'Songs From the Crossroads',
      'Truck Stop Jukebox, Vol. #vol#',
      'Up, Down and Sideways',
      'Fragile Loads',
      'Ten-Four',
      'The Graveyard Shift Sessions',
      'Live at the Diner (Dolores on Coffee)',
    ],
    vol: num(1, 12),
    note: [
      '#sharedNote#',
      'Recorded in the cab at a hundred and twelve miles an hour. Knitting can be heard throughout.',
      'Big Rosalind does not recommend listening to this on the sideways road.',
      'Dolores poured the coffee for the whole session. It stayed fresh.',
      'Recorded on the old river road. You can hear the current near the bridge.',
      'Hauled across three realities in a trailer marked FRAGILE.',
      'The fox at mile marker ten sings backing vocals. He is winning.',
    ],
  },
};

// ── Lower Hollow Community Radio (community-bed) ──────────────────────────────

export const lowerHollow: TrackPack = {
  fallbackTitle: 'The Hole Remains (Theme)',
  albumChance: 0.3,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#local# #tuneType#',
      'Theme for the #hollowThing#',
      'Theme for the #hollowThing# (#hollowVersion#)',
      '#tuneType# for #neighbour#',
      'Hymn for the Hole (#hymnTail#)',
      '#local# #tuneType# (#hollowVersion#)',
      '#local# #tuneType# for #neighbour#',
    ],
    rare: ['The Hole Remains (#hollowVersion#)', 'Item Three, #hymnTail#', 'Not My Place, #neighbour#'],
    fixed: ['The Hole Remains (Theme)', 'Not the Hole, My Door', 'Biscuit Is Busy', 'Something Plugged Itself In'],
    local: [
      'Rim Lane', 'Bake Sale', 'Noticeboard', 'Post Office', 'Church Hall', 'Scout Hut', 'Village Green', 'Jumble Sale',
      'Lost and Found', 'Rim Cottages', 'Committee', 'Choir Practice', 'Bunting', 'Flapjack', 'Lemon Drizzle', 'Overnight',
    ],
    tuneType: ['Reel', 'Waltz', 'Shuffle', 'Hymn', 'Lullaby', 'Two-Step', 'Song', 'Jig', 'March', 'Ballad', 'Strum', 'Theme'],
    hollowThing: [
      'Hole Committee', 'Lost Umbrella', 'Overnight Hole Report', 'Bake Sale', 'Single Shoes', 'New Fence', 'Noticeboard',
      'Thank-You Notes', 'Far Rim', 'Annual Inspection', 'Letter With No Stamp', 'Post Office Queue', 'Fairy Lights',
      'Extra Tenor', 'Warm Toast Breeze', 'Yellow Balloon',
    ],
    neighbour: [
      'Biscuit', 'Duchess', 'Ivy Cole', 'Councillor Dibbs', 'Maureen', 'Mrs Crabtree', 'Ron', 'Ellie Marsh', 'Edna',
      'Mister Ainsley', 'the Far Rim', 'Whoever Is New', 'the Tenors', 'the Hole',
    ],
    hymnTail: ['Do Not Look', 'Do Not Answer', 'Responsive Reading', 'Low Voices Only', 'Second Verse Omitted', 'Please Remain Seated', "Don't Harmonise", 'Organ Version'],
    hollowVersion: ['Church Hall Recording', 'Open Evening', 'Rehearsal', 'Ukulele Version', 'Overnight Mix', 'For the Noticeboard'],
    artist: ARTIST_SHAPE,
    resident: [
      'The Lower Hollow Ukulele Circle',
      'The Hole Committee Glee Club',
      'Edna Brannigan, Piano',
      'The Rim Lane Players',
      'Councillor Dibbs (Recorder)',
      'The Bake Sale Four',
      "Maureen's Nephew Gary (Guitar)",
      'The Choir (Plus One)',
    ],
    made: ['The #local# #ensemble#', '#firstL# #lastL#, #instrumentL#', '#firstL# #lastL#, #instrumentL#'],
    ensemble: ['Players', 'Singers', 'Circle', 'Band', 'Quartet', 'Ensemble', 'Society', 'Strummers'],
    firstL: ['Edna', 'Gary', 'Ron', 'Ivy', 'Pauline', 'Derek', 'Sheila', 'Trevor', 'Brenda', 'Malcolm', 'Joan', 'Keith'],
    lastL: ['Ainsley', 'Crabtree', 'Brannigan', 'Marsh', 'Cole', 'Fenwick', 'Doyle', 'Horrocks', 'Bellamy', 'Pettigrew'],
    instrumentL: ['Guitar', 'Piano', 'Ukulele', 'Recorder', 'Tambourine', 'Harmonium', 'Shaker', 'Banjo'],
    album: ['Music for the Noticeboard', 'Live at the Church Hall', 'Songs From the Rim', 'Lower Hollow Open Evening, Vol. #vol#'],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      'Recorded at the church hall open evening, on the town side of the rim.',
      'Please do not play this record near the hole. It plays back.',
      "Sold at the bake sale, next to Edna's fruit cake, which has also never been finished.",
      'The extra voice on the low notes is not credited. Please do not harmonise with it.',
      'Donated to the station by Mister Grumbel, along with a ladder nobody has used.',
    ],
  },
};

// ── Gristwick Parish Radio (brass-band) ───────────────────────────────────────

export const gristwickParish: TrackPack = {
  fallbackTitle: 'March No. 300',
  albumChance: 0.3,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      'March No. #marchNo#',
      '#fete# #brassForm#',
      'Fanfare for #villager#, #feteYear# Year',
      '#brassForm# for the #feteYear# Year',
      '#fete# #brassForm# (#bandVersion#)',
      '#brassForm# for #villager#',
    ],
    rare: ['Still Open (#bandVersion#)', 'After the Raffle (#bandVersion#)', 'March No. #marchNo# (#bandVersion#)'],
    fixed: [
      'Thank You All, Go Home, Mind the Bunting',
      'Marrow Triumphant',
      'Nearly at the Trio Section',
      "Aren't We All (Tombola Hymn)",
      'Declared Open (Again)',
    ],
    marchNo: num(1, 999),
    feteYear: ordinal(1, 300),
    fete: [
      'Tombola', 'Marrow', 'Maypole', 'Bunting', 'Tea Tent', 'Tug of War', 'Welly Throwing', 'Coconut Shy', 'Raffle',
      'Victoria Sponge', 'Dog Show', 'Lych Gate', 'Urn', 'Bell-Ringers', 'Scone', 'Marquee',
    ],
    brassForm: ['March', 'Two-Step', 'Fanfare', 'Hymn', 'Polka', 'Galop', 'Quickstep', 'Processional', 'Chorale', 'Trio Section'],
    villager: [
      'Mister Hebblethwaite', 'Mrs Pargeter', 'Mrs Abernathy', "Mrs Abernathy's Sister", 'the Reverend', 'Admiral (Both)',
      'Young Tom Fairley', 'Thomas, Tea Tent Manager', 'the Lady in the Blue Bonnet', 'the Bell-Ringers', 'the Judges',
      'the Committee', 'the Regulars', 'the Marrow',
    ],
    bandVersion: ['Slightly Out of Time', 'Reserve Band', 'Evensong Arrangement', 'Night Fête Version', 'Opening Ceremony', 'Trio Section Only', 'From the Marquee'],
    artist: ARTIST_SHAPE,
    resident: [
      'The Gristwick Silver Band',
      'The Gristwick Silver Band (Reserve)',
      'The Tea Tent Trio',
      'The Maypole Ribbon Ensemble',
      'Lower Gristwick Euphonium Society',
      'The Reverend Ashby (Cornet)',
      "The Bell-Ringers of Saint Wilfreda's",
      'Upper Gristwick Tug of War Choir',
    ],
    made: ['The #village# #bandG#'],
    village: ['Gristwick', 'Upper Gristwick', 'Lower Gristwick', 'Gristwick-under-Gristwick', 'Gristwick Green', 'Little Gristwick', 'Gristwick End', 'Gristwick Parish'],
    bandG: ['Silver Band', 'Brass Ensemble', 'Prize Band', 'Cornet Club', 'Euphonium Society', 'Concert Band', 'Marching Band', 'Bugle Corps', 'Town Band', 'Jubilee Band'],
    album: ['Three Hundred Years of the Fête', 'Music From the Marquee', 'Marches for an Endless Afternoon, Vol. #vol#', 'Still Open'],
    vol: num(1, 300),
    note: [
      '#sharedNote#',
      'Recorded under the striped tent, slightly out of time, as is traditional.',
      'The band have been playing this march since the opening ceremony. They are nearly at the trio section.',
      'Played during the judging of the giant marrow, which was too large to bring into the marquee.',
      'The tug of war was in progress throughout this recording. Neither side moved.',
      'Dedicated to the lady in the blue bonnet, who has not yet collected her prize.',
    ],
  },
};

export const V3A_STATION_PACKS: Readonly<Record<string, TrackPack>> = {
  'smoke-ring-trio': smokeRingTrio,
  'lower-hollow': lowerHollow,
  'bubble-economy': bubbleEconomy,
  'breakbeat-observatory': breakbeatObservatory,
  'piano-empty-rooms': pianoEmptyRooms,
  'wall-of-fog': wallOfFog,
  'drowned-shanty-hour': drownedShanty,
  'event-horizon-surf': eventHorizonSurf,
  'gristwick-parish': gristwickParish,
  'waystation-9': waystation9,
};

/**
 * Packs for the new recipes these stations introduce. As in v2, a recipe borrows its home
 * station's pack, so when a pirate or a rotating station plays city pop, the resident artists
 * of Marina City Nine turn up there too (with their own sound).
 */
export const V3A_RECIPE_PACKS: Readonly<Partial<Record<RecipeId, TrackPack>>> = {
  'jazz-trio': smokeRingTrio,
  'city-pop': bubbleEconomy,
  'drum-and-bass': breakbeatObservatory,
  'ambient-piano': pianoEmptyRooms,
  shoegaze: wallOfFog,
  'sea-shanty': drownedShanty,
  'surf-rock': eventHorizonSurf,
  'community-bed': lowerHollow,
  'brass-band': gristwickParish,
  'trucker-country': waystation9,
};
