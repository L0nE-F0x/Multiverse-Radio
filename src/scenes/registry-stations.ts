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
  'future-kitchen': {
    label: 'In a retro-future test kitchen after hours, a chef in a far-too-tall hat stirs a glowing pot beside jars of things to come.',
    load: () => import('./defs/future-kitchen'),
  },
  'cat-studio': {
    label: 'A ginger cat sprawls across a radio mixing desk, one paw on a fader, while late sun creeps through the blinds.',
    load: () => import('./defs/cat-studio'),
  },
  'empty-room': {
    label: 'Moonlight from tall windows slides across the bare floor of an empty room where a grand piano plays itself.',
    load: () => import('./defs/empty-room'),
  },
  'evidence-board': {
    label: "A dim detective's office: red string joins a teaspoon, the moon and a confused goose while rain runs down the blinds.",
    load: () => import('./defs/evidence-board'),
  },
  observatory: {
    label: 'A mountaintop observatory aims a giant speaker cone at the night sky, and the stars shiver on every bass hit.',
    load: () => import('./defs/observatory'),
  },
  'star-chart': {
    label: 'A hooded reader waits at a candlelit table with a crystal ball of static, under a dome of unfamiliar constellations.',
    load: () => import('./defs/star-chart'),
  },
  'ghost-ship': {
    label: 'A translucent crew stamps around an accordion player on a foggy ship deck above a faintly glowing green sea.',
    load: () => import('./defs/ghost-ship'),
  },
};
