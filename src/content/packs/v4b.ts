// Track-naming packs for the v4 Outer Band world-music stations (writers-world): orbit-roots
// (roots-reggae), island-time (island-reggae), tiki-satellite (exotica) and atomic-bachelor-pad
// (space-age-pop).
//
// Same shape as v3a: title → #main# or #rare#, hand-written `fixed` titles in light rotation,
// an optional `suffix`, and a small roster of `resident` artists who play about two tracks in
// five (the music engine gives each artist name its own sound signature). Everyone else is
// `made`. Rule names avoid the common grammar's (`when`, `n`, `where`, `instrument`, `player`,
// ...) so shared liner notes keep their own wording.
//
// The reggae packs take their jokes from the farm moon and the island's clock, never from the
// culture. Nothing here is a real song, artist, label or brand.

import type { RecipeId } from '../../broadcast/types';
import { num } from '../grammar';
import { TITLE_SHAPE } from './common';
import type { TrackPack } from './types';

/** Two tracks in five go to the station's resident artists. */
const ARTIST_SHAPE: readonly string[] = ['#resident#', '#resident#', '#made#', '#made#', '#made#'];

// ── Orbit Roots (roots-reggae) ────────────────────────────────────────────────

export const orbitRoots: TrackPack = {
  fallbackTitle: 'Who Owns the Water',
  albumChance: 0.55,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#crop# #rootsForm#',
      '#crop# #rootsForm#',
      'Who Owns the #element#? (#crop# Dub)',
      '#crop# in #farmSpot#',
      '#element# for #farmFolk#',
      'Grow #growHow#, #farmFolk#',
      '#farmTime# on the #farmPlace#',
      'Down to the #deep#, #farmFolk#',
      'The #crop# Is #cropState#',
      '#farmTime# #rootsForm#',
      'Letter to #landlord# (#crop# Version)',
      '#ringWord# #rootsForm# for #farmFolk#',
    ],
    rare: ['Give Thanks for #thanks#', 'Ice From the #ringWord#', 'Deep Roots (#crop# Version)', 'Off-Beat #rootsForm#', 'A Long Table for #farmFolk#'],
    fixed: [
      'Who Owns the Water?',
      'Respect the Pipes',
      'Letter on a Cabbage Leaf',
      'Two Weeks Ahead of the Office',
      'Some Days, Up Is a Bean',
      'Never Argue With a Floating Pumpkin',
      'Everything Grows on the Off-Beat',
    ],
    crop: [
      'Runner Bean', 'Cabbage', 'Tomato', 'Pumpkin', 'Lettuce', 'Spinach', 'Carrot', 'Sweet Potato', 'Okra', 'Pepper',
      'Melon', 'Barley', 'Wheat', 'Yam', 'Breadfruit', 'Seedling', 'Sugarcane', 'Mango', 'Squash', 'Ginger',
    ],
    rootsForm: [
      'Dub', 'Version', 'Chant', 'Anthem', 'Hymn', 'Stepper', 'Lament', 'Bassline', 'Sound', 'Shuffle', 'Parable',
      'Blessing', 'Sermon', 'Lullaby', 'March', 'Testament',
    ],
    element: ['Water', 'Rain', 'Ice', 'Rings', 'Sky', 'Soil', 'Seed', 'Sunlight', 'Harvest', 'Shade', 'Night', 'Moon'],
    farmSpot: [
      'Greenhouse Nine', 'Row Six', 'the Packing Shed', 'the Pump House', 'the Seed Exchange', 'Low Gravity', 'the Upper Gantry',
      'Greenhouse Forty', 'the Far Greenhouse', 'the Long Rows', 'the Mist', 'the Ringlight', 'the Porch', 'the Dark',
    ],
    farmFolk: [
      'the People', 'the Seedlings', 'the Harvest Crew', 'Mother Hale', 'the Pump House', 'Three Systems', 'the Children',
      'Everybody', 'the Long Table', 'the Thirsty', 'the Night Pickers', 'Brother Amos', 'the Bees', 'the Roots',
      'the Water Carriers', 'Row Six',
    ],
    thanks: [
      'Water', 'Good Soil', 'the Ice', 'the Off-Beat', 'Low Gravity', 'the Harvest', 'Good Seed', 'Slow Growth', 'the Misters',
      'Patience', 'a Little Shade', 'the Long Table', 'Clean Pipes', 'the Ringlight', 'Another Season',
    ],
    growHow: ['Slow', 'Tall', 'Upward', 'Together', 'Patient', 'Quiet', 'Steady', 'Deep', 'Strong', 'Green', 'Sideways', 'Gentle'],
    farmTime: [
      'Dawn', 'Ringrise', 'Dusk', 'First Light', 'Midnight', 'Planting Time', 'Dry Season', 'Mister Time', 'Nightfall',
      'Lunchtime', 'Seed Time', 'Icefall', 'Long Season', 'Picking Time',
    ],
    farmPlace: [
      'Fields', 'Greenhouse Ring', 'Furrows', 'Farm Moon', 'Packing Shed', 'Long Rows', 'Glasshouses', 'Seed Beds', 'Orchard',
      'Terraces', 'Pump House', 'Porch', 'Upper Gantry', 'Water Line',
    ],
    ringWord: ['Ring', 'Rings', 'Oldwater', 'Icefall', 'Ringlight', 'Ringrise', 'Ice Ring', 'High Ring'],
    deep: ['Roots', 'Soil', 'Bedrock', 'Seed', 'Water Table', 'Deep Soil', 'Ground', 'Root Cellar', 'Clay', 'Good Earth'],
    cropState: [
      'Floating', 'Ready', 'Two Weeks Ahead', 'Heavy', 'Listening', 'Coming Up', 'Asleep', 'Still Growing', 'Leaning',
      'Thirsty', 'in Space', 'Grateful', 'Patient', 'Rising',
    ],
    landlord: [
      'Clearline Holdings', 'the Water Company', 'the Landlord', 'Three Systems Away', 'the Bank', 'Whoever Owns the Ice',
      'the Office', 'Very Nice Paper', 'the Head Office', 'the Board',
    ],
    suffix: [
      'Dub', 'Version', 'Pump House Version', 'Off-Beat Mix', 'Greenhouse Dub', 'Long Table Version', 'Deep Roots Mix',
      'Irrigation Plate', 'Low Gravity Dub', 'Porch Session',
    ],
    artist: ARTIST_SHAPE,
    resident: [
      'The Irrigators',
      'Mother Hale and the Seedlings',
      'Brother Amos and the Pump House Band',
      'Kingsley Furrow',
      'Delphine Rainbarrel',
      'The Off-Beat Co-operative',
      'Ringwater Youth',
      'Junior Greenhouse',
    ],
    made: ['#rootsFirst# #rootsLast#', '#rootsFirst# #rootsLast#', '#rootsFirst# #rootsLast# and the #rootsBand#', 'The #rootsBand#'],
    rootsFirst: [
      'Clement', 'Hortense', 'Eustace', 'Marcia', 'Lorna', 'Ivy', 'Neville', 'Linton', 'Pearline', 'Gloria', 'Augustine',
      'Norma', 'Rowan', 'Fern', 'Josiah', 'Esther', 'Abner', 'Cedric',
    ],
    rootsLast: [
      'Furrow', 'Fieldstone', 'Greenway', 'Rainford', 'Seedwell', 'Waterman', 'Rowe', 'Gantry', 'Planter', 'Orchard',
      'Stillwater', 'Ringwood', 'Harrow', 'Meadows', 'Springfield', 'Tiller',
    ],
    rootsBand: [
      'Seedlings', 'Pump House Band', 'Long Rows', 'Misters', 'Night Pickers', 'Water Carriers', 'Glasshouse Players',
      'Harvest Crew', 'Root Cellar Sound', 'Off-Beat Irrigators', 'Ringlight Band',
    ],
    album: [
      'Crop Reports, Vol. #vol#',
      'Off-Beat Irrigation',
      'Who Owns the Water',
      'Songs From the Greenhouse Ring',
      'Deep Roots at Midnight',
      'The Long Table Sessions',
      'Live on the Porch',
      'Dub Plates From the Pump House',
      '#crop# Season',
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded on the porch. The tomatoes by the speaker stack are now two weeks ahead.',
      'The irrigation on this track runs on the off-beat, like everything else on the moon.',
      'Mother Hale says the young ones mixed this too quiet. She has turned it up.',
      'Played by Brother Amos on the pipes of the pump house. Pressure was good.',
      'A pumpkin floated past the microphone during the second verse. It has been left in.',
      'Dedicated to whoever owns the water. A copy has been sent, on a cabbage leaf.',
    ],
  },
};

// ── Island Time Observatory (island-reggae) ───────────────────────────────────

export const islandTime: TrackPack = {
  fallbackTitle: 'Half Past Something',
  albumChance: 0.5,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#pastWhat# Past #something#',
      '#sun# Is #sunState# Over #hillPlace#',
      '#lazy# Tide Table for #islander#',
      '#lazy# #islandThing#',
      '#lazy# #islandThing#',
      'Waiting for the #waitFor#, #islander#',
      '#lazy# Days on #hillPlace#',
      '#lazy# Observations of #observed#',
      '#lazy# Under #sun#',
      '#lazy# #islandThing#, Since 1983',
      '#lazy# Song for #islander#',
      '#lazy# #islandThing# at #hillPlace#',
    ],
    rare: ['Nobody Is Late (#islander.cap#)', 'Set Your Watch by #islandThing.a#', '#sun# Is #sunState#', 'Observations of #observed#', 'Tide Table for #islander#'],
    fixed: [
      'Time Is Optional',
      'Later, Eventually',
      'Half Past Something',
      'Nobody Has Been Late Since 1983',
      'Sooner and Later',
      'The Tide Is Out to Lunch',
      "A Letter I Haven't Written Yet",
      'Set Your Watch by Nothing',
      'The Egg Will Be Done When It Is Done',
    ],
    pastWhat: [
      'Half', 'Quarter', 'Twenty', 'Ten', 'Five', 'Nearly Half', 'Just Gone Half', 'Roughly Half', 'About Ten', 'Somewhere',
      'A Little', 'Long',
    ],
    something: [
      'Something', 'Later', 'Sundown', 'Lunch', 'Eventually', 'Whenever', 'the Tide', 'Teatime', 'the Slow Sun', 'Nap Time',
      'the Ferry', 'Yesterday', 'Dusk', 'the Afternoon', 'Breakfast', 'the Mangoes', 'Low Tide', 'Sunrise', 'Nineteen Eighty Three',
      'the Postman', 'the Hammock', 'Supper',
    ],
    sun: ['Sooner', 'Later', 'the Slow Sun', 'the Quick Sun', 'Both Suns', 'the Second Sun', 'the Big Orange One'],
    sunState: [
      'Setting', 'Taking Its Time', 'Still Up', 'Thinking About It', 'in No Hurry', 'Coming Back Up', 'Nearly Down',
      'Almost Gone', 'Changing Its Mind', 'Having a Lie-In', 'Running Late', 'Waiting for the Other One',
    ],
    islander: [
      'the Tortoise', 'Miss Dorothy', 'the Postman', 'the Ferryman', 'the Professor', 'the Tide Markers', 'Nobody in Particular',
      'the Pier', 'the Beach Bar', 'Everyone', 'the Night Shift', 'the Fishermen', 'Late Arrivals', 'the Hammock',
    ],
    lazy: [
      'Slow', 'Easy', 'Sleepy', 'Lazy', 'Barefoot', 'Unhurried', 'Half Asleep', 'Sunburnt', 'Gentle', 'Warm', 'Patient',
      'Drifting', 'Lingering', 'Breezy', 'Late Afternoon', 'Timeless',
    ],
    islandThing: [
      'Hammock', 'Tide', 'Ferry', 'Afternoon', 'Sunset', 'Postman', 'Telescope', 'Coconut', 'Breeze', 'Beach Bar', 'Sundial',
      'Tortoise', 'Pier', 'Mango', 'Porch', 'Shoreline', 'Kettle', 'Clock', 'Wristwatch', 'Lighthouse',
    ],
    waitFor: [
      'Ferry', 'Post', 'Slow Sun', 'Tide', 'Kettle', 'Egg', 'Weekend', 'Letter', 'Tortoise', 'Year to Change', 'Mangoes',
      'Second Sunset', 'Tide Markers to Agree', 'Clock to Move',
    ],
    hillPlace: [
      'Tide Hill', 'the Pier', 'the Beach', 'the Observatory Steps', 'the Rocks', 'the Point', 'the Half Past Bar', 'the Dome',
      'the Jetty', 'the Lagoon', 'the Lookout', 'the Sand Bar',
    ],
    observed: [
      'a Star', 'the Ferry', 'the Slow Sun', 'Nothing in Particular', 'the Tortoise', 'Miss Dorothy', 'the Clock', 'the Tide',
      'a Passing Ship', 'Last Week', 'the Other Moon', 'a Shooting Star', 'the Hammock', 'the Afternoon',
    ],
    suffix: [
      'Slow Version', 'Eventually', 'Half Past Mix', 'Sunset Version', 'Hammock Mix', 'Take Your Time', 'Recorded Later',
      'Low Tide Version', '1983 Version', 'Observatory Take',
    ],
    artist: ARTIST_SHAPE,
    resident: [
      'The Half Past Band',
      'Miss Dorothy and the Tide Tables',
      'Sooner and Later',
      'The Patient Tortoise Sound',
      'Lennox Driftwood',
      'The Ferry That Already Came',
      'Calvin Eventually',
      'The Tide Hill Stargazers',
    ],
    made: ['#islandFirst# #islandLast#', '#islandFirst# #islandLast#', '#islandFirst# #islandLast# and the #islandBand#', 'The #lazy# #islandBand#'],
    islandFirst: [
      'Basil', 'Clarice', 'Lennox', 'Hyacinth', 'Rupert', 'Monica', 'Osbert', 'Viola', 'Felix', 'Joyce', 'Ambrose', 'Inez',
      'Conrad', 'Daphne', 'Errol', 'Maisie',
    ],
    islandLast: [
      'Driftwood', 'Sandford', 'Eventually', 'Shoreham', 'Tidewell', 'Lately', 'Palmer', 'Breezeway', 'Sundown', 'Saltmarsh',
      'Shelley', 'Coves', 'Seaborne', 'Hammock',
    ],
    islandBand: ['Hammocks', 'Driftwood Band', 'Tide Tables', 'Stargazers', 'Sundials', 'Beach Bar Band', 'Ferrymen', 'Slow Suns', 'Late Arrivals'],
    album: [
      'Tide Tables, Vol. #vol#',
      'Morning, Eventually',
      'Lying Down Astronomy',
      'The Slow Sunset Sessions',
      'Live at the Half Past Bar',
      'Songs for a Patient Tortoise',
      'Recorded Whenever',
      'Sooner and Later',
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded at half past something. The session ended when it ended.',
      'The three tide markers disagree about when this was recorded. All of them are confident.',
      'Begun in 1983. Finished later. Later is a sun.',
      'Miss Dorothy says this one goes best with fresh juice and a hammock.',
      'The drummer arrived on time for this session. Nobody has mentioned it.',
      'The slow sun set during the final chorus. It took about three hours.',
    ],
  },
};

// ── Tiki Satellite (exotica) ──────────────────────────────────────────────────

export const tikiSatellite: TrackPack = {
  fallbackTitle: 'Sixteen Sunrises',
  albumChance: 0.6,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#retro# #exotic# of Tomorrow',
      '#retro# #exotic#',
      '#retro# #exotic#',
      '#retro# #tikiDance# in Zero Gravity',
      '#retro# #tikiDance#',
      'Sunrise Number #sunriseN# Over #below#',
      'Moonlight on the #deck# (#tikiDance#)',
      '#crewName.cap# Plays the #tikiInstrument#',
      '#retro# Bird Calls for #birdsFor#',
      'By #futureYear#, #prediction#',
      '#exotic# Over #below#',
      'The #retro# #lounge#',
      '#tikiDance# for #tikiFor#',
    ],
    rare: ['Sunrise Number #sunriseN# (Toasted)', 'Moonlight on the #deck#', '#exotic# of Tomorrow', 'Bird Calls for #birdsFor#'],
    fixed: [
      'Dock at the Round Door',
      'The Relief Crew Is Expected Any Day Now',
      "Ask Your Bartender (He's on the Ceiling)",
      'Sixteen Sunrises',
      'Hands Off, and Humming',
      'A Lovely Family in a Lovely Wheel',
      'The Future Is Bringing Snacks',
    ],
    exotic: [
      'Lagoon', 'Sunrise', 'Orchid', 'Volcano', 'Breeze', 'Jungle', 'Kitchen', 'Rocket', 'Moonbeam', 'Porthole',
      'Paradise', 'Pineapple', 'Reef', 'Firefly', 'Coconut', 'Bamboo', 'Monsoon',
    ],
    retro: [
      'Atomic', 'Orbital', 'Chrome', 'Supersonic', 'Radar', 'Jet-Age', 'Weightless', 'Interplanetary', 'Satellite', 'Rocket',
      'Electronic', 'Ultrasonic', 'Stratospheric', 'Push-Button', 'Space-Age', 'Rotating',
    ],
    tikiDance: ['Cha Cha', 'Mambo', 'Rumba', 'Bolero', 'Conga', 'Beguine', 'Waltz', 'Serenade', 'Lullaby', 'Nocturne', 'Fox-Trot', 'Lament'],
    sunriseN: num(1, 16),
    deck: [
      'Lagoon Deck', 'Porthole', 'Airlock', 'Observation Ring', 'Docking Bay', 'Bamboo Bar', 'Hydroponic Garden', 'Wheel',
      'Upper Ring', 'Space Station', 'Cocktail Lounge', 'Launch Pad',
    ],
    crewName: [
      'Vera Voss', 'Howard', 'Lyle', 'the Orbiteers', 'the Relief Crew', 'the Bartender', 'the Engineer', 'the Robot Butler',
      'the Navigator', 'the Captain', 'Clarence', 'the Night Watch', 'the Cook', 'the Radio Officer',
    ],
    tikiInstrument: [
      'Theremin', 'Vibraphone', 'Bongos', 'Bird Calls', 'Marimba', 'Celeste', 'Gong', 'Steel Guitar', 'Wind Chimes', 'Ondioline',
      'Glockenspiel', 'Bamboo Flute',
    ],
    birdsFor: [
      'the Birds of Tomorrow', 'an Empty Sky', 'Nobody in Particular', 'the Relief Crew', 'Station Seven', 'Sunrise Twelve',
      'a Pigeon', 'the Moon', 'the Year 1965', 'a Very Quiet Orbit',
    ],
    futureYear: ['1961', '1962', '1963', '1964', '1965', '1966'],
    prediction: [
      'Everyone in Orbit', 'Rain by Appointment', 'Dinner in a Pill', 'We Will All Be Here', 'Holidays on the Moon', 'a Robot Named Clarence',
      'Two Lagoons', 'Wrist Radios', 'Flying Cars', 'No More Mondays', 'Sunny Forever', 'the Relief Crew',
      'Picnics on Mars', 'Rockets for Two', 'Breakfast in Space', 'A Lagoon in Every Home', 'Robot Gardeners', 'Weekends in Orbit',
      'Atomic Lawnmowers', 'Moon Honeymoons',
    ],
    below: ['Earth', 'the Equator', 'the Ocean', 'the Night Side', 'the Moon', 'Mars', 'Station Seven', 'the Clouds', 'Sunrise'],
    lounge: ['Lounge', 'Lagoon', 'Cocktail Hour', 'Porthole', 'Bamboo Bar', 'Wheel', 'Paradise', 'Volcano Room', 'Breakfast Pill'],
    tikiFor: [
      'the Relief Crew', 'Sunrise Eleven', 'the Robot Butler', 'a Floating Pineapple', 'Miss Vera Voss', 'the Year 1958',
      'Tomorrow', 'the Lagoon Deck', 'the Bartender', 'Two Hundred Miles Up', 'the Navigator', 'Clarence', 'a Weightless Lady',
      'the Night Side', 'a Very Modern Couple', 'the Year 1965',
    ],
    suffix: [
      'Zero-G Version', 'Live on the Lagoon Deck', 'Theremin Version', 'Cocktail Hour Take', 'Bird Calls by Howard',
      'Sunrise Take', 'Recorded in Orbit', 'Hands-Off Version', 'Mono, 1958',
    ],
    artist: ARTIST_SHAPE,
    resident: [
      'The Orbiteers',
      'Miss Vera Voss',
      'Howard and His Bird Calls',
      'The Lagoon Deck Strings',
      'The Satellite Seven',
      'Dorian Moonbeam',
      'The Relief Crew',
      'Marguerite Comet',
    ],
    made: [
      '#tikiHim# #tikiLast# and His Orchestra',
      '#tikiHer# #tikiLast# and Her Orchestra',
      'The #tikiHim# #tikiLast# #ensemble#',
      'The #tikiHer# #tikiLast# #ensemble#',
      'The #retro# #ensemble#',
    ],
    tikiHim: ['Vernon', 'Thurston', 'Merle', 'Rex', 'Bernard', 'Clifford', 'Wendell', 'Lionel', 'Desmond', 'Calvin'],
    tikiHer: ['Lorraine', 'Gloria', 'Constance', 'Lucille', 'Rosalind', 'Delphine', 'Arlene', 'Corinne', 'Bunny', 'Opal'],
    tikiLast: [
      'Starling', 'Rayburn', 'Vance', 'Lumen', 'Galloway', 'Sterling', 'Halcyon', 'Skye', 'Kestrel', 'Atwater', 'Holloway',
      'Pemberton', 'Orbitwell', 'Brightman',
    ],
    ensemble: ['Orchestra', 'Ensemble', 'Strings', 'Combo', 'Quintet', 'Sound', 'Rhythm Section', 'Players', 'Exotic Ensemble'],
    album: [
      'Music for a Space Station',
      'Cocktails in Orbit',
      'Sixteen Sunrises',
      'Exotic Sounds of Tomorrow, Vol. #vol#',
      'Breakfast in Orbit',
      'Moonlight on the Lagoon Deck',
      'The Year Is 1958',
      'The #retro# Sound of Station Seven',
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'Recorded aboard Orbital Station Seven in 1958, which it still is.',
      'Miss Vera Voss did not touch anything during this recording. The engineers were very reassured.',
      'Bird calls by Howard. There are no birds in orbit. Howard has never let that stop him.',
      'The sun rose four times during this take. The band toasted every one.',
      'A cocktail was let go of during the bridge. It has not yet been found.',
      'By 1965, every home will own this record. Probably two.',
    ],
  },
};

// ── The Atomic Bachelor Pad (space-age-pop) ───────────────────────────────────

export const atomicBachelorPad: TrackPack = {
  fallbackTitle: 'Bongos to the Left',
  albumChance: 0.6,
  grammar: {
    title: TITLE_SHAPE,
    main: [
      '#travels# to the #speaker#',
      '#travels# to the #speaker#',
      '#travels# in #stereoWord#',
      '#drink# for #drinkFor#',
      '#swank# #cosmic# #popDance#',
      '#cosmic# #popDance#',
      '#cosmic# Ping-Pong #popDance#',
      'Ping-Pong Across the #room# (#popDance#)',
      'Demonstration #demoN#: #travels#',
      '#swank# Music for #musicFor#',
      '#swank# #room#',
      '#cosmic# #popDance# (#stereoWord#)',
      'From the #speaker# to the #speaker#',
    ],
    rare: ['Music for #musicFor#', 'A Test of #testOf#', 'Ping-Pong #popDance#', 'The Bouquet of #travels#'],
    fixed: [
      'The Theremin Is in the Hallway',
      'Sit on the Chalk Mark',
      'Wide, Not Loud',
      'Four Thousand Two Hundred and Six All',
      'Mind Your Posture',
      "The Pin's Opinion of the Carpet",
      'A Test of Silence',
      'Up and Slightly to the Left',
      'There Is a Bongo in Your Kitchen',
    ],
    travels: [
      'Bongos', 'Trombones', 'Harpsichord', 'Strings', 'Flutes', 'Marimba', 'Muted Trumpets', 'Vibraphone', 'Theremin',
      'Timpani', 'Xylophone', 'Celeste', 'Organ', 'Choir', 'Pizzicato', 'Castanets', 'Ondioline', 'Whistler',
    ],
    speaker: [
      'Left Speaker', 'Right Speaker', 'Centre Image', 'Hallway', 'Kitchen', 'Next County', 'Sweet Spot', 'Sunken Lounge',
      'Patio', 'Carport', 'Far Wall', 'Chalk Mark', 'Picture Window', 'Neighbours',
    ],
    stereoWord: [
      'Stereo', 'Full Stereo', 'Two Channels', 'Wide Screen Sound', 'High Fidelity', 'Dimensional Sound', 'Panoramic Sound',
      'Astro-Sonic Sound', 'Total Stereo', 'Walnut Stereo', 'Split-Level Sound', 'Ping-Pong Stereo',
    ],
    drink: ['Martini', 'Highball', 'Sidecar', 'Gimlet', 'Nightcap', 'Sherry', 'Cocktail', 'Fizz', 'Sour', 'Old Fashioned'],
    drinkFor: [
      'Two Speakers', 'the Left Channel', 'the Right Channel', 'the Sweet Spot', 'Lot Eleven', 'the Neighbours', 'Monty',
      'the Sunken Lounge', 'the Theremin', 'One Speaker', 'the Model Twelve', 'the Chalk Mark', 'the Bongos', 'the Starburst Clock',
      'a Gentleman', 'the Picture Window',
    ],
    swank: [
      'Swinging', 'Wide', 'Hi-Fi', 'Panoramic', 'Velvet', 'Starburst', 'Sunken', 'Split-Level', 'Walnut', 'Push-Button',
      'Cocktail', 'Polished', 'Glowing', 'Two-Channel',
    ],
    cosmic: ['Lunar', 'Orbital', 'Rocket', 'Satellite', 'Asteroid', 'Comet', 'Galaxy', 'Meteor', 'Saturn', 'Jupiter', 'Venus', 'Nebula', 'Starlight'],
    popDance: [
      'Cha Cha', 'Mambo', 'Bossa Nova', 'Rumba', 'Twist', 'Bolero', 'Fox-Trot', 'Promenade', 'Shuffle', 'Stroll', 'March',
      'Polka', 'Holiday', 'Strut',
    ],
    room: ['Living Room', 'Patio', 'Sunken Lounge', 'Den', 'Kitchen of Tomorrow', 'Carport', 'Hallway', 'Rumpus Room', 'Breakfast Nook', 'Split Level'],
    demoN: num(1, 48),
    musicFor: [
      'Sunken Lounges', 'Split-Level Living', 'Two Speakers', 'a Walnut Console', 'Dressing Gowns', 'the Sweet Spot',
      'Lot Twelve', 'Martinis After Ten', 'the Theremin in the Hallway', 'the Neighbours', 'Calibration', 'One Speaker (Sorry)',
    ],
    testOf: ['Silence', 'Depth', 'Width', 'Bongos', 'Posture', 'the Left Speaker', 'Character'],
    suffix: [
      'Stereo Demonstration', 'Left Channel Only', 'Right Channel Only', 'Ping-Pong Mix', 'Wide Version', 'Calibration Take',
      'Model Twelve Pressing', 'Sweet Spot Mix', 'For One Speaker',
    ],
    artist: ARTIST_SHAPE,
    resident: [
      'The Starburst Strings',
      'The Ping-Pong Orchestra',
      'The Left and Right Orchestra',
      'Clark Sterling and His Panoramic Brass',
      'The Two Channel Choir',
      'The Walnut Console Combo',
      'Rocky Panorama',
      'The Sweet Spot Singers',
    ],
    made: [
      '#padHim# #padLast# and His Orchestra',
      '#padHer# #padLast# and Her Orchestra',
      '#padHim# #padLast# and the #stereoBand#',
      '#padHer# #padLast# and the #stereoBand#',
      'The #cosmic# #stereoBand#',
    ],
    padHim: ['Dexter', 'Monroe', 'Rodney', 'Lance', 'Harlan', 'Ferdinand', 'Cosmo', 'Irving', 'Sheldon', 'Duke'],
    padHer: ['Lavinia', 'Sylvia', 'Bettina', 'Doris', 'Valentina', 'Peggy', 'Marlene', 'Trixie', 'Georgette', 'Bonita'],
    padLast: [
      'Fidelity', 'Channing', 'Woofer', 'Treble', 'Walnut', 'Dialtone', 'Hartley', 'Highball', 'Cadence', 'Lowell', 'Bellamy',
      'Vance', 'Tweeter', 'Allbright',
    ],
    stereoBand: ['Strings', 'Brass', 'Bongo Section', 'Ping-Pongers', 'Choir', 'Space Band', 'Sound', 'Orchestra', 'Hi-Fi Players', 'Combo'],
    album: [
      'Bongos to the Left',
      'A High Fidelity Demonstration, Vol. #vol#',
      'Music for the Sweet Spot',
      'Stereo at Six',
      'The Sunken Lounge',
      'Wide, Not Loud',
      'Morning Calibration',
      '#cosmic# #popDance# in #stereoWord#',
    ],
    vol: num(1, 9),
    note: [
      '#sharedNote#',
      '#sharedNote#',
      'The bongos on this record travel to your left speaker at the fifty-second mark.',
      'Monty Stereo detects notes of chrome and walnut. Serve slightly chilled.',
      'The theremin on this recording is in the hallway. It was left a sandwich.',
      'For best results, sit on the chalk mark, in the exact centre of the sofa.',
      'Listeners with one speaker should tilt their heads slightly to the left.',
      'The neighbours at Lot Eleven asked for this one to be narrower. It was not.',
    ],
  },
};

export const V4B_STATION_PACKS: Readonly<Record<string, TrackPack>> = {
  'orbit-roots': orbitRoots,
  'island-time': islandTime,
  'tiki-satellite': tikiSatellite,
  'atomic-bachelor-pad': atomicBachelorPad,
};

/**
 * Packs for the recipes these stations introduce. As in v3, a recipe borrows its home
 * station's pack, so when a pirate or a rotating station plays exotica, the residents of the
 * Lagoon Deck turn up there too (with their own sound).
 */
export const V4B_RECIPE_PACKS: Readonly<Partial<Record<RecipeId, TrackPack>>> = {
  'roots-reggae': orbitRoots,
  'island-reggae': islandTime,
  exotica: tikiSatellite,
  'space-age-pop': atomicBachelorPad,
};
