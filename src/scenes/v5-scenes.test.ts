import { describe, expect, it } from 'vitest';
import { applyBroadcastLens, callLamp, onAirLamp, sectionDrive } from './kit/broadcast';
import { hex, luma, rgb } from './kit/color';
import { Gfx } from './kit/gfx';
import { Rng, hashString } from './kit/rng';
import { loadScene } from './registry';
import { SceneRunner } from './runner';
import type { Frame } from './types';

function makeFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    t: 2.4,
    dt: 0.05,
    energy: 0.4,
    pulse: 0.2,
    beat: 4,
    awake: 1,
    playing: true,
    reduced: false,
    rareT: Infinity,
    rare: 0,
    rareSeed: 0.5,
    hour: 22,
    n: 48,
    segmentKind: 'music',
    voiceCategory: null,
    speech: 0,
    section: 'verse',
    sectionProgress: 0.5,
    event: null,
    hush: false,
    signal: 1,
    bleed: 0,
    ...overrides,
  };
}

function makePatternedBuf(w: number, h: number): Int32Array {
  const buf = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      buf[y * w + x] = rgb(30 + ((x * 5 + y * 3) & 63), 36 + ((x * 3 + y * 7) & 63), 48 + ((x * 7 + y * 5) & 63));
    }
  }
  return buf;
}

describe('broadcast scene kit helpers (v5)', () => {
  it('onAirLamp is dim on music and lights up warm red/amber with halo modulation on voice/speech', () => {
    const gMusic = new Gfx(64, 48);
    gMusic.fill(rgb(16, 16, 20));
    gMusic.lighting(0.4);
    onAirLamp(gMusic, 24, 20, makeFrame({ segmentKind: 'music', speech: 0 }));

    const gVoiceLow = new Gfx(64, 48);
    gVoiceLow.fill(rgb(16, 16, 20));
    gVoiceLow.lighting(0.4);
    onAirLamp(gVoiceLow, 24, 20, makeFrame({ segmentKind: 'voice', speech: 0.15 }));

    const gVoiceHigh = new Gfx(64, 48);
    gVoiceHigh.fill(rgb(16, 16, 20));
    gVoiceHigh.lighting(0.4);
    onAirLamp(gVoiceHigh, 24, 20, makeFrame({ segmentKind: 'voice', speech: 0.95 }));

    // Core lamp pixel is brighter on voice than music, and brighter at high speech.
    expect(luma(gVoiceLow.get(26, 21))).toBeGreaterThan(luma(gMusic.get(26, 21)) + 30);
    expect(luma(gVoiceHigh.get(26, 21))).toBeGreaterThan(luma(gVoiceLow.get(26, 21)));

    // Halo around the lamp (and exposure map) modulates with speech.
    expect(luma(gVoiceHigh.get(26, 15))).toBeGreaterThan(luma(gVoiceLow.get(26, 15)));
    expect(gVoiceHigh.exposureAt(26, 21)).toBeGreaterThan(gVoiceLow.exposureAt(26, 21));
    expect(gVoiceLow.exposureAt(26, 21)).toBeGreaterThan(gMusic.exposureAt(26, 21));

    // Labelled studio sign variant also lights up and draws ON AIR text.
    const gLabelMusic = new Gfx(80, 48);
    gLabelMusic.fill(rgb(16, 16, 20));
    onAirLamp(gLabelMusic, 20, 18, makeFrame({ segmentKind: 'music', speech: 0 }), { label: true });

    const gLabelVoice = new Gfx(80, 48);
    gLabelVoice.fill(rgb(16, 16, 20));
    onAirLamp(gLabelVoice, 20, 18, makeFrame({ segmentKind: 'voice', speech: 0.85 }), { label: true });

    expect(luma(gLabelVoice.get(34, 22))).toBeGreaterThan(luma(gLabelMusic.get(34, 22)) + 30);
  });

  it('callLamp stays dark normally and blinks amber/cyan when voiceCategory is call', () => {
    const gIdle = new Gfx(48, 48);
    gIdle.fill(rgb(14, 14, 18));
    callLamp(gIdle, 24, 24, makeFrame({ voiceCategory: 'dj', speech: 0.6 }));

    const gCallA = new Gfx(48, 48);
    gCallA.fill(rgb(14, 14, 18));
    callLamp(gCallA, 24, 24, makeFrame({ voiceCategory: 'call', speech: 0.6, t: 0.05 }));

    const gCallB = new Gfx(48, 48);
    gCallB.fill(rgb(14, 14, 18));
    callLamp(gCallB, 24, 24, makeFrame({ voiceCategory: 'call', speech: 0.6, t: 0.35 }));

    expect(luma(gCallA.get(24, 24))).toBeGreaterThan(luma(gIdle.get(24, 24)) + 40);
    expect(luma(gCallB.get(24, 24))).toBeGreaterThan(luma(gIdle.get(24, 24)) + 40);
    // Color shifts between amber and cyan across time.
    expect(gCallA.get(23, 23)).not.toBe(gCallB.get(23, 23));
  });

  it('sectionDrive returns the expected multipliers across musical sections', () => {
    expect(sectionDrive(makeFrame({ section: 'drop' }))).toBe(1.35);
    expect(sectionDrive(makeFrame({ section: 'chorus' }))).toBe(1.18);
    expect(sectionDrive(makeFrame({ section: 'verse' }))).toBe(1.0);
    expect(sectionDrive(makeFrame({ section: 'intro' }))).toBe(0.8);
    expect(sectionDrive(makeFrame({ section: 'outro' }))).toBe(0.8);
    expect(sectionDrive(makeFrame({ section: 'breakdown' }))).toBe(0.65);
  });
});

describe('applyBroadcastLens post-raster effects', () => {
  const w = 80;
  const h = 60;
  const accent = hex('#ff8844');

  it('applies scanline shear and ionisation flecks during dimensional-storm', () => {
    const base = makePatternedBuf(w, h);
    const out = base.slice();
    applyBroadcastLens(out, w, h, makeFrame({ event: 'dimensional-storm', t: 1.7 }), accent);
    let diffs = 0;
    for (let i = 0; i < out.length; i++) if (out[i] !== base[i]) diffs++;
    expect(diffs).toBeGreaterThan(w * 2);
    expect(out.every((c) => c >>> 24 === 255)).toBe(true);
  });

  it('applies a golden/violet aurora shimmer along the top 16 rows during convergence', () => {
    const base = makePatternedBuf(w, h);
    const out = base.slice();
    applyBroadcastLens(out, w, h, makeFrame({ event: 'convergence', t: 2.1 }), accent);
    // Top 16 rows are tinted; rows below 16 are untouched.
    let topDiffs = 0;
    for (let i = 0; i < 16 * w; i++) if (out[i] !== base[i]) topDiffs++;
    expect(topDiffs).toBe(16 * w);
    for (let i = 16 * w; i < out.length; i++) expect(out[i]).toBe(base[i]);
  });

  it('applies a concentric carrier ripple near the centre during signal-from-beyond', () => {
    const base = makePatternedBuf(w, h);
    const out = base.slice();
    applyBroadcastLens(out, w, h, makeFrame({ event: 'signal-from-beyond', t: 1.2 }), accent);
    let centerDiffs = 0;
    for (let y = 15; y < 45; y++) {
      for (let x = 20; x < 60; x++) {
        if (out[y * w + x] !== base[y * w + x]) centerDiffs++;
      }
    }
    expect(centerDiffs).toBeGreaterThan(50);
    // Far corners remain untouched.
    expect(out[0]).toBe(base[0]);
    expect(out[w * h - 1]).toBe(base[w * h - 1]);
  });

  it('applies horizontal sine-wave tape-flutter displacement during time-slip', () => {
    const base = makePatternedBuf(w, h);
    const out = base.slice();
    applyBroadcastLens(out, w, h, makeFrame({ event: 'time-slip', t: 0.9 }), accent);
    let diffs = 0;
    for (let i = 0; i < out.length; i++) if (out[i] !== base[i]) diffs++;
    expect(diffs).toBeGreaterThan(w * 10);
  });

  it('sweeps a 1 px amber terminal scanline bar when hush is true', () => {
    const base = makePatternedBuf(w, h);
    const out = base.slice();
    const f = makeFrame({ hush: true, t: 0.5 });
    applyBroadcastLens(out, w, h, f, accent);
    const changedRows = new Set<number>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (out[y * w + x] !== base[y * w + x]) changedRows.add(y);
      }
    }
    expect(changedRows.size).toBe(1);
  });

  it('interlaces ghost scanlines on odd rows when bleed > 0.1 proportional to bleed', () => {
    const base = makePatternedBuf(w, h);
    const low = base.slice();
    const high = base.slice();
    applyBroadcastLens(low, w, h, makeFrame({ bleed: 0.2 }), accent);
    applyBroadcastLens(high, w, h, makeFrame({ bleed: 0.85 }), accent);

    // Even rows untouched; odd rows modified more strongly at higher bleed.
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x++) {
        expect(low[y * w + x]).toBe(base[y * w + x]);
        expect(high[y * w + x]).toBe(base[y * w + x]);
      }
    }
    let oddDiffLow = 0;
    let oddDiffHigh = 0;
    for (let y = 1; y < h; y += 2) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        oddDiffLow += Math.abs((low[i]! & 255) - (base[i]! & 255));
        oddDiffHigh += Math.abs((high[i]! & 255) - (base[i]! & 255));
      }
    }
    expect(oddDiffLow).toBeGreaterThan(0);
    expect(oddDiffHigh).toBeGreaterThan(oddDiffLow);
  });

  it('skips flashing and displacement effects when reduced motion is enabled', () => {
    const base = makePatternedBuf(w, h);
    const out = base.slice();
    applyBroadcastLens(
      out,
      w,
      h,
      makeFrame({
        reduced: true,
        event: 'dimensional-storm',
        hush: true,
        bleed: 0.8,
      }),
      accent,
    );
    expect(Array.from(out)).toEqual(Array.from(base));
  });
});

describe('SceneRunner with broadcast input & upgraded flagship scenes', () => {
  it('propagates broadcast state into Frame, eases speech with dt, and runs applyBroadcastLens', async () => {
    const def = await loadScene('radio-booth');
    const container = { clientWidth: 320, clientHeight: 180 } as unknown as HTMLElement;
    let putCount = 0;
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: () => ({
        putImageData: () => {
          putCount++;
        },
      }),
    } as unknown as HTMLCanvasElement;

    let state = {
      segmentKind: 'voice' as const,
      voiceCategory: 'call' as const,
      speech: 0.9,
      section: 'drop' as const,
      sectionProgress: 0.4,
      event: 'convergence' as const,
      hush: true,
      signal: 0.85,
      bleed: 0.35,
    };

    const runner = new SceneRunner(container, canvas, def, '#ff6644', {
      playing: true,
      reducedMotion: false,
      broadcast: () => state,
    });

    expect(putCount).toBeGreaterThanOrEqual(1);
    expect(runner.frame.segmentKind).toBe('voice');
    expect(runner.frame.voiceCategory).toBe('call');
    expect(runner.frame.section).toBe('drop');
    expect(runner.frame.event).toBe('convergence');
    expect(runner.frame.hush).toBe(true);
    expect(runner.frame.bleed).toBe(0.35);

    // Change target speech to 0 and advance by a small dt: speech eases smoothly rather than snapping.
    state = { ...state, speech: 0 };
    runner.draw(0.05);
    expect(runner.frame.speech).toBeGreaterThan(0.1);
    expect(runner.frame.speech).toBeLessThan(0.9);

    runner.destroy();
  });

  it('renders all 12 upgraded flagship studio, talk, and club scenes with broadcast reactivity', async () => {
    const scenes = [
      'radio-booth',
      'two-booths',
      'newsroom',
      'courtroom',
      'radio-theatre',
      'switchboard',
      'pirate-attic',
      'roller-disco',
      'last-rave',
      'cloud-club',
      'supernova-casino',
      'cat-studio',
    ] as const;

    for (const id of scenes) {
      const def = await loadScene(id);
      const g = new Gfx(320, 180, 0, 0);
      const scene = def.create({
        accent: hex('#ff8833'),
        rng: new Rng(hashString(id)),
        variant: hashString(id),
      });
      g.target(g.bg);
      scene.background(g);
      g.target();

      // Render during a calm music breakdown.
      g.restore();
      scene.frame(
        g,
        makeFrame({
          segmentKind: 'music',
          voiceCategory: null,
          speech: 0,
          section: 'breakdown',
        }),
      );
      const calmFrame = g.frame.slice();

      // Render during an energetic drop + active call-in voice speech.
      g.restore();
      scene.frame(
        g,
        makeFrame({
          segmentKind: 'voice',
          voiceCategory: 'call',
          speech: 0.9,
          section: 'drop',
        }),
      );
      const activeFrame = g.frame.slice();

      let diffPixels = 0;
      for (let i = 0; i < calmFrame.length; i++) {
        if (calmFrame[i] !== activeFrame[i]) diffPixels++;
      }
      expect(diffPixels, `${id} should react visibly to speech/call/section`).toBeGreaterThan(10);
      expect(activeFrame.every((c) => c >>> 24 === 255), `${id} opaque pixels`).toBe(true);
    }
  });
});
