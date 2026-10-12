"""Synthesized beds, sound effects and stings. No samples: everything is built from noise,
oscillators, simple physical models and reverb, so every name in SCHEMA.md is safe to use.

Levels are set by loudness (LUFS) relative to voices, which sit at voicefx.VOICE_LUFS (-20).
"""

from __future__ import annotations

import numpy as np

import dsp
from dsp import SR, TAU, db, f32, note, ns, place, times

# ── Instruments ───────────────────────────────────────────────────────────────


def partials(freq: float, dur: float, ratios, amps, decays, attack: float = 0.002,
             rng: np.random.Generator | None = None) -> np.ndarray:
    """Sum of exponentially decaying sines (bells, bars, plates)."""
    n = ns(dur)
    t = times(n)
    out = np.zeros(n)
    for r, a, d in zip(ratios, amps, decays):
        f = freq * r
        if f >= SR * 0.45:
            continue
        phase = rng.uniform(0, TAU) if rng is not None else 0.0
        out += a * np.exp(-t / d) * np.sin(TAU * f * t + phase)
    return f32(out * np.minimum(1, t / attack))


def bell(freq: float, dur: float = 1.5, rng=None) -> np.ndarray:
    return partials(freq, dur, [1, 2.0, 2.76, 4.07, 5.4, 6.8], [1, 0.45, 0.4, 0.22, 0.14, 0.08],
                    [dur * 0.45, dur * 0.3, dur * 0.22, 0.18, 0.12, 0.08], rng=rng)


def glock(freq: float, dur: float = 1.0) -> np.ndarray:
    return partials(freq, dur, [1, 2.76, 5.4, 8.93], [1, 0.22, 0.07, 0.03], [dur * 0.4, 0.15, 0.06, 0.03])


def marimba(freq: float, dur: float = 0.7) -> np.ndarray:
    tone = partials(freq, dur, [1, 3.93, 9.24], [1, 0.3, 0.08], [min(0.45, dur * 0.6), 0.09, 0.03], attack=0.001)
    return tone


def vibes(freq: float, dur: float = 1.6) -> np.ndarray:
    tone = partials(freq, dur, [1, 4.0, 10.0], [1, 0.18, 0.04], [dur * 0.45, 0.3, 0.08], attack=0.003)
    t = times(len(tone))
    return f32(tone * (1 - 0.35 * (0.5 + 0.5 * np.sin(TAU * 5.5 * t))))


def brass(freq: float, dur: float, bright: float = 1.0, vibrato: float = 0.0, release: float = 0.09,
          wah: np.ndarray | None = None) -> np.ndarray:
    """Band-limited sawtooth whose brightness follows the envelope (a cheap brass model)."""
    n = ns(dur)
    t = times(n)
    vib = vibrato * np.sin(TAU * 5.6 * t) * np.clip((t - 0.18) / 0.25, 0, 1)
    f = freq * (1 - 0.03 * np.exp(-t / 0.03)) * (1 + 0.012 * vib)
    ph = dsp.phase_of(f)
    env = np.minimum(1, t / 0.03) * (0.8 + 0.2 * np.exp(-t / 0.15)) * dsp.envelope(n, 0, release)
    k_bright = 1.2 + 9 * bright * env * (wah if wah is not None else 1.0)
    out = np.zeros(n)
    for k in range(1, min(40, int(SR * 0.45 / freq)) + 1):
        out += np.sin(k * ph) / k * np.exp(-k / k_bright)
    return f32(out * env)


def timpani(freq: float, dur: float = 1.2, rng=None) -> np.ndarray:
    n = ns(dur)
    t = times(n)
    f = freq * (1 + 0.06 * np.exp(-t / 0.05))
    ph = dsp.phase_of(f)
    body = sum(a * np.exp(-t / d) * np.sin(r * ph) for r, a, d in
               [(1, 1, 0.7), (1.5, 0.45, 0.45), (1.98, 0.3, 0.3), (2.44, 0.15, 0.2)])
    hit = dsp.band(dsp.white(rng or np.random.default_rng(1), n), 60, 900) * np.exp(-t / 0.025) * 0.5
    return f32((body + hit) * np.minimum(1, t / 0.002))


def snare(rng: np.random.Generator, dur: float = 0.25) -> np.ndarray:
    n = ns(dur)
    t = times(n)
    rattle = dsp.band(dsp.white(rng, n), 1500, 9000) * np.exp(-t / 0.08)
    body = np.sin(TAU * 190 * t) * np.exp(-t / 0.04)
    return f32(rattle * 0.8 + body * 0.6)


def cymbal(rng: np.random.Generator, dur: float = 1.8) -> np.ndarray:
    n = ns(dur)
    t = times(n)
    wash = dsp.band(dsp.white(rng, n), 3500, 11000) * np.exp(-t / (dur * 0.35))
    ping = partials(1.0, dur, rng.uniform(3200, 9000, 8), rng.uniform(0.02, 0.06, 8), [dur * 0.3] * 8, rng=rng)
    return f32((wash + ping) * np.minimum(1, t / 0.003))


def boom(dur: float = 0.6) -> np.ndarray:
    n = ns(dur)
    t = times(n)
    f = 45 + 80 * np.exp(-t / 0.05)
    return f32(np.sin(dsp.phase_of(f)) * np.exp(-t / 0.18) * np.minimum(1, t / 0.002))


def chord(instrument, names, dur, spread: float = 0.0, **kw) -> np.ndarray:
    out = np.zeros(ns(dur + spread * len(names)), np.float32)
    for i, name in enumerate(names):
        place(out, instrument(note(name), dur, **kw), i * spread)
    return out


# ── Murmur and other textures ─────────────────────────────────────────────────


def _control(rng: np.random.Generator, seconds: float, step: tuple[float, float], lo: float, hi: float):
    """A random step curve (times, values) with smooth transitions, for shaped_noise controls."""
    ts, vs, t = [0.0], [rng.uniform(lo, hi)], 0.0
    while t < seconds + 1:
        t += rng.uniform(*step)
        ts.append(t)
        vs.append(rng.uniform(lo, hi))
    return np.array(ts), np.array(vs)


def murmur(rng: np.random.Generator, seconds: float, talkers: int = 8) -> np.ndarray:
    """Babble: noise through moving formant-like peaks, gated at syllable rate."""
    tracks = []
    for _ in range(talkers):
        ft, fv = _control(rng, seconds, (0.12, 0.3), 350, 2600)
        at, av = _control(rng, seconds, (0.1, 0.25), 0, 1)
        av = np.where(rng.random(len(av)) < 0.25, 0.0, av)  # breaths and pauses
        tracks.append((ft, fv, at, av))

    def magnitude(t, f):
        base = np.where(f < 500, (f / 500.0), (500.0 / np.maximum(f, 1)) ** 1.3) * (f > 120) * (f < 5000)
        peaks = 0.15
        for ft, fv, at, av in tracks:
            centre = np.interp(t, ft, fv)
            amp = np.interp(t, at, av)
            peaks = peaks + amp * np.exp(-(((f - centre) / (centre * 0.25)) ** 2))
            peaks = peaks + 0.6 * amp * np.exp(-(((f - centre * 0.35 - 150) / 120) ** 2))
        return base * peaks

    return dsp.shaped_noise(rng, ns(seconds), magnitude)


def clinks(rng: np.random.Generator, seconds: float, rate: float) -> np.ndarray:
    out = np.zeros(ns(seconds), np.float32)
    t = rng.uniform(0, 0.5)
    while t < seconds:
        f0 = rng.uniform(1800, 3400)
        ping = partials(f0, 0.5, [1, 2.32, 4.25, 6.63], [1, 0.5, 0.25, 0.1], [0.25, 0.12, 0.06, 0.03], rng=rng)
        place(out, ping, t, rng.uniform(0.2, 1))
        if rng.random() < 0.4:  # spoon taps twice
            place(out, ping, t + rng.uniform(0.1, 0.2), rng.uniform(0.2, 0.6))
        t += rng.exponential(1 / rate)
    return out


def clap_texture(rng: np.random.Generator, seconds: float, rate: float, density_wander: float = 0.3) -> np.ndarray:
    n = ns(seconds)
    clap = ns(0.012)
    shape = np.exp(-np.arange(clap) / (SR * 0.0025)).astype(np.float32)
    density = 1 - density_wander + density_wander * dsp.wander(rng, n, 1.5)
    imp = dsp.impulses(rng, n, rate, 0.3, 1.0) * (rng.random(n) < density)
    out = dsp.convolve(imp, dsp.white(rng, clap) * shape)[:n]
    return dsp.band(out, 600, 8000)


# ── Beds ──────────────────────────────────────────────────────────────────────


def bed_rain(rng, s):
    n = ns(s)
    hush = dsp.shaped_noise(rng, n, lambda t, f: (f > 300) * (np.maximum(f, 1) / 1000.0) ** -0.4 * (f < 10000))
    hush *= 0.85 + 0.15 * dsp.wander(rng, n, 0.3)
    drop = dsp.white(rng, ns(0.004)) * np.exp(-np.arange(ns(0.004)) / (SR * 0.0008))
    drops = dsp.band(dsp.convolve(dsp.impulses(rng, n, 260, 0.05, 1.0), drop)[:n], 1500, 9000)
    plinks = np.zeros(n, np.float32)
    for at in np.cumsum(rng.exponential(0.35, int(s * 4) + 2)):
        if at >= s:
            break
        f0 = rng.uniform(1400, 3800)
        m = ns(0.03)
        tt = times(m)
        place(plinks, f32(np.sin(dsp.phase_of(f0 * (1 - 0.4 * tt / 0.03))) * np.exp(-tt / 0.008)), at, rng.uniform(0.2, 1))
    rumble = dsp.band(dsp.colored(rng, n, -6), 40, 300)
    return dsp.at_rms(hush, -20) + dsp.at_rms(drops, -25) + dsp.at_rms(plinks, -33) + dsp.at_rms(rumble, -30)


def bed_crowd(rng, s):
    room = dsp.reverb_ir(rng, 0.9, hi=5000)
    talk = dsp.add_reverb(murmur(rng, s, talkers=10), room, -4)[: ns(s)]
    return dsp.at_rms(talk, -20) * (0.85 + 0.15 * dsp.wander(rng, ns(s), 0.4))


def bed_applause(rng, s):
    n = ns(s)
    claps = clap_texture(rng, s, 260)
    room = dsp.reverb_ir(rng, 1.2, hi=6000)
    return dsp.at_rms(dsp.add_reverb(claps, room, -6)[:n], -20) * (0.8 + 0.2 * dsp.wander(rng, n, 0.6))


def bed_stadium(rng, s):
    n = ns(s)
    swell = 0.55 + 0.45 * dsp.wander(rng, n, 0.25)
    roar = dsp.shaped_noise(rng, n, lambda t, f: (f > 150) * (f < 4500) * np.where(f < 700, 1.0, (700 / np.maximum(f, 1)) ** 1.1))
    cheer_t, cheer_v = _control(rng, s, (1.5, 4.0), 0, 1)

    def cheer(t, f):
        level = np.interp(t, cheer_t, cheer_v) ** 3
        return level * np.exp(-(((f - 1600) / 900) ** 2))

    cheers = dsp.shaped_noise(rng, n, cheer)
    talk = murmur(rng, s, talkers=14)
    mix = dsp.at_rms(roar * swell, -20) + dsp.at_rms(cheers, -26) + dsp.at_rms(talk, -24)
    big = dsp.reverb_ir(rng, 2.4, predelay=0.04, hi=4500)
    return dsp.add_reverb(mix, big, -3)[:n]


def bed_sizzle(rng, s):
    n = ns(s)
    fry = dsp.band(dsp.white(rng, n), 2500, 9000) * (0.7 + 0.3 * dsp.wander(rng, n, 3))
    crackle = dsp.band(dsp.impulses(rng, n, 45, 0.2, 1.0), 1500, 8000)
    pops = dsp.band(dsp.impulses(rng, n, 3, 0.5, 1.0), 300, 3000)
    return dsp.at_rms(fry, -21) + dsp.at_rms(crackle, -24) + dsp.at_rms(pops, -30)


def bed_organ(rng, s):
    """A slow soap-opera progression on a drawbar organ with a wobbly speaker."""
    n = ns(s)
    out = np.zeros(n, np.float32)
    chords = [("F3", "A3", "C4", "F4"), ("D3", "F3", "A3", "D4"), ("A#2", "D3", "F3", "A#3"), ("C3", "E3", "G3", "C4")]
    seg, overlap = 3.2, 0.5
    i, at = 0, 0.0
    while at < s:
        dur = seg + overlap
        m = ns(dur)
        t = times(m)
        wobble = 0.5 * np.sin(TAU * 6.1 * t)
        tone = np.zeros(m)
        for name in chords[i % len(chords)]:
            f = note(name)
            for r, a in zip((1, 2, 3, 4, 6, 8), (1, 0.7, 0.35, 0.3, 0.12, 0.08)):
                if f * r < SR * 0.45:
                    tone += a * np.sin(TAU * f * r * t + wobble * r * 0.05)
        tone *= 0.85 + 0.15 * np.sin(TAU * 6.1 * t + 1.0)
        place(out, dsp.fade(f32(tone), overlap, overlap), at)
        at += seg
        i += 1
    return dsp.band(out, 60, 5000)


def bed_room(rng, s):
    n = ns(s)
    air = dsp.band(dsp.colored(rng, n, -3), 60, 2500)
    hvac = dsp.band(dsp.colored(rng, n, -6), 30, 250) * (0.8 + 0.2 * dsp.wander(rng, n, 0.2))
    t = times(n)
    hum = np.sin(TAU * 120 * t) + 0.3 * np.sin(TAU * 240 * t)
    return dsp.at_rms(air, -20) + dsp.at_rms(hvac, -22) + dsp.at_rms(f32(hum), -40)


def bed_wind(rng, s):
    n = ns(s)
    gust_t, gust_v = _control(rng, s, (1.0, 3.0), 0.2, 1.0)
    whistle_t, whistle_v = _control(rng, s, (0.8, 2.5), 450, 1100)

    def magnitude(t, f):
        g = np.interp(t, gust_t, gust_v)
        body = (f > 80) * np.where(f < 400, 1.0, (400 / np.maximum(f, 1)) ** 1.6) * (0.3 + g)
        whistle = g**2 * 2.5 * np.exp(-(((f - np.interp(t, whistle_t, whistle_v)) / 40) ** 2))
        return body + whistle

    return dsp.shaped_noise(rng, n, magnitude)


def bed_space(rng, s):
    n = ns(s)
    t = times(n)
    drone = sum(np.sin(TAU * f * t + p) for f, p in ((55.0, 0), (55.35, 1.3), (82.4, 2.1), (110.7, 0.4), (164.8, 1.7)))
    drone = drone * (0.6 + 0.4 * np.sin(TAU * 0.07 * t))
    sweep_t, sweep_v = _control(rng, s, (2.0, 5.0), 250, 1400)
    cosmic = dsp.shaped_noise(rng, n, lambda tt, f: np.exp(-(((f - np.interp(tt, sweep_t, sweep_v)) / 300) ** 2)))
    twinkles = np.zeros(n, np.float32)
    at = rng.uniform(0, 0.6)
    while at < s:
        f0 = rng.uniform(1800, 5200)
        m = ns(1.2)
        tt = times(m)
        ping = np.sin(TAU * f0 * tt) * np.minimum(1, tt / 0.06) * np.exp(-tt / 0.35)
        place(twinkles, f32(ping), at, rng.uniform(0.3, 1))
        at += rng.exponential(0.7)
    rumble = dsp.band(dsp.colored(rng, n, -6), 25, 200)
    return (dsp.at_rms(f32(drone), -21) + dsp.at_rms(cosmic, -27) + dsp.at_rms(twinkles, -33)
            + dsp.at_rms(rumble, -27))


def bed_static(rng, s):
    n = ns(s)
    t = times(n)
    flutter = 0.8 + 0.2 * np.sin(TAU * 6.7 * t) * dsp.wander(rng, n, 0.8)
    hiss = dsp.band(dsp.white(rng, n), 300, 7000) * flutter
    pops = dsp.band(dsp.impulses(rng, n, 35, 0.2, 1.0), 300, 6000)
    whistles = np.zeros(n, np.float32)
    at = rng.uniform(0.5, 3)
    while at < s:
        dur = rng.uniform(0.8, 2.2)
        m = ns(dur)
        tt = times(m)
        f = rng.uniform(700, 2600) * (1 + rng.uniform(-0.3, 0.3) * tt / dur)
        place(whistles, f32(np.sin(dsp.phase_of(f)) * np.sin(np.pi * tt / dur) ** 2), at, rng.uniform(0.3, 1))
        at += dur + rng.exponential(4)
    rumble = dsp.band(dsp.colored(rng, n, -6), 60, 1200)
    return dsp.at_rms(hiss, -20) + dsp.at_rms(pops, -25) + dsp.at_rms(whistles, -34) + dsp.at_rms(rumble, -27)


def bed_ocean(rng, s):
    n = ns(s)
    ctrl_t = np.arange(0, s + 1, 0.01)
    level = np.full(len(ctrl_t), 0.12)
    at = -rng.uniform(0, 5)
    while at < s:
        rise, decay = rng.uniform(2.0, 3.5), rng.uniform(2.5, 4.0)
        x = ctrl_t - at
        wave = np.where(x < 0, 0, np.where(x < rise, (x / rise) ** 2, np.exp(-(x - rise) / decay * 2.2)))
        level += rng.uniform(0.6, 1.0) * wave
        at += rng.uniform(5.5, 9.5)

    def magnitude(t, f):
        lvl = np.interp(t, ctrl_t, level)
        cutoff = 400 + 3500 * np.clip(lvl - 0.12, 0, 1) ** 1.5
        return lvl * (f > 60) / np.sqrt(1 + (f / cutoff) ** 4) * (np.maximum(f, 1) / 500) ** -0.3

    surf = dsp.shaped_noise(rng, n, magnitude)
    return dsp.at_rms(surf, -20)


def bed_fluorescent(rng, s):
    n = ns(s)
    t = times(n)
    buzz = np.tanh(3 * np.sin(TAU * 120 * t)) + 0.4 * np.sin(TAU * 240 * t + 0.5)
    buzz = dsp.band(f32(buzz), 100, 3000)
    flicker = np.ones(n, np.float32)
    ticks = np.zeros(n, np.float32)
    at = rng.uniform(1, 4)
    while at < s:
        k, m = ns(at), ns(rng.uniform(0.05, 0.25))
        flicker[k : k + m] *= rng.uniform(0.2, 0.6)
        if k < n:
            ticks[k] = 1.0
        at += rng.exponential(5)
    whine = np.sin(TAU * 9600 * t) * 0.5
    ticks = dsp.band(ticks, 1500, 8000)
    return dsp.at_rms(buzz * flicker, -20) + dsp.at_rms(f32(whine), -42) + dsp.at_rms(ticks, -30)


def bed_cafe(rng, s):
    n = ns(s)
    room = dsp.reverb_ir(rng, 0.6, hi=5500)
    talk = dsp.add_reverb(murmur(rng, s, talkers=5), room, -6)[:n]
    steam = np.zeros(n, np.float32)
    at = rng.uniform(2, 8)
    while at < s:
        dur = rng.uniform(1.5, 3.0)
        burst = dsp.band(dsp.white(rng, ns(dur)), 2500, 9000) * np.sin(np.pi * times(ns(dur)) / dur) ** 2
        place(steam, f32(burst), at)
        at += dur + rng.uniform(6, 14)
    return dsp.at_rms(talk, -20) + dsp.at_rms(clinks(rng, s, 0.8), -25) + dsp.at_rms(steam, -30) * 0.7


BEDS = {
    "rain": (bed_rain, -35.0),
    "crowd": (bed_crowd, -34.0),
    "applause": (bed_applause, -32.0),
    "stadium": (bed_stadium, -31.0),
    "sizzle": (bed_sizzle, -34.0),
    "organ": (bed_organ, -33.0),
    "room": (bed_room, -43.0),
    "wind": (bed_wind, -35.0),
    "space": (bed_space, -35.0),
    "static": (bed_static, -37.0),
    "ocean": (bed_ocean, -34.0),
    "fluorescent": (bed_fluorescent, -40.0),
    "cafe": (bed_cafe, -35.0),
}


def make_bed(name: str, seconds: float, rng: np.random.Generator) -> np.ndarray:
    fn, target = BEDS[name]
    audio = fn(rng, seconds)[: ns(seconds)]
    return dsp.normalize(dsp.band(audio, 30, 11000), target)


# ── Sound effects ─────────────────────────────────────────────────────────────


def sfx_zap(rng, s):
    """A channel flip: a burst of static with a falling heterodyne chirp."""
    n = ns(s)
    t = times(n)
    hiss = dsp.band(dsp.white(rng, n), 400, 6000)
    pops = dsp.band(dsp.impulses(rng, n, max(2, s * 25) / s, 3, 6), 200, 4000)
    chirp_f = 2600 * (500 / 2600) ** (t / s)
    chirp = 0.08 * np.sin(dsp.phase_of(chirp_f))
    env = np.minimum(1, t / 0.006) * np.minimum(1, (s - t) / 0.05)
    return f32((dsp.at_rms(hiss + pops, -18) + chirp) * env)


def sfx_applause(rng, s):
    n = ns(s)
    claps = clap_texture(rng, s + 0.8, 300, 0.2)
    room = dsp.reverb_ir(rng, 1.0, hi=6000)
    wet = dsp.add_reverb(claps, room, -6)[: ns(s + 0.8)]
    env = np.ones(len(wet))
    env[: ns(0.15)] = np.linspace(0, 1, ns(0.15))
    tail = ns(min(1.2, s * 0.45) + 0.8)
    env[-tail:] *= np.linspace(1, 0, tail) ** 1.5
    return f32(wet * env) if n else wet


def sfx_phone_ring(rng, s):
    """An old bell telephone: two little bells hammered at 20 Hz, 1 s on, 0.4 s off."""
    n = ns(s)
    hammer = np.zeros(n, np.float32)
    cycle, on = 1.4, 1.0
    t = times(n)
    active = (t % cycle) < on
    strikes = np.flatnonzero(np.diff(np.floor(t * 40).astype(int), prepend=-1) > 0)
    for k, pos in enumerate(strikes):
        if active[pos]:
            hammer[pos] = 1.0 if k % 2 else -0.8
    bell_a = partials(1180, 0.4, [1, 2.08, 3.3, 4.6], [1, 0.4, 0.25, 0.1], [0.12, 0.08, 0.05, 0.03])
    bell_b = partials(1420, 0.4, [1, 2.1, 3.2, 4.4], [1, 0.4, 0.2, 0.1], [0.12, 0.08, 0.05, 0.03])
    ring = dsp.convolve(np.where(hammer > 0, hammer, 0), bell_a) + dsp.convolve(np.where(hammer < 0, -hammer, 0), bell_b)
    ring = ring[: n + ns(0.15)]
    ring[n:] *= np.linspace(1, 0, len(ring) - n)
    room = dsp.reverb_ir(rng, 0.5, hi=6000)
    return dsp.add_reverb(f32(ring), room, -10)


def sfx_phone_hangup(rng, s):
    n = ns(s)
    out = np.zeros(n + ns(0.1), np.float32)
    m = ns(0.12)
    t = times(m)
    thump = np.sin(TAU * 95 * t) * np.exp(-t / 0.03)
    click = dsp.band(dsp.white(rng, m), 1000, 6000) * np.exp(-t / 0.002)
    place(out, f32(thump + click * 0.8), 0)
    place(out, f32(click * 0.4), 0.035)
    at = 0.4
    while at + 0.05 < s:
        dur = min(0.25, s - at)
        k = ns(dur)
        tt = times(k)
        beep = (np.sin(TAU * 480 * tt) + np.sin(TAU * 620 * tt)) * dsp.envelope(k, 0.005, 0.005)
        place(out, f32(dsp.band(f32(beep), 300, 3400) * 0.12), at)
        at += 0.5
    return out


def sfx_ding(rng, s):
    tone = partials(1760, max(1.6, s + 0.6), [1, 2.32, 4.25, 6.63], [1, 0.45, 0.2, 0.08], [0.9, 0.4, 0.18, 0.08], rng=rng)
    click = dsp.band(dsp.white(rng, ns(0.01)), 2000, 9000) * np.exp(-times(ns(0.01)) / 0.001)
    tone[: len(click)] += click * 0.3
    return tone


def sfx_cash_register(rng, s):
    out = np.zeros(ns(max(s, 1.0) + 0.6), np.float32)
    for at, g in ((0.0, 1.0), (0.07, 0.7)):
        m = ns(0.08)
        t = times(m)
        clunk = dsp.band(dsp.white(rng, m), 300, 3000) * np.exp(-t / 0.012) + np.sin(TAU * 150 * t) * np.exp(-t / 0.02)
        place(out, f32(clunk), at, g)
    drawer_n = ns(0.3)
    rattle = dsp.band(dsp.white(rng, drawer_n), 500, 4000) * (0.5 + 0.5 * np.sign(np.sin(TAU * 38 * times(drawer_n))))
    place(out, f32(rattle * np.linspace(1, 0.2, drawer_n) * 0.25), 0.12)
    ching = partials(2650, 1.0, [1, 1.34, 2.1, 2.72], [1, 0.6, 0.35, 0.2], [0.5, 0.35, 0.2, 0.12], rng=rng)
    place(out, ching, 0.13, 0.9)
    place(out, ching, 0.21, 0.5)
    for _ in range(6):
        place(out, glock(rng.uniform(4200, 7000), 0.3), rng.uniform(0.3, 0.7), rng.uniform(0.05, 0.15))
    return out


def sfx_record_scratch(rng, s):
    """Drag a record back and forth under the needle, then stop it dead."""
    src_s = 3.0
    m = ns(src_s)
    t = times(m)
    music = sum(np.sign(np.sin(TAU * note(nm) * t)) * 0.25 for nm in ("C3", "E3", "G3", "C4"))
    for beat in np.arange(0, src_s, 0.5):
        place_at = ns(beat)
        k = min(m - place_at, ns(0.2))
        music[place_at : place_at + k] += np.sin(TAU * 60 * times(k)) * np.exp(-times(k) / 0.06) * 1.5
    music = dsp.band(f32(music), 80, 4000) + dsp.band(dsp.white(rng, m), 1000, 6000) * 0.1

    n = ns(s)
    tt = times(n)
    u = tt / s
    rate = np.interp(u, [0, 0.12, 0.14, 0.35, 0.38, 0.6, 0.62, 0.8, 1.0], [1, 1, -3.5, -2.5, 4.5, 3.5, -2.5, -0.3, 0])
    pos = 1.0 * SR + np.cumsum(rate)
    out = np.interp(pos, np.arange(m), music)
    friction = dsp.band(dsp.white(rng, n), 800, 5000) * np.abs(rate) * 0.12
    env = np.minimum(1, (s - tt) / 0.05)
    return f32((out + friction) * env)


def sfx_boing(rng, s):
    n = ns(max(s, 0.4))
    t = times(n)
    f = 160 * (1 + 0.9 * (1 - np.exp(-t * 5))) * (1 + 0.22 * np.exp(-t * 3) * np.sin(TAU * 13 * t))
    ph = dsp.phase_of(f)
    tone = sum(a * np.sin(k * ph) * np.exp(-t * (3 + k)) for k, a in ((1, 1.0), (2, 0.5), (3, 0.35), (4, 0.15)))
    return dsp.softclip(f32(tone * np.minimum(1, t / 0.003)), 4)


def sfx_laser(rng, s):
    n = ns(s)
    t = times(n)
    f = 2400 * (0.11 ** (t / s)) * (1 + 0.06 * np.sin(TAU * 40 * t))
    ph = dsp.phase_of(f)
    wave = sum(np.sin(k * ph) / k for k in (1, 3, 5, 7))
    env = np.minimum(1, t / 0.002) * (1 - t / s) ** 1.5
    return f32(wave * env)


def sfx_gong(rng, s):
    dur = max(s + 2.5, 4.5)
    n = ns(dur)
    t = times(n)
    f0 = 82.0
    ratios = [1, 1.47, 2.09, 2.56, 2.99, 3.62, 4.17, 5.13, 6.21, 7.37, 8.6, 10.1]
    out = np.zeros(n)
    for i, r in enumerate(ratios):
        f = f0 * r * rng.uniform(0.995, 1.005) * (1 + 0.01 * i / len(ratios) * (1 - np.exp(-t / 0.8)))
        bloom = 1 - np.exp(-t / (0.01 + 0.06 * i))
        decay = np.exp(-t / (5.5 / (1 + 0.35 * i)))
        beat = 1 + 0.15 * np.sin(TAU * rng.uniform(0.3, 1.5) * t + rng.uniform(0, TAU))
        out += (1 / (1 + 0.25 * i)) * np.sin(dsp.phase_of(f) + rng.uniform(0, TAU)) * bloom * decay * beat
    strike = dsp.band(dsp.white(rng, ns(0.05)), 80, 1500) * np.exp(-times(ns(0.05)) / 0.01)
    out[: len(strike)] += strike * 2
    return dsp.fade(f32(out), 0, 1.0)


def sfx_crickets(rng, s):
    n = ns(s)
    out = np.zeros(n, np.float32)
    for _ in range(3):
        f0 = rng.uniform(4200, 5000)
        period = rng.uniform(0.5, 0.75)
        pulses = int(rng.integers(3, 5))
        gain = rng.uniform(0.4, 1.0)
        at = rng.uniform(0, period)
        while at < s:
            for p in range(pulses):
                m = ns(0.016)
                tt = times(m)
                chirp = np.sin(TAU * f0 * tt) * np.sin(np.pi * tt / 0.016) ** 2
                place(out, f32(chirp), at + p * 0.032, gain)
            at += period * rng.uniform(0.9, 1.1)
    air = dsp.band(dsp.colored(rng, n, -3), 100, 3000)
    return dsp.fade(out + dsp.at_rms(air, 20 * np.log10(dsp.rms(out) + 1e-9) - 14), 0.15, 0.25)


def sfx_tiny_explosion(rng, s):
    dur = max(s, 0.6)
    n = ns(dur)
    t = times(n)

    def magnitude(tt, f):
        cutoff = 400 + 6000 * np.exp(-tt / 0.08)
        return np.exp(-tt / 0.12) / np.sqrt(1 + (f / cutoff) ** 4) * (f > 150)

    blast = dsp.shaped_noise(rng, n, magnitude, frame=256, hop=64)
    blast *= np.minimum(1, t / 0.002)
    thump = np.sin(dsp.phase_of(55 + 110 * np.exp(-t / 0.04))) * np.exp(-t / 0.09)
    debris_rate = 70 * np.exp(-t / 0.25)
    debris = dsp.impulses(rng, n, 70, 0.2, 1.0) * (rng.random(n) < debris_rate / 70)
    debris = dsp.band(debris, 2000, 8000)
    return dsp.at_rms(blast, -18) + dsp.at_rms(f32(thump), -20) + dsp.at_rms(debris, -28)


def sfx_door_creak(rng, s):
    n = ns(s)
    t = times(n)
    u = t / s
    rate = 22 + 85 * np.sin(np.pi * np.clip(u * 1.1, 0, 1)) ** 2 * (0.85 + 0.3 * dsp.wander(rng, n, 6))
    phase = np.cumsum(rate / SR)
    pulses = np.diff(np.floor(phase), prepend=0).astype(np.float32) * rng.uniform(0.5, 1.0, n).astype(np.float32)
    body = sum(np.sin(TAU * f * times(ns(0.08))) * np.exp(-times(ns(0.08)) / d)
               for f, d in ((380, 0.03), (720, 0.025), (1150, 0.02), (1900, 0.015), (2800, 0.01)))
    creak = dsp.convolve(pulses, f32(body))[:n]
    return dsp.fade(dsp.band(creak, 200, 5000), 0.05, 0.12)


def sfx_typing(rng, s):
    n = ns(s)
    out = np.zeros(n + ns(0.2), np.float32)
    at, keys = rng.uniform(0, 0.05), 0
    while at < s:
        space = keys > 0 and rng.random() < 0.15
        m = ns(0.05)
        tt = times(m)
        click = dsp.band(dsp.white(rng, m), 1500, 7000) * np.exp(-tt / 0.0015)
        thock_f = 160 if space else rng.uniform(240, 330)
        thock = np.sin(TAU * thock_f * tt) * np.exp(-tt / (0.025 if space else 0.012))
        key = f32(click * 0.7 + thock * 0.5)
        place(out, key, at, rng.uniform(0.6, 1.0))
        place(out, key * 0.3, at + rng.uniform(0.06, 0.09))
        keys += 1
        at += rng.exponential(0.11) + 0.03 + (rng.uniform(0.2, 0.5) if rng.random() < 0.06 else 0)
    return out


def sfx_whoosh(rng, s):
    n = ns(s)

    def magnitude(t, f):
        u = np.clip(t / s, 0, 1)
        centre = np.exp(np.interp(u, [0, 0.45, 1], np.log([300, 3500, 700])))
        amp = np.sin(np.pi * np.clip(u, 0, 1) ** 0.8) ** 2
        return amp * np.exp(-(((f - centre) / (centre * 0.7)) ** 2))

    return dsp.shaped_noise(rng, n, magnitude)


def sfx_beep(rng, s):
    n = ns(s)
    return f32(np.sin(TAU * 1000 * times(n)) * dsp.envelope(n, 0.005, 0.005))


SFX = {
    "zap": (sfx_zap, -24.0),
    "applause": (sfx_applause, -22.0),
    "phone-ring": (sfx_phone_ring, -24.0),
    "phone-hangup": (sfx_phone_hangup, -25.0),
    "ding": (sfx_ding, -24.0),
    "cash-register": (sfx_cash_register, -22.0),
    "record-scratch": (sfx_record_scratch, -21.0),
    "boing": (sfx_boing, -23.0),
    "laser": (sfx_laser, -24.0),
    "gong": (sfx_gong, -22.0),
    "crickets": (sfx_crickets, -28.0),
    "tiny-explosion": (sfx_tiny_explosion, -22.0),
    "door-creak": (sfx_door_creak, -24.0),
    "typing": (sfx_typing, -27.0),
    "whoosh": (sfx_whoosh, -24.0),
    "beep": (sfx_beep, -25.0),
}


def make_sfx(name: str, seconds: float, level: float, rng: np.random.Generator) -> np.ndarray:
    """The effect at its natural level times `level`. May ring past `seconds` (tails)."""
    fn, target = SFX[name]
    return dsp.normalize(dsp.band(fn(rng, seconds), 30, 11000), target) * level


# ── Stings ────────────────────────────────────────────────────────────────────


def sting_id(rng):
    out = np.zeros(ns(2.2), np.float32)
    rise = dsp.shaped_noise(rng, ns(0.35), lambda t, f: np.exp(-(((f - (400 + 12000 * t)) / 600) ** 2)))
    place(out, dsp.fade(rise, 0.2, 0.05) * 0.15, 0.0)
    for i, name in enumerate(("D5", "F#5", "A5", "C#6", "E6")):
        tone = glock(note(name), 1.2)
        place(out, tone * 0.5, 0.12 + i * 0.07)
        place(out, glock(note(name) * 1.006, 1.2) * 0.2, 0.135 + i * 0.07)  # the other universe's copy
    pad = sum(brass(note(nm), 1.5, bright=0.35, release=0.6) for nm in ("D4", "A4", "F#5"))
    place(out, dsp.fade(pad, 0.25, 0.6) * 0.12, 0.35)
    place(out, marimba(note("D3"), 0.9) * 0.6, 0.38)
    return out


def sting_news(rng):
    out = np.zeros(ns(2.5), np.float32)
    for i in range(4):
        place(out, glock(note("A5"), 0.25) * 0.35, i * 0.1)
    stab = sum(brass(note(nm), 1.2, bright=0.8, release=0.5) for nm in ("A3", "E4", "A4", "C5"))
    place(out, stab * 0.18, 0.42)
    place(out, timpani(note("A2"), 1.2, rng) * 0.6, 0.42)
    place(out, bell(note("E6"), 1.2, rng) * 0.15, 0.95)
    return out


def sting_sports(rng):
    out = np.zeros(ns(2.6), np.float32)
    for k, at in enumerate(np.arange(0, 0.58, 1 / 18)):
        place(out, snare(rng, 0.15) * (0.1 + 0.5 * k / 10), at)
    for i, name in enumerate(("G4", "G4", "G4")):
        place(out, brass(note(name), 0.09, bright=1.0) * 0.3, 0.3 + i * 0.1)
    held = sum(brass(note(nm), 1.4, bright=1.0, vibrato=0.6, release=0.35) for nm in ("C5", "E5", "G5", "C4"))
    place(out, held * 0.18, 0.6)
    place(out, cymbal(rng, 1.8) * 0.25, 0.6)
    place(out, timpani(note("C3"), 1.0, rng) * 0.6, 0.6)
    return out


def sting_ad(rng):
    out = np.zeros(ns(1.6), np.float32)
    for i, name in enumerate(("C5", "E5", "G5", "C6")):
        place(out, marimba(note(name), 0.4) * 0.45, i * 0.085)
    for name in ("C5", "E5", "G5", "C6"):
        place(out, marimba(note(name), 0.9) * 0.25, 0.38)
    place(out, glock(note("C7"), 0.8) * 0.08, 0.4)
    return out


def sting_weather(rng):
    out = np.zeros(ns(2.6), np.float32)
    breeze = sfx_whoosh(rng, 1.6)
    place(out, dsp.at_rms(breeze, -30), 0.0)
    for i, name in enumerate(("C5", "E5", "G5", "A5", "D6")):
        place(out, vibes(note(name), 1.6) * 0.3, 0.05 + i * 0.16)
    return out


def sting_chime(rng):
    out = np.zeros(ns(2.4), np.float32)
    for i, name in enumerate(("A5", "F5")):
        tone = partials(note(name), 1.8, [1, 2.0, 3.0, 4.2], [1, 0.25, 0.08, 0.04], [0.9, 0.4, 0.2, 0.1], attack=0.004)
        place(out, tone * 0.4, i * 0.55)
    return out


def sting_fanfare(rng):
    out = np.zeros(ns(3.4), np.float32)
    seq = [("C5", 0.0, 0.11), ("C5", 0.14, 0.11), ("C5", 0.28, 0.11), ("G5", 0.42, 0.45),
           ("E5", 0.95, 0.16), ("G5", 1.14, 1.5)]
    for name, at, dur in seq:
        place(out, brass(note(name), dur, bright=1.0, vibrato=0.5 if dur > 1 else 0) * 0.3, at)
    place(out, brass(note("E5"), 1.5, bright=0.9, vibrato=0.5) * 0.2, 1.14)
    place(out, brass(note("C4"), 1.5, bright=0.8) * 0.2, 1.14)
    for k, at in enumerate(np.arange(1.14, 2.4, 1 / 14)):
        place(out, timpani(note("C3"), 0.5, rng) * 0.25 * (1 - k / 20), at)
    place(out, cymbal(rng, 2.0) * 0.25, 1.14)
    return out


def sting_sad_trombone(rng):
    out = np.zeros(ns(3.0), np.float32)
    seq = [("D4", 0.0, 0.42), ("C#4", 0.48, 0.42), ("C4", 0.96, 0.42), ("B3", 1.44, 1.2)]
    for name, at, dur in seq:
        n = ns(dur)
        t = times(n)
        if dur > 1:
            wah = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(TAU * 5 * t - np.pi / 2))
            vib = 1.0
        else:
            wah = 0.3 + 0.7 * np.sin(np.pi * np.minimum(1, t / dur)) ** 0.7
            vib = 0.0
        place(out, brass(note(name) / 2, dur, bright=0.55, vibrato=vib, release=0.15, wah=wah) * 0.45, at)
    return out


STINGS = {
    "id": sting_id,
    "news": sting_news,
    "sports": sting_sports,
    "ad": sting_ad,
    "weather": sting_weather,
    "chime": sting_chime,
    "fanfare": sting_fanfare,
    "sad-trombone": sting_sad_trombone,
}
STING_LUFS = -19.0


def make_sting(name: str, rng: np.random.Generator) -> np.ndarray:
    audio = STINGS[name](rng)
    audio, _ = dsp.trim_silence(audio, -60, 0.01)
    return dsp.normalize(dsp.band(audio, 40, 11000), STING_LUFS)
