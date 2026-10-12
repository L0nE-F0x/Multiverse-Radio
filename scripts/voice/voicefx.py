"""Voice treatments (`fx` in the script schema).

Each preset is a list of steps (ffmpeg filter chains or numpy functions) plus a level
offset relative to the other voices in the clip. Input is a trimmed TTS line normalized to
VOICE_LUFS; output may be longer than the input (echo and reverb tails ring out).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

import dsp
from dsp import db

VOICE_LUFS = -20.0

Step = Callable[[np.ndarray, np.random.Generator], np.ndarray]


def ff(chain: str, tail: float = 0.0) -> Step:
    """An ffmpeg filter chain; `tail` seconds of silence are appended first so echoes ring out."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        if tail:
            x = np.concatenate([x, dsp.silence(tail)])
        return dsp.ffmpeg_filter(x, chain)

    return run


def drive(drive_db: float) -> Step:
    return lambda x, rng: dsp.softclip(x, drive_db)


def hiss(level_db: float, lo: float, hi: float, crackle: float = 0.0) -> Step:
    """Line noise under the voice (relative to the voice level)."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        n, ref = len(x), dsp.rms(x)
        if ref <= 1e-9:
            return x
        noise = dsp.at_rms(dsp.band(dsp.white(rng, n), lo, hi), 20 * np.log10(ref) + level_db)
        if crackle:
            pops = dsp.band(dsp.impulses(rng, n, crackle, 0.3, 1.0), 400, 5000)
            noise = noise + pops * ref * 2.0
        return dsp.f32(x + noise)

    return run


def bandlimit(lo: float, hi: float, order: int = 4) -> Step:
    """Steep band-limit, e.g. after distortion so a phone line stays a phone line."""
    return lambda x, rng: dsp.band(x, lo, hi, order)


def flutter(depth: float, rate: float) -> Step:
    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        t = dsp.times(len(x))
        wobble = 1 + depth * np.sin(dsp.TAU * rate * t + rng.uniform(0, dsp.TAU)) * (0.5 + dsp.wander(rng, len(x), 2))
        return dsp.f32(x * wobble)

    return run


def reverb(rt60: float, wet_db: float, dry: float = 1.0, predelay: float = 0.02, hi: float = 6000,
           early: list[tuple[float, float]] | None = None) -> Step:
    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        ir = dsp.reverb_ir(rng, rt60, predelay=predelay, hi=hi, early=early)
        return dsp.add_reverb(x, ir, wet_db, dry)

    return run


def echoes(taps: list[tuple[float, float]], lo: float = 200, hi: float = 5000) -> Step:
    """Discrete repeats: (delay seconds, gain dB), band-limited like a far wall."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        longest = max(d for d, _ in taps)
        out = np.concatenate([x, dsp.silence(longest)])
        colored = dsp.band(x, lo, hi)
        for delay, gain_db in taps:
            dsp.place(out, colored, delay, db(gain_db))
        return out

    return run


def ring(freq: float, mix: float, wobble: float = 0.0) -> Step:
    return lambda x, rng: dsp.ring_mod(x, freq, mix, wobble)


def bubbles(rate: float, level_db: float) -> Step:
    """Little rising blips, like air escaping a diving helmet."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        out = x.copy()
        ref = dsp.rms(x)
        count = rng.poisson(rate * len(x) / dsp.SR)
        for _ in range(count):
            dur = rng.uniform(0.02, 0.06)
            n = dsp.ns(dur)
            t = dsp.times(n)
            f0 = rng.uniform(250, 700)
            freq = f0 * (1 + 2.5 * t / dur)
            blip = np.sin(dsp.phase_of(freq)) * np.sin(np.pi * t / dur) ** 2
            at = rng.uniform(0, max(0.0, len(x) / dsp.SR - dur))
            dsp.place(out, dsp.f32(blip), at, ref * db(level_db) * 2.5 * rng.uniform(0.4, 1))
        return out

    return run


def shimmer(level_db: float, rt60: float, pitch: float = 2.0) -> Step:
    """A faint halo: the line pitched up (an octave by default) into a bright reverb, mixed far under."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        up = dsp.ffmpeg_filter(np.concatenate([x, dsp.silence(0.05)]), f"rubberband=pitch={pitch}:formant=shifted")
        ir = dsp.reverb_ir(rng, rt60, predelay=0.04, hi=10000, lo=1200, dark=0.6)
        wet = dsp.convolve(up, ir)
        out = np.zeros(max(len(x), len(wet)), np.float32)
        out[: len(x)] += x
        out[: len(wet)] += wet * (dsp.rms(x) / max(dsp.rms(wet), 1e-9)) * db(level_db)
        return out

    return run


def wow(depth: float, rate: float, flutter_depth: float = 0.0, flutter_rate: float = 9.0) -> Step:
    """Pitch wobble from an off-centre record (wow) and a wobbly motor (flutter), by resampling."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        n = len(x)
        t = dsp.times(n)
        speed = (1 + depth * np.sin(dsp.TAU * rate * t + rng.uniform(0, dsp.TAU))
                 + flutter_depth * np.sin(dsp.TAU * flutter_rate * t + rng.uniform(0, dsp.TAU)))
        pos = np.clip(np.cumsum(speed) - speed[0], 0, n - 1)
        return dsp.f32(np.interp(pos, np.arange(n), x))

    return run


def surface(level_db: float, crackle: float, tail: float = 0.25) -> Step:
    """Record surface noise: hiss, a low rumble and crackle, running a little past the words."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        ref = dsp.rms(x)
        if ref <= 1e-9:
            return x
        x = np.concatenate([x, dsp.silence(tail)])
        n = len(x)
        base = 20 * np.log10(ref) + level_db
        hiss_ = dsp.at_rms(dsp.band(dsp.white(rng, n), 900, 6000), base)
        rumble = dsp.at_rms(dsp.band(dsp.colored(rng, n, -6), 30, 160), base + 2)
        pops = dsp.band(dsp.impulses(rng, n, crackle, 0.2, 1.0), 700, 7000)
        clicks = dsp.band(dsp.impulses(rng, n, crackle * 0.08, 0.6, 1.0), 200, 3000)
        noise = dsp.fade(hiss_ + rumble + (pops * 1.6 + clicks * 2.5) * ref, 0.02, tail)
        return dsp.f32(x + noise)

    return run


def squelch(head: float, tail: float, level_db: float) -> Step:
    """CB squelch: a burst of channel noise as the mic keys up, and the 'kssh' when it lets go."""

    def burst(rng: np.random.Generator, seconds: float, ref: float) -> np.ndarray:
        n = dsp.ns(seconds)
        t = dsp.times(n)
        noise = dsp.band(dsp.white(rng, n), 350, 2800, order=4) * (1 + 0.5 * np.sin(dsp.TAU * 70 * t))
        env = np.minimum(1, t / 0.004) * np.minimum(1, (seconds - t) / 0.012)
        return dsp.at_rms(dsp.f32(noise * env), 20 * np.log10(ref) + level_db)

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        ref = dsp.rms(x)
        if ref <= 1e-9:
            return x
        gap = dsp.silence(0.03)
        return dsp.f32(np.concatenate([burst(rng, head, ref) * 0.5, gap, x, gap, burst(rng, tail, ref)]))

    return run


def ghostly(delay: float, whisper_db: float, echo_delay: float, echo_db: float) -> Step:
    """A voice slightly behind itself: a breathy double just behind the words (inside the ~30 ms
    the ear fuses, so it reads as air rather than smear) and a thin, dim copy trailing further back."""

    def run(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        breath = dsp.ffmpeg_filter(x, WHISPERIZE + ",highpass=f=500,equalizer=f=5000:t=q:w=1:g=3")
        breath = dsp.at_rms(breath, 20 * np.log10(dsp.rms(x) + 1e-12) + whisper_db)
        echo = dsp.band(dsp.ffmpeg_filter(x, "rubberband=pitch=0.985:formant=preserved"), 300, 3000)
        echo = dsp.at_rms(echo, 20 * np.log10(dsp.rms(x) + 1e-12) + echo_db)
        out = np.zeros(len(x) + dsp.ns(echo_delay) + dsp.ns(0.05), np.float32)
        dsp.place(out, x, 0.0)
        dsp.place(out, breath, delay)
        dsp.place(out, echo, echo_delay)
        return out

    return run


@dataclass(frozen=True)
class Preset:
    steps: tuple[Step, ...]
    level_db: float = 0.0  # relative loudness against the other voices


ROBOTIZE = "afftfilt=real='hypot(re,im)':imag='0':win_size=512:overlap=0.75"
WHISPERIZE = (
    "afftfilt=real='hypot(re,im)*cos((random(0)*2-1)*2*3.14)'"
    ":imag='hypot(re,im)*sin((random(1)*2-1)*2*3.14)':win_size=256:overlap=0.75"
)

PRESETS: dict[str, Preset] = {
    "clean": Preset((
        ff("highpass=f=70,equalizer=f=3200:t=q:w=1.2:g=1.5,"
           "acompressor=threshold=-26dB:ratio=2.2:attack=8:release=140:makeup=2dB"),
    )),
    "phone": Preset((
        ff("highpass=f=320,highpass=f=320,lowpass=f=3300,lowpass=f=3300,equalizer=f=1600:t=q:w=1.4:g=5,"
           "acompressor=threshold=-30dB:ratio=6:attack=2:release=60:makeup=6dB"),
        drive(5),
        hiss(-42, 300, 3300),
        bandlimit(300, 3400),
    ), level_db=-1.0),
    "radio": Preset((
        ff("highpass=f=480,highpass=f=480,lowpass=f=2700,lowpass=f=2700,equalizer=f=1200:t=q:w=1:g=4,"
           "acompressor=threshold=-30dB:ratio=8:attack=2:release=80:makeup=8dB"),
        drive(7),
        flutter(0.06, 3.1),
        hiss(-30, 400, 2800, crackle=6),
        bandlimit(450, 3000),
    ), level_db=-1.5),
    "megaphone": Preset((
        ff("highpass=f=550,highpass=f=550,lowpass=f=4200,lowpass=f=4200,equalizer=f=2000:t=q:w=0.7:g=8,"
           "acompressor=threshold=-28dB:ratio=6:attack=1:release=50:makeup=8dB"),
        drive(12),
        bandlimit(450, 5000),
        echoes([(0.11, -11), (0.23, -18), (0.37, -25)], lo=400, hi=3500),
    )),
    "robot": Preset((
        ff(ROBOTIZE + ",highpass=f=110,aecho=0.8:0.7:6|11:0.35|0.25", tail=0.05),
        ring(60, 0.25),
    )),
    "whisper": Preset((
        ff(WHISPERIZE + ",highpass=f=300,equalizer=f=4500:t=q:w=1:g=4"),
    ), level_db=-3.0),
    "cave": Preset((
        reverb(2.8, -8, predelay=0.03, hi=4500, early=[(0.04, 0.6), (0.075, 0.45), (0.12, 0.3)]),
        echoes([(0.45, -15), (0.9, -21), (1.35, -27)], lo=250, hi=3000),
    )),
    "underwater": Preset((
        ff("lowpass=f=1400,lowpass=f=1400,equalizer=f=500:t=q:w=1:g=5,vibrato=f=3.5:d=0.12,"
           "chorus=0.6:0.9:45|65:0.35|0.3:0.25|0.4:1.8|2.3", tail=0.1),
        bubbles(9, -14),
    ), level_db=-1.0),
    "alien": Preset((
        # (rubberband -> vibrato -> flanger produces NaNs in ffmpeg 9; a short comb does the job)
        ff("rubberband=pitch=1.15:formant=shifted,vibrato=f=7:d=0.12,aecho=0.8:0.6:9:0.3", tail=0.05),
        ring(95, 0.4, wobble=0.15),
    )),
    "tiny": Preset((
        ff("rubberband=pitch=1.5:formant=shifted,highpass=f=220"),
    )),
    "giant": Preset((
        ff("rubberband=pitch=0.78:formant=shifted,equalizer=f=110:t=q:w=1:g=4,lowpass=f=7000"),
        reverb(1.6, -11, predelay=0.03, hi=4000),
    ), level_db=0.5),
    "kid": Preset((
        ff("rubberband=pitch=1.3:formant=shifted"),
    )),
    "trailer": Preset((
        ff("rubberband=pitch=0.84:formant=shifted,equalizer=f=110:t=q:w=1:g=6,"
           "acompressor=threshold=-28dB:ratio=4:attack=5:release=150:makeup=4dB"),
        reverb(2.0, -10, predelay=0.04, hi=5000),
    ), level_db=1.0),
    "distant": Preset((
        ff("highpass=f=250,lowpass=f=3800"),
        reverb(1.1, -3, dry=0.75, predelay=0.03, hi=3500),
    ), level_db=-4.0),
    # v3
    "ship": Preset((
        # HUSH on the ship's PA: full and clear (it talks a lot), a touch of speaker, a small
        # metal cabin and a faint octave-up halo.
        ff("highpass=f=110,equalizer=f=320:t=q:w=1.2:g=-2,equalizer=f=2800:t=q:w=1.4:g=2.5,"
           "lowpass=f=9500,acompressor=threshold=-24dB:ratio=2.5:attack=6:release=120:makeup=2dB"),
        ff("chorus=0.92:0.92:18|27:0.12|0.09:0.21|0.27:0.6|0.8", tail=0.05),
        reverb(0.45, -17, predelay=0.012, hi=7000, early=[(0.009, 0.5), (0.017, 0.35), (0.026, 0.25)]),
        shimmer(-25, 1.6),
    )),
    "cb": Preset((
        ff("highpass=f=340,highpass=f=340,lowpass=f=2800,lowpass=f=2800,equalizer=f=1500:t=q:w=1.2:g=5,"
           "acompressor=threshold=-32dB:ratio=10:attack=1:release=50:makeup=9dB"),
        drive(10),
        flutter(0.08, 1.7),
        hiss(-26, 350, 3000, crackle=4),
        bandlimit(300, 3000),
        squelch(0.07, 0.22, -7),
    ), level_db=-1.5),
    "vinyl": Preset((
        ff("highpass=f=160,highpass=f=160,lowpass=f=5200,lowpass=f=5200,equalizer=f=1300:t=q:w=1:g=3,"
           "acompressor=threshold=-26dB:ratio=3:attack=5:release=100:makeup=3dB"),
        drive(4),
        wow(0.0035, 0.55, 0.0012, 7.5),
        reverb(0.7, -16, predelay=0.02, hi=4000),
        surface(-31, 9),
    ), level_db=-1.0),
    "ghost": Preset((
        ff("highpass=f=180,lowpass=f=7500,equalizer=f=3500:t=q:w=1:g=2"),
        ghostly(0.022, -6, 0.23, -15),
        flutter(0.12, 0.4),
        reverb(2.8, -13, predelay=0.06, hi=5000),
    ), level_db=-2.0),
}


def apply(name: str, x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Treat a line normalized to VOICE_LUFS; returns it at VOICE_LUFS + the preset's offset."""
    preset = PRESETS[name]
    for step in preset.steps:
        x = step(x, rng)
    return dsp.normalize(x, VOICE_LUFS + preset.level_db)
