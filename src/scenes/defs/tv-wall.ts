// Channel Surf: a dark living room lit only by a wall of mismatched old TVs, each looping its
// own tiny programme. A remote floats in front of the couch and will not stop clicking;
// screens flip at random.

import { gloom, lightPool, reflectDown } from '../kit/atmos';
import { type Color, hex, hsv, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, TAU } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { dome, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

interface Tv {
  x: number;
  y: number;
  w: number;
  h: number;
  body: Color;
  knobs: boolean;
  antenna: boolean;
  ch: number;
  staticUntil: number;
}

type Show = (g: Gfx, x: number, y: number, w: number, h: number, t: number) => void;

const def: SceneDef = {
  id: 'tv-wall',
  fps: 18,
  focusY: 92,
  rareEvents: 3,
  rareDuration: 6,
  grade: { contrast: 1.14, saturation: 0.8, bloom: 0.7, threshold: 0.66, vignette: 0.36, shadows: '#06050a' },
  create({ accent }) {
    const ink = hex('#060406');
    const BARS = [hex('#e8e8e8'), hex('#e8e83a'), hex('#3ae8e8'), hex('#3ae83a'), hex('#e83ae8'), hex('#e83a3a'), hex('#3a3ae8')];
    const FISH = [hex('#ff8a3a'), hex('#ffd34f'), hex('#ff6ab0')];
    const BUTTONS = [hex('#e8e8e8'), hex('#ffd34f'), hex('#4ac0ff')];
    const skin = hex('#f0c8a0');
    const tvs: Tv[] = [
      { x: 62, y: 104, w: 62, h: 50, body: hex('#6a4024'), knobs: true, antenna: false, ch: 0, staticUntil: 0 },
      { x: 128, y: 100, w: 66, h: 54, body: hex('#2a2a30'), knobs: false, antenna: false, ch: 1, staticUntil: 0 },
      { x: 198, y: 106, w: 60, h: 48, body: hex('#c8b898'), knobs: true, antenna: false, ch: 2, staticUntil: 0 },
      { x: 70, y: 58, w: 50, h: 44, body: hex('#b03a2a'), knobs: false, antenna: false, ch: 3, staticUntil: 0 },
      { x: 124, y: 54, w: 52, h: 44, body: hex('#8a6a44'), knobs: true, antenna: false, ch: 4, staticUntil: 0 },
      { x: 180, y: 60, w: 58, h: 44, body: hex('#3a8a8a'), knobs: false, antenna: false, ch: 5, staticUntil: 0 },
      { x: 88, y: 20, w: 38, h: 36, body: hex('#e8e0d0'), knobs: false, antenna: true, ch: 6, staticUntil: 0 },
      { x: 132, y: 14, w: 48, h: 38, body: hex('#4a3a5a'), knobs: true, antenna: true, ch: 7, staticUntil: 0 },
      { x: 186, y: 22, w: 36, h: 36, body: hex('#d86a2a'), knobs: false, antenna: false, ch: 8, staticUntil: 0 },
    ];
    // The cabinets sit in the dark; only their screens are lit.
    for (const tv of tvs) tv.body = mix(shade(tv.body, 0.45), hex('#140c10'), 0.45);

    const shows: Show[] = [
      // 0 an egg being folded
      (g, x, y, w, h, t) => {
        g.rect(x, y, w, h, hex('#e8d8b0'));
        g.ellipse(x + w / 2, y + h - 6, w * 0.4, 4, hex('#ffffff'));
        const p = (t % 6) / 6;
        const fold = clamp((p - 0.25) * 2.5);
        const ew = Math.max(2, (w * 0.28) * (1 - fold * 0.55));
        const cx = x + w / 2 - fold * 4;
        const cy = y + h - 9;
        if (fold < 0.95) {
          g.ellipse(cx, cy, ew, 5, hex('#fbfbf4'));
          g.disc(cx, cy - 1, 2, hex('#ffb820'));
        } else g.tri(cx - ew, cy + 3, cx + ew, cy + 3, cx, cy - 6, hex('#fbfbf4'));
        g.rect(cx + ew - 2, cy - 8 - (fold > 0 && fold < 1 ? 3 : 0), 5, 5, skin);
      },
      // 1 soap opera in a hallway
      (g, x, y, w, h, t) => {
        g.rect(x, y, w, h, hex('#5a3a4a'));
        const vx = x + w / 2;
        const vy = y + h / 2 - 2;
        g.line(x, y, vx - 6, vy - 5, hex('#3a2030'));
        g.line(x + w, y, vx + 6, vy - 5, hex('#3a2030'));
        g.line(x, y + h, vx - 6, vy + 6, hex('#3a2030'));
        g.line(x + w, y + h, vx + 6, vy + 6, hex('#3a2030'));
        g.rect(vx - 6, vy - 5, 12, 11, hex('#7a5a6a'));
        const p = (t % 5) / 5;
        const turn = p > 0.5;
        const zoom = p > 0.65 ? 1.6 : 1;
        const ax = x + w * 0.3;
        g.rect(ax - 2 * zoom, y + h - 16 * zoom, 5 * zoom, 14 * zoom, hex('#1a1a2a'));
        g.disc(ax, y + h - 18 * zoom, 2 * zoom, skin);
        g.rect(x + w * 0.7, y + h - 15, 5, 13, hex('#8a2a3a'));
        g.disc(x + w * 0.7 + 2, y + h - 17, 2, skin);
        if (turn) g.px(ax + 1, y + h - 18 * zoom, ink);
        if (p > 0.7) g.text('!', x + w - 6, y + 3, hex('#ffffff'));
      },
      // 2 sports replay
      (g, x, y, w, h, t) => {
        g.rect(x, y, w, h, hex('#2a7a3a'));
        for (let k = 0; k < w; k += 8) g.rect(x + k, y, 4, h, hex('#2e8a42'));
        g.vline(x + w - 8, y + h / 2 - 6, y + h / 2 + 6, hex('#ffffff'));
        const p = (t % 3) / 3;
        const bx = x + 6 + p * (w - 16);
        const by = y + h - 6 - Math.sin(p * Math.PI) * (h - 12);
        g.disc(bx, by, 1, hex('#ffffff'));
        if (Math.floor(t * 2) % 2) g.text('REPLAY', x + 2, y + 2, hex('#ffd34f'));
      },
      // 3 shopping channel
      (g, x, y, w, h, t) => {
        g.gradRect(x, y, w, h, [hex('#3a1a5a'), hex('#8a3a8a')]);
        const cx = x + w / 2;
        g.rect(cx - 7, y + h - 8, 14, 4, hex('#d8c8e8'));
        const sq = Math.abs(Math.cos(t * 2)) * 4 + 1;
        g.ellipse(cx, y + h - 16, sq, 4, hex('#d8d8e8'));
        g.rect(cx - 1, y + h - 13, 2, 6, hex('#b8b8c8'));
        if (Math.floor(t * 3) % 2) g.pxAdd(cx + 5, y + h - 20, hex('#ffffff'), 1);
        g.text('$9.99?', x + 2, y + 2, hex('#ffd34f'));
        if (Math.floor(t * 1.5) % 2) g.text('CALL', x + w - 18, y + h - 7, hex('#ff8ab0'));
      },
      // 4 weather
      (g, x, y, w, h, t) => {
        g.rect(x, y, w, h, hex('#2a5aa8'));
        g.ellipse(x + w * 0.4, y + h * 0.6, w * 0.3, h * 0.25, hex('#3a9a5a'));
        g.disc(x + w * 0.7, y + h * 0.35, 4, hex('#ffd34f'));
        const cx = x + w * 0.45 + Math.sin(t) * 3;
        g.disc(cx, y + h * 0.4, 4, hex('#f0f0f0'));
        g.disc(cx + 5, y + h * 0.42, 3, hex('#f0f0f0'));
        g.text('TUES?', x + 2, y + h - 7, hex('#ffffff'));
      },
      // 5 cooking show
      (g, x, y, w, h, t) => {
        g.rect(x, y, w, h, hex('#e8c8a0'));
        g.rect(x, y + h - 10, w, 10, hex('#8a6a4a'));
        const cx = x + w / 2;
        g.rect(cx - 9, y + h - 20, 18, 11, hex('#3a3a44'));
        g.rect(cx - 11, y + h - 20, 22, 2, hex('#5a5a64'));
        const a = t * 3;
        g.line(cx + Math.cos(a) * 4, y + h - 21, cx + 8, y + h - 32, hex('#a87a4a'));
        for (let k = 0; k < 3; k++) {
          const p = (t * 0.6 + k / 3) % 1;
          g.pxA(cx - 4 + k * 4 + Math.sin(p * 6) * 2, y + h - 22 - p * 12, hex('#ffffff'), 1 - p);
        }
      },
      // 6 fish tank
      (g, x, y, w, h, t) => {
        g.gradRect(x, y, w, h, [hex('#1a6aa8'), hex('#0a3a6a')]);
        for (let k = 0; k < 3; k++) {
          const fx = x + ((t * (6 + k * 3) + k * 17) % (w + 10)) - 5;
          const fy = y + 6 + k * (h / 4);
          g.ellipse(fx, fy, 3, 2, FISH[k]!);
          g.px(fx - 4, fy, FISH[k]!);
        }
        for (let k = 0; k < 4; k++) g.px(x + 4 + k * 7, y + h - 2 - ((t * 10 + k * 5) % h), hex('#a8d8ff'));
        g.rect(x, y + h - 3, w, 3, hex('#c8a870'));
      },
      // 7 test pattern
      (g, x, y, w, h) => {
        const bw = w / 7;
        for (let i = 0; i < 7; i++) g.rect(x + i * bw, y, Math.ceil(bw), h * 0.7, BARS[i]!);
        g.rect(x, y + h * 0.7, w, h * 0.3, hex('#1a1a1a'));
        g.ring(x + w / 2, y + h / 2 - 2, 7, 7, hex('#ffffff'));
      },
      // 8 cartoon: a bouncing dog
      (g, x, y, w, h, t) => {
        g.rect(x, y, w, h, hex('#9ad8ff'));
        g.rect(x, y + h - 6, w, 6, hex('#5ac85a'));
        const jump = Math.abs(Math.sin(t * 3)) * 10;
        const dx = x + w / 2 + Math.sin(t * 0.8) * (w / 4);
        const dy = y + h - 9 - jump;
        g.ellipse(dx, dy, 5, 3, hex('#c8884a'));
        g.disc(dx + 5, dy - 2, 3, hex('#c8884a'));
        g.px(dx + 6, dy - 3, ink);
        g.rect(dx + 3, dy - 6, 2, 3, hex('#8a5a2a'));
        g.line(dx - 5, dy - 1, dx - 8, dy - 4, hex('#c8884a'));
      },
      // 9 late news
      (g, x, y, w, h, t) => {
        g.rect(x, y, w, h, hex('#1a1a3a'));
        g.disc(x + w / 2, y + h / 2 - 2, 5, hex('#0a0a14'));
        g.rect(x + w / 2 - 8, y + h / 2 + 3, 16, 10, hex('#0a0a14'));
        g.rect(x, y + h - 6, w, 6, hex('#ff8fb1'));
        g.textClip('NEWS NEWS NEWS NEWS', x + 2 - ((t * 10) % 20), y + h - 6, ink, x, x + w);
      },
    ];

    let lastClick = -1;
    let clickTv = -1;
    let clickAt = -10;

    const staticFill = (g: Gfx, x: number, y: number, w: number, h: number, n: number) => {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) {
          const v = hash3(xx, yy, n);
          g.px(xx, yy, v > 0.66 ? hex('#e8e8f0') : v > 0.33 ? hex('#8a8a9a') : hex('#2a2a34'));
        }
    };

    const screens = tvs.map((tv) => ({ x: tv.x + 5, y: tv.y + 5, w: tv.w - (tv.knobs ? 18 : 10), h: tv.h - 10 }));
    const screenOf = (tv: Tv) => screens[tvs.indexOf(tv)]!;

    return {
      background(g) {
        // A dark living room with an orange glow from the screens.
        g.vgrad([hex('#060407'), hex('#0c070a'), hex('#120a0e')], g.top, 170);
        for (let x = g.left - (g.left % 16); x < g.right; x += 16) g.rect(x, g.top, 1, 170 - g.top, hex('#0e080a'));
        g.glow(160, 96, 150, accent, 0.04, 6);
        g.glow(160, 86, 120, hex('#8aa0c8'), 0.08, 6);
        g.vgrad([hex('#0e080a'), hex('#060404')], 156, g.bottom, 156);
        lightPool(g, 160, 160, 110, 8, hex('#8aa0c8'), 0.12);
        // TVs.
        for (const tv of tvs) {
          roundRect(g, tv.x - 1, tv.y - 1, tv.w + 2, tv.h + 2, 4, ink);
          roundRect(g, tv.x, tv.y, tv.w, tv.h, 4, tv.body);
          g.rect(tv.x + 2, tv.y + 1, tv.w - 4, 1, mix(tv.body, hex('#ffffff'), 0.15));
          g.rect(tv.x + 2, tv.y + tv.h - 2, tv.w - 4, 1, shade(tv.body, 0.6));
          const s = screenOf(tv);
          roundRect(g, s.x - 2, s.y - 2, s.w + 4, s.h + 4, 3, ink);
          if (tv.knobs) {
            const kx = tv.x + tv.w - 9;
            g.disc(kx, tv.y + 12, 3, ink);
            g.disc(kx, tv.y + 12, 2, shade(tv.body, 1.3));
            g.disc(kx, tv.y + 22, 3, ink);
            g.disc(kx, tv.y + 22, 2, shade(tv.body, 1.3));
            for (let k = 0; k < 4; k++) g.hline(kx - 3, kx + 3, tv.y + 30 + k * 2, shade(tv.body, 0.5));
          }
          if (tv.antenna) {
            g.line(tv.x + tv.w / 2, tv.y, tv.x + tv.w / 2 - 10, tv.y - 16, hex('#4a4a54'));
            g.line(tv.x + tv.w / 2, tv.y, tv.x + tv.w / 2 + 12, tv.y - 14, hex('#4a4a54'));
          }
        }
        // The back of the couch, in the foreground.
        for (let y = 168; y < g.bottom; y++) {
          const k = (y - 168) / 20;
          g.rect(g.left, y, g.w, 1, mix(hex('#2a120c'), hex('#0e0604'), clamp(k)));
        }
        for (let x = g.left; x < g.right; x++) g.px(x, 168 + Math.round(Math.sin((x - 20) * 0.04) * 2), hex('#4a2414'));
        gloom(g, g.left, g.top, g.w, 24 - g.top, 0.5, true);
        g.lighting(0.45);
        for (const tv of tvs) {
          const sc = screenOf(tv);
          g.light(sc.x + sc.w / 2, sc.y + sc.h / 2, sc.w * 1.1, 0.45);
        }
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // The remote clicks; a random TV changes channel.
        const period = 1.9;
        const k = Math.floor(t / period);
        if (k !== lastClick) {
          lastClick = k;
          if (f.awake > 0.3 && k > 0) {
            clickTv = Math.floor(hash3(k, 1) * tvs.length);
            const tv = tvs[clickTv]!;
            tv.ch = (tv.ch + 1 + Math.floor(hash3(k, 2) * (shows.length - 1))) % shows.length;
            tv.staticUntil = t + 0.3;
            clickAt = t;
          }
        }

        const face = f.rare === 0 && ev < 6 ? envelope(ev, 6, 0.4, 0.4) : 0;
        const allStatic = f.rare === 2 && ev < 2.5;
        const youTv = f.rare === 1 && ev < 6 ? 4 : -1;

        for (let i = 0; i < tvs.length; i++) {
          const tv = tvs[i]!;
          const s = screenOf(tv);
          g.clip(s.x, s.y, s.w, s.h);
          if (allStatic || t < tv.staticUntil) staticFill(g, s.x, s.y, s.w, s.h, f.reduced ? 1 : f.n);
          else if (face > 0.5) {
            // one big face spread across every screen, looking at you
            g.rect(s.x, s.y, s.w, s.h, hex('#e8b890'));
            const shut = blinking(t, 40, 3);
            for (let ex = 124; ex <= 196; ex += 72) {
              g.disc(ex, 84, 14, hex('#ffffff'));
              if (shut) g.rect(ex - 15, 70, 30, 28, hex('#e8b890'));
              else g.disc(ex + Math.sin(t) * 3, 86, 6, ink);
            }
            g.ellipse(160, 136, 30, 6, hex('#8a3a3a'));
            g.ellipse(160, 133, 30, 4, hex('#e8b890'));
          } else if (i === youTv) {
            g.rect(s.x, s.y, s.w, s.h, hex('#2a1418'));
            g.rect(s.x + 4, s.y + s.h - 12, s.w - 8, 10, hex('#8a3a24'));
            g.disc(s.x + s.w / 2, s.y + s.h - 16, 4, hex('#140a0a'));
            g.rect(s.x + s.w / 2 - 5, s.y + s.h - 13, 10, 6, hex('#140a0a'));
            g.text('YOU', s.x + 2, s.y + 2, hex('#ffd34f'));
          } else shows[tv.ch]!(g, s.x, s.y, s.w, s.h, t + i * 1.3);
          // scanlines + glass
          for (let y = s.y + 1; y < s.y + s.h; y += 2) g.rectMul(s.x, y, s.w, 1, 0.85);
          g.rectA(s.x + 1, s.y + 1, Math.min(10, s.w / 3), 1, hex('#ffffff'), 0.3);
          g.noClip();
          g.glow(s.x + s.w / 2, s.y + s.h / 2, s.w * 0.8, hsv(i * 0.13, 0.35, 1), 0.06 + f.energy * 0.05, 4);
        }

        // The bottom row's light on the polished floor.
        reflectDown(g, 56, 264, 156, 12, 0.22);

        // The floating remote.
        const bob = f.reduced ? 0 : Math.sin(t * 1.3) * 2;
        const rx = 160;
        const ry = 146 + bob;
        const pressed = t - clickAt < 0.2;
        g.ellipseA(rx, 172, 10, 2, ink, 0.4);
        roundRect(g, rx - 7, ry - 14, 14, 30, 4, ink);
        roundRect(g, rx - 6, ry - 13, 12, 28, 4, hex('#1c1c22'));
        g.vline(rx - 5, ry - 10, ry + 12, hex('#3a3a46'));
        g.disc(rx, ry - 9, 2, pressed ? hex('#ff4a4a') : hex('#5a1a1a'));
        if (pressed) g.glow(rx, ry - 9, 4, hex('#ff4a4a'), 0.5);
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 3; c++) g.rect(rx - 4 + c * 3, ry - 4 + r * 3 + (pressed && r === 1 && c === 1 ? 1 : 0), 2, 2, shade(BUTTONS[(r + c) % 3]!, 0.5));
        g.rect(rx - 4, ry + 6, 8, 4, shade(accent, 0.6));
        // the IR beam to whichever TV it just changed
        if (pressed && clickTv >= 0 && !f.reduced) {
          const s = screenOf(tvs[clickTv]!);
          g.lineA(rx, ry - 14, s.x + s.w / 2, s.y + s.h / 2, hex('#ff6a6a'), 0.35);
          g.glow(rx, ry - 15, 6, hex('#ff6a6a'), 0.6);
        }
        void dome;
        void frameRect;
        void ramp;
        void TAU;
      },
    };
  },
};

export default def;
