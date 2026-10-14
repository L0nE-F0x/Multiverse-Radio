// Scenes for the eight v4 Outer Band music stations (owned by the scenes-music workstream).

import type { SceneId } from '../broadcast/types';
import type { SceneEntry } from './registry';

export const MUSIC_SCENES_V4: Partial<Record<SceneId, SceneEntry>> = {
  'roller-disco': {
    label: 'Skaters circle a roller rink in silhouette as a mirror ball sweeps slow specks of light; the clock above has no hands.',
    load: () => import('./defs/roller-disco'),
  },
  'supernova-casino': {
    label: 'A velvet casino lounge with a funk band in silhouette, lit red by a swollen dying star filling the curved window.',
    load: () => import('./defs/supernova-casino'),
  },
  'reactor-room': {
    label: 'A crowd dances in the steam of a derelict reactor hall under catwalks, beside a dormant core glowing faintly blue.',
    load: () => import('./defs/reactor-room'),
  },
  'last-rave': {
    label: 'On a rock at the end of the universe a DJ plays to three dancers and a swaying nebula while the stars go out.',
    load: () => import('./defs/last-rave'),
  },
  'farm-moon': {
    label: 'Greenhouses glow green on a little farm moon under a vast ringed planet, misters arcing slowly past a studio shack.',
    load: () => import('./defs/farm-moon'),
  },
  'drift-island': {
    label: 'Two suns set at different speeds behind a palm island with an open observatory and tide posts that disagree.',
    load: () => import('./defs/drift-island'),
  },
  'tiki-satellite': {
    label: 'A 1950s space-station tiki lounge with puffer-fish lamps and a theremin, a planet turning slowly in the porthole.',
    load: () => import('./defs/tiki-satellite'),
  },
  'hifi-den': {
    label: 'A sunken space-age den: a glowing hi-fi console, two huge speakers taking turns, a rocket on the desert horizon.',
    load: () => import('./defs/hifi-den'),
  },
};
