// Every Possible News: a late-night news desk. A globe of nested globes turns, a ticker
// crawls, the anchor's side part is perfect, and every clock on the wall is wrong.

import { gloom } from '../kit/atmos';
import { callLamp, onAirLamp } from '../kit/broadcast';
import { type Color, hex, mix, mute, ramp, shade } from '../kit/color';
import { envelope, smoothstep, TAU } from '../kit/fx';
import { textWidth } from '../kit/font';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

// Everything sits between the HUD's bands: clocks just below the top one, the ticker just
// above the bottom one.
const DESK_Y = 112;
const TICK_Y = 120;
const CLOCK_Y = 36;
const ANCHOR = { x: 160, y: DESK_Y };
const GLOBE = { x: 236, y: 92, r: 15 };

const CLOCKS = [
  { label: 'NOW', speed: 1, dir: 1, off: 0.1 },
  { label: 'THEN', speed: 0.6, dir: -1, off: 0.5 },
  { label: 'SOON', speed: 3, dir: 1, off: 0.8 },
  { label: 'NEVER', speed: 0, dir: 1, off: 0.3 },
  { label: 'TUES', speed: 1.4, dir: 1, off: 0.65 },
  { label: 'YOURS', speed: 0.2, dir: -1, off: 0.9 },
];

const HEADLINES = [
  'TUESDAY POSTPONED INDEFINITELY',
  'LOCAL MAN FINDS HIMSELF, IS MILDLY DISAPPOINTED',
  'MOON ISSUES FORMAL APOLOGY',
  'WEATHER: YES',
  'SCIENTISTS CONFIRM SOUP',
  'ALL CLOCKS WRONG; OFFICIALS SAY THIS IS FINE',
  'YOUR OTHER SELF SAYS HI',
  'GRAVITY UNDER REVIEW UNTIL THURSDAY',
  'DOG ELECTED MAYOR, PROMISES WALKS',
  'THREE TIMELINES MERGE; PARKING UNCHANGED',
];
const CRAWL = HEADLINES.join('  +++  ') + '  +++  ';

const def: SceneDef = {
  id: 'newsroom',
  fps: 20,
  rareEvents: 4,
  rareDuration: 7,
  focusY: 80,
  grade: { contrast: 1.15, saturation: 0.8, bloom: 0.6, threshold: 0.7, vignette: 0.34, shadows: '#05040c' },
  create({ accent }) {
    const ink = hex('#04030a');
    const bg = [hex('#05050f'), hex('#0b0b20'), hex('#12102c')];
    const pink = mute(accent, 0.75, 0.9);
    const pinkD = shade(accent, 0.45);
    const sil = hex('#0c0a16');
    const hairHi = hex('#3e3860');
    const deskC = ramp([hex('#141228'), hex('#262246'), hex('#3a3466')], 3);
    const ocean = ramp([hex('#0a2a5a'), hex('#2a5aa8'), hex('#6aa8f0')], 3);
    const land = ramp([hex('#1a5a3a'), hex('#4a9a5a'), hex('#9ad87a')], 3);
    const crawlW = textWidth(CRAWL);

    const clock = (g: Gfx, x: number, y: number, r: number, t: number, c: (typeof CLOCKS)[number], wobble: number) => {
      g.disc(x, y, r + 2, ink);
      g.disc(x, y, r + 1, shade(pink, 0.7));
      g.disc(x, y, r, hex('#aaa498'));
      g.disc(x - 2, y - 2, r - 4, hex('#bab4a6'));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        g.px(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2), hex('#8a849a'));
      }
      const base = c.off * TAU + wobble;
      const m = base + c.dir * t * c.speed * 0.6;
      const h = base * 0.3 + c.dir * t * c.speed * 0.05;
      g.line(x, y, x + Math.sin(m) * (r - 2), y - Math.cos(m) * (r - 2), ink);
      g.line(x, y, x + Math.sin(h) * (r - 5), y - Math.cos(h) * (r - 5), ink);
      if (c.label === 'NEVER') g.line(x, y, x + Math.sin(t * 0.3) * (r - 3), y - Math.cos(t * 0.3) * (r - 3), pink);
      g.px(x, y, pink);
    };

    const anchor = (g: Gfx, x: number, y: number, nod: number, partLeft: boolean, look: number) => {
      x = Math.round(x);
      const hy = Math.round(y - 40 + nod);
      // shoulders + suit
      g.poly([x - 26, y, x + 26, y, x + 20, y - 22, x - 20, y - 22], sil);
      g.ellipse(x, y - 22, 20, 6, sil);
      // tie + collar
      g.tri(x - 4, y - 26, x + 4, y - 26, x, y - 16, hex('#1a1630'));
      g.tri(x - 2, y - 24, x + 2, y - 24, x, y - 8, pinkD);
      // neck + head
      g.rect(x - 5, hy + 10, 10, 8, sil);
      g.ellipse(x + look, hy, 11, 13, sil);
      // the perfect side part: a glossy helmet of hair with one immaculate line
      const s = partLeft ? -1 : 1;
      for (let k = -11; k <= 11; k++) {
        const top = hy - Math.round(Math.sqrt(Math.max(0, 1 - (k / 11.5) ** 2)) * 13);
        const depth = k * s > -3 ? 6 : 4;
        g.vline(x + look + k, top, top + depth - (Math.abs(k) > 9 ? 2 : 0), hairHi);
        if (k * s > 0 && k * s < 8) g.px(x + look + k, top + 1, hex('#6a6090'));
      }
      g.vline(x + look + s * -3, hy - 13, hy - 6, ink);
      g.px(x + look + s * -4, hy - 6, ink);
      // rim light
      for (let k = -12; k <= 12; k++) {
        const w = Math.sqrt(Math.max(0, 1 - (k / 13) ** 2)) * 11;
        g.pxA(x + look - w, hy + k, pink, 0.5);
        g.pxA(x + look + w, hy + k, pink, 0.35);
      }
      g.lineA(x - 26, y, x - 20, y - 22, pink, 0.5);
      g.lineA(x + 26, y, x + 20, y - 22, pink, 0.35);
    };

    return {
      background(g) {
        g.vgrad(bg, g.top, DESK_Y);
        // Studio light streaks.
        for (let i = 0; i < 6; i++) g.tri(40 + i * 50, g.top, 64 + i * 50, g.top, 120 + i * 20, DESK_Y, pink, 2, 0.025);
        // A curved video wall behind: big faint city grid.
        for (let y = 62; y < DESK_Y; y += 6) g.rect(g.left, y, g.w, 1, mix(bg[1]!, pink, 0.08));
        for (let x = g.left - (g.left % 14); x < g.right; x += 14) g.rect(x, 62, 1, DESK_Y - 62, mix(bg[1]!, pink, 0.07));
        // Clock wall.
        g.rect(54, CLOCK_Y - 18, 212, 42, hex('#0a0918'));
        frameRect(g, 54, CLOCK_Y - 18, 212, 42, pinkD);
        CLOCKS.forEach((c, i) => g.textCenter(c.label, 74 + i * 34, CLOCK_Y + 15, mix(pink, hex('#d8d0d8'), 0.2)));

        // Desk: curved front, pink stripe, logo.
        g.rect(g.left, DESK_Y, g.w, 4, deskC[2]!);
        g.rect(g.left, DESK_Y, g.w, 1, mix(deskC[2]!, hex('#ffffff'), 0.3));
        for (let y = DESK_Y + 4; y < g.bottom; y++) {
          const curve = Math.round(Math.min(1, (y - DESK_Y) / 50) * 10);
          g.rect(g.left, y, g.w, 1, ink);
          g.rect(40 + curve, y, 240 - curve * 2, 1, deskC[1]!);
          g.rect(40 + curve, y, 6, 1, deskC[2]!);
        }
        g.rect(46, DESK_Y + 30, 228, 2, pinkD);
        g.disc(160, DESK_Y + 40, 11, ink);
        g.disc(160, DESK_Y + 40, 10, pinkD);
        g.disc(160, DESK_Y + 40, 8, deskC[0]!);
        g.textCenter('EPN', 160, DESK_Y + 38, pinkD);
        // a mug on the desk, a laptop glow
        g.rect(196, DESK_Y - 7, 6, 7, hex('#b8b0a8'));
        g.rect(202, DESK_Y - 5, 2, 3, hex('#b8b0a8'));
        g.poly([104, DESK_Y, 128, DESK_Y, 126, DESK_Y - 2, 106, DESK_Y - 2], hex('#2a2a3a'));
        // Floor below the ticker (tall views).
        gloom(g, g.left, TICK_Y + 16, g.w, g.bottom - TICK_Y - 16, 0.6);
        g.lighting(0.5);
        g.light(ANCHOR.x, 70, 70, 0.45, 56);
        g.light(160, CLOCK_Y, 130, 0.2, 30);
        g.light(GLOBE.x, GLOBE.y, 30, 0.3);
        // Upper wall in tall views: studio lights rig.
        g.rect(g.left, -30, g.w, 3, hex('#2a2a3a'));
        for (let x = 70; x < 260; x += 40) {
          g.rect(x - 1, -27, 3, 6, hex('#2a2a3a'));
          roundRect(g, x - 6, -21, 13, 9, 2, hex('#3a3a4a'));
          g.ellipse(x, -12, 4, 1, hex('#fff0d0'));
        }
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // Clocks: all wrong, each in its own way.
        const knocked = f.rare === 2 && ev < 7;
        for (let i = 0; i < CLOCKS.length; i++) {
          const c = CLOCKS[i]!;
          let wob = 0;
          let dy = 0;
          if (knocked && i === 2) {
            const k = envelope(ev, 7, 0.3, 1.5);
            wob = Math.sin(ev * 20) * 2 * k;
            dy = Math.round(k * 3);
          }
          clock(g, 74 + i * 34, CLOCK_Y - 4 + dy, 11, knocked && i === 2 ? t * 8 : t, c, wob);
        }

        // Nested globes, each turning its own way.
        const gx = GLOBE.x;
        const gy = GLOBE.y;
        g.rect(gx - 1, gy + GLOBE.r, 3, DESK_Y - gy - GLOBE.r, hex('#8a849a'));
        g.ellipse(gx, DESK_Y - 1, 7, 2, hex('#8a849a'));
        const inner = 8;
        const rot = t * 0.4;
        for (let dy = -inner; dy <= inner; dy++) {
          const hw = Math.floor(Math.sqrt(inner * inner - dy * dy));
          for (let dx = -hw; dx <= hw; dx++) {
            const nx = dx / inner;
            const ny = dy / inner;
            const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
            const lon = Math.atan2(nx, nz) - rot;
            const isLand = fbm(Math.cos(lon) * 2 + 5, ny * 2 + Math.sin(lon) * 2, 3, 2) > 0.5;
            const l = 0.3 + 0.7 * nz * (0.6 - nx * 0.4);
            const r = isLand ? land : ocean;
            g.px(gx + dx, gy + dy, r[Math.min(2, Math.floor(l * 3))]!);
          }
        }
        // middle shell
        for (let k = 0; k < 4; k++) {
          const a = t * -0.6 + (k * Math.PI) / 4;
          const rx = Math.abs(Math.cos(a)) * 11;
          g.ring(gx, gy, Math.max(1, rx), 11, mix(pink, hex('#ffffff'), 0.3));
        }
        // outer shell, the other way
        for (let k = 0; k < 3; k++) {
          const a = t * 0.25 + (k * Math.PI) / 3;
          const ry = Math.abs(Math.cos(a)) * GLOBE.r;
          g.ring(gx, gy, GLOBE.r, Math.max(1, ry), hex('#8ac4ff'));
        }
        g.ring(gx, gy, GLOBE.r, GLOBE.r, hex('#c8e0ff'));

        // ── anchors ──
        const sp = f.speech ?? 0;
        const isVoice = f.segmentKind === 'voice' || sp > 0.05;
        const nod = Math.round(Math.max(f.energy, sp * 1.5) * 2 * Math.abs(Math.sin(t * 5)));
        const flip = f.rare === 0 && ev < 7 && envelope(ev, 7, 0.1, 0.1) > 0.5 && ev > 2;
        const dbl = f.rare === 1 && ev < 7;
        let look = 0;
        if (dbl) {
          const k = envelope(ev, 7, 1.5, 1.5);
          look = k > 0.9 && ev > 2.5 && ev < 4.5 ? 2 : 0;
          anchor(g, 300 - k * 90, ANCHOR.y, 0, true, -look);
        }
        anchor(g, ANCHOR.x, ANCHOR.y, nod, !flip, look);
        // shuffling papers every so often, or gesturing with speech
        const shuffle = (t % 11) / 11;
        const speechLift = !f.reduced && sp > 0.1 ? Math.round(sp * 3 * Math.abs(Math.sin(t * 6.5))) : 0;
        const lift = Math.max(speechLift, shuffle > 0.8 ? Math.round(Math.abs(Math.sin((shuffle - 0.8) * 5 * TAU * 1.5)) * 4) : 0);
        g.rect(146, DESK_Y - 3 - lift, 28, 3, hex('#c8c0b4'));
        g.rect(147, DESK_Y - 4 - lift, 26, 1, hex('#a8a098'));
        g.rect(142, DESK_Y - 5 - lift, 6, 4, sil);
        g.rect(172, DESK_Y - 5 - lift, 6, 4, sil);

        // On-air light pulses while the voice is going; desk call lamp blinks on reporter/caller links.
        onAirLamp(g, 266, 56, f, { label: true });
        callLamp(g, 116, DESK_Y - 4, f);
        g.disc(270, 70, 3, isVoice ? hex('#ff4a50') : f.playing ? hex('#a0343a') : hex('#4a1a20'));
        if (f.playing || isVoice) g.glow(270, 70, 10 + sp * 8, hex('#e04a50'), (isVoice ? 0.35 + sp * 0.4 : 0.18 + f.energy * 0.2));
        g.text('LIVE', 276, 68, isVoice ? hex('#ffd8dc') : f.playing ? hex('#d8808a') : hex('#4a3a40'));

        // ── the ticker ──
        const bar = mix(pink, hex('#2a1420'), 0.2);
        g.rect(g.left, TICK_Y, g.w, 14, bar);
        g.rect(g.left, TICK_Y, g.w, 1, mix(bar, hex('#ffffff'), 0.25));
        g.rect(g.left, TICK_Y + 13, g.w, 1, pinkD);
        const breaking = f.rare === 3 && ev < 7;
        const lx = Math.max(g.left, 0);
        g.rect(lx, TICK_Y, 48, 14, ink);
        g.text(breaking ? 'BREAKING' : 'NEWS', lx + 4, TICK_Y + 5, breaking && !f.reduced && Math.floor(ev * 3) % 2 ? hex('#ffffff') : pink);
        const off = (t * 18) % crawlW;
        const clipL = lx + 50;
        if (breaking) {
          g.textClip('IT IS STILL TONIGHT. MORE AS IT HAPPENS, OR DOESN\'T.', clipL + 4, TICK_Y + 5, ink, clipL, g.right);
        } else {
          for (let k = 0; k < 3; k++) g.textClip(CRAWL, clipL - off + k * crawlW, TICK_Y + 5, ink, clipL, g.right);
        }
        void hash3;
        void smoothstep;
        void (null as unknown as Color);
      },
    };
  },
};

export default def;
