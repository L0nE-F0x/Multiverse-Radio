// The Velvet Collapse: the Velvet Lounge of Casino Ultima, in orbit around a dying red giant.
// The star fills the curved window and swells and brightens through the local night; at 04:00
// it blooms white (slowly, over a couple of minutes) and by morning it has settled back to a
// sulky ember. A funk band plays in silhouette against it; a croupier waits at the wheel; a
// little easel by the stage counts down to the supernova.

import { onAirLamp, sectionDrive } from '../kit/broadcast';
import { type Color, hex, mix, ramp, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { rimLight } from '../kit/atmos';
import { flicker, haze, vignette } from './lib/night';
import { Follow, type Pose, figure, hoursSinceDusk } from './lib/outer';

const STAR = { x: 196, y: 82 };
const WIN = { x0: 30, x1: 290, sill: 100 };
const FLOOR_Y = 122;
const STAGE = { x0: 192, x1: 276, y: 108 };
const WHEEL = { x: 106, y: 113 };
const LEVELS = 20;

/** Brightness of the star (0–1) at hours since dusk: swells all night, settles after 04:00. */
function starLevel(hd: number): number {
  if (hd < 10) return 0.08 + 0.92 * Math.pow(hd / 10, 1.25);
  return 0.08 + 0.92 * (1 - smoothstep(10.03, 10.45, hd));
}
/** The 04:00 bloom: up over ~3 minutes, back down over ~25. */
function novaLevel(hd: number): number {
  return smoothstep(9.98, 10.03, hd) * (1 - smoothstep(10.06, 10.45, hd));
}
const winTop = (x: number) => 12 + ((x - 160) / 130) ** 2 * 16;

const def: SceneDef = {
  id: 'supernova-casino',
  fps: 15,
  focusY: 94,
  rareEvents: 4,
  rareDuration: 10,
  grade: { temperature: 0.05, saturation: 0.92, bloom: 0.55, shadows: '#0a0510' },
  create({ accent }) {
    const ink = hex('#060308');
    const sil = hex('#0b050c');
    const violet = accent;
    const violetL = mix(accent, hex('#f0d8ff'), 0.35);
    const gold = hex('#b08840');
    const velvet = [hex('#14040e'), hex('#2a0818'), hex('#46102a'), hex('#64203c')];
    const space = hex('#050309');
    const starRamp = ramp([hex('#1c0306'), hex('#4a0a0a'), hex('#8a1c0e'), hex('#c83c14'), hex('#f07a2a'), hex('#ffc070'), hex('#fff0d0')], 14);
    const fire = hex('#ff6a2a');
    const white = hex('#fff4ec');

    let level = -1;
    let b = 0;
    const smoothB = new Follow(0.08);
    const smoothNova = new Follow(0.15);
    const pose: Pose = { lean: 0, armL: 0, armR: 0, legL: 0, legR: 0 };

    const radius = (bb: number) => 56 + bb * 16;

    const easel = (g: Gfx, text: string, glowK: number) => {
      g.rect(160, 98, 40, 9, hex('#0e060c'));
      g.hline(160, 199, 98, shade(gold, 0.5));
      g.hline(160, 199, 106, shade(gold, 0.35));
      g.textCenter(text, 180, 100, mix(shade(violet, 0.45), violet, glowK * 0.8));
      g.glow(180, 102, 14, violet, 0.06 * glowK);
    };

    const band = (g: Gfx, t: number, f: { pulse: number; awake: number; reduced: boolean; energy: number }, c: Color) => {
      const groove = f.reduced ? 0 : Math.sin(t * 2.6) * f.awake;
      const hit = f.reduced ? 0 : f.pulse * f.awake;
      const reset = () => {
        pose.lean = 0;
        pose.legL = -0.12;
        pose.legR = 0.12;
        pose.kneeL = 0;
        pose.kneeR = 0;
        pose.bob = Math.round(hit);
        pose.nod = 0;
        pose.flare = false;
        pose.skirt = false;
      };
      // keys: a player behind a little organ
      reset();
      pose.armL = 1.25;
      pose.armR = 1.05 + Math.sin(t * 6.5) * 0.15 * f.awake;
      pose.elbowL = 0.5;
      pose.elbowR = 0.6;
      pose.hair = 1;
      pose.lean = 0.12;
      figure(g, 206, STAGE.y, 32, pose, c);
      g.rect(208, STAGE.y - 15, 16, 9, c);
      g.rect(210, STAGE.y - 6, 2, 6, c);
      g.rect(220, STAGE.y - 6, 2, 6, c);
      // the Baron on bass, hat on, leaning back into it
      reset();
      pose.lean = -0.1 + groove * 0.05;
      pose.legL = -0.2;
      pose.legR = 0.25;
      pose.armL = 0.8;
      pose.armR = -0.35;
      pose.elbowL = 1.0;
      pose.elbowR = -1.3;
      pose.hair = 3;
      pose.flare = true;
      figure(g, 236, STAGE.y, 36, pose, c);
      const by = STAGE.y - 17 + pose.bob!;
      g.line(228, by + 1, 251, by - 9, c);
      g.line(228, by + 2, 251, by - 8, c);
      g.ellipse(231, by + 1, 4, 3, c);
      g.rect(250, by - 11, 3, 2, c);
      // drummer, seated behind the kit
      reset();
      const stick = Math.sin(t * 8.5) * 0.25 * f.awake;
      pose.armL = 1.0 + stick;
      pose.armR = -1.0 - hit * 0.45;
      pose.elbowL = 0.5;
      pose.elbowR = -0.5;
      pose.hair = 0;
      figure(g, 266, STAGE.y - 6, 30, pose, c);
      g.line(274, STAGE.y - 14 - Math.round(stick * 6), 279, STAGE.y - 17 - Math.round(stick * 8), c);
      g.line(258, STAGE.y - 14 + Math.round(hit * 2), 252, STAGE.y - 12, c);
      g.ellipse(262, STAGE.y - 6, 7, 6, c);
      g.ellipse(250, STAGE.y - 15, 6, 1, c);
      g.vline(250, STAGE.y - 14, STAGE.y, c);
      g.ellipse(275, STAGE.y - 20, 6, 1, c);
      g.vline(275, STAGE.y - 19, STAGE.y, c);
    };
    return {
      background(g) {
        const bb = b;
        const R = radius(bb);
        // ── outside: space and the star ──
        g.rect(g.left, g.top, g.w, WIN.sill - g.top + 2, space);
        for (let i = 0; i < 90; i++) {
          const x = g.left + hash3(i, 1) * g.w;
          const y = g.top + hash3(i, 2) * (WIN.sill - g.top);
          const d = Math.hypot(x - STAR.x, y - STAR.y);
          if (d < R + 6) continue;
          g.pxAdd(x, y, hex('#d8c8ff'), 0.15 + hash3(i, 3) * 0.4 * (1 - bb * 0.5));
        }
        // a dead planet crossing the left pane, rimmed by the star
        g.disc(66, 46, 9, hex('#07040a'));
        for (let a = -1.2; a < 1.2; a += 0.05) g.px(66 + Math.cos(a) * 9, 46 + Math.sin(a) * 9, mix(hex('#3a0a0a'), fire, 0.3 + bb * 0.4));
        for (let a = -0.8; a < 0.8; a += 0.08) g.pxA(66 + Math.cos(a) * 8, 46 + Math.sin(a) * 8, fire, 0.25 + bb * 0.2);
        // corona: a wide soft glow, warmer and bigger as the star swells
        g.glow(STAR.x, STAR.y, R * 2.1, mix(hex('#6a1010'), fire, bb * 0.6), 0.22 + bb * 0.3, 10);
        g.glow(STAR.x, STAR.y, R * 1.35, mix(hex('#a02010'), hex('#ff8a3a'), bb), 0.2 + bb * 0.25, 8);
        // the disc: limb-darkened, granulated, dithered into the star ramp
        const n = starRamp.length - 1;
        const x0 = Math.max(g.left, Math.floor(STAR.x - R));
        const x1 = Math.min(g.right - 1, Math.ceil(STAR.x + R));
        const y0 = Math.max(g.top, Math.floor(STAR.y - R));
        const y1 = Math.min(WIN.sill + 2, Math.ceil(STAR.y + R));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const dx = (x + 0.5 - STAR.x) / R;
            const dy = (y + 0.5 - STAR.y) / R;
            const d2 = dx * dx + dy * dy;
            if (d2 >= 1) continue;
            const mu = Math.sqrt(1 - d2);
            const gran = fbm(x / 6 + 3, y / 6, 21, 3);
            const big = fbm(x / 26, y / 22, 22, 2);
            let v = Math.pow(mu, 0.55) * (0.62 + 0.3 * (gran - 0.5) + 0.35 * (big - 0.5));
            v *= 0.5 + 0.5 * bb;
            v += 0.06;
            let k = Math.floor(clamp(v) * n + bayer(x, y));
            if (k > n) k = n;
            g.px(x, y, starRamp[k]!);
          }

        // ── the window: a curved frame of dark gold mullions ──
        for (let x = g.left; x < g.right; x++) {
          const top = x >= WIN.x0 && x <= WIN.x1 ? winTop(x) : WIN.sill + 1;
          g.vline(x, g.top, Math.floor(top) - 1, velvet[0]!);
          if (x >= WIN.x0 && x <= WIN.x1) {
            g.px(x, Math.floor(top), shade(gold, 0.55));
            g.px(x, Math.floor(top) + 1, shade(gold, 0.25));
          }
        }
        for (let k = 0; k <= 5; k++) {
          const x = WIN.x0 + k * 52;
          g.rect(x - 1, winTop(x), 3, WIN.sill - winTop(x), hex('#120810'));
          g.vline(x - 1, winTop(x), WIN.sill, mix(hex('#120810'), fire, 0.25 + bb * 0.25));
        }
        // the ceiling and a pelmet of velvet swags
        g.vgrad([hex('#07030a'), velvet[0]!], g.top, 10, g.top, 12);
        for (let k = 0; k < 7; k++) {
          const cx = 20 + k * 47;
          for (let x = cx - 26; x <= cx + 26; x++) {
            const u = (x - cx) / 26;
            const yb = 10 + (1 - u * u) * 8;
            for (let y = Math.max(g.top, 0); y < yb; y++) {
              const fold = 0.5 + 0.5 * Math.cos(u * 3 + (y - yb) * 0.3);
              g.px(x, y, velvet[Math.min(3, Math.floor(fold * 2.2 + bayer(x, y) * 0.8 + (y > yb - 3 ? 0.6 : 0)))]!);
            }
            g.px(x, Math.round(yb), shade(gold, 0.45));
          }
        }
        // tall curtains at either side of the window
        for (const [cx, w] of [
          [16, 26],
          [304, 26],
        ] as const) {
          for (let x = cx - w / 2; x < cx + w / 2; x++) {
            const u = (x - (cx - w / 2)) / w;
            const fold = 0.5 + 0.5 * Math.sin(u * Math.PI * 5);
            const lit = cx < 160 ? u : 1 - u;
            for (let y = Math.max(g.top, 6); y < FLOOR_Y + 4; y++) {
              const v = fold * 0.6 + lit * 0.5 * (0.6 + bb * 0.4);
              g.px(x, y, velvet[Math.min(3, Math.floor(v * 3 + bayer(x, y) * 0.9))]!);
            }
          }
        }
        // the sill
        g.rect(g.left, WIN.sill, g.w, 4, hex('#1a0c14'));
        g.hline(g.left, g.right, WIN.sill, mix(shade(gold, 0.5), fire, 0.3 + bb * 0.3));

        // ── inside: the room below the window ──
        g.vgrad([hex('#1a0812'), hex('#12060e'), hex('#0a040a')], WIN.sill + 4, FLOOR_Y, WIN.sill + 4, FLOOR_Y);
        // the floor: a casino carpet of violet diamonds and gold stars, deep in shadow
        for (let y = FLOOR_Y; y < g.bottom; y++) {
          const u = clamp((y - FLOOR_Y) / 70);
          const sc = 1 + u * 1.5;
          for (let x = g.left; x < g.right; x++) {
            const px = (x - 160) / sc;
            const py = (y - FLOOR_Y) / sc;
            const dd = Math.abs(((px % 12) + 12) % 12 - 6) + Math.abs(((py % 8) + 8) % 8 - 4);
            let c = mix(hex('#140610'), hex('#1e0a18'), u * 0.5);
            if (dd < 1.2) c = mix(c, violet, 0.14);
            else if (dd > 8.6) c = mix(c, gold, 0.16);
            g.px(x, y, c);
          }
        }
        // the window's red light laid across the carpet
        for (let y = FLOOR_Y; y < FLOOR_Y + 50; y++) {
          const u = (y - FLOOR_Y) / 50;
          const k = (1 - u) * (0.05 + bb * 0.12);
          g.rectAdd(WIN.x0 + u * -30, y, WIN.x1 - WIN.x0 + u * 60, 1, fire, k);
        }

        // ── the stage: a low half-moon with a brass lip ──
        g.ellipse((STAGE.x0 + STAGE.x1) / 2, STAGE.y + 3, (STAGE.x1 - STAGE.x0) / 2 + 2, 6, ink);
        g.ellipse((STAGE.x0 + STAGE.x1) / 2, STAGE.y + 1, (STAGE.x1 - STAGE.x0) / 2, 5, hex('#1c0a14'));
        g.ellipse((STAGE.x0 + STAGE.x1) / 2, STAGE.y, (STAGE.x1 - STAGE.x0) / 2 - 1, 4, hex('#2a0e1c'));
        for (let x = STAGE.x0; x <= STAGE.x1; x++) {
          const u = (x - (STAGE.x0 + STAGE.x1) / 2) / ((STAGE.x1 - STAGE.x0) / 2);
          g.px(x, STAGE.y + 1 + Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 5), shade(gold, 0.5));
        }
        // amp and a mic stand
        g.rect(270, STAGE.y - 12, 10, 12, hex('#120810'));
        g.rect(271, STAGE.y - 11, 8, 6, hex('#1e0e18'));

        // ── the roulette table, under a violet-shaded lamp ──
        const W0 = WHEEL;
        g.ellipse(W0.x, W0.y + 3, 34, 8, ink);
        g.ellipse(W0.x, W0.y, 33, 7, hex('#0e2418'));
        g.ellipse(W0.x, W0.y, 31, 6, hex('#14301e'));
        for (let k = 0; k < 6; k++) g.rect(W0.x + 2 + k * 4, W0.y - 2 + (k % 2), 3, 2, mix(hex('#14301e'), hex('#d8c8a0'), 0.25));
        g.rect(W0.x - 31, W0.y + 3, 62, 3, hex('#1a0c10'));
        g.hline(W0.x - 32, W0.x + 32, W0.y + 3, shade(gold, 0.45));
        g.rect(W0.x - 26, W0.y + 6, 3, FLOOR_Y - W0.y - 4, ink);
        g.rect(W0.x + 24, W0.y + 6, 3, FLOOR_Y - W0.y - 4, ink);
        g.ellipseA(W0.x, FLOOR_Y + 2, 36, 3, ink, 0.6);
        // lamp
        g.vline(W0.x, g.top, 72, hex('#140a10'));
        g.poly([W0.x - 10, 80, W0.x + 10, 80, W0.x + 5, 72, W0.x - 5, 72], mix(hex('#1a0820'), violet, 0.18));
        g.hline(W0.x - 9, W0.x + 9, 80, mix(violet, violetL, 0.4));
        g.glow(W0.x, 96, 34, violet, 0.12, 6);
        g.ellipseA(W0.x, W0.y, 26, 5, violetL, 0.1);

        // ── a cocktail table mid-floor: two guests with their backs to us, watching the star ──
        g.ellipseA(150, 146, 22, 3, ink, 0.7);
        g.ellipse(150, 136, 11, 2, hex('#1a0a12'));
        g.hline(140, 160, 135, mix(hex('#1a0a12'), fire, 0.35 + bb * 0.2));
        g.rect(149, 137, 2, 9, ink);
        g.rect(147, 130, 2, 5, mix(hex('#2a1030'), violet, 0.4));
        for (const [hx, s0] of [
          [134, 1],
          [166, -1],
        ] as const) {
          g.ellipse(hx, 150, 9, 10, sil);
          g.ellipse(hx, 140, 7, 4, sil);
          g.disc(hx + s0, 132, 4, sil);
          g.hline(hx - 6, hx + 6, 136, mix(sil, fire, 0.3 + bb * 0.25));
          g.hline(hx - 2 + s0, hx + 2 + s0, 128, mix(sil, fire, 0.35 + bb * 0.25));
        }
        g.rect(g.left, 160, g.w, 0, ink);

        // ── foreground booths: curved velvet backs ──
        const booth = (cx: number, cy: number, rx: number) => {
          g.ellipse(cx, cy + 10, rx + 2, 14, ink);
          for (let x = cx - rx; x <= cx + rx; x++) {
            const u = (x - cx) / rx;
            const top = cy - Math.sqrt(Math.max(0, 1 - u * u)) * 12;
            for (let y = Math.floor(top); y < g.bottom; y++) {
              const tuft = ((x + 400) % 9 < 1 || (y + 400) % 7 < 1) ? 0 : 1;
              const v = (1 - (y - top) / 40) * 0.6 * tuft + (y - top < 2 ? 0.5 : 0);
              g.px(x, y, velvet[Math.max(0, Math.min(3, Math.floor(v * 3 + bayer(x, y) * 0.7)))]!);
            }
            g.px(x, Math.floor(top), mix(velvet[3]!, fire, 0.4 + bb * 0.3));
          }
        };
        booth(48, 156, 46);
        booth(284, 160, 44);
        // two heads in the left booth, one hat in the right
        g.disc(36, 140, 5, sil);
        g.disc(56, 141, 5, sil);
        g.rect(50, 136, 12, 3, sil);
        g.rect(276, 140, 15, 2, sil);
        g.rect(279, 136, 9, 4, sil);
        g.disc(283, 144, 5, sil);
        // little table lamps on the booths' tables
        for (const [lx, ly] of [
          [80, 150],
          [252, 154],
        ] as const) {
          g.rect(lx - 1, ly, 3, 6, hex('#1a0c14'));
          g.ellipse(lx, ly - 2, 4, 3, mix(hex('#2a1030'), violet, 0.3));
          g.hline(lx - 3, lx + 3, ly, mix(violet, violetL, 0.4));
          g.glow(lx, ly - 2, 14, violet, 0.2, 5);
        }

        // Tall views: a coffered ceiling catching the red, a chandelier, and a table in front of us.
        if (g.top < -20) {
          for (let y = g.top; y < 0; y++) {
            const k = clamp(1 - -y / 90);
            g.rect(g.left, y, g.w, 1, mix(hex('#06030a'), hex('#2a0c16'), k * k * (0.5 + bb * 0.5)));
          }
          for (let y = -16; y > g.top; y -= 22 + Math.floor(-y / 12)) g.rect(g.left, y, g.w, 2, hex('#0a040a'));
          for (let x = 0; x < 320; x += 40) g.line(x, -2, 160 + (x - 160) * 0.4, g.top, hex('#0a040a'));
          const cx = 160;
          const cy = -44;
          g.vline(cx, g.top, cy - 12, hex('#1a0c10'));
          for (let k = 0; k < 4; k++) {
            const rx = 8 + k * 6;
            const y = cy - 8 + k * 5;
            g.hline(cx - rx, cx + rx, y + 2, shade(gold, 0.35 + k * 0.05));
            for (let i = -rx; i <= rx; i += 3) {
              g.vline(cx + i, y + 3, y + 5 + ((i + k) & 1) * 2, mix(hex('#3a1a1a'), hex('#ffb080'), 0.25 + bb * 0.25));
              if (hash3(i, k, 3) < 0.35) g.pxAdd(cx + i, y + 5, hex('#ffd0a0'), 0.5);
            }
          }
          g.glow(cx, cy, 34, mix(hex('#ff9a60'), fire, 0.4), 0.14 + bb * 0.08, 6);
        }
        if (g.bottom > 190) {
          const tx = 150;
          const ty = 214;
          g.ellipseA(tx, ty + 12, 40, 5, ink, 0.6);
          g.ellipse(tx, ty + 2, 32, 7, ink);
          g.ellipse(tx, ty, 32, 6, hex('#1a0a12'));
          g.hline(tx - 30, tx + 30, ty - 5, mix(hex('#1a0a12'), fire, 0.3 + bb * 0.2));
          g.rect(tx - 2, ty + 6, 4, g.bottom - ty, ink);
          // a martini glass and a stack of chips
          g.line(tx - 12, ty - 14, tx - 6, ty - 9, hex('#c8b8c0'));
          g.line(tx, ty - 14, tx - 6, ty - 9, hex('#c8b8c0'));
          g.hline(tx - 12, tx, ty - 14, hex('#e8d8e0'));
          g.vline(tx - 6, ty - 9, ty - 4, hex('#a898a0'));
          g.hline(tx - 9, tx - 3, ty - 4, hex('#a898a0'));
          g.px(tx - 7, ty - 12, hex('#5a8a3a'));
          for (let k = 0; k < 5; k++) g.rect(tx + 8, ty - 5 - k * 2, 7, 2, k % 2 ? mix(violet, ink, 0.35) : hex('#d8c8b8'));
          g.rect(tx + 17, ty - 3, 7, 2, hex('#8a1414'));
          g.glow(tx, ty - 6, 30, violet, 0.08, 5);
        }

        haze(g, WIN.sill - 30, FLOOR_Y + 10, mix(hex('#3a0a14'), fire, 0.2), 0, 0.08 + bb * 0.06);

        // Light: the window does most of it, and it grows with the star.
        g.lighting(0.5 + bb * 0.14);
        g.lightRect(WIN.x0, 14, WIN.x1 - WIN.x0, WIN.sill - 14, 0.25 + bb * 0.25, 24);
        g.light(STAR.x, STAR.y, 120, 0.15 + bb * 0.2);
        g.light(WHEEL.x, WHEEL.y - 4, 40, 0.35);
        g.light(234, 96, 50, 0.2);
        vignette(g, 0.5, 168, 92, 240, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const hd = hoursSinceDusk(f.hour);
        // Re-bake the star and the room's light when the night has moved on a step.
        const target = starLevel(hd);
        const bs = smoothB.to(target, Math.max(f.dt, 0.001) * 60);
        const lv = Math.round(bs * LEVELS);
        if (lv !== level) {
          level = lv;
          b = lv / LEVELS;
          g.target(g.bg);
          this.background(g);
          g.target();
          g.restore();
        }
        const R = radius(b);
        const nova = smoothNova.to(novaLevel(hd), Math.max(f.dt, 0.001)) * (f.reduced ? 0.5 : 1);

        // The surface churns: a few slow bright cells and the occasional dark spot.
        for (let i = 0; i < 9; i++) {
          const a = hash3(i, 1) * Math.PI * 2 + t * 0.006 * (hash3(i, 2) - 0.5);
          const r = Math.sqrt(hash3(i, 3)) * R * 0.75;
          const cx = STAR.x + Math.cos(a) * r;
          const cy = STAR.y + Math.sin(a) * r * 0.9;
          if (cy > WIN.sill - 2) continue;
          const k = 0.08 * (0.5 + 0.5 * Math.sin(t * 0.07 + i * 2.3));
          g.glow(cx, cy, 7 + hash3(i, 4) * 6, hex('#ffb060'), k * (0.6 + b * 0.6));
        }

        // The 04:00 bloom: the star goes white, the room goes pale, then it all settles back.
        if (nova > 0.003) {
          g.glow(STAR.x, STAR.y, R * (1.5 + nova * 1.1), white, nova * 0.6, 8);
          g.glow(STAR.x, STAR.y, R * 0.9, white, nova * 0.8);
          g.tintAll(hex('#fff0f0'), nova * 0.1);
        }
        // Rare: a prominence loops off the limb and falls back.
        if (f.rare === 0 && ev < 10) {
          const k = envelope(ev, 10, 2.5, 3);
          const a0 = -2.25;
          const bx = STAR.x + Math.cos(a0) * R;
          const by = STAR.y + Math.sin(a0) * R;
          const hgt = 6 + 16 * smoothstep(0, 6, ev);
          for (let i = 0; i <= 40; i++) {
            const u = i / 40;
            const ang = Math.PI * u;
            const x = bx - 16 + 32 * u + Math.cos(a0) * Math.sin(ang) * hgt;
            const y = by + Math.sin(a0) * Math.sin(ang) * hgt - (1 - u) * 4;
            g.pxAdd(x, y, fire, 0.7 * k);
            g.pxAdd(x + 1, y, hex('#ffb070'), 0.35 * k);
          }
          g.glow(bx, by - hgt * 0.5, 16, fire, 0.12 * k);
        }

        // ── the band, in silhouette against the star ──
        const drive = sectionDrive(f);
        const sp = f.speech ?? 0;
        onAirLamp(g, 272, STAGE.y - 10, f);
        band(g, t, { pulse: f.pulse * drive + sp * 0.5, awake: f.awake * (0.7 + 0.3 * drive), reduced: f.reduced, energy: f.energy * drive }, sil);
        rimLight(g, 196, 60, 90, STAGE.y - 58, (c) => c === sil, mix(fire, hex('#ffc890'), 0.3), (0.12 + b * 0.25) * drive, true);
        // stage light: a violet glint on the bass, brighter in rare event 3 and on drops
        const spot = (f.rare === 3 && ev < 10 ? envelope(ev, 10, 1.5, 2) : 0) + Math.max(0, drive - 1) * 0.9;
        g.glow(236, STAGE.y - 22, Math.round((22 + spot * 14) * drive), violet, (0.06 + f.pulse * 0.05 * awake) * drive + spot * 0.18 + sp * 0.15);
        if (spot > 0) g.ellipseA(236, STAGE.y + 1, 20, 3, violetL, clamp(0.2 * spot));

        // ── the croupier and the wheel ──
        const spin = f.rare === 1 && ev < 10 ? envelope(ev, 10, 0.3, 4) : 0;
        pose.lean = 0;
        pose.legL = 0;
        pose.legR = 0;
        pose.kneeL = 0;
        pose.kneeR = 0;
        pose.armL = 0.6 - spin * 0.8;
        pose.armR = -0.5;
        pose.elbowL = 0.5;
        pose.elbowR = -0.7;
        pose.bob = 0;
        pose.nod = 0;
        pose.hair = 0;
        pose.flare = false;
        pose.skirt = false;
        g.clip(g.left, g.top, g.w, WHEEL.y - g.top);
        figure(g, WHEEL.x - 2, FLOOR_Y, 34, pose, sil);
        g.noClip();
        rimLight(g, WHEEL.x - 20, 80, 40, WHEEL.y - 80, (c) => c === sil, mix(fire, hex('#ffc890'), 0.3), 0.12 + b * 0.22, false);
        g.px(WHEEL.x - 2, 95, mix(sil, hex('#e8e0d8'), 0.5));
        const wa = t * (0.3 + spin * 6) * (f.reduced ? 0.2 : 1);
        const wx = WHEEL.x - 15;
        const wy = WHEEL.y - 1;
        g.ellipse(wx, wy + 1, 11, 4, ink);
        g.ellipse(wx, wy, 11, 4, hex('#2a1408'));
        for (let k = 0; k < 18; k++) {
          const a = wa + (k / 18) * Math.PI * 2;
          g.px(wx + Math.cos(a) * 8.5, wy + Math.sin(a) * 3, k % 2 ? hex('#8a1414') : hex('#0c0808'));
        }
        g.ellipse(wx, wy, 5, 1, shade(gold, 0.45));
        g.px(wx, wy - 1, shade(gold, 0.9));
        if (spin > 0) g.px(WHEEL.x - 14 + Math.cos(-wa * 1.3) * 8, WHEEL.y - 1 + Math.sin(-wa * 1.3) * 2.5, white);

        // ── the countdown easel ──
        let text: string;
        if (nova > 0.3 || (hd >= 10 && hd < 10.06)) text = 'NOVA NOW';
        else {
          const left = hd < 10 ? 10 - hd : 34 - hd;
          const mins = Math.max(0, Math.round(left * 60));
          text = `NOVA ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
        }
        easel(g, text, 0.7 + 0.3 * flicker(t, 5, 2));
        g.line(166, 107, 163, FLOOR_Y, hex('#0e060c'));
        g.line(194, 107, 197, FLOOR_Y, hex('#0e060c'));

        // Rare: a waiter crosses with a tray of something on fire.
        if (f.rare === 2 && ev < 10) {
          const p = ev / 10;
          const x = g.left - 20 + p * (g.w + 40);
          const step = f.reduced ? 0 : Math.sin(ev * 5);
          pose.lean = 0.05;
          pose.legL = step * 0.3;
          pose.legR = -step * 0.3;
          pose.armL = -0.3;
          pose.armR = -2.4;
          pose.elbowL = 0;
          pose.elbowR = 0.9;
          pose.hair = 0;
          figure(g, x, 134, 44, pose, sil);
          g.rect(x + 3, 102, 14, 1, sil);
          g.glow(x + 10, 99, 6, fire, 0.5 * flicker(t, 9, 8));
          g.px(x + 10, 100, hex('#ffd890'));
        }

        // Table lamps breathe a little; the room's red rises and falls with the music.
        g.glow(148, 130, 8, violetL, 0.2 * flicker(t, 4, 1.5));
        g.glow(80, 148, 6, violetL, 0.15 * flicker(t, 1, 1.5));
        g.glow(252, 152, 6, violetL, 0.15 * flicker(t, 2, 1.5));
        g.glow(STAR.x, WIN.sill + 6, 90, fire, (0.02 + f.energy * 0.03) * awake, 5);

      },
    };
  },
};

export default def;
