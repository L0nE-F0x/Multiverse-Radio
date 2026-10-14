// Scenes for the four v4 talk stations and the four v4 secrets (owned by the scenes-talk
// workstream). Labels are one sentence each, for screen readers.

import type { SceneId } from '../broadcast/types';
import type { SceneEntry } from './registry';

export const TALK_SCENES_V4: Partial<Record<SceneId, SceneEntry>> = {
  // ── Outer Band talk stations ──
  'radio-theatre': {
    label: 'Two actors with scripts share a ribbon microphone in a dim studio while an organist plays in a pool of light under a red ON AIR sign.',
    load: () => import('./defs/radio-theatre'),
  },
  courtroom: {
    label: 'A courtroom at night: a judge writes beneath a crest of overlapping planets, rain runs down tall windows, and something glows in the dock.',
    load: () => import('./defs/courtroom'),
  },
  'wormhole-interchange': {
    label: 'A vast knot of glowing wormhole lanes jammed bumper to bumper with ship lights, a traffic pod sweeping a searchlight over it.',
    load: () => import('./defs/wormhole-interchange'),
  },
  'pirate-attic': {
    label: 'A pirate broadcasts from a cramped attic of egg boxes and string-linked blueprints while a small light passes the round window.',
    load: () => import('./defs/pirate-attic'),
  },

  // ── v4 secrets ──
  switchboard: {
    label: 'An old telephone exchange stretches away into darkness, lamps winking, one operator in a headset at a pool of light.',
    load: () => import('./defs/switchboard'),
  },
  'between-minutes': {
    label: 'A moonlit room held still between two ticks: dust hangs in the air and a falling glass waits mid-air beside a glowing radio.',
    load: () => import('./defs/between-minutes'),
  },
  'static-presence': {
    label: 'Soft, dark television static slowly gathers into the suggestion of a face leaning closer to listen, then lets go.',
    load: () => import('./defs/static-presence'),
  },
};
