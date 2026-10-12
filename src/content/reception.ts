// Funny reception status lines: "73% — a moth has landed on the antenna".

import { expandUntil, type Grammar } from './grammar';
import { LIMITS } from './limits';
import { hashSeed, rngFor } from './rng';

const receptionGrammar: Grammar = {
  // Excuses for a weak signal.
  low: [
    'a moth has landed on the antenna',
    'an owl with opinions is using the antenna as a perch',
    'someone in Dimension 6 is vacuuming',
    'the signal is passing through a very large sandwich',
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
    'everything is fine. Too fine',
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
    'fine, but the antenna is fine in a sulky way',
    'the antenna is fine. The sky is wobbly',
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
    'somebody\'s dream',
    'a cupboard full of tinsel',
    'a brass band rehearsal',
    'the inside of a cloud',
    'a library, quietly',
    'a lot of geese',
    'next week, briefly',
  ],
  weatherEvent: ['scattered Tuesdays', 'a light drizzle of déjà vu', 'heavy fog of forgetting', 'a sudden calm', 'gusts of nostalgia', 'a stray aurora'],
};

/** Funny reception status, e.g. "73% — a moth has landed on the antenna". */
export function receptionReport(seed: number): string {
  const base = hashSeed('reception', seed);
  const r = rngFor(base, 'band');
  const roll = r.next();
  const [rule, lo, hi] = roll < 0.4 ? (['low', 11, 64] as const) : roll < 0.75 ? (['mid', 58, 88] as const) : (['high', 89, 100] as const);
  const pct = r.int(lo, hi);
  const prefix = `${pct}% — `;
  const reason = expandUntil(
    receptionGrammar,
    (a) => rngFor(base, 'reason', a),
    `#${rule}#`,
    (s) => prefix.length + s.length <= LIMITS.reception,
    'the static is trying its best',
  );
  return prefix + reason;
}
