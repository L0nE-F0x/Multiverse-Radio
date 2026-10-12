// What the dial is picking up, described for the HUD. One place that knows how stations,
// pirates, oddities and empty band differ, so the components don't have to.

import type { OddityId, PhosphorId, SceneId, StationDef, StationFormat, Tuned } from '../broadcast/types';
import { SHIP } from '../stations/ship';
import { oddityPhosphor, phosphorHex, SHIP_PHOSPHOR } from './phosphor';

export type SourceKind = Tuned['kind'];

export interface Source {
  kind: SourceKind;
  /** Station or pirate name, oddity label, or "Open band". */
  name: string;
  origin: string | null;
  host: string | null;
  tagline: string | null;
  format: StationFormat | null;
  /** The roster station or generated pirate, if that's what's tuned. */
  station: StationDef | null;
  secret: boolean;
  phosphor: PhosphorId;
}

/** Plain-language kind tags for the readouts. */
export const KIND_TAG: Record<SourceKind, string> = {
  station: 'Licensed',
  pirate: 'Pirate',
  oddity: 'Unregistered',
  static: 'No carrier',
};

export function describeTuned(tuned: Tuned): Source {
  switch (tuned.kind) {
    case 'station':
    case 'pirate': {
      const s = tuned.station;
      return {
        kind: tuned.kind,
        name: s.name,
        origin: s.origin,
        host: s.host.name,
        tagline: s.tagline,
        format: s.format,
        station: s,
        secret: !!s.secret,
        phosphor: s.phosphor ?? SHIP_PHOSPHOR,
      };
    }
    case 'oddity':
      return {
        kind: 'oddity',
        name: tuned.label,
        origin: 'Unregistered transmitter',
        host: null,
        tagline: ODDITY_NOTE[tuned.oddity] ?? null,
        format: null,
        station: null,
        secret: false,
        phosphor: oddityPhosphor(tuned.oddity),
      };
    default:
      return {
        kind: 'static',
        name: 'Open band',
        origin: null,
        host: null,
        tagline: null,
        format: null,
        station: null,
        secret: false,
        phosphor: SHIP_PHOSPHOR,
      };
  }
}

/** What the console calls the signal itself, for the "now" readout. */
export const ODDITY_SIGNAL: Record<OddityId, string> = {
  'test-tone': 'Steady reference tone',
  'distress-beacon': 'Repeating distress call',
  'stuck-loop': 'Recording on a loop',
  'time-signal': 'Time pips',
};

/** Terse console notes for things found between stations. */
const ODDITY_NOTE: Record<OddityId, string> = {
  'test-tone': 'Continuous reference tone. Origin unknown. Purpose unknown.',
  'distress-beacon': 'Automated distress call. No vessel registered at this position.',
  'stuck-loop': 'A recording repeating without operator. Duration of loop exceeds records.',
  'time-signal': 'Time signal. Agrees with no known clock.',
};

/**
 * A minimal StationDef so an oddity's scene can be drawn with StationScene. Only `id`,
 * `scene` and `color` matter to the scene; the rest is filler that is never shown.
 */
export function oddityStation(oddity: OddityId, label: string, scene: SceneId): StationDef {
  return {
    id: `oddity-${oddity}`,
    name: label,
    frequency: 0,
    origin: 'Unregistered transmitter',
    tagline: '',
    color: phosphorHex(oddityPhosphor(oddity)),
    phosphor: oddityPhosphor(oddity),
    format: 'ambient',
    recipe: 'test-tone',
    scene,
    sceneBrief: '',
    host: SHIP.computer,
    mood: [],
  };
}
