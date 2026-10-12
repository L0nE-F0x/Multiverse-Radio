// Listener shout-outs and text-ins from around the multiverse.

import type { StationDef } from '../broadcast/types';
import { expandUntil, merge, num, type Grammar } from './grammar';
import { LIMITS } from './limits';
import { hashSeed, rngFor } from './rng';
import { worldGrammar } from './world';

export interface ListenerMessage {
  from: string;
  where: string;
  text: string;
}

const messageGrammar: Grammar = {
  message: ['#generic#', '#generic#', '#templated#', '#templated#', '#local#', '#local#'],
  generic: [
    'Played this at my wedding. Both of me cried.',
    'Listening from the bath. The bath is in another dimension. Signal is great.',
    'My cat has started nodding along. She has never nodded before.',
    'Been listening for #hours# hours straight. My houseplant now leans toward the radio.',
    "Can you play something for my shadow? He's been distant.",
    "This made me call my mum. She's in another timeline. She says hi.",
    "Requesting the one that goes '#bevSong#'. Not for me. For Bev.",
    'Do you take requests from the future? Asking for next week.',
    'Had this on while I patched a leak in reality. Leak still there. Mood much improved.',
    'My neighbour listens through the wall. I can hear the wall enjoying it.',
    'Please say hello to my grandad, who is a lighthouse now and very proud of it.',
    'Left you on all night and woke up fluent in static.',
    'Turned this up so loud my shadow came back. Then it left again. Baby steps.',
    'Driving home through three dimensions with this on. Missed my exit in all of them.',
    'Hello from the night shift! We are all very tired and you are helping.',
    'Is it normal that the radio says my name sometimes? Not complaining. Just asking.',
    "Found this station by accident. Now I can't find any of the others. Fine by me.",
    "I don't know which dimension you're in but it sounds lovely. Is it warm there?",
    'My nan says this is the best thing on the radio since the radio.',
    'You were playing in the shop where I met my wife. Different shop, different wife, same song.',
    'Thank you for keeping me company. The house is very big and mostly corridors.',
    "If anyone sees a shadow called Greg, tell him Hollis isn't cross. The porch light is on.",
    'Testing. Can anyone hear me? This is Teodor, Relay Four. If you can hear me, play something.',
  ],
  templated: [
    'Listening while #activity#. #reaction#',
    'Listening while #activity#. #reaction#',
    'Shout out to #recipient#, who #did#.',
    'Shout out to #recipient#, who #did#.',
    'Big hello to #recipient#. You know why.',
    'Request for #recipient#: anything with #instrument# in it, please.',
  ],
  hours: num(9, 400),
  activity: [
    'assembling furniture from the wrong instructions',
    'waiting for a kettle that is in no hurry',
    'painting a ceiling that keeps getting further away',
    'babysitting a small storm',
    'studying for an exam in a language I made up',
    'on hold with the Bureau (day #hours#)',
    'learning the accordion left-handed',
    'knitting a scarf for the moon',
    'walking a dog that is mostly fog',
    'packing for a weekend in Tuesday',
    'repotting a plant that keeps repotting itself back',
    'writing a letter to my future self, who keeps replying',
  ],
  reaction: [
    'Ten out of ten.',
    'Going great.',
    'Highly recommend.',
    'Wish me luck.',
    'Not going well, but the music is.',
    'Nearly done. Not really.',
    'The storm likes it too.',
    'Do not tell my landlord.',
  ],
  recipient: [
    'my sister in Dimension 4',
    'the night bus driver',
    'everyone in the queue on Floor −4',
    'my reflection',
    'the fox at the mast',
    'my future self',
    'the tall stranger at the end of my bed',
    'the octopus at the lounge',
    'whoever keeps leaving soup on my doorstep',
    'my neighbour, the cloud',
    'the whole of Precinct 9',
  ],
  did: [
    'just passed their flying test',
    'finally finished the leaf',
    'said something nice about my hat',
    'is having a hard week',
    'turned a hundred, then ninety-nine',
    'kept the porch light on',
    'remembered my birthday in four timelines',
    'taught me to whistle backwards',
    'has been on hold since spring and is staying positive',
    'found my keys inside a different year',
  ],
  instrument: ['a tuba', 'a kazoo', 'whales', 'a harpsichord', 'marimba', 'rain', 'a theremin', 'accordion', 'sad trumpet'],
};

/** Station-flavored messages (rule `local`). */
const LOCAL: Readonly<Record<string, readonly string[]>> = {
  'static-lullabies': [
    'My cat sleeps on the TV now and only wakes up for the quiet bits.',
    'Fell asleep before the first song. Best night in years. Thank you.',
    'Something in my wardrobe asked me to turn this up. Very politely.',
  ],
  'void-beats': [
    'Studying for finals. The void is in my study group. It has not done the reading.',
    'DJ Eventually, please finish a sentence one day. I believe in you.',
    'My essay is due at the end of the universe. Still got time, right?',
  ],
  'every-news': [
    'Dale, you told me about the end of the world and somehow made it sound manageable.',
    'Kim, are you ok? Did you eat the soup?',
  ],
  'rainfall-fm': [
    'It stopped raining here for a second and I panicked. Thank you for keeping me calm, Drizzle.',
    'Listening with the window open. My room is now also Rainfall FM.',
    'Drizzle, please read my postcode in the rainfall totals. It would mean the world.',
  ],
  'neon-2087': [
    "Velocity, you called my parking ticket rad and I've had it framed.",
    "Drove toward the horizon all night with this on. Didn't arrive. Didn't want to.",
    'Filed my taxes to this. Accountant says it was the raddest return she has ever seen.',
  ],
  classifieds: ["Bought a used planet off Rex. It came with a guy. The guy's lovely.", 'Linda, slow down. Linda, I love you. Slow down.'],
  'end-lounge': [
    'Barnaby, you said the last one was a real heartbreaker and you were right. Play another.',
    'Tell the octopus he makes a great martini. All eight of them.',
    'Saving our booth for the very end. See you there, darling.',
  ],
  'snail-jams': [
    "Started this song in spring. Can't wait for the chorus.",
    'Shelley, the leaf traffic report really helped. I took the long way round.',
    'Is it rude to listen at normal speed? I feel like I am rushing the band.',
  ],
  'dimension-hop': ['Mara, I read your reply four seconds before I wrote this. Rude.', 'Jace, legs are great. Ignore her.'],
  'crystal-delta': [
    'This made my chandelier cry. My chandelier cried.',
    'Prism, I love how you say everything twice. I love how you say everything twice, nearly.',
  ],
  'hold-music': [
    'On hold since the Tuesday before last. Love this one.',
    'Pam, are you ok? Blink twice if you are on hold too.',
    'Is there a number for the queue for the queue? Asking for a queue.',
  ],
  'pixel-afterlife': [
    "Player Two, it's me, Player One. Sorry. On my way. Pressing start now.",
    'Lost 99 times in a row. Unlocked the good song. Worth it.',
  ],
  'ask-grenda': ['Grenda, I took your advice and talked to my shadow. We are working on it.'],
  'moon-dub': [
    'Big up the crater crew! (Big up the crater crew.)',
    'Low gravity, heavy bass, very happy astronaut over here.',
    'Sent a shout-out last week. It just echoed back. Thank you, Selector.',
  ],
  whalesong: ['Is the whale ok? He looked at me.', 'Fell asleep in lane 9, woke up in lane 12. Thank you, Captain.'],
  'impossible-sports': ["Chip, I still don't know the rules, and now I don't need to."],
  'baroque-bots': [
    'Maestro, I wept at the fugue for toaster. Is that adequate, by human standards?',
    'My toaster heard this and has not been the same since. Thank you.',
  ],
  'comet-marimba': [
    "Listening from the beach. Not your beach. A slow beach. It's nice.",
    'Coco, my hammock flew off during the last song. Worth it.',
  ],
  'channel-surf': ['Who has the remote. Please. Who has the remote.'],
  'mirror-polka': ['!looc yllaer si sihT', 'Danced to this with my reflection. She led.', 'Ynnhoj, I agree with you. Sorry it took me a second.'],
  'wild-multiverse': [
    'Is the camera crew ok? Asking for the camera crew.',
    "Saw a mostly-neck giraffe at the shops. It's still at the shops. Most of it.",
  ],
  'numbers-omega': [
    'I am the listener in the blue kitchen. The milk was fine. Thank you.',
    'How many geese do I owe? Asking before I ask the geese.',
  ],
};

export function listenerMessage(station: StationDef, seed: number): ListenerMessage {
  const grammar = merge(worldGrammar, messageGrammar, { local: LOCAL[station.id] ?? messageGrammar.generic ?? [] });
  const base = hashSeed(station.id, 'listener', seed);
  const from = expandUntil(grammar, (a) => rngFor(base, 'from', a), '#sender#', (s) => s.length <= LIMITS.listenerFrom, 'A listener');
  const where = expandUntil(grammar, (a) => rngFor(base, 'where', a), '#senderPlace#', (s) => s.length <= LIMITS.listenerWhere, 'Somewhere');
  const text = expandUntil(grammar, (a) => rngFor(base, 'text', a), '#message#', (s) => s.length <= LIMITS.listenerText, 'Love the show.');
  return { from, where, text };
}
