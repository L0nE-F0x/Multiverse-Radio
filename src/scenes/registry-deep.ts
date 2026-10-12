// Scenes for secret stations, pirate stations and oddities (owned by the scenes-deep workstream).
// Pirate scenes are shared by many generated stations, so their labels stay generic.

import type { SceneId } from '../broadcast/types';
import type { SceneEntry } from './registry';

export const DEEP_SCENES: Partial<Record<SceneId, SceneEntry>> = {
  // ── secret stations ──
  'nightjar-cabin': {
    label: "The Nightjar's dim cabin from behind the empty operator's chair, the console glowing amber and HUSH's light breathing softly.",
    load: () => import('./defs/nightjar-cabin'),
  },
  lighthouse: {
    label: 'A lighthouse on a lonely rock sweeps its beam over a dark sea under strange stars while the keeper reads at a lit window.',
    load: () => import('./defs/lighthouse'),
  },
  'first-transmitter': {
    label: 'In a firelit cave at the dawn of time, a figure in furs taps a horn wired to a lightning-struck tree under a huge moon.',
    load: () => import('./defs/first-transmitter'),
  },
};
