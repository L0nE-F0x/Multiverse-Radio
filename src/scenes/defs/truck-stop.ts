// Waystation 9 CB: a neon-lit truck-stop diner at night, at a crossroads where one road
// climbs into the sky and another goes down into the ground. A big rig waits outside
// (FRAGILE: CONTAINS TUESDAY); a waitress pours coffee; moths circle the sign.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope, stars } from '../kit/fx';
import { type Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { haze, vignette } from './lib/night';

const GROUND = 112;
const DINER = { x0: 58, x1: 166, top: 80, bottom: 116 };
const SIGN = { x: 186, top: 26 };
const RIG = { x: 196, y: 126 };
const LAMP = { x: 250, y: 60 };

/** Point along the road that climbs into the sky (u 0 = crossroads, 1 = far up). */
const skyRoad = (u: number, out: number[]) => {
  out[0] = 30 + u * 150 - Math.sin(u * 2.4) * 30;
  out[1] = GROUND - 2 - u * u * 120 - u * 8;
};

const def: SceneDef = {
  id: 'truck-stop',
  fps: 15,
  focusY: 86,
  rareEvents: 3,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#04050a');
    const sky = [hex('#03040a'), hex('#060a18'), hex('#0c1426'), hex('#18203a'), hex('#2a2a40')];
    const neon = accent;
    const neonD = shade(accent, 0.3);
    const warm = hex('#e8a860');
    const sodium = hex('#ffb050');
    const asphalt = [hex('#08080c'), hex('#0e0e14'), hex('#15141a')];
    const pt = [0, 0];

    const rig = (g: Gfx) => {
      const { x, y } = RIG;
      // trailer
      g.rect(x + 22, y - 34, 92, 28, hex('#2a2c32'));
      g.rect(x + 22, y - 34, 92, 2, hex('#4a4c54'));
      for (let i = 0; i < 12; i++) g.vline(x + 26 + i * 8, y - 32, y - 7, hex('#24262c'));
      g.rect(x + 22, y - 6, 92, 2, ink);
      g.text('FRAGILE:', x + 28, y - 28, mix(neon, hex('#c8c0a8'), 0.4));
      g.text('CONTAINS TUESDAY', x + 28, y - 20, mix(neon, hex('#c8c0a8'), 0.4));
      g.hline(x + 28, x + 90, y - 13, mix(neonD, hex('#2a2c32'), 0.4));
      // cab, facing left toward the diner
      g.rect(x - 8, y - 30, 30, 24, hex('#3a1e1a'));
      g.rect(x - 8, y - 30, 30, 2, hex('#5a3028'));
      g.rect(x - 14, y - 18, 8, 12, hex('#3a1e1a'));
      g.rect(x - 5, y - 27, 12, 8, hex('#141a24'));
      g.line(x - 4, y - 26, x + 3, y - 21, hex('#2a3a4a'));
      g.rect(x - 16, y - 10, 4, 3, hex('#8a8a90'));
      g.rect(x + 14, y - 40, 3, 12, hex('#5a5a60'));
      // wheels
      for (const wx of [x - 6, x + 14, x + 84, x + 98]) {
        g.disc(wx, y - 4, 5, ink);
        g.disc(wx, y - 4, 2, hex('#3a3a40'));
      }
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, GROUND);
        stars(g, 0, g.left, g.top, g.right, 80, 0.16, hex('#c8d0e0'), 11, 0);
        g.glow(160, GROUND, 160, hex('#3a2a40'), 0.12, 6);
        // Mesas on the horizon.
        for (let x = g.left; x < g.right; x++) {
          const m = fbm(x / 50, 1, 4, 3);
          const y = m > 0.55 ? GROUND - 14 - (m - 0.55) * 30 : GROUND - 3 - m * 6;
          g.vline(x, y, GROUND, hex('#0a0c16'));
        }
        haze(g, GROUND - 30, GROUND, hex('#1a1a2a'), 0, 0.3);

        // The road into the sky: a ribbon with reflectors, getting thinner as it climbs.
        for (let i = 0; i < 900; i++) {
          const u = i / 900;
          skyRoad(u, pt);
          const w = Math.max(2, 18 * (1 - u * 0.88));
          const th = Math.max(1, 3 * (1 - u));
          const fade = 0.35 + u * 0.5;
          g.rect(pt[0]! - w / 2, pt[1]!, w, th + 1, mix(hex('#1a1a24'), hex('#0c1020'), fade));
          g.px(pt[0]! - w / 2, pt[1]!, mix(hex('#3a3a48'), hex('#0c1020'), fade));
          g.px(pt[0]! + w / 2, pt[1]!, mix(hex('#3a3a48'), hex('#0c1020'), fade));
          if (i % 18 < 8) g.px(pt[0]!, pt[1]!, mix(neon, hex('#14141c'), 0.35 + u * 0.55));
          if (i % 30 === 0) g.px(pt[0]! + w / 2 + 1, pt[1]! - 1, mix(hex('#ff4a3a'), hex('#0c1020'), u * 0.7));
        }
        // The road that goes down: a ramp into a glowing crack on the right.
        g.poly([262, GROUND + 2, 330, GROUND + 2, 360, GROUND + 30, 300, GROUND + 30], hex('#0a0a10'));
        g.glow(320, GROUND + 22, 40, hex('#ff6a3a'), 0.12, 5);

        // Ground: asphalt lot and desert.
        for (let y = GROUND; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = hash3(x, y, 3);
            g.px(x, y, n < 0.08 ? asphalt[2]! : n < 0.5 ? asphalt[1]! : asphalt[0]!);
          }
        // the crossroads lines
        for (let x = g.left; x < g.right; x += 10) g.rect(x, 132, 5, 1, mix(neon, asphalt[1]!, 0.6));
        // the lamp's pool on the lot
        g.ellipseA(LAMP.x - 20, GROUND + 18, 70, 14, sodium, 0.08);
        g.ellipseA(LAMP.x - 20, GROUND + 18, 40, 8, sodium, 0.07);

        // The diner: long and low, chrome trim, a strip of warm windows.
        const D = DINER;
        g.rect(D.x0, D.top, D.x1 - D.x0, D.bottom - D.top, hex('#1a1c24'));
        g.rect(D.x0 - 3, D.top - 4, D.x1 - D.x0 + 6, 5, hex('#24262e'));
        g.hline(D.x0 - 3, D.x1 + 2, D.top - 4, hex('#5a5c64'));
        g.rect(D.x0, D.top + 26, D.x1 - D.x0, 2, hex('#6a6c74'));
        g.rect(D.x0 + 4, D.top + 6, D.x1 - D.x0 - 8, 18, mix(hex('#3a2a18'), warm, 0.45));
        for (let x = D.x0 + 4; x < D.x1 - 4; x += 14) g.vline(x, D.top + 6, D.top + 23, hex('#1a1c24'));
        // inside: counter, stools, a hanging lamp row
        g.rect(D.x0 + 4, D.top + 18, D.x1 - D.x0 - 8, 6, mix(hex('#2a1a10'), warm, 0.2));
        for (let x = D.x0 + 10; x < D.x1 - 6; x += 12) g.disc(x, D.top + 8, 1, hex('#fff0c8'));
        // a lone trucker at the counter
        g.ellipse(110, D.top + 15, 4, 5, hex('#1a120c'));
        g.disc(110, D.top + 9, 3, hex('#1a120c'));
        g.rect(106, D.top + 6, 9, 2, hex('#1a120c'));
        g.rect(115, D.top + 16, 3, 2, hex('#e8e0d0'));
        // door
        g.rect(D.x1 - 18, D.top + 6, 9, 22, mix(hex('#3a2a18'), warm, 0.55));
        g.rect(D.x1 - 18, D.top + 6, 9, 1, hex('#1a1c24'));
        // the light spilling out onto the lot
        g.rectA(D.x0 + 4, D.bottom, D.x1 - D.x0 - 8, 8, warm, 0.06);
        g.glow((D.x0 + D.x1) / 2, D.top + 14, 70, warm, 0.08, 6);

        // The sign pylon (lettering lit per frame).
        g.rect(SIGN.x - 1, SIGN.top + 30, 3, GROUND - SIGN.top - 30, hex('#2a2a32'));
        g.rect(SIGN.x - 26, SIGN.top, 52, 16, hex('#0c0c12'));
        g.rect(SIGN.x - 14, SIGN.top + 18, 28, 10, hex('#0c0c12'));

        // The sodium lamp over the lot.
        g.vline(LAMP.x + 10, LAMP.y, GROUND + 20, hex('#20202a'));
        g.hline(LAMP.x - 2, LAMP.x + 10, LAMP.y, hex('#20202a'));
        g.rect(LAMP.x - 4, LAMP.y, 6, 2, hex('#3a3a40'));
        g.glow(LAMP.x - 1, LAMP.y + 2, 26, sodium, 0.22, 5);

        // A signpost at the crossroads: arrows up, down, and the other way.
        g.vline(40, 98, 126, hex('#3a3a40'));
        g.rect(28, 98, 22, 5, hex('#c8c0a0'));
        g.text('UP', 31, 98, hex('#2a2a30'));
        g.rect(32, 106, 20, 5, hex('#a8a080'));
        g.text('DOWN', 33, 106, hex('#2a2a30'));
        g.rect(26, 114, 16, 5, hex('#8a8670'));
        g.text('<>', 30, 114, hex('#2a2a30'));

        rig(g);
        vignette(g, 0.5, 160, 90, 230, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // Tail lights climbing the sky road; in a rare moment, headlights come down it.
        for (let k = 0; k < 2; k++) {
          const u = ((t * 0.018 + k * 0.5) % 1);
          skyRoad(u, pt);
          const a = (1 - u) * 0.9;
          g.px(pt[0]! - 1, pt[1]! - 1, hex('#ff3a3a'));
          g.px(pt[0]! + 1, pt[1]! - 1, hex('#ff3a3a'));
          g.glow(pt[0]!, pt[1]!, 4, hex('#ff3030'), a * 0.6);
        }
        if (f.rare === 0 && ev < 10) {
          const u = 1 - clamp(ev / 9);
          skyRoad(u, pt);
          g.glow(pt[0]!, pt[1]!, 8 + (1 - u) * 6, hex('#fff4d8'), 0.6 * envelope(ev, 10, 0.5, 1));
          g.px(pt[0]! - 1, pt[1]! - 1, hex('#ffffff'));
          g.px(pt[0]! + 1, pt[1]! - 1, hex('#ffffff'));
        }

        // The sign: WAYSTATION 9 steady, EAT blinking, moths in the light.
        const steady = 0.85 + 0.15 * Math.sin(t * 9) * (f.reduced ? 0 : 0.3);
        g.text('WAYSTATION', SIGN.x - 23, SIGN.top + 3, mix(neonD, neon, steady * awake + (1 - awake) * 0.4));
        g.text('9', SIGN.x - 2, SIGN.top + 9, mix(neonD, hex('#ff8a5a'), steady));
        const eat = f.reduced || Math.floor(t * 1.2) % 3 !== 2 ? 1 : 0.15;
        g.text('EAT', SIGN.x - 7, SIGN.top + 20, mix(hex('#3a1010'), hex('#ff5a4a'), eat));
        g.glow(SIGN.x, SIGN.top + 8, 34, neon, 0.14 * steady);
        g.glow(SIGN.x, SIGN.top + 22, 18, hex('#ff5a4a'), 0.15 * eat);
        const bigMoth = f.rare === 1 && ev < 10;
        for (let i = 0; i < 9; i++) {
          let a = t * (1.5 + hash3(i, 1)) + i * 2.1;
          let r = 8 + hash3(i, 2) * 16;
          if (bigMoth) {
            r += envelope(ev, 10, 1, 2) * 20;
            a += ev;
          }
          const mx = SIGN.x + Math.cos(a) * r * 1.4;
          const my = SIGN.top + 10 + Math.sin(a * 1.3) * r * 0.6;
          g.px(mx, my, hex('#d8d0b8'));
          if (Math.floor(t * 12 + i) % 2) g.px(mx + 1, my, hex('#8a8470'));
        }
        if (bigMoth) {
          const p = clamp(ev / 3);
          const mx = SIGN.x + 30 - p * 30 + (1 - p) * Math.sin(ev * 6) * 10;
          const my = SIGN.top - 20 + p * 22;
          const flap = p < 1 ? Math.abs(Math.sin(ev * 10)) : 0.3 + 0.2 * Math.sin(ev * 2);
          const wing = mix(hex('#6a6050'), neon, 0.15);
          g.ellipse(mx, my, 1, 4, hex('#3a3428'));
          g.tri(mx, my - 3, mx - 9 * (0.4 + flap), my - 5, mx - 7 * (0.4 + flap), my + 4, wing);
          g.tri(mx, my - 3, mx + 9 * (0.4 + flap), my - 5, mx + 7 * (0.4 + flap), my + 4, wing);
          g.px(mx - 1, my - 5, hex('#3a3428'));
          g.px(mx + 1, my - 5, hex('#3a3428'));
        }

        // The waitress, pouring (now and then), behind the counter.
        const pour = (t % 9) < 3 && awake > 0.3;
        const wx = 138;
        const wy = DINER.top + 18;
        g.ellipse(wx, wy - 6, 4, 6, hex('#3a2a3a'));
        g.disc(wx, wy - 14, 3, hex('#2a1a14'));
        g.rect(wx - 3, wy - 18, 7, 2, hex('#4a2a1a'));
        g.rect(wx - 3, wy - 8, 7, 3, hex('#d8d0c0'));
        const ax = pour ? wx - 7 : wx - 4;
        const ay = pour ? wy - 9 : wy - 4;
        g.line(wx - 2, wy - 9, ax, ay, hex('#3a2a3a'));
        g.rect(ax - 3, ay - 2, 4, 4, hex('#2a2a30'));
        if (pour) g.vline(ax - 3, ay + 2, wy - 2, hex('#5a3a20'));

        // Rare: the trailer door opens on a whole Tuesday afternoon, briefly.
        if (f.rare === 2 && ev < 10) {
          const open = envelope(ev, 10, 1, 1.2) * (ev > 8.4 && ev < 8.8 ? 0.5 : 1);
          const dx = RIG.x + 114;
          const dy = RIG.y - 34;
          const w = Math.round(open * 10);
          if (w > 0) {
            g.rect(dx - 2, dy, 2, 28, hex('#9ac8f0'));
            g.rect(dx, dy, w, 28, hex('#2a2c32'));
            g.glow(dx - 4, dy + 14, 40, hex('#d8ecff'), 0.35 * open);
            g.rectA(dx - 30, dy + 28, 30, 10, hex('#fff4d0'), 0.25 * open);
            g.disc(dx - 1, dy + 6, 1, hex('#fff4c0'));
          }
        }

        // Dust drifting through the sodium light.
        for (let i = 0; i < 14; i++) {
          const p = (t * 0.05 + hash3(i, 1)) % 1;
          const x = LAMP.x - 40 + hash3(i, 2) * 60 + Math.sin(t * 0.3 + i) * 4;
          const y = LAMP.y + 4 + p * 50;
          g.pxAdd(x, y, sodium, 0.25 * Math.sin(p * Math.PI));
        }
      },
    };
  },
};

export default def;
