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
    ), level_db=-1.0),
    "radio": Preset((
        ff("highpass=f=480,highpass=f=480,lowpass=f=2700,lowpass=f=2700,equalizer=f=1200:t=q:w=1:g=4,"
           "acompressor=threshold=-30dB:ratio=8:attack=2:release=80:makeup=8dB"),
        drive(7),
        flutter(0.06, 3.1),
        hiss(-30, 400, 2800, crackle=6),
    ), level_db=-1.5),
    "megaphone": Preset((
        ff("highpass=f=550,highpass=f=550,lowpass=f=4200,lowpass=f=4200,equalizer=f=2000:t=q:w=0.7:g=8,"
           "acompressor=threshold=-28dB:ratio=6:attack=1:release=50:makeup=8dB"),
        drive(12),
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
        ff("rubberband=pitch=0.7:formant=shifted,equalizer=f=110:t=q:w=1:g=5,lowpass=f=6500"),
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
    ), level_db=-6.0),
}


def apply(name: str, x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Treat a line normalized to VOICE_LUFS; returns it at VOICE_LUFS + the preset's offset."""
    preset = PRESETS[name]
    for step in preset.steps:
        x = step(x, rng)
    return dsp.normalize(x, VOICE_LUFS + preset.level_db)
