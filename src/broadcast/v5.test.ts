// v5 broadcast & audio tests (docs/V5-PLAN.md, Pillars 3, 4 & 5):
//   - Nightjar Cabin Ambience generator (CabinAmbience)
//   - Talkover intros ("hitting the post") & melodic station jingles in computeRuns / request
//   - Musical section normalization & speech envelope
//   - Relay Fleet Presence engine (fleet telemetry, subspace wire pings, cross-instance sync)
//   - BroadcastStore v5 state/actions & getBroadcastSceneState()

import { describe, expect, it, vi } from 'vitest';
import { stationById } from '../stations/roster';
import { SHIP } from '../stations/ship';
import { CABIN_MAX_GAIN, CabinAmbience } from './cabin';
import { normalizeMusicSection, request } from './director';
import {
  FLEET_BUCKET_MS,
  FLEET_VESSELS,
  PING_BUCKET_MS,
  RelayPresence,
  buildRelayPing,
  fleetPeersAt,
  fleetPingsAt,
} from './presence';
import { StationSchedule, computeRuns } from './scheduler';
import { storage } from './storage';
import { director, getBroadcastSceneState, useBroadcast } from './store';
import { fixedTzOffset } from './time';
import type { Segment, StationDef, TrackSegment, VoiceCategory, VoiceClip, VoiceSegment } from './types';

const UTC = fixedTzOffset(0);

const station = (id: string): StationDef => {
  const s = stationById(id);
  if (!s) throw new Error(`missing station ${id}`);
  return s;
};

function makeFakeAudioContext() {
  const makeParam = (initial = 0) => ({
    value: initial,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(function (this: { value: number }, v: number) {
      this.value = v;
    }),
    linearRampToValueAtTime: vi.fn(function (this: { value: number }, v: number) {
      this.value = v;
    }),
    exponentialRampToValueAtTime: vi.fn(function (this: { value: number }, v: number) {
      this.value = v;
    }),
    setTargetAtTime: vi.fn(function (this: { value: number }, v: number) {
      this.value = v;
    }),
  });

  const makeNode = () => {
    const node = {
      connect: vi.fn((dest: unknown) => dest),
      disconnect: vi.fn(),
    };
    return node;
  };

  const gains: Array<ReturnType<typeof makeNode> & { gain: ReturnType<typeof makeParam> }> = [];
  const oscillators: Array<
    ReturnType<typeof makeNode> & {
      type: string;
      frequency: ReturnType<typeof makeParam>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }
  > = [];
  const bufferSources: Array<
    ReturnType<typeof makeNode> & {
      buffer: unknown;
      loop: boolean;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }
  > = [];

  const ctx = {
    currentTime: 10,
    sampleRate: 8000,
    destination: makeNode(),
    createGain: vi.fn(() => {
      const g = { ...makeNode(), gain: makeParam(1) };
      gains.push(g);
      return g;
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        ...makeNode(),
        type: 'sine',
        frequency: makeParam(440),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createBiquadFilter: vi.fn(() => ({
      ...makeNode(),
      type: 'lowpass',
      frequency: makeParam(350),
      Q: makeParam(1),
    })),
    createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return {
        duration: length / sampleRate,
        length,
        sampleRate,
        numberOfChannels: 1,
        getChannelData: () => data,
      };
    }),
    createBufferSource: vi.fn(() => {
      const src = {
        ...makeNode(),
        buffer: null as unknown,
        loop: false,
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(src);
      return src;
    }),
  };

  return {
    ctx: ctx as unknown as AudioContext,
    destination: ctx.destination as unknown as AudioNode,
    gains,
    oscillators,
    bufferSources,
  };
}

let clipSeq = 0;
function makeClip(owner: string, category: VoiceCategory, durationSec = 8, overMusic = true): VoiceClip {
  const id = `${category}-${++clipSeq}`;
  return {
    id,
    category,
    url: `/voice/${owner}/${id}.mp3`,
    durationMs: durationSec * 1000,
    overMusic,
    lines: [{ speaker: 'Host', text: `Line from ${id}`, startMs: 0 }],
  };
}

// ── 1. Nightjar Cabin Ambience Generator ─────────────────────────────────────

describe('CabinAmbience (src/broadcast/cabin.ts)', () => {
  it('lazily starts nodes when level > 0, clamps 0..1, and scales master gain by CABIN_MAX_GAIN', () => {
    const { ctx, destination, gains, oscillators, bufferSources } = makeFakeAudioContext();
    const cabin = new CabinAmbience(ctx, destination);

    expect(cabin.active).toBe(false);
    expect(cabin.level).toBe(0);
    expect(oscillators.length).toBe(0);

    cabin.setLevel(0.5);
    expect(cabin.active).toBe(true);
    expect(cabin.level).toBe(0.5);
    // 2 thruster oscillators + 1 thruster LFO + 1 ventilation LFO + 1 120Hz hum oscillator = 5 oscillators
    expect(oscillators.length).toBe(5);
    expect(bufferSources.length).toBe(1);
    expect(bufferSources[0]!.loop).toBe(true);
    // Master gain ramps to 0.5 * CABIN_MAX_GAIN
    expect(gains[0]!.gain.value).toBeCloseTo(0.5 * CABIN_MAX_GAIN, 5);

    // Clamps above 1
    cabin.setLevel(2.5);
    expect(cabin.level).toBe(1);
    expect(gains[0]!.gain.value).toBeCloseTo(CABIN_MAX_GAIN, 5);
  });

  it('ramps down and releases nodes after timeout when level === 0 or disposed', () => {
    vi.useFakeTimers();
    try {
      const { ctx, destination, oscillators } = makeFakeAudioContext();
      const cabin = new CabinAmbience(ctx, destination);

      cabin.setLevel(0.8);
      expect(cabin.active).toBe(true);

      cabin.setLevel(0);
      expect(cabin.level).toBe(0);
      // Still active briefly while ramping down
      expect(cabin.active).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(cabin.active).toBe(false);
      for (const osc of oscillators) {
        expect(osc.stop).toHaveBeenCalled();
      }

      // Can restart cleanly after release
      cabin.setLevel(0.4);
      expect(cabin.active).toBe(true);
      cabin.dispose();
      expect(cabin.active).toBe(false);
      expect(cabin.level).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── 2. Talkover Intros & Melodic Station Jingles ─────────────────────────────

describe('computeRuns & request talkover/jingle wiring', () => {
  it('computes talkoverSeconds, jingle, and stationId when bed voice clips precede a track', () => {
    const s = station('void-beats');
    const identSeg: VoiceSegment = {
      kind: 'voice',
      id: 'void-beats:100:0',
      stationId: s.id,
      startMs: 10_000,
      durationMs: 4200,
      clip: makeClip(s.id, 'id', 4.2, true),
      bed: true,
    };
    const djSeg: VoiceSegment = {
      kind: 'voice',
      id: 'void-beats:100:1',
      stationId: s.id,
      startMs: 14_200,
      durationMs: 11_300,
      clip: makeClip(s.id, 'dj', 11.3, true),
      bed: true,
    };
    const trackSeg: TrackSegment = {
      kind: 'track',
      id: 'void-beats:100:2',
      stationId: s.id,
      startMs: 25_500,
      durationMs: 180_000,
      recipe: s.recipe,
      seed: 42,
      meta: { title: 'Test Track', artist: 'Test Artist' },
    };
    const adSeg: VoiceSegment = {
      kind: 'voice',
      id: 'void-beats:100:3',
      stationId: s.id,
      startMs: 205_500,
      durationMs: 20_000,
      clip: makeClip('_shared', 'ad', 20, false),
      bed: false,
    };
    const trailingBedIdent: VoiceSegment = {
      kind: 'voice',
      id: 'void-beats:100:4',
      stationId: s.id,
      startMs: 225_500,
      durationMs: 5000,
      clip: makeClip(s.id, 'id', 5, true),
      bed: true,
    };

    const segments: Segment[] = [identSeg, djSeg, trackSeg, adSeg, trailingBedIdent];
    const runs = computeRuns(s, segments, undefined, UTC);

    expect(runs).toHaveLength(2);
    // First run: carries ident + dj bed over track intro
    expect(runs[0]!.startMs).toBe(10_000);
    expect(runs[0]!.endMs).toBe(205_500);
    expect(runs[0]!.talkoverSeconds).toBe(15.5);
    expect(runs[0]!.jingle).toBe(true);
    expect(runs[0]!.stationId).toBe('void-beats');

    // Request forwards talkoverSeconds, jingle, and stationId to the music engine
    const req = request(runs[0]!);
    expect(req.talkoverSeconds).toBe(15.5);
    expect(req.jingle).toBe(true);
    expect(req.stationId).toBe('void-beats');

    // Second run: standalone bed flushed at end of segments
    expect(runs[1]!.id).toContain('bed:');
    expect(runs[1]!.jingle).toBe(true);
    expect(runs[1]!.stationId).toBe('void-beats');
  });

  it('produces talkoverSeconds on real StationSchedule hours when idents/links precede tracks', () => {
    const s = station('void-beats');
    const schedule = new StationSchedule(
      s,
      {
        own: [
          makeClip(s.id, 'id', 4, true),
          makeClip(s.id, 'id', 5, true),
          makeClip(s.id, 'dj', 12, true),
          makeClip(s.id, 'dj', 14, true),
        ],
        shared: [],
      },
      { tzOffset: UTC },
    );
    const runs = schedule.runsInHour(500);
    expect(runs.length).toBeGreaterThan(0);
    // Top-of-hour ident precedes the opening track
    expect(runs[0]!.talkoverSeconds).toBeGreaterThan(0);
    expect(runs[0]!.jingle).toBe(true);
    expect(runs[0]!.stationId).toBe('void-beats');
  });

  it('normalizes musical section names accurately', () => {
    expect(normalizeMusicSection('intro')).toBe('intro');
    expect(normalizeMusicSection('outro')).toBe('outro');
    expect(normalizeMusicSection('B')).toBe('chorus');
    expect(normalizeMusicSection('B′')).toBe('chorus');
    expect(normalizeMusicSection('bridge')).toBe('chorus');
    expect(normalizeMusicSection('C')).toBe('breakdown');
    expect(normalizeMusicSection('breakdown')).toBe('breakdown');
    expect(normalizeMusicSection('drop')).toBe('drop');
    expect(normalizeMusicSection('A′', 'drum-and-bass')).toBe('drop');
    expect(normalizeMusicSection('A′', 'lofi-hiphop')).toBe('verse');
    expect(normalizeMusicSection('A')).toBe('verse');
  });
});

// ── 3. Relay Fleet Presence Engine ───────────────────────────────────────────

describe('RelayPresence (src/broadcast/presence.ts)', () => {
  const T0 = Date.UTC(2026, 9, 28, 12, 0, 0);

  it('generates 18–32 deterministic sister relay peers per 3-minute bucket', () => {
    const peersA = fleetPeersAt(T0);
    const peersB = fleetPeersAt(T0 + 60_000); // same 3-minute bucket
    const peersNext = fleetPeersAt(T0 + FLEET_BUCKET_MS); // next 3-minute bucket

    expect(peersA.length).toBeGreaterThanOrEqual(18);
    expect(peersA.length).toBeLessThanOrEqual(32);
    expect(peersA).toEqual(peersB);
    expect(peersNext).not.toEqual(peersA);

    for (const p of peersA) {
      expect(FLEET_VESSELS).toContain(p.id);
      expect(p.frequency).toBeGreaterThanOrEqual(76);
      expect(p.frequency).toBeLessThanOrEqual(160);
    }
  });

  it('generates deterministic subspace wire pings per 2-minute bucket', () => {
    const pingsA = fleetPingsAt(T0, 8);
    const pingsB = fleetPingsAt(T0 + 30_000, 8); // same 2-minute bucket
    const pingsNext = fleetPingsAt(T0 + PING_BUCKET_MS, 8);

    expect(pingsA).toHaveLength(8);
    expect(pingsA).toEqual(pingsB);
    expect(pingsNext[0]!.id).not.toBe(pingsA[0]!.id);
    for (const ping of pingsA) {
      expect(FLEET_VESSELS).toContain(ping.relay);
      expect(ping.text.length).toBeGreaterThan(10);
      expect(['LOCK', 'SIG', 'ECHO', 'ANOM', 'DRIFT']).toContain(ping.code);
    }
  });

  it('builds rich in-universe pings from R/S NIGHTJAR · RELAY 7 via buildPing', () => {
    const vb = station('void-beats');
    const stationPing = buildRelayPing(vb.frequency, { kind: 'station', station: vb }, undefined, undefined, T0);
    expect(stationPing.relay).toBe(SHIP.designation);
    expect(stationPing.stationId).toBe('void-beats');
    expect(stationPing.stationName).toBe('Void Beats');
    expect(stationPing.code).toBe('LOCK');
    expect(stationPing.live).toBe(true);
    expect(stationPing.text).toContain('Void Beats');

    const staticPing = buildRelayPing(142.35, { kind: 'static' }, 'Custom static report', 'ANOM', T0);
    expect(staticPing.stationId).toBeNull();
    expect(staticPing.stationName).toBe('Deep Band Static');
    expect(staticPing.code).toBe('ANOM');
    expect(staticPing.text).toBe('Custom static report');
  });

  it('synchronizes live peer tunes and pings across RelayPresence instances', () => {
    const presenceA = new RelayPresence({ peerId: 'R/S NIGHTJAR · TAB A' });
    const presenceB = new RelayPresence({ peerId: 'R/S NIGHTJAR · TAB B' });
    try {
      const vb = station('void-beats');
      presenceA.announceTune(vb.frequency, vb.id, T0);

      const peersOnB = presenceB.peersAt(T0);
      const livePeer = peersOnB.find((p) => p.id === 'R/S NIGHTJAR · TAB A');
      expect(livePeer).toBeDefined();
      expect(livePeer?.live).toBe(true);
      expect(livePeer?.frequency).toBe(vb.frequency);
      expect(livePeer?.stationId).toBe(vb.id);

      const sent = presenceA.sendPing(
        vb.frequency,
        { kind: 'station', station: vb },
        'Signal clear on Tab A.',
        'LOCK',
        T0 + 500,
      );
      const pingsOnB = presenceB.pingsAt(T0);
      expect(pingsOnB[0]?.id).toBe(sent.id);
      expect(pingsOnB[0]?.text).toBe('Signal clear on Tab A.');
      expect(pingsOnB[0]?.live).toBe(true);
    } finally {
      presenceA.dispose();
      presenceB.dispose();
    }
  });
});

// ── 4. Store v5 Actions, Storage & getBroadcastSceneState ────────────────────

describe('useBroadcast v5 actions & getBroadcastSceneState()', () => {
  it('sets and toggles cabin ambience and persists to storage', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
      clear: () => mem.clear(),
    });
    try {
      const store = useBroadcast.getState();
      store.setCabin?.(0);
      expect(useBroadcast.getState().cabin).toBe(0);

      store.setCabin?.(0.75);
      expect(useBroadcast.getState().cabin).toBe(0.75);
      expect(director.cabin).toBe(0.75);
      expect(storage.getCabin()).toBeCloseTo(0.75, 2);

      store.toggleCabin?.();
      expect(useBroadcast.getState().cabin).toBe(0);

      store.toggleCabin?.();
      expect(useBroadcast.getState().cabin).toBe(0.75);

      // Reset to 0 after test
      store.setCabin?.(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('transmits a subspace ping via sendPing and persists pings in storage', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
      clear: () => mem.clear(),
    });
    try {
      const stateBefore = useBroadcast.getState();
      expect(stateBefore.relays?.length).toBeGreaterThanOrEqual(18);
      expect(stateBefore.pings?.length).toBeGreaterThan(0);

      const ping = stateBefore.sendPing?.('Checking in from Nightjar console.', 'SIG');
      expect(ping).toBeDefined();
      expect(ping?.relay).toBe(SHIP.designation);
      expect(ping?.text).toBe('Checking in from Nightjar console.');
      expect(ping?.code).toBe('SIG');
      expect(useBroadcast.getState().pings?.[0]?.id).toBe(ping?.id);

      const saved = storage.getPings();
      expect(saved.some((p) => p.id === ping?.id)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns accurate BroadcastSceneState for static, music, voice, and HUSH states', () => {
    const vb = station('void-beats');
    const prev = useBroadcast.getState();
    try {
      // 1. Static state
      useBroadcast.setState({
        tuned: { kind: 'static' },
        onAir: null,
        signal: 0,
        bleed: 0.25,
        event: null,
        status: 'playing',
      });
      const staticScene = getBroadcastSceneState();
      expect(staticScene.segmentKind).toBe('static');
      expect(staticScene.voiceCategory).toBeNull();
      expect(staticScene.bleed).toBe(0.25);

      // 2. Music segment on air
      const trackSeg: TrackSegment = {
        kind: 'track',
        id: 'vb:1:0',
        stationId: vb.id,
        startMs: 1000,
        durationMs: 180_000,
        recipe: vb.recipe,
        seed: 7,
        meta: { title: 'Orbit', artist: 'Dust' },
      };
      useBroadcast.setState({
        tuned: { kind: 'station', station: vb },
        onAir: trackSeg,
        signal: 0.95,
        bleed: 0.02,
        musicSection: 'drop',
        musicSectionProgress: 0.6,
        caption: null,
      });
      const musicScene = getBroadcastSceneState();
      expect(musicScene.segmentKind).toBe('music');
      expect(musicScene.voiceCategory).toBeNull();
      expect(musicScene.section).toBe('drop');
      expect(musicScene.sectionProgress).toBe(0.6);
      expect(musicScene.signal).toBe(0.95);

      // 3. Call-in voice segment on air
      const callSeg: VoiceSegment = {
        kind: 'voice',
        id: 'vb:1:1',
        stationId: vb.id,
        startMs: 1000,
        durationMs: 30_000,
        clip: makeClip(vb.id, 'call', 30, false),
        bed: false,
      };
      useBroadcast.setState({
        onAir: callSeg,
        caption: { speaker: 'Caller', text: 'Hello?' },
        status: 'playing',
      });
      const voiceScene = getBroadcastSceneState();
      expect(voiceScene.segmentKind).toBe('voice');
      expect(voiceScene.voiceCategory).toBe('call');
      expect(voiceScene.speech).toBeGreaterThan(0);
      expect(voiceScene.hush).toBe(false);

      // 4. HUSH speaking
      useBroadcast.setState({
        caption: { speaker: SHIP.computer.name, text: 'Relay Seven attitude nominal.' },
      });
      const hushScene = getBroadcastSceneState();
      expect(hushScene.hush).toBe(true);
      expect(hushScene.voiceCategory).toBe('ship');
    } finally {
      useBroadcast.setState({
        tuned: prev.tuned,
        onAir: prev.onAir,
        signal: prev.signal,
        bleed: prev.bleed,
        event: prev.event,
        status: prev.status,
        caption: prev.caption,
      });
    }
  });
});
