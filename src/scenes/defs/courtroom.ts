// Small Claims of the Multiverse: Courtroom 4 at night, mostly empty. A high bench under a
// brass crest of overlapping planets, the judge writing by a green-shaded lamp, the clerk at
// his desk with a microphone, a lamp-lit witness stand, rain running down tall windows and
// their cold light lying across the floor. In the defendant's chair sits something faintly
// glowing.
// Rare events: the gavel comes down; the defendant rises a little to look round, and settles;
// the weather takes the witness stand (and rains on it); the clerk unrolls a very long list.

import { callLamp, onAirLamp } from '../kit/broadcast';
import { hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3, noise1 } from '../kit/rng';
import type { SceneDef } from '../types';
import { rain, vignette } from './lib/night';

const FLOOR = 116; // the bench's foot, where the wall meets the floor
const BENCH = { x: 108, y: 70, w: 104 }; // top edge of the bench front
const JUDGE = { x: 160, y: 46 }; // top of the judge's head
const CREST = { x: 160, y: 24 };
const CLERK = { x: 160, desk: 98 }; // the clerk's desk top
const STAND = { x: 222, y: 90, w: 30 }; // witness box rail
const DEF = { x: 92, seat: 132 }; // the defendant's chair
const BAR = 150; // the bar rail between the well and the gallery
// Tall arched windows: inner pair flanks the crest, outer pair at the walls.
const WINDOWS = [
  { x: 76, w: 24 },
  { x: 220, w: 24 },
  { x: 14, w: 28 },
  { x: 278, w: 28 },
] as const;
const WIN_TOP = 4;
const WIN_BOT = 68;

const def: SceneDef = {
  id: 'courtroom',
  fps: 15,
  focusX: 160,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  grade: { temperature: -0.05, contrast: 1.14, saturation: 0.8, bloom: 0.7, threshold: 0.64, vignette: 0.34, shadows: '#05060a' },
  create({ accent }) {
    const ink = hex('#040407');
    const wood = [hex('#0c0807'), hex('#140d0a'), hex('#1d130e'), hex('#281a12'), hex('#382517'), hex('#4a3220')];
    const brass = mix(accent, hex('#8a6a3a'), 0.3);
    const brassL = mix(accent, hex('#fff0c8'), 0.35);
    const brassD = shade(brass, 0.45);
    const night = hex('#3a4a66');
    const nightL = hex('#8a9ab8');
    const lampG = hex('#1f4a2e');
    const warm = hex('#ffcf8a');
    const robe = hex('#0e0d12');
    const robeL = hex('#22202a');
    const skin = hex('#a8806a');
    const skinD = hex('#4a3428');
    const wisp = mix(hex('#b8f0e0'), accent, 0.15);
    const paper = hex('#b8b0a0');

    /** A tall arched window: night sky, the glazing bars, rain drawn per frame. */
    const windowShape = (g: Gfx, x: number, w: number) => {
      const r = w / 2;
      const top = WIN_TOP + r;
      g.rect(x - 3, top, w + 6, WIN_BOT - top + 3, wood[3]!);
      g.ellipse(x + r, top, r + 3, r + 3, wood[3]!);
      g.clip(x, WIN_TOP, w, WIN_BOT - WIN_TOP);
      for (let y = WIN_TOP; y < WIN_BOT; y++)
        for (let xx = x; xx < x + w; xx++) {
          const dy = y - top;
          if (dy < 0 && (xx + 0.5 - x - r) ** 2 + dy * dy > r * r) continue;
          const v = (y - WIN_TOP) / (WIN_BOT - WIN_TOP);
          // a city glow low in the glass, a cloudy sky above
          const n = fbm(xx / 14, y / 9, 41, 3);
          const c = mix(mix(hex('#0a0e18'), hex('#1c2638'), v), hex('#2a3448'), clamp((n - 0.5) * 2) * 0.6);
          g.px(xx, y, c);
        }
      // distant lit windows across the street
      for (let i = 0; i < 8; i++) {
        const lx = x + 2 + Math.floor(hash3(i, x, 1) * (w - 4));
        const ly = WIN_BOT - 4 - Math.floor(hash3(i, x, 2) * 22);
        g.px(lx, ly, mix(hex('#3a3a30'), warm, 0.35 * hash3(i, x, 3)));
      }
      g.noClip();
      // glazing bars
      for (let gx = x + Math.round(w / 3); gx < x + w - 2; gx += Math.round(w / 3)) g.vline(gx, WIN_TOP + 2, WIN_BOT, wood[1]!);
      for (let gy = top + 6; gy < WIN_BOT; gy += 12) g.hline(x, x + w - 1, gy, wood[1]!);
      g.rect(x - 4, WIN_BOT, w + 8, 3, wood[4]!); // sill
      g.hline(x - 4, x + w + 3, WIN_BOT, wood[5]!);
    };

    /** Linenfold-ish panelling: raised panels in moulded frames. */
    const panels = (g: Gfx, x0: number, x1: number, y0: number, y1: number, pw: number, base: number) => {
      g.rect(x0, y0, x1 - x0, y1 - y0, wood[base]!);
      for (let x = x0 + 3; x + pw <= x1 - 2; x += pw + 4) {
        g.rect(x, y0 + 3, pw, y1 - y0 - 6, wood[base + 1]!);
        g.hline(x, x + pw - 1, y0 + 3, wood[base + 2]!);
        g.vline(x, y0 + 3, y1 - 4, wood[base + 2]!);
        g.hline(x, x + pw - 1, y1 - 4, wood[Math.max(0, base - 1)]!);
        g.vline(x + pw - 1, y0 + 3, y1 - 4, wood[Math.max(0, base - 1)]!);
      }
    };

    return {
      background(g) {
        // ── the back wall ──
        g.vgrad([wood[0]!, wood[1]!, wood[2]!], g.top, FLOOR);
        // upper wall: tall plain boards
        for (let x = Math.floor(g.left / 9) * 9; x < g.right; x += 9) {
          g.vline(x, g.top, 74, wood[0]!);
          g.vline(x + 1, g.top, 74, wood[2]!);
        }
        // the dado: panelling below the windows
        panels(g, g.left, g.right, 74, FLOOR, 16, 1);
        g.rect(g.left, 72, g.w, 3, wood[3]!);
        g.hline(g.left, g.right, 72, wood[4]!);
        // the cornice (portrait: a coffered ceiling fading up)
        g.rect(g.left, -4, g.w, 4, wood[3]!);
        g.hline(g.left, g.right, -1, wood[4]!);
        if (g.top < -4) {
          g.vgrad([hex('#030303'), wood[0]!], g.top, -4, g.top, -4);
          for (let y = -16; y > g.top; y -= 18) {
            g.hline(g.left, g.right, y, wood[1]!);
            for (let x = Math.floor(g.left / 32) * 32; x < g.right; x += 32) g.vline(x, y - 17, y, wood[1]!);
          }
          // a dark glass pendant, unlit
          g.vline(CREST.x, g.top, -40, hex('#141010'));
          g.ellipse(CREST.x, -36, 7, 4, hex('#16110e'));
          g.hline(CREST.x - 7, CREST.x + 7, -33, brassD);
        }
        for (const W of WINDOWS) windowShape(g, W.x, W.w);

        // ── the crest: three overlapping worlds in a brass ring, an orbit through them ──
        {
          const { x, y } = CREST;
          g.disc(x, y, 14, ink);
          g.disc(x, y, 13, wood[1]!);
          g.ring(x, y, 13, 13, brassD);
          g.ring(x, y, 12, 12, brass);
          const ramp = [brassD, mix(brassD, brass, 0.5), brass, mix(brass, brassL, 0.5), brassL];
          const worlds: [number, number, number][] = [
            [x, y - 4, 5],
            [x - 5, y + 3, 5],
            [x + 5, y + 3, 5],
          ];
          for (const [wx, wy, r] of worlds) {
            g.disc(wx, wy, r + 1, wood[0]!);
            g.ball(wx, wy, r, r, ramp, -0.5, -0.6, 0.12);
          }
          // the orbit, passing behind the top world
          for (let a = 0; a < 120; a++) {
            const ang = (a / 120) * Math.PI * 2;
            const ox = x + Math.cos(ang) * 11;
            const oy = y + Math.sin(ang) * 3 - Math.cos(ang) * 2;
            if (Math.sin(ang) < 0 && (ox - x) ** 2 + (oy - y + 3) ** 2 < 36) continue;
            g.px(ox, oy, brassL);
          }
          g.disc(x + 11, y - 2, 1, brassL);
          // laurels down the sides
          for (let i = 0; i < 6; i++) {
            const a = Math.PI * (0.62 + i * 0.07);
            g.px(x + Math.cos(a) * 15, y + Math.sin(a) * 15, brassD);
            g.px(x - Math.cos(a) * 15, y + Math.sin(a) * 15, brassD);
          }
        }

        // ── the judge's high-backed chair (judge drawn per frame) ──
        g.poly([JUDGE.x - 11, BENCH.y, JUDGE.x - 11, 40, JUDGE.x - 8, 36, JUDGE.x + 8, 36, JUDGE.x + 11, 40, JUDGE.x + 11, BENCH.y], hex('#1a0c0c'));
        g.poly([JUDGE.x - 9, BENCH.y, JUDGE.x - 9, 41, JUDGE.x - 7, 38, JUDGE.x + 7, 38, JUDGE.x + 9, 41, JUDGE.x + 9, BENCH.y], hex('#2a1210'));
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.px(JUDGE.x - 6 + j * 6, 42 + i * 6, brassD);

        // ── the bench: raised, panelled, a ledge on top ──
        const B = BENCH;
        panels(g, B.x, B.x + B.w, B.y + 3, FLOOR, 21, 2);
        g.rect(B.x - 4, B.y, B.w + 8, 4, wood[4]!);
        g.hline(B.x - 4, B.x + B.w + 3, B.y, wood[5]!);
        g.hline(B.x - 4, B.x + B.w + 3, B.y + 4, wood[0]!);
        // the gavel and its block, a stack of files, the lamp (shade drawn per frame)
        g.rect(B.x + 70, B.y - 2, 8, 2, wood[4]!);
        g.rect(B.x + 81, B.y - 3, 9, 3, wood[3]!);
        g.hline(B.x + 81, B.x + 89, B.y - 3, wood[5]!);
        g.rect(B.x + 6, B.y - 4, 16, 4, paper);
        g.hline(B.x + 6, B.x + 21, B.y - 2, shade(paper, 0.6));
        g.rect(B.x + 7, B.y - 6, 14, 2, mix(paper, hex('#a87a5a'), 0.4));
        g.vline(B.x + 28, B.y - 9, B.y - 1, brass);
        g.rect(B.x + 25, B.y - 1, 7, 1, brass);

        // ── the witness stand at the right: box, rail, its own lamp ──
        const S = STAND;
        panels(g, S.x, S.x + S.w, S.y + 2, FLOOR + 4, 9, 2);
        g.rect(S.x - 2, S.y, S.w + 4, 3, wood[4]!);
        g.hline(S.x - 2, S.x + S.w + 1, S.y, wood[5]!);
        g.vline(S.x + S.w - 5, S.y - 8, S.y, brass);
        g.rect(S.x + S.w - 9, S.y - 11, 9, 3, lampG);
        g.hline(S.x + S.w - 9, S.x + S.w - 1, S.y - 11, mix(lampG, hex('#6aa078'), 0.5));
        // a glass of water for the witness
        g.rect(S.x + 4, S.y - 4, 3, 4, hex('#3a4a50'));
        g.px(S.x + 4, S.y - 4, hex('#8aa0a8'));

        // ── the floor: dark boards, the well, a runner carpet down the aisle ──
        g.vgrad([wood[2]!, wood[1]!, ink], FLOOR, Math.max(FLOOR + 70, g.bottom - 10), FLOOR);
        for (let y = FLOOR + 2, gap = 2; y < g.bottom; y += gap, gap = Math.min(gap + 1, 14)) g.hline(g.left, g.right, y, wood[0]!);
        // runner from the gallery up to the clerk
        g.poly([CLERK.x - 16, FLOOR + 4, CLERK.x + 16, FLOOR + 4, CLERK.x + 34, g.bottom, CLERK.x - 34, g.bottom], hex('#240d0c'));
        g.poly([CLERK.x - 13, FLOOR + 4, CLERK.x + 13, FLOOR + 4, CLERK.x + 30, g.bottom, CLERK.x - 30, g.bottom], hex('#2e1210'));

        // window light lying across the floor: long cool parallelograms
        for (const W of WINDOWS) {
          const cx = W.x + W.w / 2;
          const dir = cx < 160 ? 1 : -1;
          const y0 = FLOOR + 6;
          const y1 = FLOOR + 40;
          const sk = 0.9 * dir;
          for (let y = y0; y < y1; y++) {
            const u = (y - y0) / (y1 - y0);
            const xs = cx - W.w * 0.4 + (y - y0) * sk * 1.2;
            const k = 0.08 * (1 - u) * (W.x === 76 || W.x === 220 ? 1 : 0.7);
            for (let x = xs; x < xs + W.w * 0.8 + u * 8; x++) {
              const bar = Math.abs(((x - xs) / (W.w * 0.8)) * 3 - Math.round(((x - xs) / (W.w * 0.8)) * 3)) < 0.05;
              if (!bar) g.pxAdd(x, y, night, k);
            }
          }
        }

        // ── the clerk's desk, in front of the bench ──
        panels(g, CLERK.x - 26, CLERK.x + 26, CLERK.desk + 2, FLOOR + 8, 12, 2);
        g.rect(CLERK.x - 28, CLERK.desk, 56, 3, wood[4]!);
        g.hline(CLERK.x - 28, CLERK.x + 27, CLERK.desk, wood[5]!);
        // his microphone: a heavy desk mic on a little stand
        g.rect(CLERK.x + 9, CLERK.desk - 2, 7, 2, hex('#2a2a30'));
        g.vline(CLERK.x + 12, CLERK.desk - 8, CLERK.desk - 2, hex('#3a3a42'));
        g.ellipse(CLERK.x + 12, CLERK.desk - 11, 2, 3, hex('#4a4a54'));
        g.px(CLERK.x + 11, CLERK.desk - 12, hex('#9a9aa8'));
        g.rect(CLERK.x - 20, CLERK.desk - 2, 12, 2, paper);

        // ── counsel tables in the well: the defendant's (left) and the claimant's (right) ──
        for (const [tx, side] of [
          [DEF.x - 8, -1],
          [252, 1],
        ] as const) {
          g.rect(tx - 30, 122, 60, 3, wood[4]!);
          g.hline(tx - 30, tx + 29, 122, wood[5]!);
          g.rect(tx - 28, 125, 56, 12, wood[2]!);
          g.rect(tx - 26, 137, 3, 10, wood[1]!);
          g.rect(tx + 23, 137, 3, 10, wood[1]!);
          if (side > 0) {
            // the claimant's papers, very well organised
            for (let i = 0; i < 4; i++) g.rect(tx - 20 + i * 9, 120 - (i % 2), 7, 2, mix(paper, hex('#d0c8b0'), i * 0.1));
            g.rect(tx + 10, 119, 4, 3, hex('#3a3a40'));
          }
        }
        // the defendant's chair: we see its back; the glow sits in it (drawn per frame)
        g.rect(DEF.x - 7, 118, 14, 16, hex('#1a0e0c'));
        g.rect(DEF.x - 6, 119, 12, 13, hex('#2a1410'));
        g.vline(DEF.x - 6, 134, 146, hex('#120806'));
        g.vline(DEF.x + 5, 134, 146, hex('#120806'));
        g.rect(DEF.x - 8, 132, 16, 2, hex('#1a0e0c'));
        // the claimant's chairs, empty
        for (const cx of [238, 266]) {
          g.rect(cx - 6, 120, 12, 14, hex('#1a0e0c'));
          g.rect(cx - 5, 121, 10, 11, hex('#241210'));
          g.vline(cx - 5, 134, 146, hex('#120806'));
          g.vline(cx + 4, 134, 146, hex('#120806'));
        }

        // ── the bar: a rail with turned balusters, then the gallery pews ──
        g.rect(g.left, BAR, g.w, 3, wood[4]!);
        g.hline(g.left, g.right, BAR, wood[5]!);
        for (let x = Math.floor(g.left / 7) * 7; x < g.right; x += 7) {
          if (Math.abs(x - CLERK.x) < 12) continue; // the gate
          g.rect(x, BAR + 3, 2, 14, wood[2]!);
          g.px(x, BAR + 6, wood[4]!);
          g.px(x, BAR + 11, wood[4]!);
        }
        g.rect(g.left, BAR + 17, g.w, 2, wood[3]!);
        for (let row = 0; row < 6; row++) {
          const y = BAR + 30 + row * 20;
          if (y > g.bottom + 10) break;
          for (const [x0, x1] of [
            [g.left, CLERK.x - 22],
            [CLERK.x + 22, g.right],
          ] as const) {
            g.rect(x0, y, x1 - x0, 12, wood[1]!);
            g.hline(x0, x1, y, wood[4]!);
            g.hline(x0, x1, y + 1, wood[2]!);
            g.rect(x0, y + 12, x1 - x0, 2, ink);
          }
        }

        // ── light ──
        g.lighting(0.38);
        g.light(BENCH.x + 28, BENCH.y - 4, 46, 0.7, 34); // the bench lamp
        g.light(JUDGE.x, 56, 36, 0.35, 30);
        g.light(STAND.x + STAND.w - 5, STAND.y - 6, 30, 0.55, 26);
        g.light(DEF.x, 116, 28, 0.35, 24);
        g.light(CLERK.x, CLERK.desk - 4, 40, 0.3, 24);
        g.light(CREST.x, CREST.y, 30, 0.2, 22);
        for (const W of WINDOWS) g.lightRect(W.x, WIN_TOP + 8, W.w, WIN_BOT - WIN_TOP - 8, 0.25, 8);
        g.light(160, FLOOR + 22, 140, 0.18, 26);
        g.glow(BENCH.x + 28, BENCH.y - 6, 40, warm, 0.1, 6);
        g.glow(STAND.x + STAND.w - 5, STAND.y - 6, 26, warm, 0.08, 6);
        vignette(g, 0.5, 160, 84, 240, 190);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const live = 0.55 + 0.45 * f.awake;

        // rain on the windows
        for (const W of WINDOWS) {
          g.clip(W.x, WIN_TOP, W.w, WIN_BOT - WIN_TOP);
          rain(g, t, W.x, WIN_TOP, W.w, WIN_BOT - WIN_TOP, Math.round(W.w * 0.8), nightL, 0.32, 70, 0.06, 4, W.x);
          for (let i = 0; i < 4; i++) {
            // slow drops running down the glass
            const p = (t * (0.03 + hash3(i, W.x, 1) * 0.04) + hash3(i, W.x, 2)) % 1;
            const x = W.x + 1 + hash3(i, W.x, 3) * (W.w - 2);
            g.px(x, WIN_TOP + p * (WIN_BOT - WIN_TOP), mix(nightL, hex('#ffffff'), 0.3));
            g.pxA(x, WIN_TOP + p * (WIN_BOT - WIN_TOP) - 1, nightL, 0.5);
          }
          g.noClip();
        }
        // and the shadows of the drops crawling through the light on the floor
        for (let i = 0; i < 24; i++) {
          const W = WINDOWS[i % 4]!;
          const cx = W.x + W.w / 2;
          const dir = cx < 160 ? 1 : -1;
          const p = (t * 0.15 + hash3(i, 7)) % 1;
          const y = FLOOR + 6 + p * 30;
          const x = cx - W.w * 0.4 + hash3(i, 8) * W.w * 0.8 + (y - FLOOR - 6) * dir * 1.08;
          g.pxA(x, y, ink, 0.25 * (1 - p));
        }

        // the bench lamp: a green glass shade, a warm pool on the papers
        const sp = f.speech ?? 0;
        const isVoice = f.segmentKind === 'voice' || sp > 0.05;
        const lampX = BENCH.x + 28;
        const lampY = BENCH.y - 9;
        const lk = live * (0.95 + 0.05 * noise1(t * 1.5, 3) + sp * 0.25);
        g.poly([lampX - 9, lampY + 2, lampX + 9, lampY + 2, lampX + 6, lampY - 3, lampX - 6, lampY - 3], lampG);
        g.hline(lampX - 6, lampX + 5, lampY - 3, mix(lampG, hex('#7ab088'), 0.6));
        g.hline(lampX - 8, lampX + 8, lampY + 2, mix(warm, hex('#ffffff'), 0.3));
        g.glow(lampX, lampY + 3, 22 + sp * 6, warm, 0.22 * lk, 5);
        onAirLamp(g, CLERK.x + 18, CLERK.desk - 5, f);
        callLamp(g, STAND.x + 10, STAND.y - 3, f);

        // the judge, writing; she looks up now and then; the gavel when it's called for
        {
          const x = JUDGE.x;
          const y = JUDGE.y;
          const gavel = R(0) ? ev : -1;
          const looksUp = gavel >= 0 || sp > 0.15 || Math.sin(t * 0.23) > 0.75;
          const bob = (looksUp && sp <= 0.15) || f.reduced ? 0 : sp > 0.15 ? (Math.sin(t * 6.5) > 0.3 ? 1 : 0) : 1;
          // robes and shoulders
          g.poly([x - 10, BENCH.y, x - 9, y + 16, x - 4, y + 12, x + 4, y + 12, x + 9, y + 16, x + 10, BENCH.y], robe);
          g.poly([x - 3, y + 12, x + 3, y + 12, x, y + 18], hex('#c8c4bc')); // the collar
          g.vline(x - 9, y + 16, BENCH.y - 1, robeL);
          g.vline(x + 9, y + 16, BENCH.y - 1, robeL);
          // head: grey hair pinned up, spectacles catching the lamp
          const hy = y + bob;
          g.rect(x - 1, hy + 9, 3, 3, skinD);
          g.ellipse(x, hy + 4, 5, 5, hex('#4e4a44')); // grey hair, pinned up
          g.disc(x, hy - 2, 2, hex('#5a564e'));
          g.px(x - 1, hy - 3, hex('#7a7468'));
          g.ellipse(x, hy + 6, 3, 4, skinD);
          g.ellipse(x - 1, hy + 7, 2, 2, mix(skinD, skin, 0.45));
          g.vline(x - 3, hy + 4, hy + 8, mix(skinD, warm, 0.35));
          g.hline(x - 4, x - 1, hy + 1, hex('#7a7468'));
          g.vline(x + 4, hy + 2, hy + 6, hex('#3e3a34'));
          // spectacles: two small glints from the lamp, lower when she's reading
          const gy = hy + (looksUp ? 5 : 6);
          g.px(x - 2, gy, mix(skinD, warm, 0.7));
          g.px(x + 2, gy, mix(skinD, warm, 0.5));
          g.px(x, gy, skinD);
          // the writing hand (or the gavel)
          if (gavel >= 0) {
            const up = smoothstep(0.6, 1.4, gavel) * (1 - smoothstep(2.6, 2.75, gavel));
            const gx = BENCH.x + 74;
            const gy = BENCH.y - 4 - Math.round(up * 10);
            g.line(x + 8, y + 18, gx - 2, gy + 2, robe);
            g.rect(gx - 4, gy - 1, 8, 3, wood[4]!);
            g.hline(gx - 4, gx + 3, gy - 1, wood[5]!);
            g.line(gx, gy + 2, gx - 4, gy + 6, wood[4]!);
            if (gavel > 2.7 && gavel < 3.6) {
              const p = (gavel - 2.7) / 0.9;
              for (let i = 0; i < 6; i++) g.pxA(BENCH.x + 85 + (hash3(i, 1) - 0.5) * 12 * p, BENCH.y - 4 - hash3(i, 2) * 6 * p, hex('#8a7a60'), 0.5 * (1 - p));
            }
          } else {
            const wx = x - 6 + (f.reduced ? 0 : Math.round(Math.sin(t * 2.3) * 2 + noise1(t * 4, 1)));
            g.line(x - 7, y + 18, wx, BENCH.y - 2, robe);
            g.px(wx, BENCH.y - 2, skin);
            g.px(wx + 1, BENCH.y - 3, hex('#1a1a1a'));
          }
        }

        // the clerk, reading the case into his microphone (or unrolling the list)
        {
          const x = CLERK.x - 4;
          const y = CLERK.desk - 22;
          const reads = (isVoice || f.energy > 0.15) && !f.reduced;
          const nod = reads && Math.sin(t * (isVoice ? 8 : 6)) > 0.3 ? 1 : 0;
          if (isVoice) {
            g.px(CLERK.x + 12, CLERK.desk - 13, hex('#ff5040'));
            g.glow(CLERK.x + 12, CLERK.desk - 11, 6 + sp * 8, warm, 0.18 + sp * 0.32, 3);
          }
          const suit = hex('#16161c');
          g.poly([x - 9, CLERK.desk, x - 8, y + 12, x + 8, y + 12, x + 9, CLERK.desk], suit);
          g.vline(x - 8, y + 12, CLERK.desk - 1, hex('#24242c'));
          g.poly([x - 2, y + 12, x + 2, y + 12, x, y + 17], hex('#9a968c'));
          g.rect(x - 1, y + 9 + nod, 3, 3, skinD);
          g.ellipse(x, y + 5 + nod, 4, 5, skinD);
          g.ellipse(x - 1, y + 3 + nod, 3, 2, mix(skinD, skin, 0.35)); // bald, a little lamp-shine
          g.px(x - 2, y + 1 + nod, mix(skin, warm, 0.4));
          g.px(x - 1, y + 1 + nod, mix(skinD, skin, 0.5));
          g.hline(x - 4, x - 3, y + 6 + nod, hex('#2a2420'));
          g.hline(x + 3, x + 4, y + 6 + nod, hex('#2a2420'));
          if (R(3)) {
            // the list: unrolls over the desk front and keeps going
            const p = smoothstep(1, 7, ev);
            const len = Math.round(p * 40);
            g.rect(x - 4, CLERK.desk - 4, 8, 3, paper);
            g.rect(x - 3, CLERK.desk - 1, 6, Math.min(len, FLOOR + 10 - CLERK.desk), paper);
            for (let k = 3; k < Math.min(len, FLOOR + 10 - CLERK.desk); k += 2) g.hline(x - 2, x + 1 + ((hash3(k, 4) * 2) | 0), CLERK.desk - 1 + k, shade(paper, 0.55));
            if (len > FLOOR + 10 - CLERK.desk) g.rect(x - 3, FLOOR + 9, 6 + (len - (FLOOR + 10 - CLERK.desk)), 2, paper);
            g.line(x - 8, y + 14, x - 4, CLERK.desk - 3, suit);
            g.line(x + 8, y + 14, x + 4, CLERK.desk - 3, suit);
          } else {
            g.line(x - 7, y + 14, x - 12, CLERK.desk - 2, suit);
            g.px(x - 12, CLERK.desk - 2, skin);
          }
        }

        // the witness stand's lamp, and the weather taking the stand
        {
          const sx = STAND.x + STAND.w - 5;
          g.glow(sx, STAND.y - 7, 14, warm, 0.24 * live, 5);
          if (R(2)) {
            const a = envelope(ev, 10, 2, 2);
            const cx = STAND.x + 12;
            const cy = STAND.y - 18;
            const cloud = mix(hex('#2a3040'), hex('#8a94a8'), 0.5);
            for (let i = 0; i < 6; i++) g.ellipseA(cx - 7 + i * 3, cy + (i % 2), 4, 3, cloud, a * 0.85);
            g.ellipseA(cx, cy - 2, 5, 3, mix(cloud, hex('#ffffff'), 0.2), a * 0.8);
            if (a > 0.5) {
              g.clip(STAND.x, cy + 3, STAND.w, STAND.y - cy - 3);
              rain(g, t, cx - 8, cy + 3, 16, STAND.y - cy - 3, 6, nightL, 0.6 * a, 60, 0, 3, 11);
              g.noClip();
            }
          }
        }

        // the defendant: a soft glow sitting in the chair, breathing
        {
          const rise = R(1) ? envelope(ev, 10, 2.5, 3) : 0;
          const b = f.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.9);
          const x = DEF.x + (R(1) ? Math.round(Math.sin(ev * 1.2) * 2 * rise) : 0);
          const y = 112 - Math.round(rise * 7) + (f.reduced ? 0 : Math.round(Math.sin(t * 0.6)));
          const k = (0.7 + 0.3 * live) * (1 + rise * 0.5);
          g.glow(x, y + 2, 20 + b * 3, wisp, (0.12 + 0.05 * b) * k, 6);
          // a soft, roughly seated shape of light: wider at the base, a rounder head
          g.ellipseA(x, y + 5, 5, 4, wisp, 0.3);
          g.ellipseA(x, y - 1, 3, 3, wisp, 0.4 + 0.15 * b);
          g.ellipseA(x, y - 1, 2, 2, mix(wisp, hex('#ffffff'), 0.5), 0.35 + 0.25 * b);
          // a wisp curling off the top
          if (!f.reduced) for (let i = 0; i < 4; i++) {
            const p = (t * 0.25 + i / 4) % 1;
            g.pxA(x + Math.sin(p * 6 + i) * 1.5, y - 4 - p * 8, wisp, 0.35 * (1 - p));
          }
          // the chair back sits in front of it, lit along its edges
          const edge = mix(hex('#2a1410'), wisp, 0.3 + 0.15 * b);
          g.rect(DEF.x - 7, 118, 14, 16, hex('#1a0e0c'));
          g.rect(DEF.x - 6, 119, 12, 13, hex('#24110e'));
          g.hline(DEF.x - 6, DEF.x + 5, 118, edge);
          g.vline(DEF.x - 7, 119, 128, mix(hex('#1a0e0c'), wisp, 0.15));
          g.vline(DEF.x + 6, 119, 128, mix(hex('#1a0e0c'), wisp, 0.15));
        }

        // the crest catches a little lamplight
        g.glow(CREST.x, CREST.y - 4, 18, warm, 0.05 * live, 4);
      },
    };
  },
};

export default def;
