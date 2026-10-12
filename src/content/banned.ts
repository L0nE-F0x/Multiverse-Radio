// Names of existing shows, games, brands, celebrities and famous works that must never
// appear in generated text or voice scripts. Matched case-insensitively on word
// boundaries. Not exhaustive; it catches the obvious slips.

export const BANNED_WORDS: readonly string[] = [
  // Shows and films
  'rick and morty', 'morty', 'plumbus', 'rixty', 'schwifty', 'simpsons', 'futurama', 'star wars', 'star trek',
  'jedi', 'vader', 'doctor who', 'tardis', 'dalek', 'hitchhiker', 'babel fish', 'zaphod', 'ghostbusters',
  'blade runner', 'back to the future', 'delorean', 'flux capacitor', 'knight rider', 'twin peaks', 'x-files',
  'night vale', 'stranger things', 'seinfeld', 'muppet', 'sesame street', 'teletubbies', 'spongebob',
  'adventure time', 'gravity falls', 'black mirror', 'twilight zone', 'monty python', 'hal 9000', 'skynet',
  'terminator', 'jurassic', 'godzilla', 'blue planet', 'planet earth',
  // Games
  'pokemon', 'pokémon', 'pikachu', 'super mario', 'luigi', 'zelda', 'hyrule', 'pac-man', 'pacman', 'tetris',
  'donkey kong', 'sonic the hedgehog', 'minecraft', 'fortnite', 'space invaders', 'galaga', 'warp pipe',
  'konami code', 'street fighter', 'final fantasy',
  // Brands and companies
  'nintendo', 'sega', 'atari', 'playstation', 'xbox', 'spotify', 'netflix', 'google', 'youtube', 'disney',
  'pixar', 'marvel', 'coca-cola', 'pepsi', 'starbucks', "mcdonald's", 'mcdonalds', 'ikea', 'lego', 'tesla',
  'walkman', 'muzak', 'iphone', 'ipod', 'chilledcow', 'lofi girl', 'tupperware',
  // People and characters
  'batman', 'superman', 'sherlock', 'attenborough', 'beatles', 'elvis', 'sinatra', 'bach', 'mozart',
  'beethoven', 'vivaldi', 'handel', 'chopin', 'daft punk', 'bowie', 'beyonce', 'beyoncé', 'taylor swift',
  'dolly parton', 'bob ross', 'kitt',
  // Famous song titles that the generators could plausibly assemble
  'purple rain', 'blue velvet', 'fly me to the moon', 'moon river', 'dark side of the moon', 'beer barrel',
  'blue danube', 'toccata and fugue', 'free bird', 'bohemian', 'stairway to heaven', 'yellow submarine',
];

const PATTERN = new RegExp(
  `(^|[^a-z0-9])(${BANNED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^a-z0-9])`,
  'i',
);

/** Returns the first banned term found in `text`, or null. */
export function findBanned(text: string): string | null {
  const m = PATTERN.exec(text);
  return m ? (m[2] ?? null) : null;
}
