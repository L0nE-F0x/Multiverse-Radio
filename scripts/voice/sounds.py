"""Synthesized beds, sound effects and stings. No samples: everything is built from noise,
oscillators, simple physical models and reverb, so every name in SCHEMA.md is safe to use.

Levels are set by loudness (LUFS) relative to voices, which sit at voicefx.VOICE_LUFS (-20).
"""

from __future__ import annotations

import numpy as np

import dsp
from dsp import SR, TAU, f32, note, ns, place, times

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
    # Damp whatever is still ringing at the end so truncation never clicks.
    return dsp.fade(f32(out * np.minimum(1, t / attack)), 0, min(0.08, dur / 4))


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
    return dsp.fade(f32((body + hit) * np.minimum(1, t / 0.002)), 0, 0.08)


def snare(rng: np.random.Generator, dur: float = 0.25) -> np.ndarray:
    n = ns(dur)
    t = times(n)
    rattle = dsp.band(dsp.white(rng, n), 1500, 9000) * np.exp(-t / 0.08)
    body = np.sin(TAU * 190 * t) * np.exp(-t / 0.04)
    return dsp.fade(f32(rattle * 0.8 + body * 0.6), 0, 0.04)


def cymbal(rng: np.random.Generator, dur: float = 1.8) -> np.ndarray:
    n = ns(dur)
    t = times(n)
    wash = dsp.band(dsp.white(rng, n), 3500, 11000) * np.exp(-t / (dur * 0.35))
    ping = partials(1.0, dur, rng.uniform(3200, 9000, 8), rng.uniform(0.02, 0.06, 8), [dur * 0.3] * 8, rng=rng)
    return dsp.fade(f32((wash + ping) * np.minimum(1, t / 0.003)), 0, 0.2)


def boom(dur: float = 0.6) -> np.ndarray:
    n = ns(dur)
    t = times(n)
    f = 45 + 80 * np.exp(-t / 0.05)
    return dsp.fade(f32(np.sin(dsp.phase_of(f)) * np.exp(-t / 0.18) * np.minimum(1, t / 0.002)), 0, 0.05)


def chord(instrument, names, dur, spread: float = 0.0, **kw) -> np.ndarray:
    out = np.zeros(ns(dur + spread * len(names)), np.float32)
    for i, name in enumerate(names):
        place(out, instrument(note(name), dur, **kw), i * spread)
    return out


# v3 instruments


def pluck(freq: float, dur: float, rng: np.random.Generator, bright: float = 0.6, decay: float = 0.997) -> np.ndarray:
    """Karplus-Strong plucked string (guitar, harp). The loop runs at a whole-sample period and
    is then resampled onto the exact pitch."""
    n = ns(dur)
    p = max(2, int(round(SR / freq - 0.5)))
    speed = freq / (SR / (p + 0.5))  # the two-tap average adds half a sample of delay
    m = int(n * speed) + 3
    y = np.zeros(m + 1)  # y[i] lives at y[i + 1]; y[0] stands for y[-1] = 0
    excite = dsp.band(dsp.white(rng, p), hi=800 + 9000 * bright)
    y[1 : p + 1] = excite - excite.mean()
    for start in range(p, m, p):
        end = min(m, start + p)
        y[start + 1 : end + 1] = decay * 0.5 * (y[start - p + 1 : end - p + 1] + y[start - p : end - p])
    y = y[1:] / (np.abs(y[1 : p + 1]).max() + 1e-9)
    tone = np.interp(np.arange(n) * speed, np.arange(m), y)
    return dsp.fade(f32(tone * np.minimum(1, times(n) / 0.002)), 0, min(0.1, dur / 4))


def piano(freq: float, dur: float, rng: np.random.Generator | None = None, bright: float = 0.6) -> np.ndarray:
    """Stretched, decaying partials with a hammer thump: enough of a piano for a sting."""
    k = np.arange(1, 16)
    ratios = k * np.sqrt(1 + 0.0004 * k * k)
    amps = (1 / k ** (1.4 - 0.6 * bright)) * (1 + 0.6 * np.sin(np.pi * k * 0.13))
    decays = dur * 0.5 / (1 + 0.35 * (k - 1))
    tone = partials(freq, dur, ratios, amps, decays, attack=0.003, rng=rng)
    n = len(tone)
    t = times(n)
    thump = np.sin(TAU * freq * 0.5 * t) * np.exp(-t / 0.04) * 0.3
    return f32(tone + thump * np.minimum(1, t / 0.002))


def fm_tone(freq: float, dur: float, ratio: float = 3.5, index: float = 2.0, decay: float = 0.6,
            attack: float = 0.006) -> np.ndarray:
    """Two-operator FM bell/chime: the modulation fades faster than the tone, so it softens as it rings."""
    n = ns(dur)
    t = times(n)
    mod = index * np.exp(-t / (decay * 0.35)) * np.sin(TAU * freq * ratio * t)
    tone = np.sin(TAU * freq * t + mod) * np.exp(-t / decay)
    return dsp.fade(f32(tone * np.minimum(1, t / attack)), 0, min(0.08, dur / 4))


def glide_tone(freqs, dur: float, harmonics=((1, 1.0),), vibrato: float = 0.0, vib_rate: float = 5.5) -> np.ndarray:
    """A tone following a frequency curve (array or (times, values) breakpoints) with optional vibrato."""
    n = ns(dur)
    t = times(n)
    if isinstance(freqs, tuple):
        f = np.interp(t, *freqs)
    else:
        f = np.broadcast_to(np.asarray(freqs, np.float64), (n,))
    f = f * (1 + vibrato * np.sin(TAU * vib_rate * t) * np.clip(t / 0.25, 0, 1))
    ph = dsp.phase_of(f)
    out = np.zeros(n)
    for r, a in harmonics:
        out += a * np.sin(r * ph) * (f * r < SR * 0.45)
    return f32(out)


def drip(freq: float, dur: float = 0.12) -> np.ndarray:
    """A water drop: a resonant bubble whose pitch rises sharply as it closes ("plip")."""
    n = ns(dur)
    t = times(n)
    f = freq * (1 + 1.4 * (1 - np.exp(-t / 0.012)))
    tone = np.sin(dsp.phase_of(f)) * np.exp(-t / 0.018) * np.minimum(1, t / 0.0008)
    return dsp.fade(f32(tone), 0, 0.01)


def knock(rng: np.random.Generator, modes, dur: float = 0.12, click: float = 0.6) -> np.ndarray:
    """A struck object: a noise click into a few damped resonances [(Hz, decay s, gain)]."""
    n = ns(dur)
    t = times(n)
    body = sum(g * np.sin(TAU * f * t + rng.uniform(0, TAU)) * np.exp(-t / d) for f, d, g in modes)
    hit = dsp.band(dsp.white(rng, n), 1500, 9000) * np.exp(-t / 0.002) * click
    return dsp.fade(f32((body + hit) * np.minimum(1, t / 0.0005)), 0, min(0.02, dur / 4))


def creak(rng: np.random.Generator, dur: float, rate=(15, 70), modes=((380, 0.03), (720, 0.025), (1150, 0.02))) -> np.ndarray:
    """Stick-slip friction (doors, timbers, chairs): pulses at a wandering rate through wood resonances."""
    n = ns(dur)
    u = times(n) / max(dur, 1e-3)
    lo, hi = rate
    r = lo + (hi - lo) * np.sin(np.pi * np.clip(u * 1.1, 0, 1)) ** 2 * (0.7 + 0.6 * dsp.wander(rng, n, 5))
    phase = np.cumsum(r / SR)
    pulses = np.diff(np.floor(phase), prepend=0).astype(np.float32) * rng.uniform(0.4, 1.0, n).astype(np.float32)
    m = ns(0.1)
    body = sum(np.sin(TAU * f * times(m)) * np.exp(-times(m) / d) for f, d in modes)
    return dsp.fade(dsp.convolve(pulses, f32(body))[:n], 0.04, 0.1)


def formant_voice(f0, formants, dur: float, rng: np.random.Generator, breath: float = 0.1) -> np.ndarray:
    """Additive source-filter voice: harmonics of f0(t) weighted by moving formants (Hz, bw, gain)(t).

    `f0` is (times, values); `formants` is a list of (times, freqs, bandwidths, gains) tracks.
    Used for animal calls (meow, owl) rather than speech.
    """
    n = ns(dur)
    t = times(n)
    f = np.interp(t, *f0) * (1 + 0.01 * (dsp.wander(rng, n, 12) - 0.5))
    ph = dsp.phase_of(f)
    tracks = [(np.interp(t, ts, fs), np.interp(t, ts, bws), np.interp(t, ts, gs)) for ts, fs, bws, gs in formants]

    def envelope_at(freq):
        return sum(g / (1 + ((freq - fc) / (bw / 2)) ** 2) for fc, bw, g in tracks)

    out = np.zeros(n)
    for k in range(1, int(SR * 0.45 / max(1.0, float(f.min())))):
        fk = f * k
        out += np.sin(k * ph) * envelope_at(fk) * (fk < SR * 0.45) / k**0.3
    noise = dsp.band(dsp.white(rng, n), 300, 8000)
    noise_shaped = dsp.f32(noise) * 0.5
    return f32(out + breath * noise_shaped * dsp.rms(f32(out)) / max(dsp.rms(noise_shaped), 1e-9))


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
    """Many hands: each clapper has its own hand resonance, so the texture never combs."""
    n = ns(seconds)
    clap = ns(0.014)
    density = 1 - density_wander + density_wander * dsp.wander(rng, n, 1.5)
    out = np.zeros(n, np.float32)
    hands = 16
    for _ in range(hands):
        shape = np.exp(-np.arange(clap) / (SR * rng.uniform(0.0015, 0.0035))).astype(np.float32)
        kernel = dsp.resonances(dsp.white(rng, clap) * shape, [(rng.uniform(900, 2600), rng.uniform(300, 900), 8)])
        imp = dsp.impulses(rng, n, rate / hands, 0.3, 1.0) * (rng.random(n) < density)
        out += dsp.convolve(imp, kernel)[:n]
    return dsp.band(out, 500, 9000)


# ── Beds ──────────────────────────────────────────────────────────────────────


def bed_rain(rng, s):
    n = ns(s)
    hush = dsp.shaped_noise(rng, n, lambda t, f: (f > 300) * (np.maximum(f, 1) / 1000.0) ** -0.7 * (f < 10000))
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
    return dsp.at_rms(hush, -22) + dsp.at_rms(drops, -22) + dsp.at_rms(plinks, -30) + dsp.at_rms(rumble, -30)


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


# v3 beds


def _events(rng: np.random.Generator, seconds: float, mean_gap: float, first=(0.0, 1.0), min_gap: float = 0.0):
    """Random event times: a first one in `first`, then exponential gaps (at least `min_gap`)."""
    at = rng.uniform(*first)
    while at < seconds:
        yield at
        at += min_gap + rng.exponential(mean_gap)


def bubbles_texture(rng: np.random.Generator, seconds: float, rate: float, lo: float, hi: float, rise: float = 1.6) -> np.ndarray:
    """Simmering/bubbling: short resonant blips that rise in pitch as each bubble closes."""
    out = np.zeros(ns(seconds) + ns(0.1), np.float32)
    for at in _events(rng, seconds, 1 / rate, (0, 0.2)):
        dur = rng.uniform(0.015, 0.04)
        m = ns(dur)
        t = times(m)
        f = rng.uniform(lo, hi) * (1 + (rise - 1) * t / dur)
        blip = np.sin(dsp.phase_of(f)) * np.sin(np.pi * t / dur) ** 1.5
        place(out, f32(blip), at, rng.uniform(0.2, 1.0))
    return out[: ns(seconds)]


def bed_kitchen(rng, s):
    """A working kitchen: extractor hood, a pot on a simmer, the odd clink and a little chopping."""
    n = ns(s)
    t = times(n)
    hood = dsp.band(dsp.colored(rng, n, -3), 90, 1800) * (0.9 + 0.1 * dsp.wander(rng, n, 0.3))
    motor = np.sin(TAU * 100 * t) + 0.5 * np.sin(TAU * 200 * t + 1) + 0.2 * np.sin(TAU * 300 * t)
    simmer = dsp.band(bubbles_texture(rng, s, 14, 180, 520), 120, 2500)
    chops = np.zeros(n + ns(0.3), np.float32)
    for at in _events(rng, s, 7.0, (1.5, 4.0), min_gap=3.0):
        for k in range(int(rng.integers(3, 7))):
            place(chops, dsp.at_rms(_chop(rng), -22), at + k * rng.uniform(0.17, 0.24), rng.uniform(0.6, 1.0))
    return (dsp.at_rms(hood, -21) + dsp.at_rms(f32(motor), -34) + dsp.at_rms(simmer, -25)
            + dsp.at_rms(clinks(rng, s, 0.35), -31) + chops[:n])


def bed_truckstop(rng, s):
    """Night at a truck stop: a diesel idling nearby, traffic passing on the highway, air brakes."""
    n = ns(s)
    t = times(n)
    firing = 34.0 * (1 + 0.01 * np.sin(TAU * 0.3 * t))
    ph = dsp.phase_of(firing)
    pulse = (0.5 + 0.5 * np.cos(ph)) ** 6
    diesel = (dsp.band(dsp.white(rng, n), 60, 900) * pulse * 1.0 + np.sin(ph * 2) * 0.4 + np.sin(ph) * 0.6)
    clatter = dsp.band(dsp.white(rng, n), 1200, 3500) * pulse ** 2
    diesel = dsp.band(f32(diesel + clatter * 0.25), 30, 1800)
    traffic = np.zeros(n, np.float32)
    for at in _events(rng, s, 6.0, (0.0, 3.0), min_gap=2.5):
        dur = rng.uniform(3.0, 5.0)
        peak = rng.uniform(0.4, 0.6)
        f_hi, f_lo = rng.uniform(700, 1100), rng.uniform(350, 550)

        def mag(tt, f, dur=dur, peak=peak, f_hi=f_hi, f_lo=f_lo):
            u = np.clip(tt / dur, 0, 1)
            amp = np.exp(-(((u - peak) / 0.18) ** 2))
            centre = np.where(u < peak, f_hi, f_lo)  # the doppler drop as it passes
            return amp * (f > 60) / (1 + (f / centre) ** 2) * (np.maximum(f, 1) / 300) ** -0.3

        place(traffic, dsp.at_rms(dsp.shaped_noise(rng, ns(dur), mag), -22), at, rng.uniform(0.5, 1.0))
    brakes = np.zeros(n + ns(1), np.float32)
    for at in _events(rng, s, 14.0, (4.0, 9.0), min_gap=5.0):
        dur = rng.uniform(0.5, 0.9)
        m = ns(dur)
        tt = times(m)
        hiss_ = dsp.band(dsp.white(rng, m), 1800, 6000) * np.minimum(1, tt / 0.01) * np.exp(-tt / (dur * 0.5))
        place(brakes, dsp.at_rms(f32(hiss_), -30), at, rng.uniform(0.6, 1.0))
    room = dsp.band(murmur(rng, s, talkers=3), 150, 2000)
    return (dsp.at_rms(diesel, -22) + traffic + brakes[:n]
            + dsp.at_rms(room, -33))


def bed_sea(rng, s):
    """At sea in a wooden ship: swell against the hull, lapping water and creaking timbers."""
    n = ns(s)
    ctrl_t = np.arange(0, s + 1, 0.01)
    level = np.full(len(ctrl_t), 0.2)
    swells = []
    at = -rng.uniform(0, 4)
    while at < s:
        rise, decay = rng.uniform(1.6, 2.6), rng.uniform(1.8, 3.0)
        x = ctrl_t - at
        level += rng.uniform(0.5, 0.9) * np.where(x < 0, 0, np.where(x < rise, (x / rise) ** 2, np.exp(-(x - rise) / decay * 2)))
        swells.append(at + rise)
        at += rng.uniform(4.0, 6.5)

    def magnitude(t, f):
        lvl = np.interp(t, ctrl_t, level)
        cutoff = 250 + 1300 * np.clip(lvl - 0.2, 0, 1) ** 1.3
        return lvl * (f > 40) / np.sqrt(1 + (f / cutoff) ** 4) * (np.maximum(f, 1) / 300) ** -0.4

    water = dsp.shaped_noise(rng, n, magnitude)
    lapping = np.zeros(n + ns(0.4), np.float32)
    for at in _events(rng, s, 0.8, (0, 0.5)):
        dur = rng.uniform(0.18, 0.5)
        m = ns(dur)
        tt = times(m)
        slap = dsp.band(dsp.white(rng, m), rng.uniform(250, 450), rng.uniform(1000, 1800), order=3) * np.sin(np.pi * tt / dur) ** 3
        place(lapping, f32(slap), at, rng.uniform(0.3, 1.0))
    timbers = np.zeros(n + ns(2), np.float32)
    wood = ((170, 0.05), (310, 0.04), (520, 0.03), (880, 0.02))
    for peak in swells:
        for _ in range(int(rng.integers(1, 3))):
            at = peak + rng.uniform(-0.8, 0.6)
            if 0 <= at < s:
                place(timbers, dsp.at_rms(creak(rng, rng.uniform(0.5, 1.4), rate=(8, rng.uniform(30, 55)), modes=wood), -22), at,
                      rng.uniform(0.4, 1.0))
    return dsp.at_rms(water, -21) + dsp.at_rms(lapping[:n] + 1e-9, -31) + timbers[:n]


def _owl(rng: np.random.Generator) -> np.ndarray:
    """A tawny-ish hoot: a soft breathy 'hoo', a pause, then a wavering 'hoo-hoo-hooo'."""
    out = np.zeros(ns(2.4), np.float32)
    base = rng.uniform(340, 420)
    notes = [(0.0, 0.42, 1.0, 0.0), (0.95, 0.16, 0.6, 0.0), (1.2, 0.75, 0.9, 0.03)]
    for at, dur, gain, wobble in notes:
        n = ns(dur)
        t = times(n)
        f = base * (1.04 - 0.06 * t / dur) * (1 + wobble * np.sin(TAU * 9 * t))
        tone = np.sin(dsp.phase_of(f)) + 0.15 * np.sin(2 * dsp.phase_of(f))
        breath = dsp.band(dsp.white(rng, n), base * 0.8, base * 3) * 0.25
        env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.8
        place(out, f32((tone + breath) * env), at, gain)
    return out


def bed_night(rng, s):
    """A summer night outside: crickets in the grass, an owl somewhere, a little air moving."""
    n = ns(s)
    crickets = np.zeros(n, np.float32)
    for _ in range(5):
        f0 = rng.uniform(3800, 5200)
        period = rng.uniform(0.35, 0.8)
        pulses = int(rng.integers(2, 5))
        gain = rng.uniform(0.2, 1.0)
        at = rng.uniform(0, period)
        while at < s:
            for p in range(pulses):
                m = ns(0.014)
                tt = times(m)
                place(crickets, f32(np.sin(TAU * f0 * tt) * np.sin(np.pi * tt / 0.014) ** 2), at + p * 0.028, gain)
            at += period * rng.uniform(0.92, 1.08)
    owls = np.zeros(n + ns(2.5), np.float32)
    forest = dsp.reverb_ir(rng, 1.6, predelay=0.05, hi=3000)
    for at in _events(rng, s, 7.0, (1.0, 4.0), min_gap=4.0):
        hoot = dsp.add_reverb(dsp.band(_owl(rng), 200, 2500), forest, -6, dry=0.6)
        place(owls, dsp.at_rms(hoot, -23), at, rng.uniform(0.6, 1.0))
    air = dsp.band(dsp.colored(rng, n, -4), 80, 1500) * (0.8 + 0.2 * dsp.wander(rng, n, 0.2))
    return dsp.at_rms(crickets, -24) + owls[:n] + dsp.at_rms(air, -30)


def _oompah(rng: np.random.Generator, seconds: float) -> np.ndarray:
    """A brass band some way off: tuba on the beat, cornets on the off-beat, a tune on top."""
    bpm = 104.0
    beat = 60 / bpm
    out = np.zeros(ns(seconds) + ns(1.0), np.float32)
    bass = ["C3", "G2", "C3", "G2", "F2", "C3", "G2", "G2"]
    chords = [("E4", "G4", "C5"), ("E4", "G4", "C5"), ("F4", "A4", "C5"), ("D4", "G4", "B4")]
    tune = ["E5", "G5", "C6", "G5", "A5", "F5", "D5", "G5", "E5", "C5", "D5", "B4", "C5", "E5", "G5", "C5"]
    bar = 0
    at = 0.0
    while at < seconds:
        for b in range(2):
            place(out, brass(note(bass[(bar * 2 + b) % len(bass)]) / 2, beat * 0.6, bright=0.4) * 0.5, at + b * 2 * beat)
            for nm in chords[bar % len(chords)]:
                place(out, brass(note(nm), beat * 0.4, bright=0.5) * 0.12, at + (b * 2 + 1) * beat)
        for k in range(4):
            place(out, brass(note(tune[(bar * 4 + k) % len(tune)]), beat * 0.9, bright=0.7, vibrato=0.3) * 0.22,
                  at + k * beat)
        bar += 1
        at += 4 * beat
    return out[: ns(seconds)]


def bed_fete(rng, s):
    """A village fete that never ends: a crowd on the green, a brass band across the field."""
    n = ns(s)
    crowd = dsp.band(murmur(rng, s, talkers=9), 120, 4000)
    field = dsp.reverb_ir(rng, 1.4, predelay=0.08, hi=2500)
    band_ = dsp.add_reverb(dsp.band(_oompah(rng, s), 80, 2200), field, -2, dry=0.5)[:n]
    band_ = band_ * (0.85 + 0.15 * dsp.wander(rng, n, 0.15))  # the breeze carries it, then doesn't
    patter = np.zeros(n + ns(3), np.float32)
    for at in _events(rng, s, 12.0, (3.0, 8.0), min_gap=5.0):
        dur = rng.uniform(1.2, 2.2)
        claps = clap_texture(rng, dur, 80, 0.2) * np.sin(np.pi * times(ns(dur)) / dur) ** 2
        place(patter, dsp.at_rms(f32(claps), -28), at)
    patter = dsp.band(patter[:n], 300, 3500, order=4)
    return dsp.at_rms(crowd, -23) + dsp.at_rms(band_, -24) + patter


def _cough(rng: np.random.Generator) -> np.ndarray:
    out = np.zeros(ns(0.7), np.float32)
    for k in range(int(rng.integers(1, 3))):
        dur = rng.uniform(0.12, 0.2)
        m = ns(dur)
        tt = times(m)
        burst = dsp.resonances(dsp.band(dsp.white(rng, m), 200, 4000), [(rng.uniform(450, 700), 300, 12), (1700, 600, 6)])
        place(out, f32(burst * np.minimum(1, tt / 0.005) * np.exp(-tt / (dur * 0.35))), k * rng.uniform(0.25, 0.35))
    return out


def bed_hall(rng, s):
    """A council meeting in a parish hall: room tone, ventilation, chairs, papers, a cough."""
    n = ns(s)
    air = dsp.band(dsp.colored(rng, n, -4), 70, 1500, order=3)
    vent = dsp.band(dsp.colored(rng, n, -6), 30, 300) * (0.85 + 0.15 * dsp.wander(rng, n, 0.2))
    room = dsp.reverb_ir(rng, 1.3, predelay=0.03, hi=4000)
    events = np.zeros(n + ns(1.5), np.float32)
    for at in _events(rng, s, 3.5, (0.5, 2.0), min_gap=1.0):
        kind = rng.random()
        if kind < 0.4:  # a chair creaks or scrapes
            sound = creak(rng, rng.uniform(0.2, 0.6), rate=(25, rng.uniform(60, 140)),
                          modes=((260, 0.03), (540, 0.02), (1300, 0.012)))
            gain = dsp.db(-24)
        elif kind < 0.75:  # papers
            dur = rng.uniform(0.15, 0.45)
            m = ns(dur)
            crinkle = dsp.band(dsp.white(rng, m), 1800, 7000) * (rng.random(m) < 0.25) * np.sin(np.pi * times(m) / dur)
            sound, gain = f32(crinkle), dsp.db(-27)
        else:
            sound, gain = _cough(rng), dsp.db(-22)
        place(events, dsp.at_rms(sound, 0.0), at, gain * rng.uniform(0.5, 1.0))
    events = dsp.add_reverb(events[:n] + 1e-9, room, -5)[:n]
    return dsp.at_rms(air, -22) + dsp.at_rms(vent, -24) + events


def bed_studio(rng, s):
    """A quiet studio: the hush of a treated room, a faint equipment hum, the odd chair or page."""
    n = ns(s)
    t = times(n)
    air = dsp.band(dsp.colored(rng, n, -4), 80, 1800, order=3)
    hum = np.sin(TAU * 50 * t) + 0.4 * np.sin(TAU * 100 * t) + 0.2 * np.sin(TAU * 150 * t)
    small = np.zeros(n + ns(1), np.float32)
    for at in _events(rng, s, 6.0, (2.0, 5.0), min_gap=2.0):
        if rng.random() < 0.5:
            sound = creak(rng, rng.uniform(0.15, 0.35), rate=(30, 90), modes=((300, 0.02), (700, 0.015)))
        else:
            dur = rng.uniform(0.2, 0.4)
            m = ns(dur)
            sound = f32(dsp.band(dsp.white(rng, m), 1500, 6000) * (rng.random(m) < 0.3) * np.sin(np.pi * times(m) / dur))
        place(small, dsp.at_rms(sound, -27), at, rng.uniform(0.4, 1.0))
    return dsp.at_rms(air, -22) + dsp.at_rms(f32(hum), -38) + small[:n]


def _thunder(rng: np.random.Generator) -> np.ndarray:
    dur = rng.uniform(3.0, 5.0)
    n = ns(dur)
    t = times(n)
    crack_at = rng.uniform(0.0, 0.15)
    rolls = np.zeros(n)
    for _ in range(int(rng.integers(3, 7))):
        at = rng.uniform(0, dur * 0.6)
        width = rng.uniform(0.2, 0.8)
        rolls += rng.uniform(0.3, 1.0) * np.exp(-(((t - at) / width) ** 2)) * (t >= at - width)
    rumble = dsp.band(dsp.colored(rng, n, -6), 25, 260) * rolls * np.exp(-t / (dur * 0.5))
    crack = dsp.band(dsp.white(rng, n), 800, 7000) * np.exp(-np.maximum(0, t - crack_at) / 0.08) * (t >= crack_at)
    return dsp.fade(f32(rumble * 3 + crack * 0.6), 0.01, 0.6)


def bed_storm(rng, s):
    """A dimensional storm: gusts and thunder, squalls of static and the sky bending in pitch."""
    n = ns(s)
    wind = bed_wind(rng, s)
    thunder = np.zeros(n + ns(5.5), np.float32)
    for at in _events(rng, s, 6.0, (0.5, 3.0), min_gap=3.0):
        place(thunder, dsp.at_rms(_thunder(rng), -20), at, rng.uniform(0.5, 1.0))
    weird = np.zeros(n + ns(4), np.float32)
    for at in _events(rng, s, 4.0, (1.0, 3.0), min_gap=1.5):
        dur = rng.uniform(1.2, 3.0)
        m = ns(dur)
        tt = times(m)
        f = rng.uniform(150, 600) * 2 ** (rng.uniform(-2, 2) * tt / dur)
        tone = np.sin(dsp.phase_of(f)) * np.sin(TAU * rng.uniform(20, 70) * tt)  # ring-modulated: the sky, bending
        place(weird, dsp.at_rms(f32(tone * np.sin(np.pi * tt / dur) ** 2), -27), at, rng.uniform(0.4, 1.0))
    squalls = dsp.band(dsp.white(rng, n), 600, 6000) * dsp.wander(rng, n, 1.5) ** 4
    return (dsp.at_rms(wind, -21) + thunder[:n] + weird[:n]
            + dsp.at_rms(squalls, -29))


def bed_cockpit(rng, s):
    """The Nightjar at night: the drive's low hum, ventilation, quiet telemetry chirps."""
    n = ns(s)
    t = times(n)
    drive = sum(a * np.sin(TAU * f * t + p) for f, a, p in
                ((46.0, 1.0, 0), (46.3, 0.6, 1.1), (92.0, 0.5, 0.4), (138.5, 0.25, 2.0), (184.0, 0.12, 0.7)))
    drive = drive * (0.85 + 0.15 * np.sin(TAU * 0.07 * t))  # it breathes, slowly
    vent = dsp.band(dsp.colored(rng, n, -4), 150, 1600, order=3) * (0.9 + 0.1 * dsp.wander(rng, n, 0.3))
    chirps = np.zeros(n + ns(0.5), np.float32)
    for at in _events(rng, s, 4.0, (1.0, 3.0), min_gap=1.5):
        f0 = rng.choice([1320.0, 1760.0, 1980.0, 2640.0])
        for k in range(int(rng.integers(1, 4))):
            m = ns(0.05)
            tt = times(m)
            blip = np.sin(TAU * f0 * (1 + 0.5 * (k % 2)) * tt) * np.sin(np.pi * tt / 0.05) ** 2
            place(chirps, dsp.at_rms(f32(blip), -25), at + k * 0.09)
    relays = dsp.band(dsp.impulses(rng, n, 0.4, 0.5, 1.0), 800, 5000)
    return (dsp.at_rms(f32(drive), -22) + dsp.at_rms(vent, -27) + chirps[:n]
            + dsp.at_rms(relays + 1e-9, -40))


def bed_greenhouse(rng, s):
    """A humid glasshouse: misting jets, drips, a slow fan, now and then a passing bee."""
    n = ns(s)
    fan = dsp.band(dsp.colored(rng, n, -4), 100, 2000) * (0.9 + 0.1 * np.sin(TAU * 0.9 * times(n)))
    mist = np.zeros(n + ns(3.5), np.float32)
    for at in _events(rng, s, 7.0, (1.0, 4.0), min_gap=3.0):
        dur = rng.uniform(1.5, 3.0)
        m = ns(dur)
        tt = times(m)
        jet = dsp.band(dsp.white(rng, m), 3000, 7000, order=3) * np.minimum(1, tt / 0.3) * np.minimum(1, (dur - tt) / 0.6)
        place(mist, dsp.at_rms(f32(jet), -33), at, rng.uniform(0.6, 1.0))
    glass = dsp.reverb_ir(rng, 0.9, predelay=0.01, hi=7000)
    drips = np.zeros(n + ns(0.2), np.float32)
    for at in _events(rng, s, 0.9, (0, 0.6)):
        place(drips, drip(rng.uniform(900, 2000)), at, rng.uniform(0.3, 1.0))
    drips = dsp.add_reverb(drips[:n], glass, -8)[:n]
    bees = np.zeros(n + ns(3), np.float32)
    for at in _events(rng, s, 12.0, (3.0, 8.0), min_gap=4.0):
        dur = rng.uniform(1.5, 2.6)
        m = ns(dur)
        tt = times(m)
        f = rng.uniform(190, 240) * (1 + 0.04 * np.sin(TAU * 3 * tt)) * (1.03 - 0.06 * tt / dur)
        buzz = sum(np.sin(k * dsp.phase_of(f)) / k for k in range(1, 12))
        place(bees, dsp.at_rms(dsp.band(f32(buzz * np.sin(np.pi * tt / dur) ** 2), 150, 3000), -30), at)
    return dsp.at_rms(fan, -24) + mist[:n] + dsp.at_rms(drips + 1e-9, -27) + bees[:n]


def bed_cave_drip(rng, s):
    """Deep in a cave: water dripping into pools, every drop coming back from far away."""
    n = ns(s)
    drops = np.zeros(n + ns(0.2), np.float32)
    for at in _events(rng, s, 0.8, (0, 0.5), min_gap=0.08):
        place(drops, drip(rng.uniform(550, 1700), 0.15), at, rng.uniform(0.25, 1.0))
    cave = dsp.reverb_ir(rng, 3.6, predelay=0.04, hi=4500, early=[(0.05, 0.5), (0.11, 0.35), (0.19, 0.25)])
    wet = dsp.add_reverb(drops[:n], cave, -1, dry=0.7)[:n]
    rumble = dsp.band(dsp.colored(rng, n, -6), 20, 220)
    air = dsp.band(dsp.colored(rng, n, -3), 200, 1500) * (0.7 + 0.3 * dsp.wander(rng, n, 0.1))
    return dsp.at_rms(wet, -21) + dsp.at_rms(rumble, -27) + dsp.at_rms(air, -32)


BEDS = {
    "rain": (bed_rain, -36.0),
    "crowd": (bed_crowd, -34.0),
    "applause": (bed_applause, -34.0),
    "stadium": (bed_stadium, -33.0),
    "sizzle": (bed_sizzle, -37.0),
    "organ": (bed_organ, -33.0),
    "room": (bed_room, -43.0),
    "wind": (bed_wind, -35.0),
    "space": (bed_space, -35.0),
    "static": (bed_static, -38.0),
    "ocean": (bed_ocean, -36.0),
    "fluorescent": (bed_fluorescent, -40.0),
    "cafe": (bed_cafe, -35.0),
    # v3
    "kitchen": (bed_kitchen, -37.0),
    "truckstop": (bed_truckstop, -35.0),
    "sea": (bed_sea, -36.0),
    "night": (bed_night, -38.0),
    "fete": (bed_fete, -35.0),
    "hall": (bed_hall, -40.0),
    "studio": (bed_studio, -45.0),
    "storm": (bed_storm, -34.0),
    "cockpit": (bed_cockpit, -39.0),
    "greenhouse": (bed_greenhouse, -39.0),
    "cave-drip": (bed_cave_drip, -37.0),
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
    # A bright, vowel-like chord so speed changes come out as clear pitch and formant sweeps.
    music = np.zeros(m)
    for nm in ("C3", "G3", "C4", "E4"):
        f0 = note(nm)
        for k in range(1, int(5000 / f0)):
            music += np.sin(TAU * f0 * k * t) / k
    music = dsp.resonances(dsp.band(f32(music), 100, 5000), [(750, 300, 14), (1250, 400, 10), (2600, 600, 6)])
    for beat in np.arange(0, src_s, 0.5):
        place_at = ns(beat)
        k = min(m - place_at, ns(0.2))
        music[place_at : place_at + k] += np.sin(TAU * 60 * times(k)) * np.exp(-times(k) / 0.06) * 3 * dsp.rms(music)

    n = ns(s)
    tt = times(n)
    u = tt / s
    rate = np.interp(u, [0, 0.12, 0.14, 0.35, 0.38, 0.6, 0.62, 0.8, 1.0], [1, 1, -3.5, -2.5, 4.5, 3.5, -2.5, -0.3, 0])
    pos = 1.0 * SR + np.cumsum(rate)
    out = np.interp(pos, np.arange(m), music)
    friction = dsp.band(dsp.white(rng, n), 1500, 6000) * np.abs(rate) * 0.04 * dsp.rms(music) / 0.5
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
    # Shimmer: dense inharmonic partials higher up that swell after the strike, then fade.
    for _ in range(28):
        f = rng.uniform(600, 4500)
        swell = (1 - np.exp(-t / rng.uniform(0.15, 0.6))) * np.exp(-t / rng.uniform(0.6, 2.0))
        out += 0.25 * np.sin(TAU * f * t + rng.uniform(0, TAU)) * swell * (900 / f) ** 0.5
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
    return dsp.fade(out + dsp.at_rms(air, 20 * np.log10(dsp.rms(out) + 1e-9) - 22), 0.15, 0.25)


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


# v3 sound effects


def sfx_meow(rng, s):
    """A cat: 'mmm-ee-ow', the pitch rising into the vowel and falling away."""
    dur = max(0.5, s)
    f0 = ([0, 0.08 * dur, 0.35 * dur, 0.6 * dur, dur], [520, 600, 820, 720, 440])
    # Formants: a closed, nasal 'm'; an open 'ee-a'; rounding to 'ow'.
    u = [0, 0.1 * dur, 0.22 * dur, 0.5 * dur, 0.78 * dur, dur]
    formants = [
        (u, [300, 350, 950, 1050, 750, 550], [150, 180, 260, 260, 240, 220], [0.5, 0.6, 1.0, 1.0, 0.9, 0.5]),
        (u, [1400, 1500, 2400, 2000, 1200, 950], [250, 250, 350, 350, 300, 300], [0.02, 0.05, 0.8, 0.6, 0.45, 0.25]),
        (u, [3000, 3100, 3700, 3400, 2900, 2800], [500, 500, 500, 500, 500, 500], [0.01, 0.02, 0.35, 0.25, 0.12, 0.06]),
    ]
    voice = formant_voice(f0, formants, dur, rng, breath=0.15)
    n = len(voice)
    t = times(n)
    env = np.minimum(1, t / 0.04) * (0.45 + 0.55 * np.clip((t - 0.06 * dur) / (0.12 * dur), 0, 1))
    env = env * np.clip((dur - t) / (0.3 * dur), 0, 1) ** 0.9
    return dsp.band(f32(voice * env), 250, 7000)


def sfx_purr(rng, s):
    """A contented cat: ~26 rattles a second, alternating breathing in and out."""
    n = ns(s)
    t = times(n)
    out = np.zeros(n)
    at, inhale = 0.0, True
    while at < s:
        dur = rng.uniform(0.8, 1.0) if inhale else rng.uniform(1.0, 1.3)
        m = ns(dur)
        tt = times(m)
        rate = (27.0 if inhale else 24.5) * (1 + 0.03 * np.sin(TAU * 0.7 * tt))
        ph = dsp.phase_of(rate)
        pulses = (0.5 + 0.5 * np.cos(ph)) ** 8
        rattle = dsp.band(dsp.white(rng, m), 40, 600 if inhale else 450) * pulses
        hum = np.sin(ph * (2 if inhale else 1)) * pulses * 0.5
        env = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 0.5 * (0.7 if inhale else 1.0)
        seg = f32((rattle + hum) * env)
        k = ns(at)
        if k < n:
            out[k : k + m] += seg[: n - k]
        at += dur + rng.uniform(0.05, 0.15)
    return dsp.fade(f32(out), 0.1, 0.2)


def sfx_knock_over(rng, s):
    """Something nudged to the edge of a desk, a moment of silence, then the floor."""
    dur = max(s, 1.2)
    out = np.zeros(ns(dur + 0.6), np.float32)
    m = ns(0.3)
    tt = times(m)
    stick = (0.5 + 0.5 * np.sign(np.sin(TAU * 45 * tt + rng.uniform(0, TAU)))) * (rng.random(m) < 0.6)
    scrape = dsp.band(dsp.white(rng, m), 500, 2500) * stick * np.sin(np.pi * tt / 0.3) ** 0.5
    place(out, f32(scrape) * 0.07, 0.0)
    land = 0.3 + min(0.35, dur * 0.25)
    mug = [(rng.uniform(1100, 1500), 0.12, 0.6), (rng.uniform(2600, 3200), 0.08, 0.4), (rng.uniform(4300, 5100), 0.05, 0.25)]
    floor = [(140, 0.05, 1.0), (310, 0.03, 0.5)]
    place(out, knock(rng, floor, 0.15, click=0.8), land, 1.0)
    place(out, knock(rng, mug, 0.4, click=0.4), land + 0.004, 0.6)
    bounce = land
    for k, gap in enumerate((0.13, 0.09, 0.06)):
        bounce += gap
        place(out, knock(rng, mug, 0.25, click=0.3), bounce, 0.35 * 0.55**k)
        place(out, knock(rng, floor, 0.1, click=0.4), bounce, 0.4 * 0.5**k)
    # A pen rolls away.
    roll_at = bounce + 0.05
    for i in range(int(rng.integers(6, 12))):
        place(out, knock(rng, [(rng.uniform(2500, 4000), 0.01, 0.4)], 0.03, click=0.6), roll_at + i * 0.045 * (1 + i * 0.12),
              0.12 * (1 - i / 14))
    room = dsp.reverb_ir(rng, 0.4, hi=6000)
    return dsp.add_reverb(out, room, -14)


def sfx_ship_chime(rng, s):
    """HUSH clears its throat: two soft glassy tones, a fifth apart, over a warm low note."""
    out = np.zeros(ns(max(s, 0.8) + 1.4), np.float32)
    place(out, fm_tone(note("E6"), 1.6, ratio=3.0, index=0.8, decay=0.55, attack=0.012) * 0.5, 0.0)
    place(out, fm_tone(note("B6"), 1.8, ratio=3.0, index=0.7, decay=0.65, attack=0.012) * 0.45, 0.17)
    place(out, fm_tone(note("E5"), 2.0, ratio=1.0, index=0.3, decay=0.8, attack=0.03) * 0.25, 0.0)
    shimmer_ir = dsp.reverb_ir(rng, 1.2, predelay=0.02, hi=9000, lo=600)
    return dsp.add_reverb(out, shimmer_ir, -12)


def sfx_alarm(rng, s):
    """A ship's alarm: rising whoops through a corridor speaker."""
    n = ns(s)
    t = times(n)
    cycle = 0.62
    u = (t % cycle) / cycle
    f = 420 * (1100 / 420) ** np.minimum(1, u / 0.85)
    ph = dsp.phase_of(f)
    wave = sum(np.sin(k * ph) / k for k in (1, 3, 5, 7, 9))
    gate = np.where(u < 0.88, 1.0, np.cos(np.pi / 2 * (u - 0.88) / 0.12) ** 2)
    speaker = dsp.softclip(dsp.band(f32(wave * gate), 350, 3800, order=3), 6)
    corridor = dsp.reverb_ir(rng, 0.9, predelay=0.015, hi=5000, early=[(0.012, 0.6), (0.023, 0.4)])
    return dsp.add_reverb(dsp.fade(speaker, 0.005, 0.03), corridor, -9)


MORSE = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.", "G": "--.", "H": "....", "I": "..",
    "J": ".---", "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.",
    "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--", "Z": "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...",
    "8": "---..", "9": "----.",
}
MORSE_TEXT = "CQ CQ DE NJ7 NJ7 K"  # "calling anyone, this is Nightjar relay seven, over"


def sfx_morse(rng, s):
    """Morse code on a CW tone (about 20 words a minute), cut at a letter boundary."""
    dot = 0.06
    n = ns(max(s, 1.0))
    out = np.zeros(n + ns(0.1), np.float32)
    f0 = 650.0
    at = 0.0
    text = MORSE_TEXT
    i = 0
    while True:
        ch = text[i % len(text)]
        i += 1
        if ch == " ":
            at += dot * 4  # 7 dots between words, 3 already counted after the letter
            continue
        code = MORSE[ch]
        length = sum(dot * (1 if c == "." else 3) + dot for c in code)
        if at + length > s and at > 0:  # always at least one letter, then whole letters only
            break
        for c in code:
            d = dot * (1 if c == "." else 3)
            m = ns(d)
            tt = times(m)
            place(out, f32(np.sin(TAU * f0 * tt) * dsp.envelope(m, 0.005, 0.005)), at)
            at += d + dot
        at += dot * 2
    out = out[: ns(at + 0.1)]
    noise = dsp.at_rms(dsp.band(dsp.white(rng, len(out)), 300, 2600), 20 * np.log10(dsp.rms(out) + 1e-9) - 24)
    return dsp.fade(out + noise, 0.01, 0.05)


def sfx_squelch(rng, s):
    """CB squelch tail: a hard-edged burst of channel noise that closes down as it dies, 'kssht'."""
    n = ns(s)
    t = times(n)
    u = np.clip(t / max(s, 1e-3), 0, 1)
    noise = dsp.white(rng, n)
    bright = dsp.band(noise, 350, 2900, order=4)
    dark = dsp.band(noise, 300, 1400, order=4)
    burst = (bright * (1 - u) + dark * u * 1.4) * (1 + 0.35 * np.sin(TAU * 60 * t))
    env = np.minimum(1, t / 0.002) * np.minimum(1, (s - t) / 0.012) * (1 - 0.35 * u)
    click = np.zeros(n)
    k = min(n, ns(0.004))
    click[:k] = dsp.band(dsp.white(rng, k), 500, 4000) * 2.5
    return f32(burst * env + click)


def sfx_kettle(rng, s):
    """A kettle coming to the boil, then whistling (two reeds, slightly apart)."""
    n = ns(s)
    t = times(n)
    u = t / s
    boil = dsp.band(bubbles_texture(rng, s, 30, 90, 320, rise=1.4), 60, 1500) * np.clip(u * 1.6, 0.15, 1)
    roar = dsp.band(dsp.colored(rng, n, -4), 80, 2000) * np.clip(u * 1.4, 0.1, 1)
    start = 0.35
    w = np.clip((u - start) / 0.3, 0, 1) ** 2
    f = (1850 + 450 * np.clip((u - start) / 0.65, 0, 1)) * (1 + 0.006 * dsp.wander(rng, n, 6))
    whistle = (np.sin(dsp.phase_of(f)) + 0.7 * np.sin(dsp.phase_of(f * 1.019))) * w
    breath = dsp.band(dsp.white(rng, n), 1500, 3500) * w * 0.15
    env = np.minimum(1, (s - t) / 0.15)
    return f32((dsp.at_rms(boil, -24) + dsp.at_rms(roar, -30) + dsp.at_rms(f32(whistle + breath), -16)) * env)


def sfx_buzzer(rng, s):
    """The wrong-answer buzzer: two rough, slightly detuned low tones."""
    n = ns(s)
    t = times(n)
    tone = np.zeros(n)
    for f in (108.0, 113.5):
        ph = TAU * f * t
        tone += sum(np.sin(k * ph) / k for k in range(1, 40, 2))
    tone = dsp.softclip(dsp.band(f32(tone), 90, 4500), 8)
    return f32(tone * dsp.envelope(n, 0.008, 0.04))


def sfx_correct(rng, s):
    """The right answer: a bright 'ding-DING' with a sparkle."""
    out = np.zeros(ns(max(s, 0.6) + 1.2), np.float32)
    place(out, bell(note("E6"), 1.0, rng) * 0.5, 0.0)
    place(out, glock(note("E6"), 0.8) * 0.3, 0.0)
    place(out, bell(note("A6"), 1.4, rng) * 0.6, 0.13)
    place(out, glock(note("A6"), 1.0) * 0.35, 0.13)
    for k in range(5):
        place(out, glock(note("E7") * 2 ** (k / 12 * 2), 0.4) * 0.06, 0.2 + k * 0.03)
    return out


def sfx_drumroll(rng, s):
    """A snare roll that builds, then a crash and a kick."""
    dur = max(s, 0.8)
    roll_end = dur - 0.05
    out = np.zeros(ns(dur + 2.0), np.float32)
    at, k = 0.0, 0
    while at < roll_end:
        u = at / roll_end
        place(out, snare(rng, 0.12) * (0.15 + 0.85 * u**1.5) * (1.0 if k % 2 else 0.8) * rng.uniform(0.85, 1.0), at)
        at += 1 / 30 * rng.uniform(0.92, 1.08)
        k += 1
    place(out, cymbal(rng, 1.9) * 0.5, roll_end)
    place(out, boom(0.5) * 0.9, roll_end)
    place(out, snare(rng, 0.25) * 1.0, roll_end)
    return out


def sfx_bell(rng, s):
    """One stroke of a church tower bell: hum, prime, tierce, quint and nominal, ringing on."""
    dur = max(s + 3.0, 4.5)
    f = note("E4")
    ratios = [0.5, 1.0, 1.19, 1.5, 2.0, 2.5, 2.67, 3.0, 4.0, 5.2]
    amps = [0.7, 0.8, 0.6, 0.25, 1.0, 0.35, 0.3, 0.2, 0.15, 0.08]
    decays = [dur * 0.6, dur * 0.35, dur * 0.3, dur * 0.2, dur * 0.25, 0.9, 0.8, 0.6, 0.4, 0.25]
    tone = partials(f, dur, ratios, amps, decays, attack=0.002, rng=rng)
    clang = dsp.band(dsp.white(rng, ns(0.03)), 1500, 8000) * np.exp(-times(ns(0.03)) / 0.006)
    tone[: len(clang)] += clang * 0.4
    tower = dsp.reverb_ir(rng, 2.2, predelay=0.03, hi=5000)
    return dsp.add_reverb(dsp.fade(tone, 0, 1.0), tower, -10)[: ns(dur)]


def sfx_foghorn(rng, s):
    """A diaphone foghorn across the water: a long low blast that ends in a grunt."""
    dur = max(s, 1.5)
    n = ns(dur)
    t = times(n)
    grunt = 0.45
    tail = np.clip((t - (dur - grunt)) / grunt, 0, 1)
    f = 88 * (1 - 0.12 * np.exp(-t / 0.12)) * (1 - 0.25 * tail**1.5)
    ph = dsp.phase_of(f)
    k = np.arange(1, 40)
    tone = sum(np.sin(i * ph) / i**0.9 for i in k[: int(4000 / 88)])
    env = np.minimum(1, t / 0.12) * np.where(t > dur - grunt, np.clip((dur - t) / grunt, 0, 1) ** 0.7, 1)
    horn = dsp.band(dsp.resonances(f32(tone * env), [(260, 180, 6), (520, 300, 3)]), 60, 2200)
    coast = dsp.reverb_ir(rng, 3.0, predelay=0.08, hi=2500)
    wet = dsp.add_reverb(horn, coast, -4, dry=0.8)
    out = np.zeros(len(wet) + ns(1.0), np.float32)
    place(out, wet, 0)
    place(out, dsp.band(horn, 80, 1200), 0.9, 0.18)  # the cliffs answer
    return out


def _chop(rng: np.random.Generator) -> np.ndarray:
    board = [(rng.uniform(380, 460), 0.025, 1.0), (rng.uniform(760, 900), 0.018, 0.5), (rng.uniform(1300, 1600), 0.01, 0.3)]
    thock = knock(rng, board, 0.08, click=1.2)
    crunch = dsp.band(dsp.white(rng, ns(0.03)), 1200, 6000) * np.exp(-times(ns(0.03)) / 0.008)
    thock[: len(crunch)] += crunch * 0.4
    return thock


def sfx_chopping(rng, s):
    """Knife on a chopping board, about five chops a second (always at least one: a short
    `seconds` makes a single tap)."""
    out = np.zeros(ns(s) + ns(0.1), np.float32)
    at = 0.0
    while True:
        place(out, _chop(rng), at, rng.uniform(0.7, 1.0))
        at += rng.uniform(0.17, 0.23)
        if at >= s - 0.05:
            return out


def sfx_pips(rng, s):
    """A time signal: five short pips a second apart, then a long one on the hour."""
    out = np.zeros(ns(max(s, 5.6)), np.float32)
    for k in range(6):
        d = 0.5 if k == 5 else 0.1
        m = ns(d)
        place(out, f32(np.sin(TAU * 1000 * times(m)) * dsp.envelope(m, 0.004, 0.004)), k * 1.0)
    return out


def sfx_splash(rng, s):
    """Something going into water: a slap, a plunge, a rush of bubbles, drops falling back."""
    dur = max(s, 0.8)
    n = ns(dur + 0.4)
    t = times(n)

    def mag(tt, f):
        cutoff = 600 + 7000 * np.exp(-tt / 0.06)
        return np.exp(-tt / 0.2) * (f > 200) / np.sqrt(1 + (f / cutoff) ** 4)

    slap = dsp.shaped_noise(rng, n, mag, frame=256, hop=64) * np.minimum(1, t / 0.002)
    plunge = np.sin(dsp.phase_of(150 * np.exp(-t / 0.15) + 60)) * np.exp(-t / 0.12)
    bub = np.zeros(n, np.float32)
    for at in _events(rng, dur * 0.8, 0.02, (0.02, 0.05)):
        m = ns(0.04)
        tt = times(m)
        f0 = rng.uniform(350, 1400)
        blip = np.sin(dsp.phase_of(f0 * (1 + 1.2 * tt / 0.04))) * np.exp(-tt / 0.012)
        place(bub, f32(blip), at, rng.uniform(0.1, 0.6) * np.exp(-at / 0.35))
    drops = np.zeros(n, np.float32)
    for at in _events(rng, dur, 0.06, (0.25, 0.35)):
        place(drops, drip(rng.uniform(1200, 2600), 0.08), at, rng.uniform(0.1, 0.4))
    return dsp.at_rms(f32(slap), -18) + dsp.at_rms(f32(plunge), -22) + dsp.at_rms(bub, -24) + dsp.at_rms(drops, -30)


def sfx_tape_rewind(rng, s):
    """A cassette rewinding: clunk, a rising chipmunk chatter and motor whine, clunk."""
    dur = max(s, 0.8)
    n = ns(dur)
    t = times(n)
    u = t / dur
    speed = 0.4 + 0.6 * np.clip(u / 0.3, 0, 1)
    ft, fv = _control(rng, dur, (0.015, 0.04), 1200, 5500)  # syllables flying past
    at_, av = _control(rng, dur, (0.01, 0.03), 0, 1)

    def mag(tt, f):
        centre = np.interp(tt, ft, fv) * np.interp(tt, t[:: 64], speed[:: 64])
        amp = np.interp(tt, at_, av) ** 2
        return amp * np.exp(-(((f - centre) / (centre * 0.3)) ** 2)) + 0.05 * (f > 2000) * (f < 9000)

    chatter = dsp.shaped_noise(rng, n, mag, frame=256, hop=64)
    whine = np.sin(dsp.phase_of(900 + 1500 * speed)) * 0.5 + np.sin(dsp.phase_of(2 * (900 + 1500 * speed))) * 0.2
    body = (dsp.at_rms(chatter, -20) + dsp.at_rms(f32(whine), -30)) * np.minimum(1, t / 0.05) * np.minimum(1, (dur - 0.08 - t) / 0.02).clip(0, 1)
    out = np.zeros(n + ns(0.15), np.float32)
    place(out, f32(body), 0.05)
    mech = [(180, 0.03, 1.0), (900, 0.012, 0.4), (2300, 0.006, 0.3)]
    place(out, knock(rng, mech, 0.1, click=1.0), 0.0, 0.5)
    place(out, knock(rng, mech, 0.12, click=1.2), dur - 0.06, 0.6)
    return out


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
    # v3
    "meow": (sfx_meow, -24.0),
    "purr": (sfx_purr, -28.0),
    "knock-over": (sfx_knock_over, -23.0),
    "ship-chime": (sfx_ship_chime, -25.0),
    "alarm": (sfx_alarm, -25.0),
    "morse": (sfx_morse, -27.0),
    "squelch": (sfx_squelch, -27.0),
    "kettle": (sfx_kettle, -26.0),
    "buzzer": (sfx_buzzer, -24.0),
    "correct": (sfx_correct, -24.0),
    "drumroll": (sfx_drumroll, -23.0),
    "bell": (sfx_bell, -23.0),
    "foghorn": (sfx_foghorn, -23.0),
    "chopping": (sfx_chopping, -26.0),
    "pips": (sfx_pips, -27.0),
    "splash": (sfx_splash, -23.0),
    "tape-rewind": (sfx_tape_rewind, -26.0),
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
        place(out, snare(rng, 0.15) * (0.04 + 0.2 * k / 10), at)
    for i, name in enumerate(("G4", "G4", "G4")):
        place(out, brass(note(name), 0.09, bright=1.0) * 0.3, 0.3 + i * 0.1)
    held = sum(brass(note(nm), 1.4, bright=1.0, vibrato=0.6, release=0.35) for nm in ("C5", "E5", "G5", "C4"))
    place(out, held * 0.18, 0.6)
    place(out, cymbal(rng, 1.8) * 0.08, 0.6)
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
    place(out, cymbal(rng, 2.0) * 0.08, 1.14)
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


# v3 stings


def sting_quiz(rng):
    """Game show: a quick run up the scale into a bright stab, cymbal and sparkle."""
    out = np.zeros(ns(2.4), np.float32)
    run = ["C5", "D5", "E5", "F5", "G5", "A5", "B5"]
    for i, name in enumerate(run):
        place(out, brass(note(name), 0.07, bright=0.9) * 0.18, i * 0.045)
        place(out, marimba(note(name), 0.25) * 0.2, i * 0.045)
    hit = 0.36
    stab = sum(brass(note(nm), 0.9, bright=1.0, vibrato=0.4, release=0.4) for nm in ("C5", "E5", "G5", "C6", "C4"))
    place(out, stab * 0.15, hit)
    place(out, cymbal(rng, 1.6) * 0.12, hit)
    place(out, timpani(note("C3"), 0.9, rng) * 0.5, hit)
    for k, nm in enumerate(("C7", "E7", "G7", "C8")):
        place(out, glock(note(nm), 0.5) * 0.08, hit + 0.12 + k * 0.05)
    return out


def sting_crime(rng):
    """True crime: a low piano cluster, a timpani thud, a muted trumpet asking a question."""
    out = np.zeros(ns(3.2), np.float32)
    for nm in ("C2", "C3", "Eb3", "Gb3", "Db4"):
        place(out, piano(note(nm), 2.6, rng, bright=0.4) * 0.22, 0.0)
    place(out, timpani(note("C2"), 1.5, rng) * 0.6, 0.0)
    muted = [("G4", 0.55, 0.28), ("F#4", 0.75, 0.28), ("D#4", 1.0, 1.1)]
    for name, at, dur in muted:
        place(out, brass(note(name), dur, bright=0.4, vibrato=0.5 if dur > 0.5 else 0, release=0.3) * 0.42, at)
    club = dsp.reverb_ir(rng, 1.8, predelay=0.03, hi=3500)
    return dsp.add_reverb(dsp.band(out, 50, 6000), club, -9)


def sting_kids(rng):
    """Children's programme: a bouncy xylophone tune, a slide whistle, a cheerful plonk."""
    out = np.zeros(ns(2.0), np.float32)
    tune = [("C6", 0.0), ("E6", 0.1), ("G6", 0.2), ("E6", 0.3), ("C7", 0.42)]
    for name, at in tune:
        place(out, marimba(note(name), 0.45) * 0.4, at)
        place(out, glock(note(name), 0.4) * 0.12, at)
    m = ns(0.45)
    tt = times(m)
    slide = glide_tone(([0, 0.45], [700, 1900]), 0.45, harmonics=((1, 1.0), (2, 0.08)), vibrato=0.02, vib_rate=11)
    place(out, f32(slide * np.sin(np.pi * tt / 0.45) ** 0.6) * 0.18, 0.55)
    place(out, marimba(note("C5"), 0.6) * 0.45, 1.05)
    place(out, marimba(note("G5"), 0.6) * 0.3, 1.05)
    return out


def sting_community(rng):
    """Community radio: a friendly strummed guitar chord and a little three-note tune."""
    out = np.zeros(ns(2.6), np.float32)
    for i, nm in enumerate(("G2", "D3", "G3", "B3", "D4", "G4")):
        place(out, pluck(note(nm), 2.2, rng, bright=0.55, decay=0.996) * 0.22, 0.04 + i * 0.025)
    for i, nm in enumerate(("B5", "D6", "G6")):
        place(out, vibes(note(nm), 1.4) * 0.22, 0.5 + i * 0.22)
    place(out, bell(note("G6"), 1.2, rng) * 0.06, 0.94)
    return out


def sting_mystic(rng):
    """Horoscopes: a harp sweeping up a lydian scale into a shimmer and a crystal ping."""
    out = np.zeros(ns(3.2), np.float32)
    scale = ["C4", "D4", "E4", "F#4", "G4", "A4", "B4", "C5", "D5", "E5", "F#5", "G5", "B5"]
    for i, nm in enumerate(scale):
        place(out, pluck(note(nm), 1.6, rng, bright=0.7, decay=0.998) * 0.16, i * 0.045)
    n = ns(2.6)
    t = times(n)
    pad = sum(np.sin(TAU * note(nm) * d * t) for nm in ("C4", "G4", "D5", "F#5") for d in (0.998, 1.002))
    pad = f32(pad * np.clip(t / 0.8, 0, 1) * np.clip((2.6 - t) / 1.0, 0, 1) * (1 + 0.2 * np.sin(TAU * 4.5 * t)))
    place(out, pad * 0.05, 0.3)
    place(out, fm_tone(note("F#6"), 1.8, ratio=2.76, index=1.2, decay=0.7) * 0.25, 0.62)
    hall = dsp.reverb_ir(rng, 2.6, predelay=0.03, hi=7000)
    return dsp.add_reverb(out, hall, -6)


def sting_ship(rng):
    """The Nightjar: a low drone swelling up, a sonar ping, HUSH's three-note motif."""
    out = np.zeros(ns(3.0), np.float32)
    n = ns(2.6)
    t = times(n)
    drone = sum(a * np.sin(TAU * f * t) for f, a in ((55.0, 1.0), (55.4, 0.7), (110.0, 0.5), (164.8, 0.35), (220.4, 0.15)))
    drone = f32(drone * np.clip(t / 0.9, 0, 1) ** 2 * np.clip((2.6 - t) / 0.9, 0, 1))
    place(out, drone * 0.35, 0.0)
    place(out, fm_tone(note("E6"), 1.4, ratio=1.0, index=0.2, decay=0.5, attack=0.004) * 0.25, 0.05)
    for i, nm in enumerate(("E5", "B5", "E6")):
        place(out, fm_tone(note(nm), 1.6, ratio=3.0, index=0.8, decay=0.6, attack=0.012) * 0.3, 0.55 + i * 0.2)
    deck = dsp.reverb_ir(rng, 2.2, predelay=0.04, hi=6000)
    return dsp.add_reverb(out, deck, -8)


def sting_halloween(rng):
    """Halloween: a tolling bell, a tremolo organ chord that won't resolve, a theremin wail."""
    out = np.zeros(ns(3.4), np.float32)
    place(out, partials(note("D3"), 2.4, [0.5, 1, 1.19, 1.5, 2, 2.5], [0.6, 0.8, 0.5, 0.3, 0.7, 0.3],
                        [1.4, 1.0, 0.8, 0.6, 0.7, 0.4], rng=rng) * 0.3, 0.0)
    n = ns(2.6)
    t = times(n)
    organ = np.zeros(n)
    for nm in ("C3", "Eb3", "Gb3", "A3"):
        f = note(nm)
        for r, a in zip((1, 2, 3, 4), (1, 0.6, 0.3, 0.2)):
            organ += a * np.sin(TAU * f * r * t)
    organ = f32(organ * (0.75 + 0.25 * np.sin(TAU * 6.5 * t)) * np.clip(t / 0.15, 0, 1) * np.clip((2.6 - t) / 0.6, 0, 1))
    place(out, organ * 0.045, 0.3)
    wail = glide_tone(([0, 0.5, 1.3, 2.0], [note("A4"), note("E5"), note("D#5"), note("A4") * 0.94]), 2.0,
                      harmonics=((1, 1.0), (2, 0.12), (3, 0.05)), vibrato=0.014, vib_rate=6.2)
    m = len(wail)
    tt = times(m)
    place(out, f32(wail * np.clip(tt / 0.2, 0, 1) * np.clip((2.0 - tt) / 0.5, 0, 1)) * 0.45, 0.6)
    crypt = dsp.reverb_ir(rng, 2.4, predelay=0.04, hi=4500)
    return dsp.add_reverb(out, crypt, -7)


STINGS = {
    "id": sting_id,
    "news": sting_news,
    "sports": sting_sports,
    "ad": sting_ad,
    "weather": sting_weather,
    "chime": sting_chime,
    "fanfare": sting_fanfare,
    "sad-trombone": sting_sad_trombone,
    # v3
    "quiz": sting_quiz,
    "crime": sting_crime,
    "kids": sting_kids,
    "community": sting_community,
    "mystic": sting_mystic,
    "ship": sting_ship,
    "halloween": sting_halloween,
}
STING_LUFS = -19.0


def make_sting(name: str, rng: np.random.Generator) -> np.ndarray:
    audio = STINGS[name](rng)
    audio, _ = dsp.trim_silence(audio, -60, 0.01)
    return dsp.normalize(dsp.band(audio, 40, 11000), STING_LUFS)
