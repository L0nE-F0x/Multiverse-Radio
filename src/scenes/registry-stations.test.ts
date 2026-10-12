import { describe, expect, it } from 'vitest';
import { SCENE_IDS } from '../broadcast/types';
import { MAIN_STATIONS } from '../stations/roster';
import { STATION_SCENES_V3 } from './registry-stations';
import { SCENES } from './registry';

// The twenty v3 station scenes sit between 'cloud-club' and 'greenhouse' in SCENE_IDS.
const V3_IDS = SCENE_IDS.slice(SCENE_IDS.indexOf('cloud-club'), SCENE_IDS.indexOf('greenhouse') + 1);

describe('v3 station scenes', () => {
  it('covers all twenty new stations', () => {
    expect(V3_IDS).toHaveLength(20);
    for (const id of V3_IDS) {
      expect(STATION_SCENES_V3[id], id).toBeDefined();
      expect(SCENES[id], id).toBe(STATION_SCENES_V3[id]);
    }
    for (const s of MAIN_STATIONS) if (V3_IDS.includes(s.scene)) expect(STATION_SCENES_V3[s.scene], s.id).toBeDefined();
  });

  it('registers nothing outside its own twenty', () => {
    for (const id of Object.keys(STATION_SCENES_V3)) expect(V3_IDS).toContain(id);
  });

  it('describes each scene in one short sentence', () => {
    for (const id of V3_IDS) {
      const label = STATION_SCENES_V3[id]!.label;
      expect(label.length, id).toBeGreaterThan(40);
      expect(label.length, id).toBeLessThanOrEqual(140);
      expect(label.endsWith('.'), id).toBe(true);
    }
  });
});
