// HUSH: After Hours — the Nightjar's own cabin, seen from behind the operator's empty chair.
// The amber console, a mug, a small plant, a viewport of slow stars, and HUSH's status light
// breathing softly. In a bunk to the left, under a blanket, the operator is asleep.
// Rare events: HUSH types a question and thinks better of it; tea arrives for nobody; HUSH
// signals a passing ship; the empty seat gets warmed, just in case.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep, steam } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { vignette } from './deep-kit';

const VP = { x: 70, y: 16, w: 180, h: 64 }; // viewport frame
const GL = { x: 76, y: 22, w: 168, h: 54 }; // the glass
const DESK_Y = 108;
const SCR = { x: 90, y: 85, w: 60, h: 21 };
const SCOPE = { x: 172, y: 86, w: 52, h: 19 };
const EYE = { x: 161, y: 93 };
const MUG = { x: 236, y: DESK_Y };
const PLANT = { x: 68, y: DESK_Y };
const CHAIR = { x: 160, y: 113 };

const LOG = [
  'HDG 088.2',
  'HULL OK',
  'KETTLE WARM',
  'CREW 1 ASLEEP',
  'STARS: MANY',
  'DRIFT 0.03',
  'RELAY 7 OK',
  'LOG SAVED',
  'NO CALLS',
  'TEMP 19.5',
  'ALL QUIET',
  'PLANT OK',
  'SIG CLEAR',
];

const def: SceneDef = {
  id: 'nightjar-cabin',
  fps: 15,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 12,
  create({ accent }) {
    const amber = accent;
    const amberHot = mix(accent, hex('#fff2d0'), 0.45);
    const amberDim = shade(accent, 0.32);
    const amberDD = shade(accent, 0.12);
    const ink = hex('#030409');
    const wall = [hex('#05060a'), hex('#0a0c13'), hex('#10131c'), hex('#171b27'), hex('#202636')];
    const metal = hex('#262c3a');
    const metalL = hex('#394154');
    const glassTop = hex('#02030a');
    const glassBot = hex('#060914');
    const star = hex('#c8d2ff');
    const screenBg = mix(hex('#0b0703'), amber, 0.06);
    const chair = hex('#09080a');
    const chairL = hex('#16131a');
    const plantD = hex('#0e1f15');
    const plantM = hex('#1d3a22');
    const plantL = hex('#4c7236');
    const mugC = hex('#3c3832');
    const mugL = hex('#8a7c64');
    const blanket = hex('#1a1c2c');
    const blanketL = hex('#2a2c44');
    const red = hex('#c03a2a');
    const green = hex('#3aa860');

    // Star layers: [count, speed px/s, brightness]
    const LAYERS: [number, number, number][] = [
      [70, 0.35, 0.35],
      [34, 0.9, 0.6],
      [12, 2.2, 0.95],
    ];
    const LOOP = GL.w + 24;

    const drawStars = (g: Gfx, t: number, k: number) => {
      g.clip(GL.x, GL.y, GL.w, GL.h);
      for (let L = 0; L < LAYERS.length; L++) {
        const [n, sp, b] = LAYERS[L]!;
        for (let i = 0; i < n; i++) {
          const bx = hash3(i, L, 1) * LOOP;
          const y = GL.y + hash3(i, L, 2) * GL.h;
          const x = GL.x - 12 + ((((bx - t * sp) % LOOP) + LOOP) % LOOP);
          const tw = 0.75 + 0.25 * Math.sin(t * (1 + hash3(i, L, 3) * 2) + i);
          const kk = b * tw * k * (0.5 + 0.5 * hash3(i, L, 4));
          g.pxAdd(x, y, star, kk);
          if (L === 2 && hash3(i, L, 5) > 0.6) {
            g.pxAdd(x + 1, y, star, kk * 0.35);
            g.pxAdd(x - 1, y, star, kk * 0.35);
            g.pxAdd(x, y - 1, star, kk * 0.35);
            g.pxAdd(x, y + 1, star, kk * 0.35);
          }
        }
      }
      g.noClip();
    };

    /** Screen text in phosphor amber, with a dim ghost row offset for CRT bloom. */
    const screenText = (g: Gfx, s: string, x: number, y: number, k: number) => {
      g.text(s, x, y, mix(screenBg, amber, 0.55 * k));
      g.text(s, x, y, mix(screenBg, amberHot, 0.9 * k));
    };

    const chairShape = (g: Gfx, dy: number, c: Color, rim: Color) => {
      const { x, y } = CHAIR;
      // backrest
      roundRect(g, x - 24, y + 17 + dy, 49, 70, 7, c);
      // headrest + posts
      g.rect(x - 7, y + 12 + dy, 2, 7, c);
      g.rect(x + 6, y + 12 + dy, 2, 7, c);
      roundRect(g, x - 14, y + dy, 29, 13, 5, c);
      // armrests
      roundRect(g, x - 36, y + 38 + dy, 14, 5, 2, c);
      roundRect(g, x + 23, y + 38 + dy, 14, 5, 2, c);
      g.rect(x - 32, y + 42 + dy, 3, 18, c);
      g.rect(x + 30, y + 42 + dy, 3, 18, c);
      // seat edges peeking out either side
      roundRect(g, x - 30, y + 52 + dy, 61, 12, 4, c);
      // rim light from the console
      g.hline(x - 11, x + 11, y + dy, rim);
      g.px(x - 13, y + 1 + dy, mix(c, rim, 0.6));
      g.px(x + 13, y + 1 + dy, mix(c, rim, 0.6));
      g.hline(x - 20, x + 20, y + 17 + dy, mix(c, rim, 0.55));
      g.hline(x - 33, x - 25, y + 38 + dy, mix(c, rim, 0.45));
      g.hline(x + 26, x + 34, y + 38 + dy, mix(c, rim, 0.45));
    };

    return {
      background(g) {
        // ── shell: back wall, ceiling, floor ──
        g.vgrad(wall, g.top, 150);
        // ceiling ribs curving over (visible above the viewport and in tall views)
        for (let i = 0; i < 9; i++) {
          const y = 12 - i * 13;
          if (y < g.top - 4) break;
          const sag = 4 + i * 0.5;
          for (let x = g.left; x < g.right; x++) {
            const yy = Math.round(y + ((x - 160) / 200) ** 2 * sag * 4);
            g.rect(x, yy, 1, 2, i % 2 ? wall[2]! : wall[3]!);
            g.px(x, yy + 2, ink);
          }
        }
        // a conduit bundle along the ceiling, a closed hatch
        for (let k = 0; k < 3; k++) g.rect(g.left, -30 + k * 3, g.w, 2, k === 1 ? hex('#141826') : hex('#0d1019'));
        roundRect(g, 128, -64, 64, 22, 3, hex('#0d1019'));
        frameRect(g, 128, -64, 64, 22, metal);
        for (let x = 132; x < 188; x += 6) g.rect(x, -46, 3, 2, hex('#3a3018'));
        g.text('AFT', 152, -58, hex('#3a4256'));
        // a dim ceiling lamp, switched to night mode, and sagging cable loops
        roundRect(g, 74, -22, 30, 6, 2, hex('#0d1019'));
        g.rect(78, -17, 22, 2, hex('#2a1a10'));
        g.glow(89, -15, 26, amber, 0.06, 4);
        for (const [x0, x1, sag] of [[200, 252, 9], [212, 262, 6], [40, 96, 7]] as const)
          for (let x = x0; x <= x1; x++) {
            const u = (x - x0) / (x1 - x0);
            g.px(x, Math.round(-27 + Math.sin(u * Math.PI) * sag), hex('#090b11'));
          }
        // the kettle arm, stowed in its ceiling slot
        g.rect(226, -2, 24, 4, hex('#0d1019'));
        g.rect(230, 0, 16, 3, metal);

        // side walls: angled panels with seams
        for (const side of [-1, 1]) {
          const x0 = side < 0 ? g.left : 262;
          const x1 = side < 0 ? 58 : g.right;
          if (x1 <= x0) continue;
          g.rectMul(x0, g.top, x1 - x0, 150 - g.top, 0.75);
          for (let x = side < 0 ? 52 : 268; side < 0 ? x > g.left : x < g.right; x += side * 22) g.vline(x, g.top, 150, ink);
        }

        // ── the viewport ──
        g.gradRect(GL.x, GL.y, GL.w, GL.h, [glassTop, glassBot]);
        // a faint nebula, very far away
        g.clip(GL.x, GL.y, GL.w, GL.h);
        for (let y = GL.y; y < GL.y + GL.h; y++)
          for (let x = GL.x; x < GL.x + GL.w; x++) {
            const n = fbm(x / 34, y / 16, 21, 4);
            const band = Math.exp(-(((y - 30 - (x - 76) * 0.12) / 14) ** 2));
            const v = clamp((n - 0.42) * 2.4) * band;
            if (v > 0.02) g.pxA(x, y, n > 0.58 ? hex('#3a2a5a') : hex('#1a3040'), v * 0.55);
          }
        // a distant planet's limb, bottom right of the glass
        g.ellipse(232, 92, 42, 26, hex('#05070e'));
        for (let a = 0; a < 140; a++) {
          const ang = Math.PI * (1.08 + (a / 140) * 0.5);
          g.pxA(232 + Math.cos(ang) * 42, 92 + Math.sin(ang) * 26, hex('#4a6a8a'), 0.35);
        }
        g.noClip();
        // frame: thick, with chamfered corners and two struts
        const fr = hex('#11141d');
        g.rect(VP.x, VP.y, VP.w, GL.y - VP.y, fr);
        g.rect(VP.x, GL.y + GL.h, VP.w, VP.y + VP.h - GL.y - GL.h, fr);
        g.rect(VP.x, VP.y, GL.x - VP.x, VP.h, fr);
        g.rect(GL.x + GL.w, VP.y, VP.x + VP.w - GL.x - GL.w, VP.h, fr);
        for (let i = 0; i < 6; i++) {
          g.rect(GL.x, GL.y + i, 6 - i, 1, fr);
          g.rect(GL.x + GL.w - 6 + i, GL.y + i, 6 - i, 1, fr);
          g.rect(GL.x, GL.y + GL.h - 1 - i, 6 - i, 1, fr);
          g.rect(GL.x + GL.w - 6 + i, GL.y + GL.h - 1 - i, 6 - i, 1, fr);
        }
        g.rect(GL.x + 55, GL.y, 3, GL.h, fr);
        g.rect(GL.x + 110, GL.y, 3, GL.h, fr);
        g.hline(VP.x, VP.x + VP.w - 1, VP.y, metal);
        g.hline(GL.x, GL.x + GL.w - 1, GL.y + GL.h, metalL);
        for (let x = VP.x + 4; x < VP.x + VP.w; x += 12) {
          g.px(x, VP.y + 3, metal);
          g.px(x, VP.y + VP.h - 3, metal);
        }

        // ── console ──
        // upper panel (screens), desk top, desk front
        g.rect(40, 82, 240, DESK_Y - 82, hex('#0e1119'));
        g.hline(40, 279, 82, metal);
        g.rect(36, DESK_Y, 248, 5, hex('#1a1d26'));
        g.hline(36, 283, DESK_Y, mix(hex('#1a1d26'), amber, 0.35));
        g.rect(40, DESK_Y + 5, 240, g.bottom, hex('#0a0c12'));
        g.hline(40, 279, DESK_Y + 5, ink);
        for (let x = 60; x < 280; x += 40) g.vline(x, DESK_Y + 6, 150, ink);
        // screen bezels
        roundRect(g, SCR.x - 3, SCR.y - 3, SCR.w + 6, SCR.h + 6, 3, hex('#07080c'));
        roundRect(g, SCR.x, SCR.y, SCR.w, SCR.h, 2, screenBg);
        roundRect(g, SCOPE.x - 3, SCOPE.y - 3, SCOPE.w + 6, SCOPE.h + 6, 3, hex('#07080c'));
        roundRect(g, SCOPE.x, SCOPE.y, SCOPE.w, SCOPE.h, 2, screenBg);
        // scope graticule
        for (let x = SCOPE.x + 6; x < SCOPE.x + SCOPE.w; x += 8)
          for (let y = SCOPE.y + 2; y < SCOPE.y + SCOPE.h; y += 2) g.px(x, y, mix(screenBg, amber, 0.1));
        for (let x = SCOPE.x + 2; x < SCOPE.x + SCOPE.w - 2; x += 2) g.px(x, SCOPE.y + 9, mix(screenBg, amber, 0.12));
        // HUSH's eye: a ringed lens with a small name plate
        g.disc(EYE.x, EYE.y, 6, hex('#06070b'));
        g.ring(EYE.x, EYE.y, 6, 6, metal);
        g.ring(EYE.x, EYE.y, 4, 4, hex('#1a1c24'));
        g.text('HUSH', EYE.x - 7, EYE.y + 9, shade(amber, 0.3));
        // left switch bank
        for (let r = 0; r < 3; r++)
          for (let i = 0; i < 7; i++) {
            const x = 46 + i * 5;
            const y = 87 + r * 7;
            g.rect(x, y, 3, 4, hex('#07080c'));
            g.px(x + 1, y + (hash3(i, r, 2) > 0.5 ? 0 : 2), metalL);
          }
        // right panel: a round gauge and a key slot
        g.disc(248, 94, 9, hex('#07080c'));
        g.disc(248, 94, 8, mix(screenBg, amber, 0.05));
        for (let a = 0; a < 7; a++) {
          const ang = Math.PI * (0.85 + a * 0.22);
          g.px(248 + Math.cos(ang) * 6, 94 + Math.sin(ang) * 6, amberDim);
        }
        g.rect(264, 90, 6, 10, hex('#07080c'));
        g.rect(266, 92, 2, 6, metal);
        // maker's plate
        g.rect(146, 101, 30, 5, hex('#151821'));
        // desk top lit by the screens
        g.glow(SCR.x + SCR.w / 2, DESK_Y + 2, 44, amber, 0.22, 5);
        g.glow(SCOPE.x + SCOPE.w / 2, DESK_Y + 2, 32, amber, 0.14, 5);

        // ── the bunk on the left: a curtain mostly drawn, someone asleep ──
        g.rect(g.left, 58, 54 - g.left, 52, hex('#07080d'));
        g.rect(g.left, 104, 56 - g.left, 4, hex('#151822'));
        g.ellipse(26, 98, 22, 7, blanket);
        g.ellipse(24, 96, 16, 5, blanketL);
        g.ellipse(0, 94, 8, 5, hex('#2a2a36')); // pillow
        for (let y = 56; y < 106; y++)
          for (let x = 34; x < 56; x++) {
            const f = Math.sin(x * 0.9 + Math.sin(y * 0.12) * 1.5);
            g.px(x + (y > 90 ? Math.floor((y - 90) * 0.2) : 0), y, f > 0.2 ? hex('#1c1a28') : hex('#121019'));
          }
        g.rect(g.left, 55, 58 - g.left, 2, metal);

        // ── the right wall: a hatch and a coat on a hook ──
        roundRect(g, 284, 30, 34, 100, 4, hex('#0b0d14'));
        frameRect(g, 284, 30, 34, 100, hex('#1c2130'));
        g.disc(290, 80, 2, metal);
        // spare headphones on a hook
        g.rect(270, 50, 4, 2, metal);
        g.px(271, 52, metalL);
        for (let a = 0; a <= 16; a++) {
          const ang = Math.PI * (1 + a / 16);
          g.px(Math.round(272 + Math.cos(ang) * 7), Math.round(60 + Math.sin(ang) * 8), hex('#1c1f2a'));
        }
        g.px(272, 52, hex('#1c1f2a'));
        roundRect(g, 263, 58, 5, 9, 2, hex('#15171f'));
        roundRect(g, 277, 58, 5, 9, 2, hex('#15171f'));
        g.vline(267, 60, 64, hex('#262a38'));
        g.line(279, 67, 276, 82, hex('#101219'));
        g.line(276, 82, 281, 94, hex('#101219'));

        // ── floor (tall views) ──
        g.vgrad([hex('#0a0c12'), hex('#05060a')], 150, g.bottom, 150);
        for (let y = 154; y < g.bottom; y += 9) g.hline(g.left, g.right, y, ink);
        for (let x = 0; x < 330; x += 30) g.line(160 + (x - 160) * 0.6, 150, 160 + (x - 160) * 1.8, 240, ink);
        g.glow(160, 158, 70, amber, 0.1, 4);
        // chair base (tall views)
        g.rect(158, 175, 5, 14, hex('#0e0f14'));
        for (const dx of [-22, -12, 12, 22]) g.line(160, 190, 160 + dx, 196 + Math.abs(dx) * 0.1, hex('#0e0f14'));
        g.ellipse(160, 196, 26, 3, hex('#040508'));

        vignette(g, 0.5, 160, 80);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 12;
        const wake = 0.35 + 0.65 * f.awake;

        // Stars drift by, slowly. Then the console's reflection on the glass.
        drawStars(g, t, 0.85 + 0.15 * f.awake);
        // a passing ship (rare 2)
        let shipFlash = 0;
        if (R(2)) {
          const p = ev / 12;
          const sx = GL.x + GL.w + 6 - p * (GL.w + 12);
          const sy = GL.y + 14 + p * 6;
          g.clip(GL.x, GL.y, GL.w, GL.h);
          g.rect(sx - 3, sy, 8, 2, hex('#1a2030'));
          g.rect(sx - 1, sy - 1, 3, 1, hex('#1a2030'));
          g.hline(sx - 3, sx + 4, sy, hex('#2c3448'));
          g.px(sx + 5, sy + 1, (t % 1.6) < 0.3 ? hex('#ff4a3a') : hex('#4a1a14'));
          g.glow(sx + 5, sy + 1, 3, hex('#ff4a3a'), (t % 1.6) < 0.3 ? 0.3 : 0);
          shipFlash = ev > 9.4 && ev < 10.4 ? 1 - Math.abs(ev - 9.9) / 0.5 : 0;
          if (shipFlash > 0) {
            g.glow(sx - 1, sy, 14, hex('#d8e4ff'), shipFlash * (f.reduced ? 0.35 : 0.9), 4);
            g.px(sx - 1, sy, hex('#ffffff'));
          }
          g.noClip();
        }
        g.rectAdd(GL.x + 6, GL.y + GL.h - 8, GL.w - 12, 8, amberDD, 0.35 * wake);
        g.rectAdd(GL.x + 40, GL.y + GL.h - 3, 30, 2, amberDim, 0.12 * wake);

        // HUSH's status light: a slow breath. Brighter on the beat, slower when dozing.
        const period = 4.2 + (1 - f.awake) * 3;
        let eye = 0.35 + 0.35 * (0.5 - 0.5 * Math.cos((t / period) * Math.PI * 2)) + f.pulse * 0.12;
        if (R(0) && ev > 3.5 && ev < 7) eye *= 0.6;
        if (R(2)) {
          // ·· — (a hello), then waits, then answers the reply with a glow
          const seq: [number, number][] = [
            [3, 3.25],
            [3.5, 3.75],
            [4, 4.8],
          ];
          let on = 0;
          for (const [a, b] of seq) if (ev > a && ev < b) on = 1;
          if (f.reduced) on *= 0.5;
          if (ev > 2.8 && ev < 9.6) eye = 0.25 + on * 0.75;
          if (ev >= 9.8 && ev < 12) eye = 0.4 + 0.6 * envelope(ev - 9.8, 2.2, 0.3, 1.5);
        }
        eye = clamp(eye);
        g.disc(EYE.x, EYE.y, 3, mix(amberDD, amberHot, eye));
        g.px(EYE.x - 1, EYE.y - 1, mix(amber, hex('#ffffff'), 0.4 * eye));
        g.glow(EYE.x, EYE.y, 7 + eye * 6, amber, 0.12 + eye * 0.3, 4);
        g.glow(EYE.x, EYE.y, 18, amber, 0.05 + eye * 0.06, 3);

        // ── main screen: the log, or HUSH thinking aloud ──
        const sk = wake * (0.85 + 0.15 * Math.sin(t * 37) * (f.reduced ? 0 : 0.2));
        g.clip(SCR.x + 2, SCR.y + 1, SCR.w - 4, SCR.h - 2);
        let custom: string[] | null = null;
        if (R(0)) {
          const q = 'ARE YOU|AWAKE?';
          if (ev < 2.5) custom = [];
          else if (ev < 7.5) custom = q.slice(0, Math.floor((ev - 2.5) * 6)).split('|');
          else if (ev < 9.4) custom = q.slice(0, Math.max(0, q.length - Math.floor((ev - 7.5) * 9))).split('|');
          else custom = ['LOG:', 'ALL QUIET.'.slice(0, Math.floor((ev - 9.4) * 8))];
        } else if (R(1)) custom = ev < 1.5 ? null : ['TEA FOR 1', ev > 7 ? 'SERVED.' : 'POURING'];
        else if (R(2)) custom = ev < 2 ? null : ev < 9.6 ? ['VESSEL 1', ev > 3 ? 'HELLO?' : ''] : ['VESSEL 1', 'HELLO!'];
        else if (R(3)) {
          const s = 'SEAT 1 EMPTY|WARMING IT';
          custom = ev < 1 ? null : s.slice(0, Math.floor((ev - 1) * 7)).split('|');
        }
        if (custom) {
          custom.forEach((line, i) => screenText(g, line, SCR.x + 4, SCR.y + 3 + i * 8, sk));
          if ((t * 2) % 1 < 0.6) {
            const last = custom[custom.length - 1] ?? '';
            const cx = SCR.x + 4 + (last.length ? g.text(last, -999, -999, 0) + 2 : 0);
            g.rect(cx, SCR.y + 3 + Math.max(0, custom.length - 1) * 8, 3, 5, mix(screenBg, amber, 0.8 * sk));
          }
        } else {
          // scrolling log
          const rate = 3.6;
          const pos = t / rate;
          const top = Math.floor(pos);
          const frac = smoothstep(0.85, 1, pos - top);
          for (let i = 0; i < 4; i++) {
            const line = LOG[Math.floor(hash3(top + i, 3) * LOG.length)]!;
            const y = SCR.y + 2 + i * 7 - Math.round(frac * 7);
            screenText(g, line, SCR.x + 4, y, sk * (i === 0 ? 0.6 : 1));
          }
        }
        g.noClip();
        // scanlines + bloom
        for (let y = SCR.y + 1; y < SCR.y + SCR.h; y += 2) g.rectMul(SCR.x + 1, y, SCR.w - 2, 1, 0.82);
        g.glow(SCR.x + SCR.w / 2, SCR.y + SCR.h / 2, 30, amber, 0.12 * wake, 4);

        // ── scope: the programme's waveform ──
        g.clip(SCOPE.x + 1, SCOPE.y + 1, SCOPE.w - 2, SCOPE.h - 2);
        const amp = (2 + f.energy * 14) * f.awake;
        const mid = SCOPE.y + 9;
        let py = mid;
        for (let x = 0; x < SCOPE.w - 2; x++) {
          const u = x / (SCOPE.w - 2);
          const env = Math.sin(u * Math.PI);
          const y = Math.round(mid + env * amp * (Math.sin(u * 19 + t * 5) * 0.6 + Math.sin(u * 47 - t * 9) * 0.3 + (hash3(x, f.n, 1) - 0.5) * 0.25));
          g.vline(SCOPE.x + 1 + x, Math.min(py, y), Math.max(py, y), mix(screenBg, amberHot, 0.75 * wake));
          py = y;
        }
        g.noClip();
        for (let y = SCOPE.y + 1; y < SCOPE.y + SCOPE.h; y += 2) g.rectMul(SCOPE.x + 1, y, SCOPE.w - 2, 1, 0.85);
        g.glow(SCOPE.x + SCOPE.w / 2, mid, 24, amber, (0.06 + f.energy * 0.1) * wake, 4);

        // gauge needle, a few LEDs
        const ang = Math.PI * (0.9 + clamp(f.energy * 1.2) * 1.1 * f.awake);
        g.line(248, 94, 248 + Math.cos(ang) * 6, 94 + Math.sin(ang) * 6, amber);
        for (let i = 0; i < 5; i++) {
          const on = hash3(Math.floor(t / (1.5 + i * 0.7)), i, 9) > 0.45;
          g.px(47 + i * 7, 108, on ? (i === 3 ? red : green) : hex('#0b0c10'));
        }

        // ── the plant: a few leaves, swaying a little in the air recycler's draught ──
        {
          const { x, y } = PLANT;
          g.poly([x - 5, y, x + 5, y, x + 4, y - 7, x - 4, y - 7], hex('#2a1e18'));
          g.hline(x - 5, x + 5, y - 7, hex('#3a2a20'));
          const sway = f.reduced ? 0 : Math.sin(t * 0.6) * 0.8;
          const leaves: [number, number, number][] = [
            [-6, -15, -1],
            [5, -17, 1],
            [-2, -21, -1],
            [3, -12, 1],
            [0, -24, 1],
          ];
          for (const [dx, dy, s] of leaves) {
            const lx = x + dx + sway * (-dy / 20);
            const ly = y + dy;
            g.line(x, y - 7, lx, ly + 3, plantD);
            g.ellipse(lx, ly, 3, 2, plantM);
            g.px(lx + s * 2, ly - 1, plantL);
            g.px(lx + 1, ly, mix(plantM, amber, 0.25));
          }
        }

        // ── the mug, and tea (rare 1) ──
        {
          const { x, y } = MUG;
          roundRect(g, x - 4, y - 8, 9, 8, 1, mugC);
          g.vline(x + 4, y - 7, y - 2, mix(mugC, amber, 0.4));
          g.ring(x - 6, y - 4, 2, 2, mugC);
          g.hline(x - 3, x + 3, y - 8, hex('#1a120c'));
          const hot = R(1) ? smoothstep(4, 6, ev) : 0;
          steam(g, t, x, y - 9, mugL, 3 + Math.round(hot * 5), 10 + hot * 10, 2, 0.2 + hot * 0.25, 0.25, 4);
        }

        // the kettle arm (rare 1): down from the ceiling, pours, back up
        if (R(1)) {
          const down = smoothstep(0.5, 3, ev) * (1 - smoothstep(7.5, 10, ev));
          const ax = 238;
          const ay = Math.round(-2 + down * 80);
          g.rect(ax - 1, -2, 3, ay + 2, metal);
          g.vline(ax + 1, -2, ay, metalL);
          const tilt = smoothstep(3.2, 4, ev) * (1 - smoothstep(6.4, 7, ev));
          const kx = ax + 2;
          const ky = ay + 2;
          roundRect(g, kx - 6, ky, 13, 9, 3, hex('#2e3444'));
          g.hline(kx - 4, kx + 4, ky + 1, metalL);
          g.line(kx - 6, ky + 4, kx - 10, ky + 2 + Math.round(tilt * 5), hex('#2e3444'));
          if (tilt > 0.6) g.vline(kx - 10, ky + 3 + Math.round(tilt * 5), MUG.y - 8, hex('#9a6a3a'));
          g.glow(kx, ky + 4, 10, amber, 0.1);
        }

        // ── the empty chair: a silhouette against the lit desk ──
        const warmth = R(3) ? envelope(ev - 3, 9, 2.5, 2.5) : 0;
        const chairC = warmth > 0 ? mix(chair, hex('#40180a'), warmth * 0.55) : chair;
        chairShape(g, 0, chairC, mix(amberDim, amber, 0.35 * wake));
        // quilted seams on the back and headrest
        const seam = warmth > 0 ? mix(chairL, hex('#6a2a10'), warmth * 0.6) : chairL;
        for (let k = 0; k < 6; k++) g.hline(CHAIR.x - 19, CHAIR.x + 19, CHAIR.y + 26 + k * 8, seam);
        g.vline(CHAIR.x, CHAIR.y + 22, CHAIR.y + 80, seam);
        g.hline(CHAIR.x - 10, CHAIR.x + 10, CHAIR.y + 6, seam);
        if (warmth > 0) {
          g.glow(CHAIR.x, CHAIR.y + 40, 30, hex('#ff6a2a'), warmth * 0.25, 4);
          // a little heat shimmer above the headrest
          for (let i = 0; i < 6; i++) {
            const p = (t * 0.5 + i / 6) % 1;
            g.pxA(CHAIR.x - 10 + i * 4 + Math.sin(t * 3 + i) * 1.5, CHAIR.y - p * 14, hex('#ffb070'), warmth * 0.35 * Math.sin(p * Math.PI));
          }
        }

        // dust motes drifting through the console light
        if (!f.reduced)
          for (let i = 0; i < 9; i++) {
            const p = (t * 0.03 + hash3(i, 2)) % 1;
            const x = 90 + hash3(i, 3) * 140 + Math.sin(t * 0.4 + i) * 6;
            const y = 112 - p * 70;
            g.pxA(x, y, amberHot, 0.25 * Math.sin(p * Math.PI));
          }

        // the sleeper's slow breathing
        const br = (Math.sin(t * 0.9) + 1) * 0.5;
        g.ellipse(24, 95 - Math.round(br), 14, 3, mix(hex('#24263a'), hex('#2e3048'), br));
      },
    };
  },
};

export default def;
