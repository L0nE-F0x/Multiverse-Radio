// Free Frequency: a cramped attic studio under the roof. A scavenged transmitter of mismatched
// boxes with its valves aglow, egg-box foam on the gable wall, a corkboard of relay-ship
// blueprints joined with red string, the night's drift frequencies chalked on a rafter, and
// one bare bulb on its flex. Static Kate leans into the mic. Through the round window under
// the ridge, now and then, a small light passes: it might be the Nightjar.
// Rare events: HUSH jams the signal (the scope fills with snow, the bulb sags, Kate glares at
// the window); a new length of string goes up on the board; the Nightjar passes close enough
// to light the room; the kettle on the shelf comes to the boil.

import { callLamp, onAirLamp, sectionDrive } from '../kit/broadcast';
import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep, steam } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3, noise1 } from '../kit/rng';
import type { SceneDef } from '../types';
import { eggBox } from './deep-kit';
import { motes, shaft, vignette } from './lib/night';

const APEX = { x: 160, y: -46 };
const EAVE_Y = 62;
const GABLE_L = 40;
const GABLE_R = 280;
const FLOOR = 150;
const WIN = { x: 160, y: 26, r: 12 }; // the round window
const BULB = { x: 146, y: 60 }; // where the bulb hangs at rest
const COLLAR = 42; // the collar beam's top
const DESK = { x: 84, y: 114, w: 112 }; // desk top (left edge, height, width)
const KATE = { x: 182, seat: 124 };
const BOARD = { x: 206, y: 66, w: 60, h: 40 };
const MIC = { x: 162, y: 92 };
const TX = { x: 92, y: 80 }; // the transmitter stack's top-left
const PASS = 46; // seconds between the Nightjar's passes
// Tonight's drift frequencies, chalked on the left rafter.
const CHALK = ['108.85', '110.65', '112.45', '114.30', '116.05'];

const def: SceneDef = {
  id: 'pirate-attic',
  fps: 15,
  focusX: 160,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 10,
  grade: { temperature: 0.25, contrast: 1.15, saturation: 0.82, bloom: 0.75, threshold: 0.62, vignette: 0.36, shadows: '#070405' },
  create({ accent }) {
    const ink = hex('#060404');
    const board = [hex('#0e0907'), hex('#161009'), hex('#20170e'), hex('#2c2014'), hex('#3a2a1a')];
    const plaster = [hex('#16120f'), hex('#1e1813'), hex('#272018')];
    const foam = [hex('#1a1614'), hex('#262019'), hex('#120e0c')];
    const bulbC = hex('#ffcf8a');
    const bulbHot = hex('#fff2d6');
    const valve = hex('#ff8a3a');
    const red = mix(accent, hex('#c0302a'), 0.3);
    const blueprint = [hex('#1a2e4a'), hex('#24406a'), hex('#8ab0d8')];
    const moon = hex('#9ab0d8');
    const skin = hex('#b8886a');
    const skinD = hex('#4e3428');
    const hoodie = hex('#2a2a30');
    const hoodieD = hex('#16161a');
    const hairC = hex('#3a1a14');
    const metal = [hex('#14161a'), hex('#24272e'), hex('#3a3e46'), hex('#5a5e66')];
    let front: Int32Array = new Int32Array(0);
    const inBeam = (x: number, y: number) => {
      // the moonbeam from the round window falls down and to the left
      const u = (y - WIN.y) / 110;
      const ax = WIN.x - u * 44;
      return clamp(1 - Math.abs(x - ax) / (8 + u * 18));
    };

    /** A little relay ship in plan: hull, dish, fins, as a blueprint line drawing. */
    const shipPlan = (g: Gfx, x: number, y: number, s: number, c: Color) => {
      g.hline(x - 7 * s, x + 7 * s, y, c);
      g.hline(x - 6 * s, x + 6 * s, y + 3 * s, c);
      g.vline(x - 7 * s, y, y + 3 * s, c);
      g.line(x + 7 * s, y, x + 9 * s, y + 1.5 * s, c);
      g.line(x + 6 * s, y + 3 * s, x + 9 * s, y + 1.5 * s, c);
      g.line(x - 2 * s, y, x - 1 * s, y - 3 * s, c);
      g.ring(x - 1 * s, y - 4 * s, 2 * s, 1 * s, c);
      g.line(x - 7 * s, y + 3 * s, x - 9 * s, y + 5 * s, c);
      for (let i = -4; i <= 4; i += 2) g.px(x + i * s, y + 1.5 * s, c);
    };

    return {
      background(g) {
        // ── the roof's underside everywhere outside the gable: boards and rafters ──
        g.fill(board[0]!);
        for (let y = g.top; y < FLOOR; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 6, y / 40, 5, 2);
            if (n > 0.58) g.px(x, y, board[1]!);
            else if (n < 0.3) g.px(x, y, hex('#0a0605'));
          }
        // rafters, parallel to each gable edge, stepping outward toward us
        for (let k = 1; k < 7; k++) {
          const off = k * 30 + k * k * 3;
          const c = k % 2 ? board[3]! : board[2]!;
          for (let dx = 0; dx < 3 + k; dx++) {
            g.line(APEX.x - off - dx, APEX.y - off * 0.2, GABLE_L - off - dx, EAVE_Y + off * 0.9, c);
            g.line(APEX.x + off + dx, APEX.y - off * 0.2, GABLE_R + off + dx, EAVE_Y + off * 0.9, c);
          }
        }
        // the ridge beam coming toward us (portrait sees it)
        g.poly([APEX.x - 3, APEX.y, APEX.x + 3, APEX.y, APEX.x + 12, g.top - 1, APEX.x - 12, g.top - 1], board[2]!);
        g.line(APEX.x - 3, APEX.y, APEX.x - 12, g.top - 1, board[3]!);
        // the knee walls
        g.rect(g.left, 118, GABLE_L - g.left, FLOOR - 118, board[1]!);
        g.rect(GABLE_R, 118, g.right - GABLE_R, FLOOR - 118, board[1]!);
        for (let x = Math.floor(g.left / 6) * 6; x < g.right; x += 6) if (x < GABLE_L || x > GABLE_R) g.vline(x, 118, FLOOR, board[0]!);
        g.hline(g.left, GABLE_L, 118, board[3]!);
        g.hline(GABLE_R, g.right, 118, board[3]!);

        // ── the gable wall: old plaster, the round window ──
        const gable = [GABLE_L, FLOOR, GABLE_L, EAVE_Y, APEX.x, APEX.y, GABLE_R, EAVE_Y, GABLE_R, FLOOR];
        g.poly(gable, plaster[1]!);
        for (let y = APEX.y; y < FLOOR; y++)
          for (let x = GABLE_L; x < GABLE_R; x++) {
            if (g.get(x, y) !== plaster[1]) continue;
            const n = fbm(x / 22, y / 18, 9, 3);
            if (n > 0.6) g.px(x, y, plaster[2]!);
            else if (n < 0.38) g.px(x, y, plaster[0]!);
          }
        // the gable's own rafters (the edges), thick and dark
        for (let d = 0; d < 4; d++) {
          g.line(APEX.x, APEX.y + d, GABLE_L - 1, EAVE_Y + d, d === 0 ? board[4]! : d < 3 ? board[3]! : board[1]!);
          g.line(APEX.x, APEX.y + d, GABLE_R + 1, EAVE_Y + d, d === 0 ? board[4]! : d < 3 ? board[3]! : board[1]!);
        }
        // a collar beam across, under the window
        {
          const xl = APEX.x - ((COLLAR - APEX.y) / (EAVE_Y - APEX.y)) * (APEX.x - GABLE_L) - 6;
          const xr = 2 * APEX.x - xl;
          g.rect(xl, COLLAR, xr - xl, 5, board[2]!);
          g.hline(xl, xr, COLLAR, board[4]!);
          g.hline(xl, xr, COLLAR + 5, ink);
          for (let x = xl + 10; x < xr; x += 23) g.px(x, COLLAR + 2, board[0]!); // old nail holes
        }
        // round window: frame, night sky (the light passes per frame)
        g.disc(WIN.x, WIN.y, WIN.r + 3, board[3]!);
        g.disc(WIN.x, WIN.y, WIN.r + 1, board[1]!);
        g.disc(WIN.x, WIN.y, WIN.r, hex('#0a1020'));
        g.clip(WIN.x - WIN.r, WIN.y - WIN.r, WIN.r * 2 + 1, WIN.r * 2 + 1);
        for (let y = WIN.y - WIN.r; y <= WIN.y + WIN.r; y++)
          for (let x = WIN.x - WIN.r; x <= WIN.x + WIN.r; x++) {
            if ((x - WIN.x) ** 2 + (y - WIN.y) ** 2 > WIN.r * WIN.r) continue;
            const v = (y - WIN.y + WIN.r) / (WIN.r * 2);
            g.px(x, y, mix(hex('#060a18'), hex('#1a2440'), v * v));
            if (hash3(x, y, 41) < 0.05) g.px(x, y, mix(hex('#8a98c8'), hex('#ffffff'), hash3(x, y, 42)));
          }
        g.noClip();
        g.vline(WIN.x, WIN.y - WIN.r, WIN.y + WIN.r, board[2]!);
        g.hline(WIN.x - WIN.r, WIN.x + WIN.r, WIN.y, board[2]!);

        // ── egg-box foam patched over the wall behind the desk ──
        for (const [x, y, w, h] of [
          [52, 82, 36, 32],
          [92, 78, 108, 36],
          [176, 50, 28, 26],
          [136, 50, 40, 28],
          [270, 70, 10, 44],
        ] as const)
          eggBox(g, x, y, w, h, foam[0]!, foam[1]!, foam[2]!, 4);

        // ── a slate of tonight's drift frequencies, the next one circled ──
        {
          const sx = 52;
          const sy = 54;
          g.rect(sx - 2, sy - 2, 40, 27, board[3]!);
          g.rect(sx, sy, 36, 23, hex('#14181a'));
          for (let i = 0; i < 30; i++) g.px(sx + hash3(i, 3) * 36, sy + hash3(i, 4) * 23, hex('#1e2426'));
          const chalk = hex('#8e8a80');
          for (let i = 0; i < 3; i++) g.text(CHALK[i + 1]!, sx + 7, sy + 3 + i * 7, i === 0 ? shade(chalk, 0.6) : chalk);
          g.hline(sx + 5, sx + 31, sy + 5, shade(chalk, 0.8)); // last night's, crossed out
          g.ring(sx + 18, sy + 19, 15, 4, mix(chalk, red, 0.5));
          g.vline(sx + 18, sy - 6, sy - 2, board[0]!);
        }

        // ── the corkboard of blueprints ──
        const B = BOARD;
        g.rect(B.x - 2, B.y - 2, B.w + 4, B.h + 4, board[3]!);
        g.rect(B.x, B.y, B.w, B.h, hex('#3a2818'));
        for (let i = 0; i < 80; i++) g.px(B.x + hash3(i, 1) * B.w, B.y + hash3(i, 2) * B.h, hex('#2a1c10'));
        const sheets: [number, number, number, number][] = [
          [B.x + 3, B.y + 3, 24, 16],
          [B.x + 31, B.y + 4, 26, 15],
          [B.x + 6, B.y + 22, 20, 15],
          [B.x + 30, B.y + 23, 26, 14],
        ];
        for (let i = 0; i < sheets.length; i++) {
          const [x, y, w, h] = sheets[i]!;
          g.rect(x + 1, y + 1, w, h, ink);
          g.rect(x, y, w, h, blueprint[i % 2]!);
          for (let gx = x + 3; gx < x + w; gx += 4) g.vline(gx, y + 1, y + h - 2, mix(blueprint[i % 2]!, blueprint[2]!, 0.12));
          shipPlan(g, x + w / 2, y + h / 2, i === 1 ? 1.4 : 1, mix(blueprint[2]!, blueprint[i % 2]!, 0.15));
        }
        // a polaroid of a streak of light; a note
        g.rect(B.x + 44, B.y + 18, 9, 10, hex('#b8b0a0'));
        g.rect(B.x + 45, B.y + 19, 7, 6, hex('#101418'));
        g.line(B.x + 45, B.y + 23, B.x + 51, B.y + 20, hex('#d8b070'));
        g.rect(B.x + 22, B.y + 17, 10, 7, hex('#c8b860'));
        g.hline(B.x + 23, B.x + 30, B.y + 19, hex('#5a5020'));
        g.hline(B.x + 23, B.x + 28, B.y + 21, hex('#5a5020'));

        // ── shelf under the left slope: dead radios, tapes, the kettle ──
        g.rect(GABLE_L - 30, 92, 62, 3, board[3]!);
        g.hline(GABLE_L - 30, GABLE_L + 31, 92, board[4]!);
        g.rect(GABLE_L - 26, 80, 18, 12, hex('#2a1e14'));
        g.disc(GABLE_L - 21, 86, 3, hex('#1a120c'));
        g.rect(GABLE_L - 15, 83, 5, 2, hex('#6a5a3a'));
        for (let i = 0; i < 5; i++) g.rect(GABLE_L - 4 + i * 4, 84, 3, 8, [hex('#3a2a2a'), hex('#2a2a3a'), hex('#3a3a2a')][i % 3]!);
        // kettle (steam per frame)
        g.ellipse(GABLE_L + 22, 87, 5, 4, metal[2]!);
        g.rect(GABLE_L + 17, 88, 11, 4, metal[1]!);
        g.line(GABLE_L + 27, 86, GABLE_L + 31, 83, metal[2]!);
        g.hline(GABLE_L + 19, GABLE_L + 25, 82, metal[1]!);
        g.px(GABLE_L + 20, 85, metal[3]!);

        // ── the desk and the scavenged transmitter ──
        const D = DESK;
        // the desk's top and front go in their own layer: Kate sits behind them
        front = g.layer();
        g.target(front);
        g.rect(D.x, D.y, D.w, 4, board[3]!);
        g.hline(D.x, D.x + D.w - 1, D.y, board[4]!);
        g.rect(D.x + 2, D.y + 4, D.w - 4, FLOOR + 2 - D.y - 4, board[1]!);
        g.hline(D.x + 2, D.x + D.w - 3, D.y + 4, board[0]!);
        for (const dx of [6, D.w - 36]) {
          g.rect(D.x + dx, D.y + 7, 30, 10, board[2]!); // drawers
          g.rect(D.x + dx, D.y + 19, 30, 10, board[2]!);
          g.hline(D.x + dx, D.x + dx + 29, D.y + 7, board[3]!);
          g.hline(D.x + dx, D.x + dx + 29, D.y + 19, board[3]!);
          g.rect(D.x + dx + 12, D.y + 11, 6, 1, metal[3]!);
          g.rect(D.x + dx + 12, D.y + 23, 6, 1, metal[3]!);
        }
        // stickers and a gaffer-taped frequency card on the front
        g.rect(D.x + 47, D.y + 10, 13, 7, hex('#6e665a'));
        g.text('FF', D.x + 49, D.y + 11, shade(red, 0.7));
        g.rect(D.x + 66, D.y + 8, 8, 8, hex('#2a3a4a'));
        g.rect(D.x + 64, D.y + 9, 3, 2, hex('#6a6050'));
        g.target(g.bg);
        // transmitter: a tall rack of mismatched boxes
        const T = TX;
        g.rect(T.x, T.y + 18, 38, 16, hex('#2a2620')); // bottom: an old receiver, big dial
        g.disc(T.x + 10, T.y + 26, 6, hex('#1a1612'));
        g.ring(T.x + 10, T.y + 26, 6, 6, metal[2]!);
        for (let i = 0; i < 4; i++) g.rect(T.x + 21 + i * 4, T.y + 22, 2, 2, metal[2]!);
        g.rect(T.x + 20, T.y + 28, 16, 3, hex('#3a3018')); // dial window
        g.rect(T.x + 2, T.y + 2, 34, 16, hex('#1c2228')); // middle: grey rack unit, meters and a scope
        g.hline(T.x + 2, T.x + 35, T.y + 2, metal[3]!);
        g.rect(T.x + 4, T.y + 5, 10, 8, hex('#0a1410')); // scope screen
        g.rect(T.x + 17, T.y + 5, 7, 5, hex('#3a3018'));
        g.rect(T.x + 26, T.y + 5, 7, 5, hex('#3a3018'));
        for (let i = 0; i < 5; i++) g.px(T.x + 18 + i * 3, T.y + 14, metal[3]!);
        g.rect(T.x + 6, T.y - 12, 26, 14, hex('#141414')); // top: open chassis with valves
        for (let i = 0; i < 4; i++) {
          g.rect(T.x + 9 + i * 6, T.y - 10, 3, 8, hex('#2a2420'));
          g.px(T.x + 9 + i * 6, T.y - 10, hex('#5a5048'));
        }
        g.line(T.x + 32, T.y - 12, T.x + 44, T.y - 40, metal[2]!); // an aerial lead off to the roof
        // mic on a spring arm, clamped to the desk
        g.vline(MIC.x - 22, D.y - 14, D.y - 1, metal[1]!);
        g.line(MIC.x - 22, D.y - 14, MIC.x - 8, MIC.y - 6, metal[2]!);
        g.line(MIC.x - 8, MIC.y - 6, MIC.x - 2, MIC.y - 2, metal[2]!);
        g.rect(MIC.x - 3, MIC.y - 3, 5, 9, metal[0]!);
        g.rect(MIC.x - 2, MIC.y - 2, 3, 7, metal[2]!);
        for (let k = 0; k < 3; k++) g.hline(MIC.x - 2, MIC.x, MIC.y - 1 + k * 2, metal[1]!);
        // mugs, papers, a headphone cable
        g.rect(D.x + 60, D.y - 6, 5, 6, hex('#5a4a40'));
        g.rect(D.x + 65, D.y - 5, 1, 3, hex('#5a4a40'));
        g.rect(D.x + 44, D.y - 1, 14, 1, hex('#a89e88'));
        g.rect(D.x + 46, D.y - 2, 12, 1, hex('#b8ae98'));
        for (let i = 0; i <= 30; i++) {
          const u = i / 30;
          g.px(D.x + 38 + u * 40, D.y - 1 + Math.sin(u * 3.1) * 3 + 3, ink);
        }

        // ── floor: bare boards, a rug, cables ──
        g.vgrad([board[2]!, board[1]!, ink], FLOOR, Math.max(FLOOR + 60, g.bottom - 10), FLOOR);
        for (let x = Math.floor(g.left / 9) * 9; x < g.right; x += 9) {
          // boards run toward us, fanning a little
          g.line(x, FLOOR, x + (x - 160) * 0.8, g.bottom, board[0]!);
        }
        g.ellipse(150, FLOOR + 20, 70, 10, hex('#2a1412'));
        g.ellipse(150, FLOOR + 20, 64, 8, hex('#341a16'));
        for (let a = 0; a < 70; a++) g.px(150 + Math.cos(a * 0.09) * 58, FLOOR + 20 + Math.sin(a * 0.09) * 6, hex('#4a2a1e'));
        // a camp bed against the knee wall (she lives here, mostly)
        g.rect(GABLE_R + 4, 136, 40, 6, hex('#2a2a24'));
        g.rect(GABLE_R + 4, 132, 12, 5, hex('#3a3830'));
        g.vline(GABLE_R + 6, 142, FLOOR + 2, metal[1]!);

        // ── light ──
        g.lighting(0.42);
        g.light(BULB.x, BULB.y + 8, 130, 0.9, 110);
        g.light(BULB.x, FLOOR + 20, 90, 0.25, 30);
        g.light(TX.x + 18, TX.y + 10, 30, 0.3, 26);
        g.light(KATE.x, 96, 34, 0.25, 30);
        g.light(WIN.x, WIN.y, 26, 0.35, 26);
        g.glow(BULB.x, BULB.y, 70, bulbC, 0.08, 6);
        vignette(g, 0.55, 160, 86, 240, 180);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const live = 0.55 + 0.45 * f.awake;
        const jam = R(0) ? envelope(ev, 10, 0.4, 2.5) : 0;

        // ── the round window: the Nightjar passes now and then ──
        {
          const close = R(2) ? envelope(ev, 10, 1.5, 2) : 0;
          let p = ((t + 30) % PASS) / 9; // 9 s to cross, then long gaps
          if (R(2)) p = clamp((ev - 1) / 8);
          if (p < 1) {
            const x = WIN.x - WIN.r - 4 + p * (WIN.r * 2 + 8);
            const y = WIN.y + 4 - p * 6 + Math.sin(p * 3) * 1;
            g.clip(WIN.x - WIN.r, WIN.y - WIN.r, WIN.r * 2 + 1, WIN.r * 2 + 1);
            if (close > 0.1) {
              // near enough to see the hull, the long lit cabin window
              g.rect(x - 9, y - 1, 16, 4, hex('#05070c'));
              g.poly([x + 7, y - 1, x + 10, y + 1, x + 7, y + 3], hex('#05070c'));
              g.hline(x - 6, x + 3, y, mix(hex('#2a1e10'), hex('#ffb648'), 0.8));
              g.vline(x - 3, y - 4, y - 1, hex('#05070c'));
              g.px(x - 9, y + 1, hex('#ff8a6a'));
            } else {
              g.px(x, y, hex('#ffd8a0'));
              g.pxA(x - 1, y, hex('#ffd8a0'), 0.4);
              if (Math.sin(t * 2.4) > 0.6) g.px(x - 2, y + 1, hex('#ff5a4a'));
            }
            g.noClip();
            g.glow(x, y, 6 + close * 10, hex('#ffd8a0'), (0.25 + close * 0.5) * (1 - Math.abs(p - 0.5)));
          }
          if (close > 0) {
            // its light sweeps across the room
            const sx = 300 - clamp((ev - 1) / 8) * 320;
            g.rectAdd(sx - 30, g.top, 60, FLOOR - g.top, hex('#ffb648'), 0.05 * close);
          }
        }
        // the moonbeam through the window, dust turning in it
        shaft(g, WIN.x, WIN.y + 6, WIN.x - 44, WIN.y + 118, 14, 40, moon, 0.06 * (1 - jam * 0.5), 0.7, 5);
        motes(g, t, WIN.x - 70, WIN.y + 6, 90, 110, 22, moon, 0.35, 5, 0.3, inBeam);

        // ── the corkboard's string (and the new length that goes up) ──
        {
          const B = BOARD;
          const pins: [number, number][] = [
            [B.x + 15, B.y + 5],
            [B.x + 44, B.y + 6],
            [B.x + 16, B.y + 24],
            [B.x + 43, B.y + 25],
            [B.x + 48, B.y + 19],
            [B.x + 27, B.y + 18],
          ];
          const links: [number, number][] = [
            [0, 1],
            [0, 3],
            [2, 1],
            [4, 3],
            [5, 0],
            [5, 2],
          ];
          for (const [a, b] of links) {
            const [x0, y0] = pins[a]!;
            const [x1, y1] = pins[b]!;
            g.line(x0, y0, x1, y1 + 1, red);
          }
          if (R(1)) {
            const p = smoothstep(1, 5, ev);
            const [x0, y0] = pins[2]!;
            const x1 = B.x + B.w - 4;
            const y1 = B.y + B.h - 4;
            g.line(x0, y0, x0 + (x1 - x0) * p, y0 + (y1 - y0) * p, mix(red, hex('#ff8a7a'), envelope(ev, 10, 1, 3) * 0.4));
            if (p >= 1) g.px(x1, y1, hex('#e8e0d0'));
          }
          for (const [x, y] of pins) {
            g.px(x, y, hex('#e84a3a'));
            g.px(x, y - 1, hex('#ff8a7a'));
          }
        }

        // ── the transmitter: valves glow, meters swing, the scope traces (or snows) ──
        const sp = f.speech ?? 0;
        const isVoice = f.segmentKind === 'voice' || sp > 0.05;
        const drive = sectionDrive(f);
        {
          const T = TX;
          onAirLamp(g, T.x + 28, T.y - 11, f);
          callLamp(g, T.x + 4, T.y + 21, f);
          for (let i = 0; i < 4; i++) {
            const k = live * (0.75 + 0.25 * noise1(t * 3 + i * 7, i) + sp * 0.25) * (1 - jam * 0.6);
            g.rect(T.x + 9 + i * 6, T.y - 8, 3, 5, mix(hex('#3a1a0a'), valve, clamp(k)));
            g.px(T.x + 10 + i * 6, T.y - 7, mix(valve, hex('#fff0c0'), 0.5 * clamp(k)));
            g.glow(T.x + 10 + i * 6, T.y - 6, 7, valve, 0.22 * clamp(k), 4);
          }
          const sigLevel = Math.max(f.energy * drive, sp * 1.4);
          for (let i = 0; i < 2; i++) {
            const v = clamp(sigLevel * 1.1 + noise1(t * 5, i + 3) * 0.2) * live;
            const cx = T.x + 20 + i * 9;
            g.line(cx, T.y + 9, cx - 2 + Math.round(v * 4), T.y + 6, hex('#1a1408'));
            g.glow(cx, T.y + 7, 5, hex('#e8b050'), 0.12 * live, 3);
          }
          // scope: a green trace following the voice, or snow while jammed
          for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 8; y++) {
              if (jam > 0.3 && hash3(x, y, Math.floor(t * 15)) < 0.5 * jam) g.px(T.x + 4 + x, T.y + 5 + y, hex('#6a8a7a'));
            }
            if (jam <= 0.3) {
              const y = clamp(4 + Math.round(Math.sin(x * 1.3 + t * 9) * sigLevel * 3.5), 0, 7);
              g.px(T.x + 4 + x, T.y + 5 + y, hex('#5aff9a'));
            }
          }
          g.glow(T.x + 9, T.y + 9, 8, hex('#3aff8a'), (0.1 + sp * 0.15) * live, 3);
          // the dial
          g.rectAdd(T.x + 20, T.y + 28, 16, 3, hex('#ffb648'), 0.35 * live);
          g.vline(T.x + 24 + Math.round(Math.sin(t * 0.05) * 3), T.y + 28, T.y + 30, hex('#c83a2a'));
        }

        // ── Static Kate at the mic, behind the desk ──
        {
          const x = KATE.x;
          const y = KATE.seat;
          const talking = (isVoice || f.energy > 0.15) && !f.reduced && jam < 0.3;
          const lean = talking ? 1 : 0;
          const nod = talking && Math.sin(t * (isVoice ? 9 : 7)) > 0.2 ? 1 : 0;
          const glare = (R(0) && ev > 1 && ev < 8.5) || Boolean(f.hush);
          const look = glare || (R(2) && ev > 3 && ev < 8);
          if (isVoice) g.glow(MIC.x - 1, MIC.y + 1, 6 + sp * 7, bulbC, 0.16 + sp * 0.3, 3);
          // the chair back behind her
          g.rect(x + 5, y - 24, 4, 22, hex('#141210'));
          g.hline(x + 5, x + 8, y - 24, hex('#2a2620'));
          // body: a hoodie, hunched toward the mic on her left
          const bx = x - lean;
          g.poly([bx - 7, y, bx + 6, y, bx + 5, y - 19, bx - 6, y - 20], hoodie);
          g.poly([bx + 1, y, bx + 6, y, bx + 5, y - 19, bx + 1, y - 20], hoodieD);
          g.ellipse(bx - 1, y - 20, 5, 2, hoodie); // hood bunched at the neck
          // head in profile, facing left (tipped up at the window when it matters)
          const hx = bx - 2 - lean;
          const hy = y - 32 + nod - (look ? 1 : 0);
          g.rect(hx, hy + 9, 3, 3, skinD);
          g.ellipse(hx, hy + 5, 4, 5, skinD);
          g.vline(hx - 4, hy + 3 - (look ? 1 : 0), hy + 7, skin);
          g.px(hx - 5, hy + 5 - (look ? 2 : 0), skin); // nose
          g.px(hx - 4, hy + 8, skinD);
          // dark red hair, a messy knot
          g.ellipse(hx + 1, hy + 2, 4, 4, hairC);
          g.rect(hx + 1, hy + 2, 4, 7, hairC);
          g.disc(hx + 4, hy - 1, 2, hairC);
          g.px(hx - 2, hy - 1, mix(hairC, bulbC, 0.4));
          // headphones (pulled down round her neck when HUSH jams her)
          if (glare) {
            g.hline(hx - 2, hx + 3, hy + 12, metal[2]!);
            g.rect(hx + 3, hy + 10, 2, 3, metal[1]!);
          } else {
            g.line(hx - 2, hy - 2, hx + 4, hy - 1, metal[2]!);
            g.rect(hx, hy + 3, 3, 4, metal[1]!);
          }
          // arms on the desk: one hand flat, one gesturing at the mic as she makes her case
          const gest = talking && Math.sin(t * 0.9) > 0.3 ? Math.round(Math.sin(t * 5) * 2) : 0;
          g.line(bx - 5, y - 16, bx - 11, y - 10, hoodie);
          g.line(bx - 11, y - 10, bx - 18, DESK.y - 4 - Math.max(0, gest), hoodie);
          g.px(bx - 19, DESK.y - 4 - Math.max(0, gest), skin);
          g.line(bx + 3, y - 15, bx - 2, DESK.y - 1, hoodieD);
          g.px(bx - 3, DESK.y - 1, skinD);
          // the bulb catches her cheek and shoulder
          g.vline(hx - 4, hy + 2, hy + 4, mix(skin, bulbC, 0.4));
          g.vline(bx - 6, y - 19, y - 10, mix(hoodie, bulbC, 0.35));
          g.hline(bx - 5, bx - 1, y - 21, mix(hoodie, bulbC, 0.3));
        }
        g.overlay(front);

        // ── the kettle on the shelf ──
        if (R(3)) {
          const k = envelope(ev, 10, 2, 3);
          steam(g, t, GABLE_L + 31, 82, hex('#c8c0b8'), 8, 18 * k, 4, 0.5 * k, 0.5, 3);
        }

        // ── the bare bulb on its flex, swaying a hair ──
        {
          const sway = f.reduced ? 0 : Math.sin(t * 0.6) * 1.2;
          const bx = BULB.x + Math.round(sway);
          const by = BULB.y;
          g.line(BULB.x + 2, COLLAR + 5, bx, by - 4, hex('#0a0806'));
          g.rect(bx - 1, by - 4, 3, 3, metal[1]!);
          const k = live * (1 - jam * 0.45 * (0.8 + 0.2 * noise1(t * 6, 2)));
          g.ellipse(bx, by + 1, 2, 3, mix(hex('#5a4020'), bulbHot, k));
          g.px(bx, by + 1, mix(bulbC, hex('#ffffff'), k));
          g.glow(bx, by + 1, 26, bulbC, 0.32 * k, 6);
          g.glow(bx, by + 1, 7, bulbHot, 0.5 * k, 4);
        }
      },
    };
  },
};

export default def;
