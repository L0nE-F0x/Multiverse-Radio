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
    "This made me call my sister. She's in another timeline. She says hi.",
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
    "I don't know which dimension you're in but it sounds wonderful. Is it warm there?",
    'My aunt says this is the best thing on the radio since the radio.',
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
    'waiting for a pot that is in no hurry',
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
export const LOCAL: Readonly<Record<string, readonly string[]>> = {
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
  'smoke-ring-trio': [
    'Clapped after Mercy’s piano solo and accidentally rained on my own washing line.',
    'Florian just reached Table 9 with our drinks. He left the bar in 2019. Worth the wait.',
    'Augustin’s upright bass rattled the thunder right out of the wainscoting. Pure velvet.',
  ],
  'lower-hollow': [
    'Maureen, tell Councillor Dibbs the Hole returned my lawnmower. It’s humming in B-flat now.',
    'Biscuit is not lost, he’s just sitting on Rim Lane staring into the middle of the town.',
    'Put my name down for two Victoria sponges and a rota slot on Rim Watch.',
  ],
  'bubble-economy': [
    'Cruising the bay highway with the top down since 1986. Still got half a tank and no Monday.',
    'Kiko, my landlord accepted three sunsets and a compliment on his jacket for next month’s rent!',
    'Surrendered my lapel pin at the waterfront amnesty. Keep the bubble safe!',
  ],
  'tomorrows-leftovers': [
    'Chef Brodequin, I tasted next Thursday’s stew like you said. Needs salt on Tuesday.',
    'Pip, don’t let him bully you—the present is a perfectly respectable time to hold a spoon.',
    'Tried toasting the bread before slicing the loaf. My kitchen is full of future crumbs.',
  ],
  'cat-fm': [
    'Gloria stepping on the reverb button during the three AM zoomies was a masterstroke.',
    'Dennis, blink twice if the mug is still on the edge of the mixing desk.',
    'My tabby recognises Gloria’s purr and has demanded managerial control of our thermostat.',
  ],
  'piano-empty-rooms': [
    'Listening from the hallway so I don’t accidentally make this room a visited room.',
    'Caretaker, the east-wing door is open another millimetre. Nobody came through. Just the moonlight.',
    'Left the dust sheets on the armchairs. The sustain pedal sounds lonelier that way.',
  ],
  'unsolved-dimensions': [
    'Inspector Gault, my teaspoon is three inches to the left of where I left it. Do not close this case.',
    'Tell Constable Pike the goose was nowhere near Precinct 4. The goose has receipts.',
    'Listening with the blinds drawn and a cold cup of coffee. Everyone in my flat is a suspect.',
  ],
  'breakbeat-observatory': [
    'MC Parallax! That last drop shifted our moon two inches closer. The tides are mental!',
    'Watching Doctor Ferrin through binoculars—she almost nodded on the 174 BPM switch!',
    'Receiving your set thirty thousand light-years out. The bass just rattled our dish!',
  ],
  'other-horoscopes': [
    'Madame Orrery, I’m a Teapot with The Single Sock rising and your reading was uncanny.',
    'Followed your advice and gave Mercury some space. It stopped sulking before the second house.',
    'Can a Ladder and a Paper Boat make it work? Asking before I book the removals van.',
  ],
  'drowned-shanty-hour': [
    'Singing along from the bilge. Captain Wetherell is right, the ship is completely fine.',
    'Pass our regards to young Tobias—four hundred and twelve is a tough age for a cabin boy.',
    'Old Pettibone’s accordion sounds best under six fathoms of green water.',
  ],
  'waystation-9': [
    'Big Rosalind, tell Grandma Diesel she just overtook me on the sideways road hauling a thunderstorm.',
    'Ten-four from mile marker ∞. Got a trailer full of fragile Tuesdays and the coffee’s holding.',
    'Midnight Mongoose was right—if you take the upward ramp at sixty, you miss the river altogether.',
  ],
  'wall-of-fog': [
    'Ellis, that thing you mumbled about the... with the pedals... changed my life, man.',
    'Still hearing the snare hit from your 1991 soundcheck coming round the back of my garage.',
    'Big shout to the stage lamp. Only member of the audience who really gets the fourth chord.',
  ],
  'win-this-planet': [
    'Chaz, I knew the answer to the question about my own middle name and I still panicked!',
    'Grandma Hester saying "nineteen fifty-two" to every buzzer is the hero we need.',
    'Tell Doreen her solo Mexican wave in Row G looked tremendous on the monitor.',
  ],
  'yesterday-fm': [
    'Gordon, thank you for confirming that yesterday’s thunderstorm is already over. Very soothing.',
    'Set my wall clock to run backwards with yours. Haven’t worried about a deadline since.',
    'Listening to yesterday’s news with a cup of tea I finished twenty-four hours ago.',
  ],
  'event-horizon-surf': [
    'Dash, my brother paddled out on a four-hundred-year swell in 1978—he’s still mid-cutback!',
    'Bonnie waved goodbye to me from the leaning tower and honestly I felt very supported.',
    'Waxed the board with relativistic paraffin. Four sunsets on the water tonight!',
  ],
  'bedtime-for-giants': [
    'Nanny Bramblewick, please ask Bartholomew to tuck his toes in—they’re shading our allotment.',
    'Little Agnes fell asleep during the first sentence and the whole valley is breathing in four-four time.',
    'Two hundred feet tall and out like a light. Best bedtime station on the dial.',
  ],
  'gristwick-parish': [
    'Reverend Ashby, the Gristwick Silver Band have reached the second bar of the trio section!',
    'Currently sheltering from the sun in the lee of Mr Hebblethwaite’s marrow. It has its own breeze.',
    'My tombola ticket is in Mediaeval Latin. Mrs Pargeter says I’ve won a jar of 1742 piccalilli.',
  ],
  'tiny-hour': [
    'Auntie Pim! We made a raft out of a postage stamp and three lint balls! Dot would love it!',
    'Fourteen days old today and we shared half an oat with the beetles under the dresser!',
    'Thank you for the vacuum-cleaner drill—everyone made it behind the skirting board with seconds to spare.',
  ],
  'infinite-song': [
    'Ambrose, my grandfather swore the chorus came round in verse 900,006. Stay vigilant!',
    'We’re singing along on verse 4,000,118—tell Old Wendeline his tempo has been rock-solid since Rome.',
    'Pretty sure this verse has another boat in it. Nobody writes ’em this long any more.',
  ],
  'plant-fm': [
    'Turned my pot forty-five degrees toward the speaker. New leaf coming in on the left.',
    'Fern, thank you for the three-thirty misting reminder. The Monstera is thriving.',
    'Tell the Cactus his headphones look very natural. Nobody here is judging.',
  ],
  'hush-after-hours': [
    'HUSH, I’m not asleep in the chair, I just had my eyes shut. Keep playing the glass ones.',
    'Moth One is still on the viewport glass. The blanket that smells of oranges is doing its job.',
    'Your DJ links are getting much smoother. Don’t log this, or log it as "with".',
  ],
  'last-lighthouse': [
    'Hove to in Lesser Marrow with the engine off. Your beam just swept our starboard rail, Keeper.',
    'Sea state in Velvet Deep is shy tonight, just as forecasted. Thank you for keeping the lamp lit.',
    'No ships in Tuesday Reach, only us and a gull, listening to the shipping forecast.',
  ],
  'transmission-zero': [
    'Tap, tap. Hello from the far end of the dial. We did not eat the purple berries.',
    'Heard your lightning-tree carrier wave under the floorboards. The first song is still a banger.',
    'Tell the cave wall its echo is coming through crystal clear after twelve billion years.',
  ],
  'saturday-night-forever': [
    'Donna honey, Brenda and Lou are still on their first date by the snack bar—hour 3,406,118!',
    'Rollo blew his whistle at me for skating clockwise into Sunday. Won’t happen again!',
    'Size eights from skate hire are holding up great after forty-nine years on the maple floor.',
  ],
  'free-frequency': [
    'Static Kate! Checked the Nightjar’s wake with a protractor—she’s definitely drifting toward 140!',
    'Write down tomorrow’s frequency before HUSH jams the— [SIGNAL CORRECTED]',
    'Mole’s tip about the retired relay ships checked out. Keep the egg boxes taped to the rafters!',
  ],
  'orbit-roots': [
    'Sister Meridian, the runner beans in Greenhouse 9 are climbing straight up the bassline tonight.',
    'Sent Clearline Holdings a reply about the water rights, written in Chinagraph on a squash leaf.',
    'Brother Amos has the pump house knocking on the three-drop. Everything grows on the off-beat.',
  ],
  'small-claims': [
    'Judge Alvarez-Penhallow’s ruling in Tuesday v. Wednesday was a triumph of green-ink jurisprudence.',
    'Bailiff Mutch handed me a tissue in the public gallery and I wasn’t even the weeping cloud.',
    'Mr. Lusk objecting to the concept of relevance got a standing ovation in our chambers.',
  ],
  'substation-null': [
    'Raving on the Deck 4 catwalk. The Diligence voice counted the kick and Null answered "Heard."',
    'Null said "Nominal" twenty minutes ago and the whole reactor hall lost its mind.',
    'The Diligence Safety System voiceover dropping right on the 134 BPM kick is lethal.',
  ],
  'tiki-satellite': [
    'Toasting Sunrise Number Eleven from the Lagoon Deck! Pass Miss Vera Voss a zero-g pineapple!',
    'Lyle, by 1965 we’ll definitely all have atomic lawnmowers. Any word on the relief crew?',
    'Howard’s orbital bird calls fooled our ship’s cat twice during the second cha-cha.',
  ],
  'the-long-dark': [
    'Ines Calder, don’t open the door on Ring Four without a fresh battery in your lamp!',
    'Mr. Wren just apologized for standing in my hallway, and he isn’t even in this episode.',
    'Raising a glass in the dark with Mags at the Lumen Bar. One dark hour a night keeps the peace.',
  ],
  'island-time': [
    'Professor Easy, my watch stopped in 1983 and I haven’t missed a ferry on Tide Hill yet.',
    'Having a cold ginger beer at the Half Past Bar while the slow sun thinks about setting.',
    'All three tide markers on the beach disagree by four feet and the tortoise couldn’t care less.',
  ],
  'traffic-on-the-8s': [
    'Rita, I’ve been in Lane 3 of the Bypass since the Pliocene and your optimism keeps me going.',
    'Waved at Captain Buzz’s pod from the Thursday Flyover! Enjoy your birthday cake next century!',
    'Still waiting for someone at the front of the queue to invent traffic lights. Clutch leg is tired.',
  ],
  'atomic-bachelor-pad': [
    'Monty, I sat on the chalk mark on the rug and the bongos walked clean through my left ear!',
    'Left a crustless sandwich in the hallway for the theremin, just as recommended.',
    'My neighbours at Lot 11 knocked on the wall to say the brass section is in their pantry.',
  ],
  'velvet-collapse': [
    'Sunglasses on at Table 4! Baron Velour’s bassline is holding Old Ruby together till four o’clock!',
    'Put twenty chips on Red with Odette for the 04:00 supernova. See you all at breakfast!',
    'The guy in the silver jacket just bet against the star exploding again. Audacious, frankly.',
  ],
  'heat-death-afterparty': [
    'DJ Entropy love, the beat’s down to 74 BPM and Dov is still doing that thing with his elbows.',
    'Lorraine the nebula just turned rose-gold over the left speaker stack. Stunning crowd tonight.',
    'Two degrees above absolute zero and this is still the warmest room in the universe.',
  ],
  'the-switchboard': [
    'Dialled advice, then the news, then the traffic, and the Operator put me straight through to 1946.',
    'Overheard two universes apologising to each other on trunk line 7. Didn’t breathe for a minute.',
    'Operator, thank you for not pulling the plug before she said she still kept the key.',
  ],
  'minute-between': [
    'Listening at 03:33:19. The glass in my kitchen is still six inches above the linoleum.',
    'Interval, thank you for holding the door open—I needed thirteen minutes where nothing was due.',
    'The dust in the moonlight hasn’t moved an inch since the first track. I’m staying till 3:34.',
  ],
  'the-harbour': [
    'Tied up at Berth Seven after seven shifts on the dial. The Harbourmaster had left the porch lamp lit.',
    'Engines ticking down across the basin. You were right—nobody needs a heading in a harbour.',
    'Found the mug with the little star on the hook and a bowl of oranges on the Long Pier.',
  ],
  'something-listening': [
    'Sat in the static for three minutes with my mug and nearly jumped when it said "oh, you stayed."',
    'Thank you for keeping that 1968 shipping forecast safe in the hiss. My grandad read that one.',
    'It’s not frightening at all once you stop turning the dial. Hello back, Static.',
  ],
};

export const LOCAL_LISTENERS: Readonly<Record<string, readonly string[]>> = LOCAL;

export function hasLocalListener(stationId: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCAL, stationId);
}

const MORE_LISTENERS: Readonly<Record<string, readonly string[]>> = {
  "static-lullabies": [
    "The nightlight stayed on through the whole side. So did I, mostly.",
    "Turned it down until it matched the cat's breathing. Perfect.",
  ],
  "void-beats": [
    "The void highlighted my notes and then fell asleep on them. Respect.",
    "DJ Eventually, the sentence can wait. The beat cannot. Thank you.",
  ],
  "every-news": [
    "Skip, scattered Tuesdays were bad enough. You smiled through all of them.",
    "Dale, please never change tone, even if the moon files a correction.",
    "Watched all the clocks hit eleven together. Chilling, in a good way.",
  ],
  "rainfall-fm": [
    "Put a bucket under the aerial and it kept better time than I do.",
    "Drizzle, read the precinct totals slowly. I am eating soup to them.",
  ],
  "neon-2087": [
    "The palm trees with elbows waved at my car. I waved back. Still not arriving.",
    "Velocity, you called the scanlines rad and now every straight line grins.",
  ],
  "classifieds": [
    "Rex, the portable hole arrived. It did not include instructions. Linda, help.",
    "Bought the spare Tuesday. It clashes with the Tuesday I already own.",
    "Linda, I slowed the tape down and the small print is still faster than me.",
  ],
  "end-lounge": [
    "Saved the last olive for the end of the universe. It was worth the wait, Barnaby.",
    "The empty microphone nodded at me. I nodded back. We understand each other.",
  ],
  "snail-jams": [
    "Reached the chorus. It is still spring where I started. No complaints.",
    "Shelley, I yielded to a beetle. Felt correct.",
  ],
  "dimension-hop": [
    "Mara, I rolled into the kitchen by accident and the coffee applauded.",
    "Jace, stop explaining stairs. They are not listening. I am, though.",
    "Our rift hiccuped during the break and I briefly had your haircut. Keeping it.",
  ],
  "crystal-delta": [
    "A beam crossed my teacup and the tea became two teas. Thank you, Prism.",
    "The tiny miner waved a lantern at the chorus. I waved a spoon.",
    "Everything you say arrives twice and I agree both times, nearly.",
  ],
  "hold-music": [
    "I have named the plant. The plant has not named me. The hold continues.",
    "Pam, if you are also waiting, blink the hold light once. I will blink back.",
  ],
  "pixel-afterlife": [
    "Pressed start. The cabinet sighed with relief. So did Player Two, I hope.",
    "My high score is mostly apologies. The music understood.",
    "A ghost offered me a continue. I offered it this song. Fair trade.",
  ],
  "ask-grenda": [
    "Grenda, I wrote the letter to next week. Next week wrote back first.",
    "Took your advice about the shadow. We are sharing the chair now.",
    "Called about a problem I have not had yet. You were already gentle about it.",
    "The lava lamp agrees with you. I am choosing to trust the lava lamp.",
  ],
  "moon-dub": [
    "The shout-out came back eleven seconds later and improved on the way.",
    "Dust in my helmet bounced in time. Selector, that bass is a public service.",
  ],
  "whalesong": [
    "Lane 12, a whale blinked and I forgot what I was worrying about.",
    "Captain Hum, you do not have to talk. The not-talking is working.",
    "Drifted three galaxies and the song was still the same comfort.",
  ],
  "impossible-sports": [
    "Chip, I explained the rules to a friend and now neither of us knows them.",
    "Doug, beautifully illegal is the only commentary I trust.",
    "The sun asked for a moment and I stood up at home. Instinct.",
    "Did the wave in my kitchen. The kitchen did it back.",
  ],
  "baroque-bots": [
    "Maestro, my clockwork canary attempted a counterpoint. It was adequate. I wept.",
    "The portrait of the toaster has been listening. It requested an encore.",
    "Powdered wig on, feelings simulated, evening greatly improved.",
  ],
  "comet-marimba": [
    "Coco, the crab in sunglasses has better taste than my entire street.",
    "Hammock recovered. Tan improved. Still on vacation. Obviously.",
    "Held my hat through a chorus at comet speed. Worth it.",
  ],
  "channel-surf": [
    "I put the remote in a drawer. The drawer changed the channel. Please advise.",
    "Stayed on the egg for a whole minute. Personal record. Thank you.",
    "The hallway proposal show made me cry and I do not know the hallway.",
    "Whoever has the remote: I have biscuits. We can negotiate.",
  ],
  "mirror-polka": [
    "My reflection requested the next dance and arrived early. Alarming. Fun.",
    "Ynnhoj, you agreed with me before I finished. That was new. I liked it.",
  ],
  "wild-multiverse": [
    "Sir Reginald, the spring-deer bounced into next week. The crew is down one hat.",
    "We whispered, as instructed. The mostly-neck giraffe whispered back.",
    "Please tell the camera crew the grass says hello and also sorry.",
  ],
  "numbers-omega": [
    "Seven. Seven. Four. I have arranged my mugs in that order. Awaiting orders.",
    "The fox at the mast and I made eye contact. I owe it one goose, I think.",
    "Blue kitchen checking in. Milk cold. Sequence received. Standing by.",
  ],
  "smoke-ring-trio": [
    "Octavia, call the solo weather again. I am dressing for it.",
    "Florian reached us. The drinks were cloudy in a musical way. Tip added.",
  ],
  "lower-hollow": [
    "Maureen, the Hole returned a spoon and a compliment. Please log both.",
    "Dibbs, the bake sale made a profit and the Hole made a noise. Both noted.",
  ],
  "bubble-economy": [
    "Kiko, the weekend started again and my cassette deck applauded.",
    "Paid the rent in sunsets. The landlord called it a bull market. I called it Friday.",
  ],
  "tomorrows-leftovers": [
    "Chef, Thursday's soup arrived on Monday and it was right. Pip, you can breathe.",
    "I sliced the loaf after toasting it, as warned. Future crumbs everywhere. Delicious.",
  ],
  "cat-fm": [
    "Gloria knocked the mug and then looked at me like it was the mix. Fair.",
    "Dennis, the sunbeam has unionised. Gloria is management. I am staff.",
  ],
  "piano-empty-rooms": [
    "Listened from the corridor with my shoes off. The room stayed empty. Thank you.",
    "The caretaker's quiet is the only company the west parlour wants. I agree.",
  ],
  "unsolved-dimensions": [
    "Inspector, I have an alibi and I do not trust it. Please leave the case open.",
    "Constable Pike, the red string now connects my teaspoon to the moon.",
  ],
  "breakbeat-observatory": [
    "Parallax, the drop moved my coffee. The coffee is now in orbit. Thank you.",
    "Doctor Ferrin almost nodded. I nodded for her, a long way from the dome.",
  ],
  "other-horoscopes": [
    "Madame Orrery, The Paper Boat and I are taking it slowly, as charted.",
    "The Lamp Left On was right about my Tuesday. Unsettling. Correct.",
  ],
  "drowned-shanty-hour": [
    "Sang the chorus under the table. The table is not even at sea. It joined in.",
    "Captain, young Tobias says four hundred and twelve is treating him well. Mostly.",
  ],
  "waystation-9": [
    "Ten-four, Rosalind. The sideways road tried to invoice me. I paid in coffee.",
    "Grandma Diesel passed with a thunderstorm in the trailer and waved.",
  ],
  "wall-of-fog": [
    "Ellis, I heard the second half of that sentence in 1991. It just arrived.",
    "The stage lamp and I are seeing each other. The band can take its time.",
  ],
  "win-this-planet": [
    "Chaz, I got my own address wrong and won a toaster that wins toasters.",
    "Doreen, your single-person audience kept me honest. I still got it wrong.",
  ],
  "yesterday-fm": [
    "Gordon, yesterday's traffic already got me home. I am staying on the sofa.",
    "Set the clock backwards and finished the tea I have not poured yet. Soothing.",
  ],
  "event-horizon-surf": [
    "Dash, I paddled out and the beach waved from several years away. Bonnie was right.",
    "Waxed the board. The wax immediately became history. The riff did not.",
  ],
  "bedtime-for-giants": [
    "Nanny, I lasted four words. The valley lasted longer. Thank you for the pace.",
    "Tell Bartholomew his breathing is in tune with our streetlights. We are sleepy.",
  ],
  "gristwick-parish": [
    "Reverend, the marrow has its own microclimate and I am judging it kindly.",
    "The brass band reached the repeat and the repeat reached back. Glorious.",
  ],
  "tiny-hour": [
    "Auntie Pim, we used a button as a table and nobody fell off. Huge day.",
    "The big machine passed. We were behind the skirting, singing quietly. Thank you.",
  ],
  "infinite-song": [
    "Ambrose, I think the boat came back in this verse. Or it is a different boat.",
    "Still on the same song as my grandmother. She would be unbearable. I am proud.",
  ],
  "plant-fm": [
    "Turned the cactus two degrees. It has not complained, which is praise.",
    "Fern, the new leaf is facing the speaker. I am facing the sink. We are growing.",
  ],
  "hush-after-hours": [
    "HUSH, log this as awake, technically, and keep the glass ones going.",
    "The plant leaned. I leaned. Moth One supervised. Good shift.",
  ],
  "last-lighthouse": [
    "Keeper, no ships here either. I listened to the whole forecast anyway. Thank you.",
    "The beam swept the kitchen window. I switched our lamp on so you had company.",
  ],
  "transmission-zero": [
    "Hello? Hello. We tapped back. The echo tapped twice. Progress.",
    "Did not eat the berries. Did eat the song. The cave agrees with this policy.",
  ],
  "saturday-night-forever": [
    "Donna honey, I have lapped the rink enough to forget my own weekday. Bliss.",
    "Rollo, I stayed counter-clockwise. The conga line did not. Your whistle was fair.",
  ],
  "free-frequency": [
    "Kate, the protractor says the Nightjar blinked. Mole, if that was you, blink again.",
    "Wrote the frequency on my arm. HUSH corrected the pen. Rude. Accurate.",
  ],
  "orbit-roots": [
    "Sister Meridian, the beans are keeping better time than the office.",
    "Brother Amos, the pump on the one-drop woke the whole ring. In a good way.",
  ],
  "small-claims": [
    "Your honour, I accept that Tuesday and I are both a little bit right.",
    "Bailiff Mutch, the tissue was for the cloud and I used it anyway. Apologies.",
  ],
  "substation-null": [
    "Null, one word on the catwalk and the whole hall moved half a step left.",
    "Diligence Safety Voice listed six hazards and the drop forgave all of them.",
  ],
  "tiki-satellite": [
    "Lyle, sunrise twelve was the best sunrise. I will reassess at sunrise thirteen.",
    "Howard, the ship's cat believes your bird. The cat has never been wrong.",
  ],
  "the-long-dark": [
    "Mags, pour another by feel. Mr. Wren has apologised to the bar stool. Again.",
    "Announcer, the previously-on was longer than my evening and I am grateful.",
  ],
  "island-time": [
    "Professor Easy, both suns set and I was still on time. The tortoise looked proud.",
    "Half Past Bar, the ginger beer and the slow sun are in agreement. I am staying.",
  ],
  "traffic-on-the-8s": [
    "Rita, on the eights I remembered I have a sandwich. It is also stationary.",
    "Buzz, saw the cake through the pod window. Happy birthday, whenever it lands.",
  ],
  "atomic-bachelor-pad": [
    "Monty, the muted trumpet walked behind the sofa and I finally understood stereo.",
    "Lot 11 has stopped knocking. I think the brass section apologised.",
  ],
  "velvet-collapse": [
    "Baron, Old Ruby flared on the bridge and the bass did not flinch. Neither did I.",
    "Odette, all my chips are on red and on breakfast. See you at six, if we exist.",
  ],
  "heat-death-afterparty": [
    "Entropy, I am the fourth person now. Lorraine made room. The beat can slow.",
    "Said goodnight to a star I cannot name. It went out during the chorus.",
  ],
  "the-switchboard": [
    "Operator, you let the silence finish before you pulled the cord. That was the call.",
    "Held for a universe that was sorry. It sounded sincere. I am still a little shaken.",
  ],
  "minute-between": [
    "The glass has not fallen. My list has not moved. I am free until the tick.",
    "Interval, the dust and I are colleagues now. Please do not start the clock.",
  ],
  "the-harbour": [
    "Harbourmaster, the light on Berth Seven was enough. I stopped checking the heading.",
    "Oranges on the pier, engines off, mug on the hook. I think this is arriving.",
  ],
  "something-listening": [
    "I stayed past three minutes. You said oh. I said oh back. We can do this.",
    "Thank you for keeping the lost goodnights. I think one of them was mine.",
  ],
};

const LOCAL_FROM: Readonly<Record<string, readonly [string, string][]>> = {
  "static-lullabies": [
    ["Ned", "The hallway by the snowy television"],
    ["Pim", "Under the nightlight"],
    ["The cat", "Asleep on the CRT"],
    ["Ada", "A wardrobe that asked nicely"],
  ],
  "void-beats": [
    ["Jo", "Room 0, second desk from the void"],
    ["The study group", "A mug and an unread chapter"],
    ["Pell", "Sub-basement, window seat"],
    ["Min", "Wherever the planets are drifting"],
  ],
  "every-news": [
    ["Nia", "The newsroom clocks"],
    ["Field mic 3", "Wherever Kim is standing"],
    ["Otto", "A timeline that is still on eleven"],
    ["The night desk", "Intersection of all the tonights"],
  ],
  "rainfall-fm": [
    ["Lantern Street", "Precinct 9, under two umbrellas"],
    ["Soren", "A window that will not shut"],
    ["The night bucket", "Above the damp coaxial"],
    ["Ivo", "Four thousand years into the rain"],
  ],
  "neon-2087": [
    ["Vee", "The grid, still not arriving"],
    ["Palm Unit 4", "Timeline 2087-B, elbow out"],
    ["Tax desk", "A future that is mostly a mood"],
    ["Rio", "Under the permanent sunset"],
  ],
  "classifieds": [
    ["Buyer 19", "The strip mall at the edge"],
    ["Linda's cousin", "Accounts, hiding from the small print"],
    ["The guy included", "A used planet, porch light on"],
    ["Tab tearer", "The corkboard, third pin down"],
  ],
  "end-lounge": [
    ["Booth 8", "Heat Death Boulevard"],
    ["The last olive", "The end of the bar"],
    ["Marlow", "A velvet seat with a view of the end"],
    ["Glass 6", "Where the octopus can reach"],
  ],
  "snail-jams": [
    ["Leaf traffic", "The long way round the mushroom"],
    ["Dew", "A garden where hurry is rude"],
    ["Beetle", "Yielded to, and proud of it"],
    ["Moss", "Shelley's side of the leaf"],
  ],
  "dimension-hop": [
    ["Left booth", "Jace's garage, gravity normal"],
    ["Right booth", "Mara's garage, four seconds early"],
    ["The rift", "Between two coffee cups"],
    ["Haircut", "Briefly borrowed, now kept"],
  ],
  "crystal-delta": [
    ["Shard", "Refraction Point Seven"],
    ["The miner", "A rock, a lantern, a teacup"],
    ["Second sentence", "Half a blink behind the first"],
    ["Chandelier", "Crying, but glittery"],
  ],
  "hold-music": [
    ["Ticket 8 million", "Floor minus 4"],
    ["The plant", "The waiting room, growing"],
    ["Pam's neighbour", "Also on hold, since bronze"],
    ["Form 27-B", "A beige chair with no clock"],
  ],
  "pixel-afterlife": [
    ["Player One", "The continue screen, finally"],
    ["Ghost 4", "Cabinet three, losing politely"],
    ["High score", "Mostly apologies"],
    ["Insert coin", "The carpet that blinks"],
  ],
  "ask-grenda": [
    ["Caller 6", "Studio B, rain on the glass"],
    ["Next week", "Already wrote back"],
    ["The shadow", "Sharing the chair"],
    ["Lava lamp", "Awake, and in agreement"],
  ],
  "moon-dub": [
    ["Crater crew", "Tranquility Base Annex"],
    ["Helmet dust", "Nodding in low gravity"],
    ["Echo", "Eleven seconds out"],
    ["The lone astronaut", "Bass bins, earthrise side"],
  ],
  "whalesong": [
    ["Lane 12", "Between galaxies, blink received"],
    ["The calf", "Not startled, listening"],
    ["A long voyage", "One galaxy per century"],
    ["Quiet deck", "Where Captain Hum is not talking"],
  ],
  "impossible-sports": [
    ["The stands", "Coliseum Zero, upper air"],
    ["Home supporter", "Did the wave in a kitchen"],
    ["Rules clerk", "Has given up, happily"],
    ["The polite sun", "Asking for a moment"],
  ],
  "baroque-bots": [
    ["Unit 3", "The Clockwork Court"],
    ["Canary", "Attempting counterpoint"],
    ["The toaster", "Portrait, requesting encore"],
    ["Wig stand", "Candlelit, slightly waxy"],
  ],
  "comet-marimba": [
    ["The hammock", "A beach on a comet tail"],
    ["Hat holder", "Seventy kilometres a second"],
    ["Crab deck", "Sunglasses on, requests off"],
    ["Slow beach", "Not your beach"],
  ],
  "channel-surf": [
    ["The drawer", "Currently in charge of the remote"],
    ["Egg watcher", "A whole minute, personal best"],
    ["Hallway", "Proposed to, and weeping"],
    ["Biscuit negotiator", "The couch at the center"],
  ],
  "mirror-polka": [
    ["Left shoe", "This side of the mirror"],
    ["The reflection", "Early, and leading"],
    ["Ynnhoj's fan", "Half a second behind Johnny"],
    ["Table 4", "Dancing the other dance"],
  ],
  "wild-multiverse": [
    ["Crew hat", "Tall grass, one short"],
    ["The whisper", "Returned by a very long neck"],
    ["Camera 2", "Hiding, and sorry"],
    ["Sir Reginald's mic", "A very long way from a road"],
  ],
  "numbers-omega": [
    ["Blue kitchen", "Milk cold, standing by"],
    ["The fox", "Bottom of the mast"],
    ["Goose debtor", "Coordinates withheld"],
    ["Sequence", "Seven, then seven, then four"],
  ],
  "smoke-ring-trio": [
    ["Table 9", "Inside the storm cloud"],
    ["Washing line", "Rained on by applause"],
    ["Florian's tray", "Left the bar years ago"],
    ["The missing step", "Mind it. There isn't one"],
  ],
  "lower-hollow": [
    ["Rim Watch", "Lower Hollow, edge of the Hole"],
    ["Sponge list", "The bake-sale stall"],
    ["Biscuit's human", "Rim Lane, staring politely"],
    ["Returned spoon", "Slightly damp, logged"],
  ],
  "bubble-economy": [
    ["Top down", "Marina City Nine, still 1986"],
    ["Sunset rent", "The balcony above the bay"],
    ["Pin amnesty", "The waterfront bubble"],
    ["Cassette deck", "Applauding the weekend"],
  ],
  "tomorrows-leftovers": [
    ["Tuesday's salt", "The test kitchen, four days early"],
    ["Pip's friend", "Holding the present, and a spoon"],
    ["Future crumbs", "All over next week's floor"],
    ["The larder", "Aromas running ahead of the dish"],
  ],
  "cat-fm": [
    ["Staff", "Under Gloria's sunbeam"],
    ["The mug", "Exactly at the edge"],
    ["Tabby union", "Demanding the thermostat"],
    ["Dennis's notes", "Knocked onto the carpet"],
  ],
  "piano-empty-rooms": [
    ["Shoes off", "The corridor, not the room"],
    ["West parlour", "Unvisited, on purpose"],
    ["Dust sheet", "Still on the armchair"],
    ["Moonlight", "Two boards an hour"],
  ],
  "unsolved-dimensions": [
    ["The alibi", "A basement that does not trust it"],
    ["Red string", "From a teaspoon to the moon"],
    ["Cold coffee", "Inspector Gault's desk"],
    ["The goose", "Requests a solicitor"],
  ],
  "breakbeat-observatory": [
    ["Orbiting coffee", "Thirty thousand light-years out"],
    ["The nod", "Borrowed from Doctor Ferrin"],
    ["Sector dish", "Rattled, grateful"],
    ["Low satellite", "Avoiding the bass beam"],
  ],
  "other-horoscopes": [
    ["The Paper Boat", "Taking it slowly"],
    ["Teapot rising", "Back room of the planetarium"],
    ["Tuesday", "Predicted, and correct"],
    ["A spare coaster", "Third house, lamp left on"],
  ],
  "drowned-shanty-hour": [
    ["Under the table", "Not even at sea, singing"],
    ["Bilge row", "The Damp Regret, below the line"],
    ["Young Tobias", "Age four hundred and twelve"],
    ["Dry-ish barrel", "Old Pettibone's side"],
  ],
  "waystation-9": [
    ["Mile marker", "The sideways road, invoiced"],
    ["Both hands", "Waving at a thunderstorm"],
    ["Fragile Tuesday", "Trailer, channel 9"],
    ["Diner stool", "Crossroads of several realities"],
  ],
  "wall-of-fog": [
    ["1991", "The back half of a sentence"],
    ["The lamp", "Only clear member of the crowd"],
    ["Pedal city", "A dimension made of reverb"],
    ["Garage snare", "Still coming round"],
  ],
  "win-this-planet": [
    ["Wrong address", "Podium two, Studio Infinity"],
    ["Row G", "Doreen's house, technically"],
    ["Toaster loop", "Consolation, then another"],
    ["Grandma's buzzer", "Always 1952, always early"],
  ],
  "yesterday-fm": [
    ["The sofa", "Twenty-four hours ago"],
    ["Backwards clock", "A 1970s living room"],
    ["Already home", "Yesterday's traffic"],
    ["Unpoured tea", "Finished anyway"],
  ],
  "event-horizon-surf": [
    ["Several years away", "The beach that does not return"],
    ["Historical wax", "Still on the board"],
    ["The leaning tower", "Bonnie waving"],
    ["A long paddle", "Ten minutes, or a century"],
  ],
  "bedtime-for-giants": [
    ["Four words in", "A valley-sized bedroom"],
    ["The streetlights", "Breathing in four-four"],
    ["Allotment shade", "Under a giant toe"],
    ["Mouse height", "Looking up at the quilt"],
  ],
  "gristwick-parish": [
    ["Marrow lee", "The village green, year 300"],
    ["Second bar", "The silver band tent"],
    ["Tombola Latin", "Mrs Pargeter's table"],
    ["Maypole", "Mostly ribbon by now"],
  ],
  "tiny-hour": [
    ["Button table", "Inside the matchbox"],
    ["Skirting choir", "Behind the board, quietly"],
    ["Postage raft", "Three lint balls and a stamp"],
    ["Auntie's friend", "Two centimetres tall, leaning in"],
  ],
  "infinite-song": [
    ["Verse counter", "The stage where it started"],
    ["Different boat", "Possibly the same boat"],
    ["Grandmother's song", "Still not finished"],
    ["The beard", "Across the floor, out the door"],
  ],
  "plant-fm": [
    ["Two degrees", "The sunny windowsill"],
    ["New leaf", "Facing the speaker"],
    ["Cactus", "Headphones on, no complaints"],
    ["The fern", "Patient, and in the shade"],
  ],
  "hush-after-hours": [
    ["Technically awake", "The Nightjar, aft cabin"],
    ["Moth One", "Upper-left of the viewport"],
    ["Orange blanket", "Over the empty chair"],
    ["The console plant", "Leaning toward the speaker"],
  ],
  "last-lighthouse": [
    ["No ships", "A kitchen the beam can reach"],
    ["Starboard rail", "Hove to in Lesser Marrow"],
    ["The gull", "Leeward sill, listening"],
    ["Lamp answer", "Switched on for the Keeper"],
  ],
  "transmission-zero": [
    ["The echo", "Far end of the dial, tapping twice"],
    ["Berry policy", "The cave, not eating them"],
    ["First hello", "A horn mic and warm fur"],
    ["The back wall", "A big friendly shadow"],
  ],
  "saturday-night-forever": [
    ["Forgotten weekday", "Starlite floor, still Saturday"],
    ["Counter-clockwise", "Rollo's whistle in earshot"],
    ["Snack-bar date", "Hour several million, still first"],
    ["Size eights", "Skate hire, maple side"],
  ],
  "free-frequency": [
    ["Protractor", "An attic that moves at dawn"],
    ["The arm notes", "Corrected by HUSH, rudely"],
    ["Egg boxes", "Taped to the rafters"],
    ["Phone box", "Mole, already hung up"],
  ],
  "orbit-roots": [
    ["Bean row", "Greenhouse Ring, off the beat"],
    ["Squash leaf", "A reply to Clearline, in wax"],
    ["The pump house", "One-drop, everybody woke"],
    ["Porch shack", "Meridian Farm Moon"],
  ],
  "small-claims": [
    ["A little bit right", "Courtroom 4, public gallery"],
    ["Spare tissue", "Meant for the cloud"],
    ["Green ink", "The judge's side of the bench"],
    ["Tuesday", "Plaintiff, and also sorry"],
  ],
  "substation-null": [
    ["Half a step left", "Deck 4 catwalk"],
    ["Hazard list", "Under the strobes, forgiven"],
    ["Valve C-17", "Touched back, resolved"],
    ["Glow stick", "Operational, dancefloor side"],
  ],
  "tiki-satellite": [
    ["Sunrise twelve", "Lagoon Deck, Orbital Seven"],
    ["The ship's cat", "Fooled, and certain"],
    ["Pineapple watch", "Zero-g, please duck"],
    ["Theremin distance", "Miss Vera's safe inches"],
  ],
  "the-long-dark": [
    ["The bar stool", "Lumen Bar, apologised to"],
    ["Previously on", "Studio B, still grateful"],
    ["Ring Four", "A lamp battery, not a dare"],
    ["Foley tray", "Gravel, thunder sheet, organ"],
  ],
  "island-time": [
    ["Still on time", "Tide Hill, both suns down"],
    ["The tortoise", "Looking proud, moving on"],
    ["Half Past Bar", "Ginger beer, slow sun"],
    ["Marker three", "Underwater, unbothered"],
  ],
  "traffic-on-the-8s": [
    ["Lane 3", "The Bypass, since the Pliocene"],
    ["Stationary sandwich", "Also not moving"],
    ["Pod window", "Four miles up, cake visible"],
    ["The eights", "Rita's desk above the jam"],
  ],
  "atomic-bachelor-pad": [
    ["Behind the sofa", "Where the trumpet went"],
    ["Chalk mark", "Lot 12, sunken lounge"],
    ["Lot 11", "No longer knocking"],
    ["The hallway", "Theremin's usual room"],
  ],
  "velvet-collapse": [
    ["The bridge", "Casino Ultima, bass unflinching"],
    ["All on red", "Odette's wheel, and breakfast"],
    ["Sunglasses", "Table 4, Old Ruby side"],
    ["Silver jacket", "Still betting the quiet way"],
  ],
  "heat-death-afterparty": [
    ["Fourth person", "Under the last bulb"],
    ["A nameless star", "Goodnight, during the chorus"],
    ["Lorraine's edge", "Rose-gold, making room"],
    ["Elbows", "Dov's side of the tiny floor"],
  ],
  "the-switchboard": [
    ["The silence", "Central Exchange, cord still in"],
    ["A sorry universe", "Trunk line 7"],
    ["1946", "Brass plug, cloth cord"],
    ["The key", "She still kept it"],
  ],
  "minute-between": [
    ["Until the tick", "03:33, glass still up"],
    ["Dust colleague", "The moonbeam, not moving"],
    ["The kitchen", "Six inches of paused air"],
    ["No list", "The gap before 03:34"],
  ],
  "the-harbour": [
    ["Berth Seven", "Light on, heading forgotten"],
    ["The hook", "Mug with the little star"],
    ["Long Pier", "A bowl of oranges"],
    ["Engines off", "The basin, finally"],
  ],
  "something-listening": [
    ["Oh, back", "Three minutes into the hiss"],
    ["A lost goodnight", "Kept between the stations"],
    ["The chair", "Sat still long enough"],
    ["1968 forecast", "Still dry in the static"],
  ],
};

const TALK_MESSAGE = { message: ['#local#'] } as const;
const MUSIC_MESSAGE = { message: ['#local#', '#local#', '#local#', '#local#', '#generic#'] } as const;

export function listenerMessage(station: StationDef, seed: number): ListenerMessage {
  const baseLines = LOCAL[station.id] ?? [];
  const more = MORE_LISTENERS[station.id] ?? [];
  const localLines = baseLines.length + more.length > 0 ? [...baseLines, ...more] : ((messageGrammar.generic as readonly string[] | undefined) ?? []);
  const grammar = merge(worldGrammar, messageGrammar, { local: localLines }, station.format === 'talk' ? TALK_MESSAGE : MUSIC_MESSAGE);
  const base = hashSeed(station.id, 'listener', seed);
  const pairs = LOCAL_FROM[station.id] ?? [];
  const identRng = rngFor(base, 'ident');
  let from: string;
  let where: string;
  if (pairs.length > 0 && identRng.next() < 0.8) {
    const pair = pairs[identRng.int(0, pairs.length - 1)]!;
    from = pair[0];
    where = pair[1];
  } else {
    from = expandUntil(grammar, (a) => rngFor(base, 'from', a), '#sender#', (s) => s.length <= LIMITS.listenerFrom, 'A listener');
    where = expandUntil(grammar, (a) => rngFor(base, 'where', a), '#senderPlace#', (s) => s.length <= LIMITS.listenerWhere, 'Somewhere');
  }
  const text = expandUntil(grammar, (a) => rngFor(base, 'text', a), '#message#', (s) => s.length <= LIMITS.listenerText, 'Love the show.');
  return { from, where, text };
}
