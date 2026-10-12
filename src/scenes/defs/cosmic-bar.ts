// The Lounge at the End of Time: an octopus bartender polishes eight glasses at once while
// the universe ends, slowly and prettily, outside the window. A spotlit mic waits on stage.

import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, stars } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { frameRect, roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const WIN = { x: 70, y: 14, w: 136, h: 82 };
const BAR_Y = 126;
const OCT = { x: 138, y: 84 };
const STAGE = { x: 258, y: 140 };

const def: SceneDef = {
  id: 'cosmic-bar',
  fps: 20,
  rareEvents: 3,
  rareDuration: 8,
  create({ accent }) {
    const ink = hex('#12060c');
    const velvet = [hex('#2a0a16'), hex('#3c0f20'), hex('#521630')];
    const gold = accent;
    const goldD = shade(accent, 0.55);
    const goldL = mix(accent, hex('#fff4d0'), 0.5);
    const sky = [hex('#1a0820'), hex('#3a1030'), hex('#7a2238'), hex('#c8502e'), hex('#f2a040')];
    const octo = ramp([hex('#3a1440'), hex('#7a2c78'), hex('#b84f9e'), hex('#f08ac0')], 5);
    const sucker = hex('#ffc8de');
    const glassC = hex('#d8f0ff');
    const glassD = hex('#7aa0b8');
    const woodC = { d: hex('#1e0c08'), m: hex('#3a1a10'), l: hex('#5a2c18') };
    const bottleC = [hex('#5aa45a'), hex('#c84a4a'), hex('#e8b04a'), hex('#6a8ad8'), hex('#c87ad8'), hex('#4ac8b0')];

    // Glass anchor points fanned around the octopus.
    const holds = Array.from({ length: 8 }, (_, i) => {
      const a = Math.PI * (0.92 + (i / 7) * 1.16);
      const r = i === 0 || i === 7 ? 44 : 40;
      return { x: OCT.x + Math.cos(a) * r * 1.15, y: 100 + Math.sin(a) * r * 0.62, base: OCT.x - 14 + i * 4, wine: i % 3 === 1 };
    });

    const drawGlass = (g: Gfx, x: number, y: number, wine: boolean) => {
      x = Math.round(x);
      y = Math.round(y);
      if (wine) {
        g.ellipse(x, y - 4, 3, 3, glassD);
        g.ellipse(x, y - 4, 2, 2, glassC);
        g.rect(x - 2, y - 3, 5, 2, mix(accent, hex('#a02040'), 0.5));
        g.vline(x, y - 1, y + 3, glassC);
        g.hline(x - 2, x + 2, y + 4, glassC);
        g.px(x - 1, y - 6, hex('#ffffff'));
      } else {
        g.rect(x - 3, y - 4, 7, 8, glassD);
        g.rect(x - 2, y - 4, 5, 7, glassC);
        g.rect(x - 2, y, 5, 3, mix(accent, glassC, 0.4));
        g.vline(x - 2, y - 3, y + 1, hex('#ffffff'));
      }
    };

    return {
      background(g) {
        // Velvet wall with soft folds and gold pinstripes.
        for (let y = g.top; y < BAR_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const fold = Math.sin(x * 0.35) * 0.5 + 0.5;
            g.px(x, y, fold > 0.7 ? velvet[2]! : fold > 0.3 ? velvet[1]! : velvet[0]!);
          }
        for (let x = g.left - (g.left % 40); x < g.right; x += 40) g.rectD(x, g.top, 1, BAR_Y - g.top, goldD, 0.6);

        // Window onto the end of the universe.
        g.gradRect(WIN.x, WIN.y, WIN.w, WIN.h, sky);
        g.clip(WIN.x, WIN.y, WIN.w, WIN.h);
        stars(g, 0, WIN.x, WIN.y, WIN.x + WIN.w, WIN.y + 50, 0.25, hex('#ffd8c0'), 6, 0);
        // the enormous, tired red sun
        g.glow(170, WIN.y + WIN.h + 10, 80, hex('#ff6a3a'), 0.25, 6);
        g.ball(170, WIN.y + WIN.h + 16, 46, 46, ramp([hex('#6a1018'), hex('#b0281e'), hex('#e8502a'), hex('#ff9a5a')], 5), -0.3, -0.8, 0.3);
        // drifting, fading galaxies
        const galaxy = (x: number, y: number, r: number, c: number) => {
          for (let i = 0; i < 40; i++) {
            const a = i * 0.45;
            const rr = (i / 40) * r;
            g.pxAdd(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.45, c, 0.5 - i / 100);
            g.pxAdd(x - Math.cos(a) * rr, y - Math.sin(a) * rr * 0.45, c, 0.5 - i / 100);
          }
          g.glow(x, y, r * 0.6, c, 0.4);
        };
        galaxy(96, 30, 10, hex('#ffc8a0'));
        galaxy(188, 24, 7, hex('#ffb8d8'));
        galaxy(124, 56, 5, hex('#ffe0a0'));
        g.noClip();
        // Art-deco frame.
        frameRect(g, WIN.x - 3, WIN.y - 3, WIN.w + 6, WIN.h + 6, gold);
        frameRect(g, WIN.x - 2, WIN.y - 2, WIN.w + 4, WIN.h + 4, goldD);
        frameRect(g, WIN.x - 1, WIN.y - 1, WIN.w + 2, WIN.h + 2, ink);
        for (let i = 0; i < 5; i++) g.rect(WIN.x + WIN.w / 2 - 9 + i * 4, WIN.y - 7, 2, 4 + (i === 2 ? 2 : 0), gold);

        // Back-bar shelves with bottles (left).
        for (let s = 0; s < 3; s++) {
          const sy = 40 + s * 26;
          g.rect(14, sy, 50, 2, goldD);
          g.rect(14, sy, 50, 1, gold);
          for (let b = 0; b < 6; b++) {
            const bx = 17 + b * 8;
            const c = bottleC[(b + s * 2) % bottleC.length]!;
            const h = 10 + ((hash3(b, s) * 8) | 0);
            g.rect(bx, sy - h, 5, h, shade(c, 0.6));
            g.rect(bx + 1, sy - h, 2, h - 1, c);
            g.rect(bx + 1, sy - h - 4, 3, 4, shade(c, 0.5));
            g.px(bx + 1, sy - h + 2, hex('#fff4e0'));
          }
        }

        // Stage on the right: curtain, platform, mic stand.
        for (let y = g.top; y < 140; y++)
          for (let x = 216; x < g.right; x++) {
            const fold = Math.sin((x - 216) * 0.55 + y * 0.01);
            g.px(x, y, fold > 0.5 ? hex('#8a1a2a') : fold > -0.4 ? hex('#6a1020') : hex('#460a16'));
          }
        for (let x = 216; x < g.right; x++) g.rect(x, g.top, 1, 6 + (x % 6 < 3 ? 2 : 0) - g.top + g.top, gold);
        g.ellipse(STAGE.x, STAGE.y + 4, 40, 9, ink);
        g.ellipse(STAGE.x, STAGE.y + 3, 38, 8, woodC.l);
        g.ellipse(STAGE.x, STAGE.y + 2, 38, 7, hex('#7a3a20'));
        g.rect(STAGE.x - 38, STAGE.y + 3, 77, 6, woodC.m);
        g.rect(STAGE.x - 38, STAGE.y + 8, 77, 1, gold);
        g.ellipse(STAGE.x, STAGE.y + 1, 5, 1, ink);
        g.vline(STAGE.x, 108, STAGE.y, hex('#8a8a90'));
        g.line(STAGE.x, 108, STAGE.x - 3, 104, hex('#8a8a90'));
        g.ellipse(STAGE.x - 4, 102, 2, 3, hex('#3a3a40'));
        g.ellipse(STAGE.x - 4, 101, 1, 2, hex('#9a9aa0'));

        // The bar: polished top, tufted velvet front, brass foot rail, rounded end.
        g.rect(g.left, BAR_Y, 214 - g.left, 5, woodC.l);
        g.rect(g.left, BAR_Y, 214 - g.left, 1, goldL);
        g.disc(212, BAR_Y + 2, 3, woodC.l);
        for (let y = BAR_Y + 5; y < g.bottom; y++)
          for (let x = g.left; x < 214; x++) {
            const ty = (y - BAR_Y - 5) % 12;
            const tx = (x + (Math.floor((y - BAR_Y - 5) / 12) % 2) * 8) % 16;
            const d = Math.abs(tx - 8) / 8 + Math.abs(ty - 6) / 6;
            g.px(x, y, d < 0.22 ? gold : d < 0.75 ? hex('#7a2040') : d < 1.05 ? velvet[2]! : velvet[1]!);
          }
        g.rect(g.left, 166, 214 - g.left, 2, gold);
        g.rect(g.left, 168, 214 - g.left, 1, goldD);
        // Floor by the stage.
        g.gradRect(216, 140, g.right - 216, g.bottom - 140, [hex('#1a0a10'), hex('#0e0508')]);
        g.rect(214, BAR_Y, 2, g.bottom - BAR_Y, ink);
        // Two stools, the seats seen from the front.
        for (const sx of [96, 182]) {
          g.rect(sx - 1, 176, 3, 40, goldD);
          g.ellipse(sx, 174, 13, 4, ink);
          g.ellipse(sx, 173, 12, 3, hex('#8a1a2a'));
          g.hline(sx - 9, sx + 9, 172, hex('#b03040'));
        }
        // Warm haze from the window onto the wall around it.
        g.glow(WIN.x + WIN.w / 2, WIN.y + WIN.h, 110, hex('#ff7a3a'), 0.12, 6);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // Dying stars blink out and the occasional one comes back.
        g.clip(WIN.x, WIN.y, WIN.w, WIN.h);
        stars(g, t * 0.4, WIN.x, WIN.y, WIN.x + WIN.w, WIN.y + 46, 0.08, hex('#fff0d0'), 13, 0.5);
        if (f.rare === 1 && ev < 7) {
          const sx = 150;
          const sy = 34;
          const k = ev < 1.5 ? ev / 1.5 : Math.max(0, 1 - (ev - 1.5) / 0.6);
          g.glow(sx, sy, 3 + k * 4, hex('#fff4d8'), k);
          if (ev > 2.1 && ev < 3) {
            const r = (ev - 2.1) * 12;
            for (let i = 0; i < 12; i++) g.pxAdd(sx + Math.cos(i * 0.52) * r, sy + Math.sin(i * 0.52) * r, hex('#ffd8a0'), 0.6 - (ev - 2.1) * 0.6);
          }
        }
        g.noClip();

        // Spotlight on the empty mic (and the occasional ghost of a singer).
        const spot = (0.16 + f.energy * 0.12) * (0.5 + 0.5 * f.awake);
        g.tri(STAGE.x - 6, g.top, STAGE.x + 6, g.top, STAGE.x, STAGE.y, hex('#fff0c8'), 2, 0);
        for (let y = Math.max(g.top, 0); y < STAGE.y + 6; y++) {
          const hw = 4 + ((y - g.top) / (STAGE.y - g.top)) * 26;
          g.rectAdd(STAGE.x - hw, y, hw * 2, 1, hex('#ffe8b0'), spot * (0.35 + 0.65 * ((y - g.top) / (STAGE.y - g.top))));
        }
        g.ellipseA(STAGE.x, STAGE.y + 2, 30, 5, hex('#fff0c8'), spot * 1.4);
        for (let i = 0; i < 10; i++) {
          const p = (t * 0.05 + hash3(i, 2)) % 1;
          const x = STAGE.x - 14 + hash3(i, 3) * 28 + Math.sin(t * 0.5 + i) * 3;
          g.pxAdd(x, 20 + p * 110, hex('#fff8e0'), 0.4 * Math.sin(p * Math.PI));
        }
        if (f.rare === 2 && ev < 8) {
          const k = envelope(ev, 8, 2, 2) * 0.45;
          const sway = Math.sin(ev * 2) * 2;
          g.ellipseA(STAGE.x + 6 + sway, 116, 6, 7, hex('#d8e8ff'), k);
          g.ellipseA(STAGE.x + 6 + sway * 1.2, 126, 8, 10, hex('#d8e8ff'), k);
          g.ellipseA(STAGE.x + 6 + sway * 1.4, 136, 10, 4, hex('#d8e8ff'), k * 0.6);
          if (k > 0.3) g.text('~', STAGE.x - 6, 96 - Math.round(ev * 2) % 8, hex('#d8e8ff'));
        }

        // Bottle glints, gently following the music.
        for (let i = 0; i < 4; i++) {
          const gx = 20 + ((i * 13) % 44);
          const gy = 30 + (i % 3) * 26;
          g.glow(gx, gy, 6, bottleC[i]!, 0.12 + f.energy * 0.2 + 0.06 * Math.sin(t + i));
        }

        // ── the octopus ──
        const sway = f.reduced ? 0 : Math.sin(t * 1.2) * 1.2 * f.awake + f.pulse * 0.8;
        const ox = OCT.x + sway;
        const oy = OCT.y + (1 - f.awake) * 3;
        const dropping = f.rare === 0 && ev < 8;
        const shocked = dropping && ev > 0.8 && ev < 3.5;
        g.ellipse(ox, oy, 19, 21, ink);
        g.ball(ox, oy, 18, 20, octo, -0.5, -0.6, 0.25);
        for (let i = 0; i < 6; i++) g.disc(ox - 10 + ((hash3(i, 1) * 20) | 0), oy - 14 + ((hash3(i, 2) * 14) | 0), 1, octo[1]!);
        // eyes: heavy-lidded, horizontal pupils; wide when a glass slips
        for (let s = -1; s <= 1; s += 2) {
          const ex = Math.round(ox + s * 7);
          const ey = Math.round(oy + 7);
          g.ellipse(ex, ey, 4, 3, ink);
          g.ellipse(ex, ey, 3, 2, hex('#fff4d0'));
          g.rect(ex - 2, ey, 5, 1, ink);
          const shut = blinking(t, s + 4) || f.awake < 0.3;
          if (shut) g.rect(ex - 3, ey - 2, 7, 5, octo[2]!);
          else if (!shocked) g.rect(ex - 3, ey - 3, 7, 2, octo[2]!);
          if (shut) g.hline(ex - 3, ex + 3, ey + 1, ink);
        }
        // bow tie
        const by = Math.round(oy + 17);
        g.tri(ox - 6, by - 3, ox - 6, by + 3, ox, by, ink);
        g.tri(ox + 6, by - 3, ox + 6, by + 3, ox, by, ink);
        g.tri(ox - 5, by - 2, ox - 5, by + 2, ox - 1, by, gold);
        g.tri(ox + 5, by - 2, ox + 5, by + 2, ox + 1, by, gold);
        g.disc(ox, by, 1, goldD);

        // eight arms, eight glasses, polishing in a slow wave
        for (let i = 0; i < 8; i++) {
          const h = holds[i]!;
          const ph = t * (2.4 + f.energy) + i * 0.8;
          const polish = f.awake > 0.3 ? 1 : 0.2;
          let gx = h.x + sway * 0.5 + Math.cos(ph) * 1.6 * polish;
          let gy = h.y + Math.sin(ph) * 1.2 * polish;
          let held = true;
          if (dropping && i === 6) {
            if (ev < 2.6) {
              const fall = Math.max(0, ev - 0.4);
              gy = h.y + Math.min(BAR_Y - 4 - h.y, 60 * fall * fall);
              gx = h.x + fall * 4;
              held = ev < 0.4;
              if (gy >= BAR_Y - 4) held = false;
            }
          }
          const toast = f.rare === 1 && ev > 3 && ev < 6.5 && i === 3;
          if (toast) {
            gx += 4;
            gy -= 10 * envelope(ev - 3, 3.5, 0.5, 0.7);
          }
          // tentacle: from behind the bar up to the glass, curling outward
          const bx = h.base + sway;
          const byy = oy + 16;
          const tipx = held || !dropping || i !== 6 ? gx : h.x;
          const tipy = held || !dropping || i !== 6 ? gy + 4 : h.y + 4;
          const cx = bx + (tipx - bx) * 0.8;
          const cy = byy + 16;
          let px = bx;
          let py = byy;
          for (let k = 1; k <= 10; k++) {
            const u = k / 10;
            const qx = (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * cx + u * u * tipx;
            const qy = (1 - u) * (1 - u) * byy + 2 * (1 - u) * u * cy + u * u * tipy;
            const w = 6 - u * 3.5;
            thickLine(g, px, py, qx, qy, w + 1, ink);
            px = qx;
            py = qy;
          }
          px = bx;
          py = byy;
          for (let k = 1; k <= 10; k++) {
            const u = k / 10;
            const qx = (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * cx + u * u * tipx;
            const qy = (1 - u) * (1 - u) * byy + 2 * (1 - u) * u * cy + u * u * tipy;
            const w = 5 - u * 3;
            thickLine(g, px, py, qx, qy, w, octo[k < 5 ? 2 : 3]!);
            if (k % 2 === 0 && k > 2) g.px(qx, qy + 1, sucker);
            px = qx;
            py = qy;
          }
          if (dropping && i === 6 && !held) {
            if (ev < 2.6 && gy < BAR_Y - 4) drawGlass(g, gx, gy, h.wine);
            else if (ev < 4) {
              // shards
              for (let k = 0; k < 8; k++) {
                const p = clamp((ev - 1.4) / 1.2);
                g.px(h.x + 4 + (hash3(k, 1) - 0.5) * 22 * p, BAR_Y - 1 - Math.sin(p * Math.PI) * hash3(k, 2) * 8, glassC);
              }
            } else if (ev > 5) drawGlass(g, gx, gy, h.wine); // a fresh one, as if nothing happened
          } else {
            drawGlass(g, gx, gy, h.wine);
            // polishing cloth
            if (i % 2 === 0) g.rect(gx - 3 - Math.cos(ph) * 1.5, gy + 1, 3, 2, hex('#f4f0e8'));
          }
        }
        // the head sits in front of the arm roots
        g.ellipse(ox, oy, 19, 21, ink);
        g.ball(ox, oy, 18, 20, octo, -0.5, -0.6, 0.25);
        for (let i = 0; i < 6; i++) g.disc(ox - 10 + ((hash3(i, 1) * 20) | 0), oy - 14 + ((hash3(i, 2) * 14) | 0), 1, octo[1]!);
        for (let s = -1; s <= 1; s += 2) {
          const ex = Math.round(ox + s * 7);
          const ey = Math.round(oy + 7);
          g.ellipse(ex, ey, 4, 3, ink);
          g.ellipse(ex, ey, 3, 2, hex('#fff4d0'));
          g.rect(ex - 2, ey, 5, 1, ink);
          const shut = blinking(t, s + 4) || f.awake < 0.3;
          if (shut) g.rect(ex - 3, ey - 2, 7, 5, octo[2]!);
          else if (!shocked) g.rect(ex - 3, ey - 3, 7, 2, octo[2]!);
          if (shut) g.hline(ex - 3, ex + 3, ey + 1, ink);
        }
        g.tri(ox - 6, by - 3, ox - 6, by + 3, ox, by, ink);
        g.tri(ox + 6, by - 3, ox + 6, by + 3, ox, by, ink);
        g.tri(ox - 5, by - 2, ox - 5, by + 2, ox - 1, by, gold);
        g.tri(ox + 5, by - 2, ox + 5, by + 2, ox + 1, by, gold);
        g.disc(ox, by, 1, goldD);
        // the bar top hides where the arms meet
        g.rect(g.left, BAR_Y, 214 - g.left, 5, woodC.l);
        g.rect(g.left, BAR_Y, 214 - g.left, 1, goldL);

        // a highlight on the bar top under the lamp-light of the window
        g.rectAdd(OCT.x - 40, BAR_Y, 80, 1, hex('#ffb070'), 0.25);
        void roundRect;
      },
    };
  },
};

export default def;
