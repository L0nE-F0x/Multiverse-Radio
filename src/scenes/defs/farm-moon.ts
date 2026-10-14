// placeholder
import { hex } from '../kit/color';
import type { SceneDef } from '../types';
const def: SceneDef = {
  id: 'farm-moon',
  rareEvents: 1,
  rareDuration: 5,
  create() {
    return {
      background(g) { g.vgrad([hex('#000000'), hex('#203040'), hex('#405060'), hex('#808080')], g.top, g.bottom); },
      frame(g, f) { g.rect(100 + (f.t % 10), 80, 20, 20, hex('#ff0000')); },
    };
  },
};
export default def;
