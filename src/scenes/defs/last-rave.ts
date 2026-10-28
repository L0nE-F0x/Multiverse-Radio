// Afterparty at the Heat Death: the last rave in the universe, on a small rock floating in
// the dark. One speaker stack, DJ Entropy under a single warm bulb, three dancers, and a dim
// nebula that sways along with two long arms of dust. Over the local night the stars go out,
// one at a time; by dawn only a handful are left, and in the evening they're all back.

import { onAirLamp, sectionDrive } from '../kit/broadcast';
import { hex, mix, ramp } from '../kit/color';
import { clamp, envelope, lightCone, smoothstep } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { rimLight } from '../kit/atmos';
import { fbm, hash3, noise1 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, vignette } from './lib/night';
import { type Pose, figure, nightProgress } from './lib/outer';

const STARS = 240;
const ROCK = { x0: 88, x1: 236, top: 118 };
const NEB = { x: 196, y: 46, w: 200, h: 110 };
const LAMP = { x: 210, y: 78 };
const DANCERS = [
  { x: 134, h: 25, ph: 0.2, hair: 1 },
  { x: 154, h: 27, ph: 2.1, hair: 0 },
  { x: 174, h: 24, ph: 4.0, hair: 3 },
];

const def: SceneDef = {
  id: 'last-rave',
  fps: 15,
  focusY: 92,
  rareEvents: 4,
  rareDuration: 12,
  grade: { temperature: 0.05, saturation: 0.9, bloom: 0.6, shadows: '#050407', vignette: 0.3 },
  create({ accent }) {
    const body = hex('#22181a');
    const warm = mix(accent, hex('#ffd8a8'), 0.45);
    const ember = accent;
    const dust = [hex('#3a1828'), hex('#6a2a3a'), hex('#9a4a40'), hex('#c87048'), hex('#f0a870')];
    const violet = hex('#6a5aa8');
    const rockC = ramp([hex('#0a080c'), hex('#18121a'), hex('#2a2024'), hex('#423028'), hex('#6a4a34')], 7);
    const starC = hex('#fff0e0');

    // Stars: position, brightness, and the point in the night when each goes out.
    const sx = new Float32Array(STARS);
    const sy = new Float32Array(STARS);
    const sb = new Float32Array(STARS);
    const death = new Float32Array(STARS);
    const diedAt = new Float32Array(STARS).fill(NaN);
    for (let i = 0; i < STARS; i++) {
      sx[i] = -40 + hash3(i, 1) * 400;
      sy[i] = -110 + hash3(i, 2) * 400;
      sb[i] = 0.25 + hash3(i, 3) ** 2 * 0.75;
      // a handful never go out: the last lights
      death[i] = i % 37 === 0 ? 2 : 0.02 + hash3(i, 4) * 0.96;
    }
    let lastP = -1;

    // The nebula: an alpha + colour texture baked once.
    const nebA = new Uint8Array(NEB.w * NEB.h);
    const nebC = new Int32Array(NEB.w * NEB.h);
    for (let y = 0; y < NEB.h; y++)
      for (let x = 0; x < NEB.w; x++) {
        const u = (x - NEB.w / 2) / (NEB.w / 2);
        const v = (y - NEB.h / 2) / (NEB.h / 2);
        // body: a leaning soft mass, densest low and left
        const body = clamp(1 - Math.hypot(u * 1.05 + v * 0.3, v * 1.2));
        const n = fbm(x / 34, y / 24, 31, 3);
        const ridge = 1 - Math.abs(2 * fbm(x / 22, y / 13, 33, 3) - 1);
        let a = Math.pow(body, 1.15) * (0.7 + 0.45 * n) * (0.8 + 0.35 * ridge ** 4);
        a = clamp(a * 1.1 - 0.03);
        nebA[y * NEB.w + x] = Math.round(a * 255);
        nebC[y * NEB.w + x] = mix(mix(violet, dust[2]!, clamp(body * 1.6)), dust[4]!, clamp(ridge ** 4 * 0.6 + body * 0.3 - 0.1));
      }

    const pose: Pose = { lean: 0, armL: 0, armR: 0, legL: 0, legR: 0 };

    const drawNebula = (g: Gfx, t: number, sway: number, k: number) => {
      const b = g.buf;
      const x0 = NEB.x - NEB.w / 2;
      const y0 = NEB.y - NEB.h / 2;
      for (let y = 0; y < NEB.h; y++) {
        const wy = y0 + y;
        const by = wy - g.oy;
        if (by < 0 || by >= g.h) continue;
        // the sway: the top rocks more than the base, like a dancer's shoulders
        const dx = Math.round(sway * (1 - y / NEB.h) * 4 + Math.sin(t * 0.5 + y * 0.05) * 0.8);
        const row = by * g.w;
        for (let x = 0; x < NEB.w; x++) {
          const a = nebA[y * NEB.w + x]!;
          if (a < 8) continue;
          const wx = x0 + x + dx;
          const bx = wx - g.ox;
          if (bx < 0 || bx >= g.w) continue;
          const m = Math.floor((a / 255) * k * 10 + bayer(wx, wy)) / 10;
          if (m <= 0) continue;
          const c = nebC[y * NEB.w + x]!;
          const d = b[row + bx]!;
          const r = (d & 255) + ((c & 255) * m) | 0;
          const gg = ((d >>> 8) & 255) + (((c >>> 8) & 255) * m) | 0;
          const bb = ((d >>> 16) & 255) + (((c >>> 16) & 255) * m) | 0;
          b[row + bx] = 0xff000000 | ((bb > 255 ? 255 : bb) << 16) | ((gg > 255 ? 255 : gg) << 8) | (r > 255 ? 255 : r);
        }
      }
    };

    // The nebula's two long arms of dust, raised and swaying.
    const arm = (g: Gfx, bx: number, by: number, side: number, lift: number, sway: number, k: number) => {
      let x = bx;
      let y = by;
      let a = -Math.PI / 2 + side * (1.1 - lift * 0.8) + sway * 0.25;
      for (let i = 0; i < 11; i++) {
        const r = 9 - i * 0.55;
        g.glow(x, y, r, mix(dust[2]!, violet, i / 14), k * (0.45 - i * 0.025), 5);
        x += Math.cos(a) * 5;
        y += Math.sin(a) * 5;
        a += side * (0.06 + 0.04 * Math.sin(i + sway)) - sway * 0.03;
      }
    };

    return {
      background(g) {
        g.vgrad([hex('#020203'), hex('#040306'), hex('#07050a')], g.top, 140);
        // the remains of a galaxy, very far off, upper left
        for (let y = 10; y < 70; y++)
          for (let x = 20; x < 110; x++) {
            const u = (x - 62) / 36;
            const v = (y - 38 + (x - 62) * 0.35) / 8;
            const d = u * u + v * v;
            if (d > 1) continue;
            const arm = 0.5 + 0.5 * Math.sin(Math.atan2(v, u) * 2 + Math.hypot(u, v) * 7);
            const k = (1 - d) * (0.4 + 0.6 * arm) * fbm(x / 5, y / 5, 41, 2);
            if (k > 0.12 + bayer(x, y) * 0.2) g.pxAdd(x, y, hex('#8a7088'), 0.2 * k + 0.04);
          }
        g.glow(62, 38, 6, hex('#d8c0b0'), 0.18);
        // a smaller chunk of rock drifting below (tall views)
        for (let x = 104; x < 140; x++) {
          const u = (x - 122) / 18;
          const top = 214 - Math.sqrt(Math.max(0, 1 - u * u)) * 4 + (fbm(x / 4, 7, 57, 2) - 0.5) * 2;
          const bot = 214 + Math.pow(Math.max(0, 1 - u * u), 1.4) * 16;
          for (let y = Math.round(top); y < bot; y++) g.px(x, y, rockC[Math.min(2, Math.floor((1 - (y - top) / 20) * 2.4 + bayer(x, y) * 0.8))]!);
          g.px(x, Math.round(top), mix(rockC[4]!, violet, 0.4));
        }
        // dust lit by the party, behind the rock
        g.glow(160, 124, 120, hex('#3a1c22'), 0.22, 7);

        // ── the rock: a flat top for the dancefloor, a long jagged underside ──
        const underside = (x: number) => {
          const u = (x - (ROCK.x0 + ROCK.x1) / 2) / ((ROCK.x1 - ROCK.x0) / 2);
          return ROCK.top + 4 + Math.pow(Math.max(0, 1 - u * u), 1.6) * 92 + fbm(x / 9, 3, 51, 3) * 12 - 6;
        };
        const topAt = (x: number) => ROCK.top + Math.abs(((x - 162) / 74) ** 3) * 6 + (fbm(x / 6, 9, 53, 2) - 0.5) * 2;
        const n = rockC.length - 1;
        for (let x = ROCK.x0 - 4; x <= ROCK.x1 + 4; x++) {
          const top = Math.round(topAt(x));
          const bot = underside(x);
          for (let y = top; y < bot; y++) {
            const depth = (y - top) / Math.max(1, bot - top);
            const lightL = clamp(1 - Math.hypot((x - LAMP.x) / 80, (y - top) / 26));
            const rimR = clamp((x - 200) / 40) * clamp(1 - depth * 1.5) * 0.4;
            const tex = fbm(x / 5, y / 4, 55, 3);
            let v = 0.22 + lightL * 0.6 + rimR + (tex - 0.5) * 0.4 - depth * 0.3;
            v = clamp(v);
            let k = Math.floor(v * n + bayer(x, y));
            if (k > n) k = n;
            g.px(x, y, rockC[k]!);
          }
          g.px(x, top, mix(rockC[3]!, warm, clamp(1 - Math.abs(x - LAMP.x) / 70) * 0.6));
          // dangling roots of rock
          if (hash3(x, 5) < 0.04) g.vline(x, bot, bot + 4 + hash3(x, 6) * 8, rockC[0]!);
        }
        // the dancefloor: a little grid of tiles set into the rock
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 7; c++) {
            const y = ROCK.top - 1 + r * 2;
            const x = 128 + c * 8 - r * 2 + (r > 0 ? 0 : 1);
            g.rect(x, y, 7 + r, 2, mix(hex('#1a1214'), hex('#2a1e1a'), (c + r) % 2));
          }

        // ── the speaker stack ──
        const stack = (x: number, y: number, w: number, h: number) => {
          g.rect(x, y, w, h, hex('#0a0809'));
          g.rect(x + 1, y + 1, w - 2, h - 2, hex('#141012'));
          g.hline(x, x + w - 1, y, hex('#2a2220'));
        };
        stack(98, 80, 24, 20);
        stack(96, 100, 28, 19);
        // the DJ's table, and the crooked lamp pole
        g.rect(190, 104, 34, 3, hex('#16100e'));
        g.hline(190, 223, 104, mix(hex('#2a2018'), warm, 0.5));
        g.rect(193, 107, 2, 12, hex('#0a0809'));
        g.rect(219, 107, 2, 12, hex('#0a0809'));
        g.ellipse(198, 103, 4, 1, hex('#0e0a0a'));
        g.ellipse(214, 103, 4, 1, hex('#0e0a0a'));
        g.line(228, ROCK.top, 226, 72, hex('#141010'));
        g.line(226, 72, LAMP.x + 2, 68, hex('#141010'));
        g.vline(LAMP.x, 69, LAMP.y - 3, hex('#141010'));
        // a cable snaking from the decks to the stack
        for (let x = 124; x < 192; x++) g.px(x, ROCK.top + 1 + Math.round(Math.sin(x * 0.15) * 0.7), hex('#0c0a0a'));

        g.lighting(0.8);
        g.light(LAMP.x, LAMP.y + 18, 70, 0.6, 46);
        g.light(NEB.x, NEB.y, 110, 0.25);
        vignette(g, 0.3, 164, 96, 240, 185);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;
        const p = nightProgress(f.hour);

        // ── stars, going out one by one ──
        for (let i = 0; i < STARS; i++) {
          const x = sx[i]!;
          const y = sy[i]!;
          if (x < g.left || x >= g.right || y < g.top || y >= g.bottom) continue;
          let k = sb[i]!;
          if (p >= death[i]!) {
            if (diedAt[i]! !== diedAt[i]!) diedAt[i] = lastP < 0 ? -1e9 : t;
            const since = t - diedAt[i]!;
            if (since > 5) continue;
            // a last brightening, then gone
            k *= since < 0.8 ? 1 + since * 1.5 : Math.max(0, 1 - (since - 0.8) / 4.2) * 2.2;
            g.glow(x, y, 3, starC, 0.25 * clamp(1 - since / 5));
          } else if (diedAt[i]! === diedAt[i]!) diedAt[i] = NaN;
          // stars behind the rock stay hidden
          if (x > ROCK.x0 - 2 && x < ROCK.x1 + 2 && y > ROCK.top - 1 && y < ROCK.top + 60) continue;
          const tw = 0.75 + 0.25 * Math.sin(t * (0.5 + sb[i]!) + i);
          g.pxAdd(x, y, starC, k * tw * 0.8);
          if (sb[i]! > 0.85) {
            g.pxAdd(x - 1, y, starC, k * 0.25);
            g.pxAdd(x + 1, y, starC, k * 0.25);
          }
        }
        lastP = p;

        // Rare: the last comet in the universe, taking its time.
        if (f.rare === 2 && ev < 12) {
          const q = ev / 12;
          const cx = g.right + 10 - q * (g.w + 60);
          const cy = 20 + q * 26;
          const k = envelope(ev, 12, 1.5, 1.5);
          for (let i = 0; i < 26; i++) g.pxAdd(cx + i * 1.6, cy - i * 0.6, hex('#c8d8ff'), (0.5 - i * 0.018) * k);
          g.glow(cx, cy, 4, hex('#e8f0ff'), 0.5 * k);
        }

        // ── the nebula, swaying along ──
        const drive = sectionDrive(f);
        const sp = f.speech ?? 0;
        const sway = f.reduced ? 0 : (Math.sin(t * 1.1) * (0.4 + 0.6 * awake) + f.pulse * 0.3 * awake) * drive;
        const nk = (0.52 + 0.14 * e * awake) * (0.75 + 0.25 * drive);
        drawNebula(g, t, sway, nk);
        const wave = f.rare === 3 && ev < 12 ? envelope(ev, 12, 3, 3) : 0;
        const lift = (0.35 + 0.25 * Math.max(0, Math.sin(t * 0.55)) * awake) * drive + wave * 0.6;
        arm(g, NEB.x - 34 + Math.round(sway * 3), NEB.y - 18, -1, lift, sway, nk);
        arm(g, NEB.x + 30 + Math.round(sway * 3), NEB.y - 24, 1, lift * 0.9, -sway, nk);

        // ── the speaker stack's cones ──
        onAirLamp(g, 114, 82, f);
        const hit = f.reduced ? 0 : f.pulse * awake * drive;
        for (const [cx, cy, r] of [
          [110, 90, 6],
          [110, 109, 7],
        ] as const) {
          g.disc(cx, cy, r + 1, hex('#0a0809'));
          g.disc(cx, cy, r, mix(hex('#1e1818'), warm, 0.1 + hit * 0.12));
          g.ring(cx, cy, r - 2 + Math.round(hit), r - 2 + Math.round(hit), hex('#0c0a0a'));
          g.disc(cx, cy, 1.5, mix(hex('#2a2220'), warm, 0.3));
        }
        g.px(120, 83, mix(hex('#401010'), ember, 0.4 + 0.6 * (e * drive > 0.5 ? 1 : 0)));

        // ── the lamp: one warm bulb on a crooked pole ──
        const fl = (f.reduced ? 1 : flicker(t, 7, 3) * 0.15 + 0.85) * (0.75 + 0.25 * drive);
        g.rect(LAMP.x - 3, LAMP.y - 4, 7, 3, hex('#1a1210'));
        g.px(LAMP.x, LAMP.y - 1, hex('#fff2d8'));
        g.glow(LAMP.x, LAMP.y, Math.round(9 * drive), warm, 0.45 * fl);
        lightCone(g, LAMP.x, LAMP.y + 1, 4, Math.round(44 * drive), ROCK.top - LAMP.y - 1, warm, 0.07 * fl);
        g.glow(LAMP.x, LAMP.y + 26, 46, warm, 0.07 * fl, 6);

        // ── DJ Entropy behind her decks ──
        pose.lean = 0.05 + sp * 0.08;
        pose.legL = 0;
        pose.legR = 0;
        pose.kneeL = 0;
        pose.kneeR = 0;
        pose.armL = 1.0 + (f.reduced ? 0 : Math.sin(t * 1.3) * 0.15 * drive);
        pose.armR = sp > 0.15 ? -2.7 : -2.3;
        pose.elbowL = 0.6;
        pose.elbowR = -1.5;
        pose.bob = Math.round(hit + sp);
        pose.nod = f.reduced ? 0 : Math.round((Math.sin(t * 1.9) * 0.6 + sp * 1.1) * awake);
        pose.hair = 2;
        pose.flare = false;
        pose.skirt = false;
        g.clip(g.left, g.top, g.w, 104 - g.top);
        figure(g, 206, ROCK.top + 2, 34, pose, body);
        rimLight(g, 192, 84, 30, 20, (c) => c === body, warm, 0.3, false);
        g.noClip();
        g.pxAdd(204, 91 + pose.bob, warm, 0.6);
        g.pxAdd(208, 93 + pose.bob, warm, 0.35);
        g.px(198 + (Math.floor(t * 3) % 3) - 1, 103, hex('#8a7a6a'));

        // ── three dancers ──
        const look = f.rare === 0 && ev > 1.2 && ev < 7 ? smoothstep(1.2, 2, ev) * (1 - smoothstep(6, 7, ev)) : 0;
        for (let i = 0; i < DANCERS.length; i++) {
          const d = DANCERS[i]!;
          const ph = t * 1.6 + d.ph;
          const groove = f.reduced ? 0 : Math.sin(ph) * awake * (1 - look) * drive;
          const lighter = f.rare === 1 && i === 1 && ev < 12 ? envelope(ev, 12, 2, 2) : 0;
          pose.lean = groove * 0.14;
          pose.legL = -0.28 + Math.max(0, groove) * 0.25;
          pose.legR = 0.28 + Math.min(0, groove) * 0.25;
          pose.kneeL = 0.15 + Math.max(0, -groove) * 0.6;
          pose.kneeR = -0.15 - Math.max(0, groove) * 0.6;
          pose.armL = i === 0 ? -2.4 + groove * 0.35 : i === 1 ? -0.9 + groove * 0.4 : -0.5 - groove * 0.3;
          pose.armR = i === 2 ? 2.3 - groove * 0.35 : i === 1 ? 0.9 + groove * 0.4 : 0.7 + groove * 0.3;
          pose.elbowL = i === 0 ? 0.4 : -1.2;
          pose.elbowR = i === 2 ? -0.4 : 1.2;
          if (lighter > 0) {
            pose.armR = 2.7 + Math.sin(ev * 1.2) * 0.2;
            pose.elbowR = 0;
          }
          pose.bob = Math.round((f.reduced ? 0 : Math.abs(groove)) + hit * 0.8);
          pose.nod = Math.round(-look * 2 + groove);
          pose.hair = d.hair;
          const x = d.x + Math.round(groove * 1.5);
          figure(g, x, ROCK.top + 1, d.h, pose, body);
          rimLight(g, x - 16, ROCK.top - d.h - 6, 32, d.h + 7, (c) => c === body, warm, 0.25 * drive, false);
          if (lighter > 0) {
            const lx = x + Math.sin(2.7 + Math.sin(ev * 1.2) * 0.2) * d.h * 0.39 + 2;
            const ly = ROCK.top - d.h * 0.98;
            g.px(lx, ly, hex('#ffe0a0'));
            g.glow(lx, ly, 6, warm, 0.45 * lighter * flicker(t, 3, 9));
          }
        }
        // the floor tiles catch the beat
        for (let c = 0; c < 7; c++) {
          const on = hash3(c, f.beat, 3) < 0.35 * drive;
          if (!on) continue;
          g.rectAdd(129 + c * 8, ROCK.top - 1, 7, 1, ember, (0.08 + hit * 0.18) * drive * awake);
        }
        g.glow(154, ROCK.top + 2, Math.round(34 * drive), ember, (0.03 + hit * 0.05 * awake) * drive);

        // Rare: a star right over the floor goes out with a tiny pop; everyone looks up.
        if (f.rare === 0 && ev < 12) {
          const x = 160;
          const y = 52;
          const k = ev < 1.2 ? 1 + ev : Math.max(0, 1 - (ev - 1.2) / 3);
          if (k > 0) {
            g.pxAdd(x, y, starC, k);
            g.glow(x, y, 3 + (ev < 1.2 ? ev * 3 : 4), starC, 0.4 * k);
          }
        }
        // a few motes of dust drifting off the nebula, toward the floor
        for (let i = 0; i < 10; i++) {
          const q = ((t * 0.02 + hash3(i, 9)) % 1);
          const x = NEB.x - 60 + hash3(i, 10) * 80 - q * 40 + noise1(t * 0.1 + i, 5) * 6;
          const y = NEB.y + 10 + q * 50;
          g.pxAdd(x, y, dust[4]!, 0.25 * Math.sin(q * Math.PI));
        }
      },
    };
  },
};

export default def;
