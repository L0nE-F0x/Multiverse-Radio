// Tiki Satellite: the lounge of Station Tomorrowland-7, a 1958 space station of the future
// that still believes it's 1958. Bamboo and chrome, two carved idols, puffer-fish lamps on
// long cords, and a great porthole where a blue planet turns slowly as the station spins. A
// theremin waits on a little stage. At the bar, a mai tai has floated a little way out of its
// glass and nobody minds.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, vignette } from './lib/night';
import { type Globe, GlobeRenderer } from './lib/outer';

const PORT = { x: 160, y: 58, r: 33 };
const PLANET = { x: 172, y: 70, r: 19 };
const IDOLS = [116, 204];
const LAMPS = [
  { x: 74, y: 40, cord: 46, r: 6, ph: 0 },
  { x: 132, y: 22, cord: 30, r: 5, ph: 1.4 },
  { x: 238, y: 34, cord: 40, r: 6, ph: 2.6 },
];
const GLASS = { x: 84, y: 101 };
const THEREMIN = { x: 236, y: 120 };
const floorY = (x: number) => 128 - ((x - 160) / 170) ** 2 * 26;

const def: SceneDef = {
  id: 'tiki-satellite',
  fps: 15,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 11,
  grade: { temperature: 0.2, saturation: 0.9, bloom: 0.6 },
  create({ accent }) {
    const ink = hex('#0a0606');
    const warm = mix(accent, hex('#ffd8a0'), 0.4);
    const amber = accent;
    const bamboo = [hex('#1e130a'), hex('#33210f'), hex('#4e3416'), hex('#6e4c22')];
    const chrome = [hex('#1a1c24'), hex('#3a3e4a'), hex('#7a808e'), hex('#c8ccd8')];
    const wood = [hex('#140c08'), hex('#24160c'), hex('#3a2412'), hex('#56381c')];
    const ocean = [hex('#08142a'), hex('#10284a'), hex('#1c3e66'), hex('#33608a')];
    const land = [hex('#141e12'), hex('#2a361c'), hex('#4a5030'), hex('#6a6448')];
    const cloud = [hex('#3a4450'), hex('#7a8590'), hex('#aab4be'), hex('#d0d6dc')];

    // The planet's map: 0 ocean, 1 land, 2 cloud (cloud over either).
    const globe: Globe = { w: 128, h: 64, tex: new Uint8Array(128 * 64) };
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 128; x++) {
        const nx = Math.cos((x / 128) * Math.PI * 2) * 2;
        const nz = Math.sin((x / 128) * Math.PI * 2) * 2;
        const l = fbm(nx + 5, y / 14 + nz, 91, 4);
        const c = fbm(nx * 1.6 + 9, y / 6 + nz * 1.6, 93, 3);
        const polar = Math.abs(y - 32) > 27;
        globe.tex[y * 128 + x] = polar || c > 0.67 ? 2 : l > 0.54 ? 1 : 0;
      }
    const gr = new GlobeRenderer();
    const shadeGlobe = (cls: number, light: number, x: number, y: number): Color => {
      const r = cls === 0 ? ocean : cls === 1 ? land : cloud;
      const k = Math.min(3, Math.floor(light * 3.2 + bayer(x, y) * 0.8));
      return r[k]!;
    };

    const idol = (g: Gfx, x: number, flip: number) => {
      const top = 70;
      const bot = floorY(x);
      // body: a carved post with a big face
      for (let y = top; y < bot; y++) {
        const w = y < top + 26 ? 9 : 7;
        for (let dx = -w; dx <= w; dx++) {
          const lit = clamp(0.5 + (dx * flip) / w * 0.5);
          g.px(x + dx, y, wood[Math.min(3, Math.floor(lit * 2.6 + bayer(x + dx, y) * 0.8))]!);
        }
      }
      // brow, eyes, nose, mouth
      g.rect(x - 9, top + 4, 19, 2, wood[3]!);
      g.rect(x - 6, top + 7, 4, 3, ink);
      g.rect(x + 3, top + 7, 4, 3, ink);
      g.px(x - 4, top + 8, amber);
      g.px(x + 5, top + 8, amber);
      g.rect(x - 1, top + 9, 3, 6, wood[3]!);
      g.rect(x - 6, top + 17, 13, 5, ink);
      for (let k = 0; k < 4; k++) g.rect(x - 5 + k * 3, top + 17, 2, 2, hex('#c8b898'));
      // headdress
      g.poly([x - 11, top, x + 11, top, x + 7, top - 8, x, top - 12, x - 7, top - 8], wood[2]!);
      g.hline(x - 11, x + 11, top, wood[3]!);
      // carved bands lower down
      for (let y = top + 30; y < bot - 4; y += 8) g.hline(x - 7, x + 7, y, wood[0]!);
      g.rect(x - 4, top + 34, 9, 3, ink);
    };

    return {
      background(g) {
        // ── the curved ceiling: chrome ribs radiating over the lounge ──
        g.vgrad([hex('#07060a'), hex('#120d10'), hex('#1e1612')], g.top, 30);
        for (let k = -6; k <= 6; k++) {
          for (let y = g.top; y < 20; y++) {
            const u = clamp((y - g.top) / (20 - g.top));
            const x = 160 + k * (12 + 34 * u * u);
            g.px(x, y, mix(hex('#120d10'), chrome[1]!, 0.25 + 0.5 * u));
          }
        }
        for (let y = 2; y > g.top; y -= 14 + Math.floor(-y / 6)) g.hline(g.left, g.right, y, mix(hex('#0e0b0e'), chrome[1]!, 0.3));
        g.rect(g.left, 18, g.w, 3, chrome[1]!);
        g.hline(g.left, g.right, 18, chrome[2]!);

        // ── the bamboo wall ──
        for (let x = g.left; x < g.right; x++) {
          const pole = ((x % 7) + 7) % 7;
          const edge = pole === 0 || pole === 6;
          for (let y = 21; y < 132; y++) {
            const node = (y + Math.floor(x / 7) * 5) % 19 === 0;
            const lit = edge ? 0 : node ? 3 : pole === 2 ? 2 : 1;
            g.px(x, y, bamboo[lit]!);
          }
        }
        // a chrome band at dado height
        g.rect(g.left, 92, g.w, 3, chrome[1]!);
        g.hline(g.left, g.right, 92, chrome[2]!);

        // ── the porthole ──
        const P = PORT;
        g.disc(P.x, P.y, P.r + 6, chrome[0]!);
        g.ball(P.x, P.y, P.r + 5, P.r + 5, chrome, -0.5, -0.6, 0.25);
        g.disc(P.x, P.y, P.r + 1, chrome[0]!);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          g.px(P.x + Math.cos(a) * (P.r + 3), P.y + Math.sin(a) * (P.r + 3), chrome[3]!);
        }
        g.disc(P.x, P.y, P.r, hex('#03040a'));

        // ── the floor: a woven mat on a deck that curves up at both ends ──
        for (let x = g.left; x < g.right; x++) {
          const top = Math.round(floorY(x));
          g.vline(x, top - 3, top - 1, wood[1]!);
          g.px(x, top - 3, wood[3]!);
          for (let y = top; y < g.bottom; y++) {
            const weave = ((x >> 2) + (y >> 1)) & 1;
            const d = clamp((y - top) / 100);
            g.px(x, y, mix(weave ? hex('#4a3620') : hex('#36281a'), hex('#120c08'), d * 0.7));
          }
        }
        // a round rug with an atomic star
        g.ellipse(160, 150, 60, 10, hex('#2a1418'));
        g.ellipse(160, 150, 56, 9, hex('#4a2028'));
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI;
          g.line(160 - Math.cos(a) * 30, 150 - Math.sin(a) * 5, 160 + Math.cos(a) * 30, 150 + Math.sin(a) * 5, mix(hex('#4a2028'), amber, 0.4));
        }

        // a low tiki table with a flaming bowl (tall views)
        if (g.bottom > 190) {
          g.ellipseA(150, 214, 34, 5, ink, 0.6);
          g.ellipse(150, 200, 30, 6, wood[0]!);
          g.ellipse(150, 198, 30, 6, wood[2]!);
          g.hline(122, 178, 194, wood[3]!);
          g.rect(146, 204, 8, 14, wood[1]!);
          g.ellipse(150, 194, 8, 3, hex('#5a3a2a'));
          g.ellipse(150, 193, 6, 2, hex('#8a4a1a'));
          g.glow(150, 190, 30, amber, 0.12, 5);
        }
        // ── the bar: bamboo front, chrome top, two stools ──
        const by = 104;
        g.rect(g.left, by, 104 - g.left, 3, chrome[2]!);
        g.hline(g.left, 104, by, chrome[3]!);
        for (let x = g.left; x < 102; x++)
          for (let y = by + 3; y < floorY(x) - 3; y++) g.px(x, y, bamboo[((x % 4) + 4) % 4 === 0 ? 0 : (x & 1) + 1]!);
        for (const sx of [58, 92]) {
          g.ellipse(sx, 116, 6, 2, hex('#6a2028'));
          g.hline(sx - 5, sx + 5, 115, hex('#8a3038'));
          g.vline(sx, 118, floorY(sx) - 2, chrome[2]!);
          g.ellipse(sx, floorY(sx) - 2, 4, 1, chrome[1]!);
        }
        // bottles on a shelf behind the bar
        g.rect(g.left, 76, 98 - g.left, 2, wood[2]!);
        for (let x = 40; x < 96; x += 5) {
          const c = [hex('#6a3a1a'), hex('#2a4a3a'), hex('#7a5a2a'), hex('#5a2a3a')][(x >> 2) % 4]!;
          const h = 7 + (x % 3) * 2;
          g.rect(x, 76 - h, 3, h, c);
          g.px(x + 1, 76 - h - 1, c);
          g.px(x, 76 - h + 2, mix(c, hex('#ffffff'), 0.4));
        }

        for (let i = 0; i < IDOLS.length; i++) idol(g, IDOLS[i]!, i === 0 ? 1 : -1);

        // ── the stage and the theremin ──
        const T = THEREMIN;
        g.ellipse(T.x, floorY(T.x) + 1, 28, 5, ink);
        g.ellipse(T.x, floorY(T.x) - 1, 27, 4, hex('#3a1a1a'));
        g.hline(T.x - 26, T.x + 26, floorY(T.x) - 4, mix(hex('#5a2a20'), amber, 0.4));
        g.rect(T.x - 8, T.y - 14, 16, 7, wood[2]!);
        g.hline(T.x - 8, T.x + 7, T.y - 14, wood[3]!);
        g.vline(T.x - 6, T.y - 7, floorY(T.x) - 3, wood[1]!);
        g.vline(T.x + 6, T.y - 7, floorY(T.x) - 3, wood[1]!);
        g.vline(T.x + 6, T.y - 38, T.y - 15, chrome[3]!);
        g.ring(T.x - 12, T.y - 13, 4, 2, chrome[2]!);
        g.line(T.x - 8, T.y - 13, T.x - 9, T.y - 13, chrome[2]!);
        g.px(T.x - 3, T.y - 11, amber);
        g.px(T.x, T.y - 11, amber);

        g.lighting(0.66);
        g.light(150, 196, 50, 0.3, 20);
        for (const l of LAMPS) g.light(l.x, l.y, 60, 0.5);
        g.light(PORT.x, PORT.y, 50, 0.2);
        g.light(T.x, T.y - 10, 30, 0.25);
        vignette(g, 0.5, 160, 84, 230, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;

        // ── out of the porthole: stars wheel with the station, the planet turns ──
        const spin = t * 0.025;
        g.clip(PORT.x - PORT.r, PORT.y - PORT.r, PORT.r * 2 + 1, PORT.r * 2 + 1);
        const cs = Math.cos(spin);
        const sn = Math.sin(spin);
        for (let i = 0; i < 70; i++) {
          const rx = (hash3(i, 1) - 0.5) * 2 * PORT.r * 1.4;
          const ry = (hash3(i, 2) - 0.5) * 2 * PORT.r * 1.4;
          const x = PORT.x + rx * cs - ry * sn;
          const y = PORT.y + rx * sn + ry * cs;
          if ((x - PORT.x) ** 2 + (y - PORT.y) ** 2 > PORT.r * PORT.r) continue;
          g.pxAdd(x, y, hex('#e8eeff'), 0.25 + hash3(i, 3) * 0.6);
        }
        // the planet drifts round with the spin and turns on its own axis
        const pa = spin * 0.6;
        const px = PORT.x + (PLANET.x - PORT.x) * Math.cos(pa) - (PLANET.y - PORT.y) * Math.sin(pa);
        const py = PORT.y + (PLANET.x - PORT.x) * Math.sin(pa) + (PLANET.y - PORT.y) * Math.cos(pa);
        g.glow(px, py, PLANET.r + 8, hex('#4a8ad0'), 0.18);
        gr.draw(g, globe, px, py, PLANET.r, t * 0.004, -0.6, -0.4, 0.06, shadeGlobe);
        // Rare: a finned rocket of tomorrow cruises past.
        if (f.rare === 0 && ev < 11) {
          const p = ev / 11;
          const x = PORT.x - PORT.r - 10 + p * (PORT.r * 2 + 20);
          const y = PORT.y - 14 + p * 6;
          g.rect(x - 5, y - 1, 10, 3, chrome[3]!);
          g.px(x + 5, y, chrome[3]!);
          g.px(x + 6, y, hex('#d04030'));
          g.line(x - 5, y - 1, x - 7, y - 3, hex('#d04030'));
          g.line(x - 5, y + 1, x - 7, y + 3, hex('#d04030'));
          g.glow(x - 8, y, 4, warm, 0.6);
        }
        g.noClip();
        // reflections on the glass
        g.line(PORT.x - 24, PORT.y - 12, PORT.x - 12, PORT.y - 24, mix(hex('#03040a'), chrome[3]!, 0.18));
        g.line(PORT.x - 22, PORT.y - 8, PORT.x - 8, PORT.y - 22, mix(hex('#03040a'), chrome[3]!, 0.1));

        // ── puffer-fish lamps, swinging very gently on their cords ──
        const puff = f.rare === 1 && ev < 11 ? envelope(ev, 11, 1.5, 3) : 0;
        for (let i = 0; i < LAMPS.length; i++) {
          const L = LAMPS[i]!;
          const sw = f.reduced ? 0 : Math.sin(t * 0.6 + L.ph) * 0.05;
          const top = L.y - L.cord;
          const lx = L.x + Math.sin(sw) * L.cord;
          const ly = top + Math.cos(sw) * L.cord;
          g.line(L.x, top, lx, ly - L.r, hex('#2a2018'));
          const r = L.r * (1 + (i === 1 ? puff * 0.6 : 0));
          const fl = 0.85 + 0.15 * flicker(t, i + 3, 2);
          g.glow(lx, ly, r * 4, warm, 0.22 * fl);
          g.ball(lx, ly, r, r * 0.9, [hex('#6a3010'), hex('#b06020'), mix(amber, hex('#ffd890'), 0.3), hex('#fff0c8')], -0.3, -0.3, 0.45);
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2 + 0.3;
            g.px(lx + Math.cos(a) * (r + 1.5), ly + Math.sin(a) * (r * 0.9 + 1.5), hex('#4a2a14'));
          }
          // tail and fins
          g.line(lx + r, ly, lx + r + 3, ly - 2, hex('#8a4a1a'));
          g.line(lx + r, ly, lx + r + 3, ly + 2, hex('#8a4a1a'));
          g.px(lx - r * 0.5, ly - 1, ink);
          g.px(lx - r * 0.5 + 1, ly - 1, hex('#ffffff'));
        }
        // the idols' eyes catch the lamplight
        for (const x of IDOLS) {
          g.pxAdd(x - 4, 78, amber, 0.3 + 0.2 * Math.sin(t * 0.5 + x));
          g.pxAdd(x + 5, 78, amber, 0.3 + 0.2 * Math.sin(t * 0.5 + x));
        }

        // ── the mai tai, a little way out of its glass ──
        const G = GLASS;
        g.rect(G.x - 3, G.y - 6, 7, 6, mix(hex('#3a2a20'), hex('#c8d0d8'), 0.35));
        g.rect(G.x - 2, G.y - 4, 5, 3, mix(hex('#a04a1a'), amber, 0.4));
        g.line(G.x + 2, G.y - 6, G.x + 5, G.y - 12, hex('#c8c0a8'));
        g.ellipse(G.x + 5, G.y - 13, 3, 1, hex('#c04a6a'));
        const lift = f.rare === 2 && ev < 11 ? envelope(ev, 11, 3, 3) * 10 : 0;
        const gy = G.y - 13 - lift + (f.reduced ? 0 : Math.sin(t * 0.8) * 1.5);
        const gx = G.x - 1 + (f.reduced ? 0 : Math.sin(t * 0.53) * 1);
        g.ellipse(gx, gy, 2.5 + Math.sin(t * 1.3) * 0.3, 2 - Math.sin(t * 1.3) * 0.3, mix(hex('#c05a20'), amber, 0.5));
        g.px(gx - 1, gy - 1, hex('#ffd8a0'));
        g.px(gx + 3, gy + 2, mix(hex('#c05a20'), amber, 0.5));
        g.glow(gx, gy, 5, amber, 0.12);

        // ── the theremin's tone, drawn in the air ──
        const T = THEREMIN;
        const play = (f.rare === 3 && ev < 11 ? envelope(ev, 11, 2, 2) : 0) + e * awake * 0.6;
        if (play > 0.05) {
          for (let i = 0; i < 26; i++) {
            const x = T.x + 9 + i;
            const y = T.y - 32 + Math.sin(i * 0.5 - t * 3) * (1 + play * 2.5) * (1 - i / 30);
            g.pxAdd(x, y, warm, (0.5 - i * 0.017) * clamp(play));
          }
        }
        g.glow(T.x + 6, T.y - 38, 4, warm, 0.2 + play * 0.3);
        if (g.bottom > 190) {
          const fl = flicker(t, 11, 6);
          g.px(150, 190, hex('#ffe0a0'));
          g.px(149 + (Math.floor(t * 5) % 2), 189, amber);
          g.glow(150, 190, 6, warm, 0.4 * fl);
        }
        void shade;
      },
    };
  },
};

export default def;
