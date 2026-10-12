// Every scene, lazily loaded: each module becomes its own chunk, so the main bundle only
// carries this table. Labels are short one-sentence descriptions for screen readers.

import type { SceneId } from '../broadcast/types';
import type { SceneDef } from './types';

export interface SceneEntry {
  label: string;
  load: () => Promise<{ default: SceneDef }>;
}

export const SCENES: Record<SceneId, SceneEntry> = {
  'study-desk': {
    label: 'A sleepy many-eyed creature in big headphones studies at a desk by a window onto the purple void.',
    load: () => import('./defs/study-desk'),
  },
  'rain-window': {
    label: 'Rain streams down a window over a neon city where people drift under floating umbrellas.',
    load: () => import('./defs/rain-window'),
  },
  'mossy-garden': {
    label: 'Two snails in tiny headphones inch along a mossy leaf at dusk among mushrooms and fireflies.',
    load: () => import('./defs/mossy-garden'),
  },
  'crystal-cave': {
    label: 'A tiny miner sips tea in a glowing crystal cave full of prismatic light.',
    load: () => import('./defs/crystal-cave'),
  },
  'neon-grid': {
    label: 'A car with far too many wheels drives toward a striped neon sunset past palm trees with elbows.',
    load: () => import('./defs/neon-grid'),
  },
  'cosmic-bar': {
    label: 'An octopus bartender polishes eight glasses in a velvet lounge while the universe ends warmly outside.',
    load: () => import('./defs/cosmic-bar'),
  },
  'waiting-room': {
    label: 'An endless beige waiting room where the take-a-number display has reached an impossible number.',
    load: () => import('./defs/waiting-room'),
  },
  'space-whales': {
    label: 'Enormous translucent whales drift slowly through a soft nebula.',
    load: () => import('./defs/space-whales'),
  },
  'pixel-arcade': {
    label: 'Friendly little ghosts play arcade cabinets beneath a high-score board of absurd names.',
    load: () => import('./defs/pixel-arcade'),
  },
  'robot-salon': {
    label: 'Robots in powdered wigs play harpsichord and cello by candlelight, conducted with a spoon.',
    load: () => import('./defs/robot-salon'),
  },
  'moon-soundsystem': {
    label: 'A towering speaker stack on the moon bounces dust in low gravity as a sleepy blue planet rises.',
    load: () => import('./defs/moon-soundsystem'),
  },
  'mirror-ballroom': {
    label: 'Polka dancers in a checkered ballroom and their slightly out-of-step reflections in a giant mirror.',
    load: () => import('./defs/mirror-ballroom'),
  },
  'comet-beach': {
    label: 'A crab in sunglasses plays records on a tiny beach riding the tail of a comet.',
    load: () => import('./defs/comet-beach'),
  },
  'crt-snow': {
    label: 'A three-eyed cat sleeps on an old television glowing with soft static in a dark bedroom.',
    load: () => import('./defs/crt-snow'),
  },
  newsroom: {
    label: 'A late-night news anchor at a desk in front of a wall of clocks that all show the wrong time.',
    load: () => import('./defs/newsroom'),
  },
  corkboard: {
    label: 'A crowded corkboard of strange classified ads with tear-off phone numbers.',
    load: () => import('./defs/corkboard'),
  },
  'two-booths': {
    label: 'Two podcast hosts in different realities, one of them upside down, wave across a glowing rift.',
    load: () => import('./defs/two-booths'),
  },
  'radio-booth': {
    label: 'A cozy late-night radio booth with a big microphone, a glowing ON AIR sign and a lava lamp with something alive inside.',
    load: () => import('./defs/radio-booth'),
  },
  stadium: {
    label: 'A floating stadium at night where the ball is a small, polite sun and the crowd does the wave.',
    load: () => import('./defs/stadium'),
  },
  'tv-wall': {
    label: 'A wall of mismatched old televisions, each showing a different odd little programme.',
    load: () => import('./defs/tv-wall'),
  },
  'foggy-antenna': {
    label: 'A lone radio mast blinks red on a foggy hill while a fox sits listening at its base.',
    load: () => import('./defs/foggy-antenna'),
  },
  'tall-grass': {
    label: 'Something improbable walks across golden grass at sunset while a tiny film crew hides in the foreground.',
    load: () => import('./defs/tall-grass'),
  },
};

const cache = new Map<SceneId, Promise<SceneDef>>();

/** Load (or start loading) a scene module. Safe to call repeatedly. */
export function loadScene(id: SceneId): Promise<SceneDef> {
  let p = cache.get(id);
  if (!p) {
    p = SCENES[id].load().then((m) => m.default);
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
