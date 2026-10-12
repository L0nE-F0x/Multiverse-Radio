// Alien Classifieds: a crowded corkboard of flyers with tear-off tabs. Pushpins wobble.
// Every so often a hand pins up something new, or a tab is torn off by someone unseen.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { textWidth } from '../kit/font';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { arc, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

interface Line {
  s: string;
  k?: number; // scale
  c?: Color;
}

interface Flyer {
  x: number;
  y: number;
  w: number;
  h: number;
  paper: Color;
  ink: Color;
  lines: Line[];
  pin: Color;
  tabs?: number;
  doodle?: (g: Gfx, x: number, y: number) => void;
}

const def: SceneDef = {
  id: 'corkboard',
  fps: 12,
  rareEvents: 3,
  rareDuration: 7,
  create({ accent }) {
    const ink = hex('#1e1612');
    const cork = [hex('#7a5230'), hex('#946640'), hex('#ae7c4e'), hex('#c8955e')];
    const frameC = [hex('#3a2414'), hex('#5a3a20'), hex('#7a5232')];
    const pins = [hex('#e0303a'), hex('#2a7ae0'), hex('#3ac060'), hex('#f0c030'), hex('#d040c0')];
    const white = hex('#f6f2e8');
    const yellow = accent;
    const blue = hex('#9ad0f0');
    const pink = hex('#ffb0c8');
    const green = hex('#b8e8a0');
    const orange = hex('#ffb070');

    const flyers: Flyer[] = [
      {
        x: 26, y: 14, w: 54, h: 60, paper: white, ink, pin: pins[0]!,
        lines: [{ s: '' }, { s: '' }, { s: '' }, { s: '' }, { s: '' }, { s: '' }, { s: 'PLANET 4 SALE' }, { s: '1 OWNER!', c: hex('#c83a3a') }],
        doodle: (g, x, y) => {
          g.rect(x + 4, y + 4, 46, 36, hex('#10102a'));
          for (let i = 0; i < 14; i++) g.px(x + 5 + hash3(i, 1) * 44, y + 5 + hash3(i, 2) * 34, hex('#c8c8ff'));
          g.ball(x + 27, y + 22, 9, 9, [hex('#6a2a1a'), hex('#c86a3a'), hex('#f0a86a'), hex('#ffd8a8')], -0.6, -0.5);
          g.ring(x + 27, y + 22, 16, 4, hex('#f0d8a0'));
        },
      },
      {
        x: 88, y: 10, w: 60, h: 74, paper: yellow, ink, pin: pins[1]!, tabs: 8,
        lines: [{ s: 'LOST', k: 2 }, { s: 'MY SHADOW' }, { s: '' }, { s: '' }, { s: '' }, { s: '' }, { s: 'ANSWERS TO' }, { s: '"HEY"' }],
        doodle: (g, x, y) => {
          // dashed outline of somebody who isn't there
          const cx = x + 30;
          const cy = y + 34;
          for (let a = 0; a < Math.PI * 2; a += 0.5) g.px(cx + Math.cos(a) * 4, cy - 6 + Math.sin(a) * 4, ink);
          for (let k = 0; k < 14; k += 2) {
            g.px(cx - 6, cy + k, ink);
            g.px(cx + 6, cy + k, ink);
          }
          for (let k = -6; k <= 6; k += 2) g.px(cx + k, cy, ink);
        },
      },
      {
        x: 156, y: 16, w: 52, h: 42, paper: blue, ink, pin: pins[3]!,
        lines: [{ s: 'USED MOON' }, { s: 'LOW MILES' }, { s: '' }, { s: '' }, { s: 'NO CRATERS*' }],
        doodle: (g, x, y) => {
          g.disc(x + 26, y + 22, 6, hex('#f4f0d8'));
          g.disc(x + 29, y + 20, 5, blue);
        },
      },
      {
        x: 216, y: 10, w: 62, h: 58, paper: pink, ink, pin: pins[2]!, tabs: 9,
        lines: [{ s: 'GUITAR' }, { s: 'LESSONS' }, { s: 'FOR YOUR' }, { s: 'GUITAR' }],
        doodle: (g, x, y) => {
          g.disc(x + 46, y + 22, 5, hex('#8a4a2a'));
          g.disc(x + 46, y + 16, 4, hex('#8a4a2a'));
          g.disc(x + 46, y + 20, 1, ink);
          g.rect(x + 45, y + 2, 2, 12, hex('#4a2a1a'));
        },
      },
      {
        x: 18, y: 82, w: 62, h: 52, paper: white, ink, pin: pins[4]!,
        lines: [{ s: 'FREE!', k: 2, c: hex('#3a8a3a') }, { s: 'BOX OF SMALLER' }, { s: 'BOXES' }],
        doodle: (g, x, y) => {
          for (let k = 0; k < 4; k++) frameRect(g, x + 24 + k * 2, y + 35 + k * 2, 14 - k * 4, 14 - k * 4, ink);
        },
      },
      {
        x: 90, y: 94, w: 70, h: 40, paper: green, ink, pin: pins[0]!, tabs: 10,
        lines: [{ s: 'ROOMMATE' }, { s: 'WANTED.' }, { s: 'MUST TOLERATE' }, { s: 'ME.' }],
      },
      {
        x: 168, y: 66, w: 48, h: 26, paper: white, ink, pin: pins[1]!,
        lines: [{ s: 'REX BELLOWS', c: hex('#c83a3a') }, { s: 'USED PLANETS' }, { s: 'ALL DEALS FINAL' }],
      },
      {
        x: 168, y: 100, w: 54, h: 46, paper: orange, ink, pin: pins[3]!,
        lines: [{ s: 'TIME SHARE' }, { s: 'TUESDAYS' }, { s: 'ONLY' }, { s: '' }, { s: 'BRING OWN' }, { s: 'TUESDAY' }],
      },
      {
        x: 230, y: 76, w: 52, h: 56, paper: white, ink, pin: pins[4]!, tabs: 7,
        lines: [{ s: 'HAVE YOU' }, { s: 'SEEN THIS' }, { s: 'CLOUD?' }],
        doodle: (g, x, y) => {
          g.disc(x + 18, y + 30, 5, hex('#c8d8f0'));
          g.disc(x + 26, y + 27, 7, hex('#c8d8f0'));
          g.disc(x + 34, y + 31, 5, hex('#c8d8f0'));
          g.rect(x + 14, y + 31, 24, 5, hex('#c8d8f0'));
          g.px(x + 24, y + 28, ink);
          g.px(x + 29, y + 28, ink);
        },
      },
      {
        x: 40, y: 142, w: 66, h: 30, paper: blue, ink, pin: pins[2]!,
        lines: [{ s: 'FOUND: A SECOND' }, { s: 'ME. NOT GREAT.' }, { s: 'PLEASE COLLECT.' }],
      },
      {
        x: 228, y: 140, w: 60, h: 30, paper: yellow, ink, pin: pins[0]!,
        lines: [{ s: 'DOG WALKING' }, { s: 'ANY DIMENSION' }, { s: 'NO HELLHOUNDS' }],
      },
      {
        x: 120, y: -58, w: 80, h: 40, paper: white, ink, pin: pins[1]!, tabs: 12,
        lines: [{ s: 'BAND NEEDS' }, { s: 'DRUMMER' }, { s: '(DRUMS NEED BAND)' }],
      },
      {
        x: 110, y: 196, w: 100, h: 36, paper: pink, ink, pin: pins[3]!,
        lines: [{ s: 'LOST CAT.' }, { s: 'CAT IS FINE.' }, { s: 'I AM LOST. SEND HELP.' }],
      },
    ];

    // Sticky note and the tab bookkeeping.
    const torn = new Set<string>();
    let lastTearSlot = -1;

    const extras: Flyer[] = [
      { x: 120, y: 56, w: 70, h: 36, paper: hex('#d8c8ff'), ink, pin: pins[2]!, lines: [{ s: 'WANTED:' }, { s: 'ONE (1) MORE' }, { s: 'HOUR IN THE DAY' }] },
      { x: 120, y: 56, w: 70, h: 36, paper: hex('#ffe0a0'), ink, pin: pins[0]!, lines: [{ s: 'GARAGE SALE' }, { s: 'EVERYTHING MUST' }, { s: 'GO (ELSEWHERE)' }] },
      { x: 120, y: 56, w: 70, h: 36, paper: hex('#c0f0e0'), ink, pin: pins[4]!, lines: [{ s: 'FREE GRAVITY' }, { s: 'SLIGHTLY USED' }, { s: 'YOU COLLECT' }] },
    ];
    let extraCount = 0;
    let lastRare = -1;

    const drawFlyer = (g: Gfx, fl: Flyer, t: number, wobble: number, opts: { drawPin?: boolean } = {}) => {
      const { x, y, w, h } = fl;
      g.rectA(x + 2, y + 2, w, h, ink, 0.35);
      g.rect(x, y, w, h, fl.paper);
      g.rect(x, y + h - 1, w, 1, shade(fl.paper, 0.85));
      g.rect(x + w - 1, y, 1, h, shade(fl.paper, 0.9));
      if (fl.doodle) fl.doodle(g, x, y);
      let ly = y + 6;
      for (const ln of fl.lines) {
        const k = ln.k ?? 1;
        if (ln.s) g.text(ln.s, x + Math.round((w - textWidth(ln.s, k)) / 2), ly, ln.c ?? fl.ink, k);
        ly += 6 * k + 1;
      }
      if (fl.tabs) {
        const tw = Math.floor((w - 2) / fl.tabs);
        for (let i = 0; i < fl.tabs; i++) {
          const key = `${fl.x},${fl.y},${i}`;
          const tx = x + 1 + i * tw;
          if (torn.has(key)) {
            g.rect(tx, y + h, tw - 1, 2, fl.paper);
            continue;
          }
          const flutter = Math.sin(t * 2 + i * 1.3 + fl.x) > 0.93 ? 1 : 0;
          g.rect(tx + flutter, y + h, tw - 1, 12, fl.paper);
          g.rect(tx + flutter + Math.floor(tw / 2) - 1, y + h + 2, 1, 8, mix(fl.ink, fl.paper, 0.4));
          g.rect(tx + flutter + tw - 1, y + h, 1, 12, shade(fl.paper, 0.8));
        }
      }
      if (opts.drawPin !== false) {
        const px = x + Math.floor(w / 2) + wobble;
        g.disc(px + 1, y + 2, 2, shade(ink, 1));
        g.disc(px, y + 1, 2, fl.pin);
        g.px(px - 1, y, mix(fl.pin, hex('#ffffff'), 0.7));
      }
    };

    return {
      background(g) {
        // Wall around the board (wide/tall views).
        g.fill(hex('#3a3430'));
        // Cork.
        for (let y = g.top; y < g.bottom; y++)
          for (let x = 8; x < 312; x++) {
            const n = fbm(x / 3, y / 3, 4, 2);
            const sp = hash3(x, y, 9);
            const c = sp > 0.94 ? cork[0]! : sp < 0.05 ? cork[3]! : n > 0.55 ? cork[2]! : cork[1]!;
            g.px(x, y, c);
          }
        // Frame posts.
        for (const fx of [2, 312]) {
          g.rect(fx, g.top, 6, g.h, frameC[1]!);
          g.rect(fx, g.top, 1, g.h, frameC[2]!);
          g.rect(fx + 5, g.top, 1, g.h, frameC[0]!);
        }
        // Old pin holes and staples.
        for (let i = 0; i < 60; i++) g.px(10 + hash3(i, 3) * 300, g.top + hash3(i, 4) * g.h, cork[0]!);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // Tabs vanish now and then, torn by someone just out of frame.
        const slot = Math.floor(t / 17);
        if (slot !== lastTearSlot) {
          lastTearSlot = slot;
          if (slot > 0) {
            const tabbed = flyers.filter((fl) => fl.tabs);
            const fl = tabbed[Math.floor(hash3(slot, 1) * tabbed.length)]!;
            torn.add(`${fl.x},${fl.y},${Math.floor(hash3(slot, 2) * fl.tabs!)}`);
            if (torn.size > 24) torn.clear();
          }
        }

        for (let i = 0; i < flyers.length; i++) {
          const fl = flyers[i]!;
          const wob = !f.reduced && Math.sin(t * 0.7 + i * 2.3) > 0.97 ? (Math.floor(t * 8) % 2 ? 1 : -1) : 0;
          drawFlyer(g, fl, t, wob);
        }
        // Sticky note.
        g.rect(196, 52, 20, 18, hex('#fff27a'));
        g.text('CALL', 198, 55, ink);
        g.text('BACK?', 198, 62, hex('#c83a3a'));

        // Freshly pinned flyers (from the rare event) stay up until the next one.
        if (f.rare === 0 && ev < 7 && lastRare !== f.rareSeed) {
          lastRare = f.rareSeed;
          extraCount++;
        }
        const showExtra = extraCount > 0;
        const ex = extras[(extraCount - 1 + extras.length * 9) % extras.length]!;
        if (f.rare === 0 && ev < 7) {
          // a hand slides in from below, pins it, and leaves
          const inK = envelope(ev, 7, 1.6, 1.6);
          const placed = ev > 2.4;
          const prev = extraCount > 1 ? extras[(extraCount - 2) % extras.length]! : null;
          if (prev) drawFlyer(g, prev, t, 0);
          const fy = placed ? ex.y : ex.y + (1 - clamp(ev / 2.4)) * 140;
          if (placed || inK > 0) drawFlyer(g, { ...ex, y: Math.round(fy) }, t, 0, { drawPin: placed });
          const hx = ex.x + ex.w / 2 + 4;
          const hy = Math.round(placed ? ex.y + 4 + (1 - inK) * 150 : fy + 4);
          const skin = hex('#e8b890');
          const skinD = hex('#c8906a');
          g.rect(hx - 7, hy + 12, 14, 70, hex('#3a5a9a'));
          g.rect(hx - 8, hy + 12, 16, 3, hex('#2a4a8a'));
          roundRect(g, hx - 7, hy + 2, 14, 11, 3, skin);
          for (let k = 0; k < 4; k++) {
            g.rect(hx - 6 + k * 3, hy - 3, 2, 6, skin);
            g.px(hx - 6 + k * 3, hy - 3, skinD);
          }
          g.rect(hx - 9, hy + 4, 3, 5, skin);
          g.hline(hx - 5, hx + 5, hy + 6, skinD);
        } else if (showExtra) drawFlyer(g, ex, t, 0);

        // A flyer corner lifts in a draught.
        if (f.rare === 1 && ev < 7) {
          const k = envelope(ev, 7, 1, 1) * (0.6 + 0.4 * Math.sin(ev * 8));
          const fl = flyers[5]!;
          const cx = fl.x + fl.w;
          const cy = fl.y + fl.h;
          const s = Math.round(k * 8);
          if (s > 0) {
            g.tri(cx - s, cy, cx, cy - s, cx, cy, cork[1]!);
            g.tri(cx - s, cy, cx, cy - s, cx - s, cy - s, shade(fl.paper, 0.8));
          }
        }
        // A tab torn off by an unseen force, fluttering away.
        if (f.rare === 2 && ev < 4) {
          const fl = flyers[1]!;
          const p = ev / 4;
          const tx = fl.x + 20 + p * 60 + Math.sin(ev * 6) * 6;
          const ty = fl.y + fl.h + p * p * 90;
          const flip = Math.floor(ev * 6) % 2;
          g.rect(tx, ty, flip ? 6 : 2, flip ? 12 : 10, fl.paper);
          g.rect(tx + (flip ? 2 : 0), ty + 2, 1, 6, mix(fl.ink, fl.paper, 0.4));
        }
        void arc;
      },
    };
  },
};

export default def;
