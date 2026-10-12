// Department of Hold Music: an endless beige waiting room receding to infinity. The number
// display counts impossibly high. A potted plant grows visibly. The clock has no hands.
// Somebody in the far distance has been waiting since before chairs.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { textWidth } from '../kit/font';
import { bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const VP = { x: 160, y: 80 };
const F = 60; // focal length
const ROOM = { w: 70, floor: 56, ceil: 50 }; // half-width, floor depth below eye, ceiling above
const SIGN = { x: 160, y: 18 };

const def: SceneDef = {
  id: 'waiting-room',
  fps: 15,
  rareEvents: 3,
  rareDuration: 7,
  create({ accent }) {
    const ink = hex('#2a261e');
    const beige = hex('#d8c8a4');
    const beigeD = hex('#b8a47e');
    const tileA = hex('#e4d8bc');
    const tileB = hex('#c8b894');
    const ceil = hex('#ece4d0');
    const haze = hex('#efe6cc');
    const chair = accent;
    const chairD = shade(accent, 0.7);
    const led = hex('#ff4a2a');

    let lastN = -1;
    let numStr = '';

    const project = (X: number, Y: number, z: number) => ({ x: VP.x + (X / z) * F, y: VP.y + (Y / z) * F, s: F / z });

    return {
      background(g) {
        for (let y = g.top; y < g.bottom; y++) {
          const dy = y + 0.5 - VP.y;
          for (let x = g.left; x < g.right; x++) {
            const dx = x + 0.5 - VP.x;
            const wallT = Math.abs(dx) / ROOM.w;
            const flT = dy > 0 ? dy / ROOM.floor : -dy / ROOM.ceil;
            let c;
            let z;
            if (wallT > flT) {
              z = F / wallT;
              const Y = (dy * z) / F;
              const zz = z / 8;
              // wainscot, a door every so often, posters
              if (Y > ROOM.floor * 0.45) c = beigeD;
              else if (Y > ROOM.floor * 0.4) c = shade(beigeD, 0.85);
              else c = beige;
              const door = ((zz % 7) + 7) % 7;
              if (door > 5 && door < 6.2 && Y > -ROOM.ceil * 0.35) c = shade(beige, 0.78);
              const poster = ((zz + 3.5) % 7 + 7) % 7;
              if (poster > 5.2 && poster < 5.9 && Y > -ROOM.ceil * 0.25 && Y < ROOM.floor * 0.1) c = mix(beige, accent, 0.35);
            } else if (dy > 0) {
              z = F / flT;
              const X = (dx * z) / F;
              c = (Math.floor(X / 14) + Math.floor(z / 14)) & 1 ? tileA : tileB;
            } else {
              z = F / flT;
              const X = (dx * z) / F;
              const panel = ((z / 10) % 4 + 4) % 4;
              c = panel < 1.4 && Math.abs(X) < ROOM.w * 0.35 ? hex('#fffbe8') : ceil;
            }
            // distance haze: everything ends in beige
            const fog = clamp((z - 20) / 260);
            g.px(x, y, fog > bayer(x, y) * 0.9 + 0.05 ? mix(c, haze, Math.min(1, fog * 1.2)) : c);
          }
        }
        // Rows of chairs along both walls, receding forever.
        for (let k = 40; k >= 0; k--) {
          const z = 14 + k * 9;
          for (const side of [-1, 1]) {
            const p = project(side * (ROOM.w - 10), ROOM.floor, z);
            const s = p.s;
            if (s < 0.25) continue;
            const w = 9 * s;
            const sh = 5 * s;
            const back = 9 * s;
            const fog = clamp((z - 20) / 260);
            const cc = mix(chair, haze, fog);
            const cd = mix(chairD, haze, fog);
            g.rect(p.x - w / 2, p.y - sh - back, w, back, cd);
            g.rect(p.x - w / 2, p.y - sh, w, Math.max(1, s * 2), cc);
            g.rect(p.x - w / 2 + s, p.y - sh + s * 2, Math.max(1, s * 0.6), sh - s * 2, mix(ink, haze, fog));
            g.rect(p.x + w / 2 - s * 1.6, p.y - sh + s * 2, Math.max(1, s * 0.6), sh - s * 2, mix(ink, haze, fog));
          }
        }
        // Wall clock with no hands (right wall, near).
        const ck = project(ROOM.w - 1, -ROOM.ceil * 0.2, 46);
        g.ellipse(ck.x, ck.y, 6, 9, ink);
        g.ellipse(ck.x, ck.y, 5, 8, hex('#f8f4e8'));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.px(ck.x + Math.cos(a) * 3.5, ck.y + Math.sin(a) * 6, hex('#8a8070'));
        }
        // Ticket dispenser on a post (left, near).
        g.rect(72, 120, 3, 40, hex('#8a8070'));
        roundRect(g, 66, 108, 15, 14, 2, hex('#c83a2a'));
        g.rect(69, 118, 9, 2, hex('#f8f4e8'));
        g.text('TAKE', 66, 100, hex('#8a2a1a'));
        // Sign hanging from the ceiling.
        g.vline(SIGN.x - 40, g.top, SIGN.y - 8, hex('#8a8070'));
        g.vline(SIGN.x + 40, g.top, SIGN.y - 8, hex('#8a8070'));
        g.rect(SIGN.x - 52, SIGN.y - 9, 104, 24, ink);
        g.rect(SIGN.x - 51, SIGN.y - 8, 102, 22, hex('#1a0a08'));
        frameRect(g, SIGN.x - 52, SIGN.y - 9, 104, 24, hex('#8a8070'));
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // NOW SERVING: an impossible, slowly climbing number.
        const youTurn = f.rare === 0 && ev < 7;
        g.textCenter('NOW SERVING', SIGN.x, SIGN.y - 6, mix(led, hex('#1a0a08'), 0.35));
        let num: string;
        if (youTurn) num = ev < 4.5 ? 'YOU?' : 'NO.';
        else {
          const n = 48213557902 + Math.floor(t / 4) + Math.floor(t / 37) * 1009;
          if (n !== lastN) {
            lastN = n;
            numStr = n.toLocaleString('en-US');
          }
          num = numStr;
        }
        const blink = youTurn && !f.reduced && Math.floor(ev * 3) % 2 === 0;
        g.textCenter(num, SIGN.x, SIGN.y + 3, blink ? hex('#ffd0a0') : led);
        g.glow(SIGN.x, SIGN.y, 40, led, 0.08 + (youTurn ? 0.1 : 0));
        void textWidth;

        // One fluorescent panel near the front flickers sometimes.
        if (!f.reduced) {
          const slot = Math.floor(t * 6);
          if (hash3(slot, 7) > 0.96 || (Math.floor(t / 9) % 4 === 0 && hash3(slot, 8) > 0.7)) {
            g.rectMul(116, g.top, 88, 6 - g.top + g.top, 0.85);
          }
        }

        // Somebody far away, waiting since before chairs (sitting on a rock).
        const far = { x: VP.x + 1, y: VP.y + 6 };
        const stand = f.rare === 1 && ev < 7 ? envelope(ev, 7, 1.2, 1.5) : 0;
        g.rect(far.x - 2, far.y, 4, 1, hex('#9a8a70'));
        g.rect(far.x - 1, far.y - 3 - Math.round(stand * 2), 2, 3, hex('#5a6a8a'));
        g.px(far.x, far.y - 4 - Math.round(stand * 2), hex('#c8a080'));
        if (stand > 0.8 && ev > 2.5 && ev < 4.5) g.px(far.x + 2, far.y - 6, hex('#5a6a8a'));

        // The front-row regular, reading the same newspaper.
        const px = 96;
        const py = 150;
        g.rect(px - 9, py - 26, 18, 16, chairD);
        g.rect(px - 10, py - 10, 20, 4, chair);
        g.rect(px - 9, py - 6, 2, 16, ink);
        g.rect(px + 7, py - 6, 2, 16, ink);
        g.rect(px - 5, py - 12, 10, 4, hex('#4a5a7a'));
        g.rect(px - 4, py - 8, 3, 14, hex('#4a5a7a'));
        g.rect(px + 1, py - 8, 3, 14, hex('#4a5a7a'));
        const page = Math.floor(t / 8) % 2;
        g.rect(px - 9, py - 32, 18, 16, hex('#f0ece0'));
        for (let k = 0; k < 5; k++) g.hline(px - 7, px + (k === 0 ? 7 : 4), py - 29 + k * 3, hex('#9a968a'));
        g.vline(px, py - 32, py - 17, hex('#c8c4b8'));
        if (page && (t % 8) < 0.4) g.rect(px, py - 33, 9, 17, hex('#ffffff'));
        g.disc(px, py - 35, 4, hex('#d8b090'));
        g.rect(px - 4, py - 39, 8, 2, hex('#6a5a4a'));
        g.disc(px - 9, py - 24, 2, hex('#d8b090'));
        g.disc(px + 9, py - 24, 2, hex('#d8b090'));

        // The potted plant: visibly growing, until somebody trims it.
        const cycle = 300;
        const grow = (t % cycle) / cycle;
        const trimmed = f.rare === 2 && ev < 7;
        const height = 10 + grow * 70;
        const ppx = 236;
        const ppy = 172;
        g.poly([ppx - 9, ppy - 14, ppx + 9, ppy - 14, ppx + 7, ppy, ppx - 7, ppy], hex('#b06a4a'));
        g.rect(ppx - 10, ppy - 16, 20, 3, hex('#c88060'));
        const sway = Math.sin(t * 0.6) * (0.5 + f.energy);
        for (let i = 0; i < height; i++) {
          const u = i / Math.max(1, height);
          const sx = ppx + Math.sin(u * 3 + 1) * 3 + sway * u * 2;
          const sy = ppy - 16 - i;
          g.px(sx, sy, hex('#3a7a3a'));
          if (i % 7 === 3) {
            const side = (i / 7) % 2 < 1 ? -1 : 1;
            g.ellipse(sx + side * 4, sy, 4, 2, hex('#4a9a4a'));
            g.px(sx + side * 5, sy - 1, hex('#7ac86a'));
          }
        }
        g.ellipse(ppx + Math.sin(3 + 1) * 3 + sway * 2, ppy - 16 - height, 3, 3, hex('#5aaa5a'));
        if (grow > 0.85) g.text('!', ppx + 8, ppy - 20 - height, hex('#5a7a5a'));

        // Tumbleweed (it's been a while).
        if (trimmed) {
          const p = ev / 7;
          const tx = 330 - p * 360;
          const ty = 168 - Math.abs(Math.sin(ev * 3)) * 8;
          const r = 6;
          for (let k = 0; k < 18; k++) {
            const a = k * 0.7 + ev * 4;
            g.px(tx + Math.cos(a) * r * hash3(k, 1), ty + Math.sin(a) * r * hash3(k, 2), hex('#a88a5a'));
          }
          g.ring(tx, ty, r, r, hex('#8a6a3a'));
        }
      },
    };
  },
};

export default def;
