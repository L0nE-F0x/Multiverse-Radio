// Scenes for the twenty v3 stations (owned by the scenes-new workstream).

import type { SceneId } from '../broadcast/types';
import type { SceneEntry } from './registry';

export const STATION_SCENES_V3: Partial<Record<SceneId, SceneEntry>> = {
  'cloud-club': {
    label: 'A piano trio plays under one warm spotlight in a dim jazz club built inside a storm cloud.',
    load: () => import('./defs/cloud-club'),
  },
  'hollow-town': {
    label: 'A small lamplit town with bunting and a bake sale circles an enormous, perfectly round hole; a dog peers in.',
    load: () => import('./defs/hollow-town'),
  },
  'bubble-skyline': {
    label: 'A neon skyline at night from a high balcony, a cassette deck and a cocktail on the table, a palm against the moon.',
    load: () => import('./defs/bubble-skyline'),
  },
};
