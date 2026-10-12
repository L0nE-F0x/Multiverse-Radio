// Plays one composed Score on the AudioContext clock: builds the track's mixing graph
// (instrument buses → pump → tape wobble → saturation → filters → fader) and schedules
// notes and automation a little ahead of time.

import { PATCHES } from '../dsp/patches';
import { barAt, eventsFrom, type AutoEvent, type InstrumentSpec, type NoteEvent, type Score } from '../score';
import type { SampleBank } from './bank';
import { kRate, saturationCurve } from './fx';
import { SYNTHS, type SynthDef } from '../dsp/synths';

export interface EngineBuses {
  ctx: BaseAudioContext;
  dryIn: AudioNode;
  reverbIn: AudioNode;
  bank: SampleBank;
  /** Offline rendering: never skip late events. */
  offline: boolean;
}

interface InstBus {
  spec: InstrumentSpec;
  input: GainNode;
  /** Target of 'inst' automation (the input gain when the instrument has none). */
  level: GainNode;
  delaySend: GainNode | null;
  synth: SynthDef | null;
  release: number;
  /** Choke group: a new hit silences the previous one (drum-machine style, and cheap). */
  choke: string | null;
  oneShot: boolean;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
}

/** Most voices a sampled instrument may hold at once; the oldest is released first. */
const MAX_POLY = 10;

/** One-shots that should ring over each other (rolls, fills, cymbals). */
const NO_CHOKE = new Set(['timpani', 'crash', 'conga', 'bongo', 'tom', 'triangle', 'clap']);

const TEXTURES = new Set(['vinyl', 'rain', 'static', 'hiss', 'shortwave', 'ocean']);

/** True if no two notes of instrument `i` start together (a melody line, not chords). */
function monophonic(events: readonly NoteEvent[], i: number): boolean {
  let prev = -Infinity;
  for (const e of events) {
    if (e.i !== i) continue;
    if (e.t - prev < 0.02) return false;
    prev = e.t;
  }
  return true;
}

/** Default release (seconds) when a sampled note's gate closes. */
function defaultRelease(spec: InstrumentSpec): number {
  if (spec.kind !== 'sample') return 0.2;
  const p = spec.patch;
  if (p.startsWith('bass')) return 0.09;
  if (p === 'ep' || p === 'ep-bright' || p === 'wurli') return 0.22;
  if (p === 'piano' || p === 'felt-piano') return 0.35;
  if (['vibes', 'celesta', 'glass', 'musicbox', 'marimba', 'kalimba', 'steeldrum', 'harpsichord', 'nylon', 'pizz'].includes(p)) return 0.6;
  return 0.3;
}

interface Seg {
  t0: number;
  v0: number;
  t1: number;
  v1: number;
}

export class TrackPlayer {
  readonly when: number;
  readonly offset: number;
  readonly endCtx: number;
  stopped = false;
  disposeAt = Infinity;

  private readonly ctx: BaseAudioContext;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly insts: InstBus[] = [];
  private readonly events: NoteEvent[];
  private readonly autos: AutoEvent[];
  private readonly pumps: number[];
  private evIdx = 0;
  private autoIdx = 0;
  private pumpIdx = 0;
  private stopAt = Infinity;
  private readonly fader: GainNode;
  private readonly revFader: GainNode;
  private segs: { dry: Seg[]; rev: Seg[] } = { dry: [], rev: [] };
  private readonly lowpass: BiquadFilterNode;
  private readonly pumpBus: GainNode;
  private readonly pumpDepth: number;
  private readonly wobble: DelayNode | null = null;
  private readonly stopGain: GainNode;
  private disposed = false;

  constructor(
    readonly score: Score,
    private readonly buses: EngineBuses,
    start: { when: number; offset: number; fadeIn: number },
  ) {
    const ctx = (this.ctx = buses.ctx);
    const fx = score.fx;
    this.when = start.when;
    this.offset = Math.max(0, Math.min(start.offset, Math.max(0, score.duration - 0.5)));
    this.endCtx = this.when + (score.duration - this.offset);

    // ── Track graph ──
    const fader = (this.fader = this.gain(0));
    fader.connect(buses.dryIn);
    const trackGain = this.gain(fx.gain);
    trackGain.connect(fader);
    const hp = this.node(ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.value = fx.highpass;
    hp.Q.value = 0.6;
    hp.connect(trackGain);
    const lp = (this.lowpass = this.node(ctx.createBiquadFilter()));
    kRate(lp.frequency, lp.Q);
    lp.type = 'lowpass';
    lp.frequency.value = fx.lowpass;
    lp.Q.value = fx.q ?? 0.5;
    lp.connect(hp);
    let chainIn: AudioNode = lp;
    if (fx.drive > 0) {
      const shaper = this.node(ctx.createWaveShaper());
      shaper.curve = saturationCurve(fx.drive);
      shaper.connect(chainIn);
      chainIn = shaper;
    }
    const stopGain = (this.stopGain = this.gain(1));
    stopGain.connect(chainIn);
    chainIn = stopGain;
    const needsWobble = fx.wow > 0 || fx.flutter > 0 || score.autos.some((a) => a.target === 'tapestop');
    if (needsWobble) {
      const wobble = (this.wobble = this.node(ctx.createDelay(2)));
      wobble.delayTime.value = 0.015;
      wobble.connect(chainIn);
      chainIn = wobble;
      // Wow and flutter from a single oscillator (oscillators are the costly part).
      if (fx.wow > 0) {
        const n = Math.max(2, Math.round(6.1 / fx.wowRate));
        const imag = new Float32Array(n + 1);
        imag[1] = 1;
        imag[n] = fx.flutter / fx.wow;
        const wave = ctx.createPeriodicWave(new Float32Array(n + 1), imag, { disableNormalization: true });
        this.lfo(fx.wowRate, fx.wow / 1000, wobble.delayTime, this.when, wave);
      } else if (fx.flutter > 0) this.lfo(6.1, fx.flutter / 1000, wobble.delayTime);
    }
    const colorIn = this.gain(1);
    colorIn.connect(chainIn);
    const pumpBus = (this.pumpBus = this.gain(1));
    pumpBus.connect(colorIn);
    this.pumpDepth = Math.max(0, ...score.instruments.map((i) => i.pump ?? 0));
    const texBus = this.gain(1);
    texBus.connect(trackGain);

    const revFader = (this.revFader = this.gain(0));
    revFader.connect(buses.reverbIn);
    const revLevel = this.gain((fx.reverbLevel ?? 1) * fx.gain);
    revLevel.connect(revFader);
    const revTone = this.node(ctx.createBiquadFilter());
    revTone.type = 'lowpass';
    revTone.frequency.value = fx.reverbTone ?? 6000;
    revTone.connect(revLevel);
    const revBus = this.gain(1);
    revBus.connect(revTone);

    let delayIn: GainNode | null = null;
    if (fx.delay) {
      delayIn = this.gain(1);
      const delay = this.node(ctx.createDelay(4));
      delay.delayTime.value = fx.delay.time;
      const tone = this.node(ctx.createBiquadFilter());
      tone.type = 'lowpass';
      tone.frequency.value = fx.delay.tone;
      const hpd = this.node(ctx.createBiquadFilter());
      hpd.type = 'highpass';
      hpd.frequency.value = 140;
      const fb = this.gain(fx.delay.feedback);
      const wet = this.gain(fx.delay.wet);
      delayIn.connect(delay);
      delay.connect(tone);
      tone.connect(hpd);
      hpd.connect(fb);
      fb.connect(delay);
      hpd.connect(wet);
      // Echoes stay dry: feeding a feedback loop into the shared ConvolverNode makes
      // Chrome's convolver several times more expensive (measured ~11% of a core).
      wet.connect(colorIn);
    }

    // ── Instruments ──
    // Buses are as lean as possible: every node costs CPU on the audio thread for as long
    // as the track plays, so panners/level stages only exist where they're needed.
    score.instruments.forEach((spec, index) => {
      const tremolo = spec.tremolo;
      const ampTrem = !!tremolo && spec.kind === 'sample' && !spec.patch.startsWith('ep') && spec.patch !== 'wurli';
      const input = this.gain(ampTrem && tremolo ? spec.gain * (1 - tremolo.depth / 2) : spec.gain);
      let last: AudioNode = input;
      for (const [type, freq, q] of [
        ['lowpass', spec.lowpass, 0.5],
        ['highpass', spec.highpass, 0.6],
      ] as const) {
        if (!freq) continue;
        const f = this.node(ctx.createBiquadFilter());
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        last.connect(f);
        last = f;
      }
      const automated = score.autos.some((a) => a.target === 'inst' && a.inst === index);
      let level = input;
      if (automated) {
        level = this.gain(1);
        last.connect(level);
        last = level;
      }
      let panner: StereoPannerNode | null = null;
      if ((spec.pan ?? 0) !== 0 || (tremolo && !ampTrem)) {
        panner = this.node(ctx.createStereoPanner());
        kRate(panner.pan);
        panner.pan.value = spec.pan ?? 0;
        last.connect(panner);
        last = panner;
      }
      const isTexture = spec.kind === 'sample' && TEXTURES.has(spec.patch);
      last.connect(isTexture ? texBus : (spec.pump ?? 0) > 0 ? pumpBus : colorIn);
      if (spec.reverb && !isTexture) {
        const send = this.gain(spec.reverb);
        last.connect(send);
        send.connect(revBus);
      }
      let delaySend: GainNode | null = null;
      if (delayIn && spec.delay !== undefined) {
        delaySend = this.gain(spec.delay);
        last.connect(delaySend);
        delaySend.connect(delayIn);
      }
      if (tremolo) {
        if (ampTrem) this.lfo(tremolo.rate, (spec.gain * tremolo.depth) / 2, input.gain, this.when);
        else if (panner) this.lfo(tremolo.rate, tremolo.depth, panner.pan, this.when);
      }
      const synth = spec.kind === 'synth' ? SYNTHS[spec.patch] : null;
      const oneShot = spec.kind === 'sample' && PATCHES[spec.patch].roots.length === 1 && !isTexture;
      let choke: string | null = null;
      if (oneShot && spec.kind === 'sample' && !NO_CHOKE.has(spec.patch)) choke = spec.patch.startsWith('hat') ? 'hat' : `i${index}`;
      // Synth lines that never play two notes at once are monophonic: each note hands over.
      if (synth && monophonic(score.events, index)) choke = `i${index}`;
      this.insts.push({ spec, input, level, delaySend, synth, release: spec.release ?? (synth ? synth.amp.r : defaultRelease(spec)), choke, oneShot });
    });

    // ── Join mid-track ──
    const barStart = barAt(score, this.offset) * score.barDur;
    this.events = eventsFrom(score.events, barStart, this.offset);
    this.pumps = score.pumps.filter((t) => t >= this.offset);
    // Restore automation state at the offset, then schedule what follows.
    const state = new Map<string, AutoEvent>();
    const rest: AutoEvent[] = [];
    for (const a of score.autos) {
      if (a.t < this.offset) {
        if (a.target !== 'tapestop') state.set(`${a.target}:${a.inst ?? -1}`, a);
      } else rest.push(a);
    }
    for (const a of state.values()) this.applyAuto({ ...a, tau: 0 }, this.when);
    this.autos = rest;

    // ── Fades ──
    const fadeIn = Math.max(0.02, start.fadeIn);
    this.ramp(this.when, 0, this.when + fadeIn, 1, 'dry');
    this.ramp(this.when, 0, this.when + fadeIn, 1, 'rev');
    const endFade = Math.min(1.2, Math.max(0.05, score.duration * 0.05));
    const endStart = Math.max(this.when + fadeIn, this.endCtx - endFade);
    this.ramp(endStart, 1, this.endCtx, 0, 'dry');
    // The reverb send closes a little earlier so the shared reverb's tail has died away
    // by the end of the track: the ending lands inside durationSeconds.
    const revEnd = Math.max(this.when + fadeIn + 0.01, this.endCtx - 0.7);
    this.ramp(Math.min(endStart, revEnd - 0.05), 1, revEnd, 0, 'rev');
    this.disposeAt = this.endCtx + 0.3;
  }

  // ── Graph helpers ──

  private node<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  private gain(value: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return this.node(g);
  }

  /** A sine LFO scaled by `depth`, optionally connected to a parameter. */
  private lfo(rate: number, depth: number, param: AudioParam | null, at = this.when, wave?: PeriodicWave): GainNode {
    const osc = this.ctx.createOscillator();
    if (wave) osc.setPeriodicWave(wave);
    osc.frequency.value = rate;
    const g = this.gain(depth);
    osc.connect(g);
    if (param) g.connect(param);
    osc.start(at);
    this.sources.push(osc);
    this.nodes.push(osc);
    return g;
  }

  private ramp(t0: number, v0: number, t1: number, v1: number, which: 'dry' | 'rev'): void {
    const p = which === 'dry' ? this.fader.gain : this.revFader.gain;
    p.setValueAtTime(v0, t0);
    p.linearRampToValueAtTime(v1, t1);
    this.segs[which].push({ t0, v0, t1, v1 });
  }

  /** A fader's scheduled value at time t (piecewise linear). */
  faderAt(t: number, which: 'dry' | 'rev' = 'dry'): number {
    let v = 0;
    for (const s of this.segs[which]) {
      if (t >= s.t1) v = s.v1;
      else if (t >= s.t0) v = s.v0 + ((s.v1 - s.v0) * (t - s.t0)) / (s.t1 - s.t0);
    }
    return v;
  }

  private ctxTime(t: number): number {
    return this.when + (t - this.offset);
  }

  // ── Scheduling ──

  /** Schedules everything that starts before `until` (context time). Returns notes skipped as too late. */
  schedule(until: number): number {
    if (this.disposed) return 0;
    let skipped = 0;
    const limit = Math.min(until, this.stopAt, this.endCtx);
    const now = this.ctx.currentTime;
    const lateCutoff = this.buses.offline ? -Infinity : now - 0.05;
    while (this.evIdx < this.events.length) {
      const e = this.events[this.evIdx]!;
      const at = this.ctxTime(e.t);
      if (at >= limit) break;
      this.evIdx++;
      if (e.t < this.offset) {
        this.playNote(e, this.when, this.offset - e.t);
        continue;
      }
      if (at < lateCutoff) {
        skipped++;
        continue;
      }
      this.playNote(e, Math.max(at, now), 0);
    }
    while (this.autoIdx < this.autos.length) {
      const a = this.autos[this.autoIdx]!;
      const at = this.ctxTime(a.t);
      if (at >= limit) break;
      this.autoIdx++;
      this.applyAuto(a, Math.max(at, now));
    }
    if (this.pumpDepth > 0) {
      const p = this.pumpBus.gain;
      while (this.pumpIdx < this.pumps.length) {
        const at = this.ctxTime(this.pumps[this.pumpIdx]!);
        if (at >= limit) break;
        this.pumpIdx++;
        if (at < now) continue;
        p.setTargetAtTime(1 - this.pumpDepth, at, 0.006);
        p.setTargetAtTime(1, at + 0.03, 0.08);
      }
    }
    return skipped;
  }

  private applyAuto(a: AutoEvent, at: number): void {
    const set = (param: AudioParam, value: number) => {
      if (a.tau <= 0) param.setValueAtTime(value, at);
      else param.setTargetAtTime(value, at, a.tau);
    };
    switch (a.target) {
      case 'cutoff':
        set(this.lowpass.frequency, a.value);
        break;
      case 'inst': {
        const inst = this.insts[a.inst ?? -1];
        if (inst) set(inst.level.gain, a.value);
        break;
      }
      case 'echo': {
        const inst = this.insts[a.inst ?? -1];
        if (inst?.delaySend) set(inst.delaySend.gain, a.value);
        break;
      }
      case 'tapestop': {
        const w = this.wobble;
        if (!w) break;
        if (a.value > 0) {
          // Delay grows quadratically ⇒ playback speed falls linearly to zero.
          const T = a.value;
          const steps = 32;
          const curve = new Float32Array(steps);
          for (let k = 0; k < steps; k++) {
            const tau = (k / (steps - 1)) * T;
            curve[k] = 0.015 + (tau * tau) / (2 * T);
          }
          w.delayTime.setValueCurveAtTime(curve, at, T);
          this.stopGain.gain.setValueAtTime(1, at + T * 0.6);
          this.stopGain.gain.linearRampToValueAtTime(0, at + T);
        } else {
          w.delayTime.setValueAtTime(0.015, at);
          this.stopGain.gain.setValueAtTime(0, at);
          this.stopGain.gain.linearRampToValueAtTime(1, at + 0.01);
        }
        break;
      }
    }
  }

  private playNote(e: NoteEvent, at: number, late: number): void {
    const inst = this.insts[e.i];
    if (!inst || (this.soloSet && !this.soloSet.has(e.i))) return;
    const ctx = this.ctx;
    const dur = e.d - late;
    if (dur <= 0.01) return;
    const spec = inst.spec;
    if (spec.kind === 'synth') {
      this.playSynth(inst, e, at, late, dur);
      return;
    }
    const zone = this.buses.bank.zone(spec.patch, e.p, e.v);
    const src = ctx.createBufferSource();
    const rate = 2 ** ((e.p - zone.root + (spec.detune ?? 0) / 100) / 12);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const amp = (zone.loop ? e.v : e.v ** 1.5) * (PATCHES[spec.patch].level ?? 1);
    const end = at + dur;
    const relTau = Math.max(0.005, inst.release / 4);
    const natural = (zone.buffer.duration - late * rate) / rate; // seconds left in the sample
    let stopAt: number;
    if (zone.loop) {
      src.buffer = zone.buffer;
      src.loop = true;
      const fade = Math.min(1.5, dur * 0.25);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(amp, at + (late > 0 ? 0.05 : fade));
      g.gain.setValueAtTime(amp, Math.max(at + fade, end - fade));
      g.gain.linearRampToValueAtTime(0, end);
      src.start(at, ((e.t + late) * 0.37) % zone.buffer.duration);
      stopAt = end + 0.05;
      src.stop(stopAt);
    } else if (e.rev) {
      // A reverse swell that peaks right at the end of the gate.
      src.buffer = this.buses.bank.reversed(zone);
      const span = Math.min(zone.buffer.duration / rate, dur);
      const startIn = Math.max(0, zone.buffer.duration - span * rate);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(amp, at + Math.min(0.05, span / 2));
      g.gain.setValueAtTime(amp, end - 0.012);
      g.gain.linearRampToValueAtTime(0, end);
      src.start(at, startIn);
      stopAt = end + 0.02;
      src.stop(stopAt);
    } else {
      src.buffer = zone.buffer;
      if (natural <= 0) return;
      if (late > 0) {
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(amp, at + 0.03);
      } else {
        g.gain.value = amp;
      }
      src.start(at, late * rate);
      if (natural <= dur + 0.005) {
        // The sample ends on its own before the gate closes: no envelope needed.
        stopAt = at + natural;
      } else {
        g.gain.setTargetAtTime(0, end, relTau);
        stopAt = Math.min(end + relTau * 5, at + natural);
        src.stop(stopAt);
      }
    }
    src.connect(g);
    g.connect(inst.input);
    src.onended = () => g.disconnect();
    this.track(inst, e.i, { src, gain: g, end: stopAt }, at);
  }

  /** A synth note: a looping rendered zone with the amplitude envelope applied here. */
  private playSynth(inst: InstBus, e: NoteEvent, at: number, late: number, dur: number): void {
    const def = inst.synth!;
    const spec = inst.spec;
    if (spec.kind !== 'synth') return;
    const ctx = this.ctx;
    const zone = this.buses.bank.synthZone(spec.patch, e.p, e.v);
    const src = ctx.createBufferSource();
    src.buffer = zone.buffer;
    src.loop = true;
    src.loopStart = zone.loopStart ?? 0;
    src.loopEnd = zone.loopEnd ?? zone.buffer.duration;
    const rate = (p: number) => 2 ** ((p - zone.root + (spec.detune ?? 0) / 100) / 12);
    const pr = src.playbackRate;
    if (e.from !== undefined && e.glide && late <= 0) {
      pr.setValueAtTime(rate(e.from), at);
      pr.exponentialRampToValueAtTime(rate(e.p), at + e.glide);
    } else if (e.arp?.length && e.arpRate) {
      const steps = Math.min(512, Math.ceil(dur / e.arpRate));
      for (let k = 0; k < steps; k++) pr.setValueAtTime(rate(e.p + e.arp[k % e.arp.length]!), at + k * e.arpRate);
    } else {
      pr.value = rate(e.p);
    }
    const g = ctx.createGain();
    const gp = g.gain;
    const peak = def.gain * e.v ** 1.3;
    const { a, d, s } = def.amp;
    const end = at + dur;
    if (late > 0) {
      gp.setValueAtTime(0, at);
      gp.linearRampToValueAtTime(peak * Math.max(s, 0.05), at + 0.03);
    } else if (dur <= a) {
      gp.setValueAtTime(0, at);
      gp.linearRampToValueAtTime(peak * (dur / a), end);
    } else {
      gp.setValueAtTime(0, at);
      gp.linearRampToValueAtTime(peak, at + a);
      gp.setTargetAtTime(peak * s, at + a, Math.max(0.005, d / 3));
    }
    const relTau = Math.max(0.005, inst.release / 4);
    gp.setTargetAtTime(0, end, relTau);
    const stopAt = end + relTau * 5;
    src.connect(g);
    g.connect(inst.input);
    src.start(at, late > 0 ? src.loopStart : 0);
    src.stop(stopAt);
    src.onended = () => g.disconnect();
    this.track(inst, e.i, { src, gain: g, end: stopAt }, at);
  }

  private readonly voices = new Map<string, Voice[]>();

  /** Choke groups and polyphony limits: quickly release voices that would pile up. */
  private track(inst: InstBus, index: number, voice: Voice, at: number): void {
    const key = inst.choke ?? `p${index}`;
    const list = (this.voices.get(key) ?? []).filter((v) => v.end > at);
    const release = (v: Voice) => {
      v.gain.gain.setTargetAtTime(0, at, 0.006);
      try {
        v.src.stop(at + 0.04);
      } catch {
        /* already stopped */
      }
      v.end = at + 0.04;
    };
    if (inst.choke) for (const v of list) release(v);
    else while (list.length >= MAX_POLY) release(list.shift()!);
    list.push(voice);
    this.voices.set(key, inst.choke ? [voice] : list.filter((v) => v.end > at));
  }

  /** Debug: silence every instrument except these. */
  solo(indices: number[]): void {
    this.soloSet = new Set(indices);
  }

  private soloSet: Set<number> | null = null;

  /** Fades out from `when` over `fade` seconds and stops scheduling beyond that. */
  stop(when: number, fade: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const f = Math.max(0.02, fade);
    for (const which of ['dry', 'rev'] as const) {
      const p = which === 'dry' ? this.fader.gain : this.revFader.gain;
      const v = this.faderAt(when, which);
      // Hold exactly where the automation is at `when` (no jump), where supported.
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(when);
      else {
        p.cancelScheduledValues(when);
        p.setValueAtTime(v, when);
      }
      p.linearRampToValueAtTime(0, when + f);
      this.segs[which] = this.segs[which].filter((s) => s.t0 < when);
      this.segs[which].push({ t0: when, v0: v, t1: when + f, v1: 0 });
    }
    this.stopAt = when + f;
    this.disposeAt = Math.min(this.disposeAt, when + f + 0.3);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* not started */
      }
    }
    for (const n of this.nodes) n.disconnect();
  }
}
