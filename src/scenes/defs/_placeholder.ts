// Temporary: a plain gradient for scenes that aren't drawn yet.
import type { SceneId } from '../../broadcast/types';
import { hex, mix } from '../kit/color';
import type { SceneDef } from '../types';

export function placeholder(id: SceneId): SceneDef {
  return {
    id,
    rareEvents: 0,
    rareDuration: 1,
    create({ accent }) {
      return {
        background(g) {
          g.vgrad([hex('#0a0a0c'), mix(accent, hex('#0a0a0c'), 0.6)], g.top, g.bottom);
          g.textCenter(id.toUpperCase(), 160, 88, accent, 2);
        },
        frame() {},
      };
    },
  };
}
