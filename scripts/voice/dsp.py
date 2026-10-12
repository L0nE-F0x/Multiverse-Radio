"""DSP building blocks for the voice renderer (numpy only, plus ffmpeg for filter chains).

Everything runs mono at SR (Kokoro's native 24 kHz). Randomness always comes from an
explicit numpy Generator so renders are reproducible.
"""

from __future__ import annotations

import subprocess

import numpy as np

SR = 24_000
TAU = 2 * np.pi


def ns(seconds: float, sr: int = SR) -> int:
    return max(0, int(round(seconds * sr)))


def f32(x) -> np.ndarray:
    return np.asarray(x, dtype=np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(ns(seconds), dtype=np.float32)


def times(n: int) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / SR


def db(gain_db: float) -> float:
    return float(10 ** (gain_db / 20))


# ── Noise ─────────────────────────────────────────────────────────────────────


def white(rng: np.random.Generator, n: int) -> np.ndarray:
    return rng.standard_normal(n).astype(np.float32)


def colored(rng: np.random.Generator, n: int, slope_db_per_octave: float) -> np.ndarray:
    """Noise with a spectral slope: -3 dB/oct is pink, -6 is brown."""
    if n == 0:
        return np.zeros(0, np.float32)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1] if len(f) > 1 else 1.0
    spec *= (f / 1000.0) ** (slope_db_per_octave / 6.0206)
    return f32(np.fft.irfft(spec, n))


def impulses(rng: np.random.Generator, n: int, rate: float, lo: float = 0.2, hi: float = 1.0) -> np.ndarray:
    """Random impulses (Poisson-ish, `rate` per second) with random signed amplitudes."""
    out = np.zeros(n, np.float32)
    count = rng.poisson(rate * n / SR) if n else 0
    if count:
        pos = rng.integers(0, n, size=count)
        out[pos] += rng.uniform(lo, hi, size=count) * rng.choice([-1.0, 1.0], size=count)
    return out


def wander(rng: np.random.Generator, n: int, rate: float) -> np.ndarray:
    """Smooth random movement between 0 and 1, about `rate` new targets per second."""
    if n == 0:
        return np.zeros(0, np.float32)
    points = rng.random(int(n / SR * rate) + 3)
    xs = np.linspace(0, len(points) - 1.001, n)
    i = np.floor(xs).astype(int)
    t = xs - i
    t = (1 - np.cos(np.pi * t)) / 2
    return f32(points[i] * (1 - t) + points[i + 1] * t)


# ── Filters (zero-phase, frequency domain) ────────────────────────────────────

_PAD = 4096


def _apply_gain(x: np.ndarray, gain_fn) -> np.ndarray:
    n = len(x)
    if n == 0:
        return f32(x)
    size = n + _PAD
    spec = np.fft.rfft(x, size)
    f = np.fft.rfftfreq(size, 1 / SR)
    return f32(np.fft.irfft(spec * gain_fn(f), size)[:n])


def band(x: np.ndarray, lo: float | None = None, hi: float | None = None, order: int = 2) -> np.ndarray:
    """Butterworth-shaped high/low/band-pass (magnitude only)."""

    def gain(f):
        g = np.ones_like(f)
        if lo:
            g /= np.sqrt(1 + (lo / np.maximum(f, 1e-6)) ** (2 * order))
        if hi:
            g /= np.sqrt(1 + (f / hi) ** (2 * order))
        return g

    return _apply_gain(x, gain)


def resonances(x: np.ndarray, peaks: list[tuple[float, float, float]]) -> np.ndarray:
    """Add resonant peaks: (freq Hz, bandwidth Hz, gain dB)."""

    def gain(f):
        g = np.ones_like(f)
        for freq, bw, gain_db in peaks:
            g += (db(gain_db) - 1) / (1 + ((f - freq) / (bw / 2)) ** 2)
        return g

    return _apply_gain(x, gain)


def convolve(x: np.ndarray, h: np.ndarray) -> np.ndarray:
    n = len(x) + len(h) - 1
    size = 1 << max(1, (n - 1).bit_length())
    return f32(np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(h, size), size)[:n])


def shaped_noise(rng: np.random.Generator, n: int, magnitude, frame: int = 1024, hop: int = 256) -> np.ndarray:
    """Noise whose spectrum changes over time.

    `magnitude(t, f)` gets frame times (F, 1) in seconds and bin frequencies (1, B) in Hz
    and returns amplitudes (F, B). Synthesized by random-phase overlap-add.
    """
    if n == 0:
        return np.zeros(0, np.float32)
    frames = n // hop + frame // hop + 1
    freqs = np.fft.rfftfreq(frame, 1 / SR)[None, :]
    window = np.hanning(frame).astype(np.float32)
    out = np.zeros(frames * hop + frame, np.float32)
    chunk = 1024
    for start in range(0, frames, chunk):
        idx = np.arange(start, min(frames, start + chunk))
        t = ((idx * hop - frame // 2) / SR)[:, None]
        mag = np.broadcast_to(magnitude(np.maximum(t, 0.0), freqs), (len(idx), freqs.shape[1]))
        phase = rng.uniform(0, TAU, size=mag.shape)
        block = np.fft.irfft(mag * np.exp(1j * phase), frame, axis=1).astype(np.float32) * window
        for k in range(frame // hop):
            seg = block[:, k * hop : (k + 1) * hop].ravel()
            at = start * hop + k * hop
            out[at : at + len(seg)] += seg
    return out[frame // 2 : frame // 2 + n]


# ── Levels ────────────────────────────────────────────────────────────────────


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64)) + 1e-20)) if len(x) else 0.0


def at_rms(x: np.ndarray, level_db: float) -> np.ndarray:
    r = rms(x)
    return f32(x * (db(level_db) / r)) if r > 1e-9 else f32(x)


def _k_weighting_power(f: np.ndarray, sr: int = SR) -> np.ndarray:
    """|H(f)|^2 of the ITU-R BS.1770 K-weighting filter at sample rate `sr` (libebur128 design)."""
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = np.tan(np.pi * f0 / sr)
    vh = 10 ** (gain / 20)
    vb = vh**0.4996667741545416
    a0 = 1 + k / q + k * k
    b1 = ((vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0)
    a1 = (1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0)
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / sr)
    d = 1 + k / q + k * k
    b2 = (1.0, -2.0, 1.0)
    a2 = (1.0, 2 * (k * k - 1) / d, (1 - k / q + k * k) / d)
    z = np.exp(-1j * TAU * f / sr)

    def h(b, a):
        return (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)

    return np.abs(h(b1, a1) * h(b2, a2)) ** 2


def loudness(x: np.ndarray, sr: int = SR) -> float:
    """Integrated loudness in LUFS (BS.1770-4 gating). Clips shorter than one 400 ms
    block are measured as a single block, so very short idents still get a sensible value."""
    n = len(x)
    if n == 0:
        return -120.0
    size = n + _PAD
    spec = np.fft.rfft(np.asarray(x, np.float64), size)
    f = np.fft.rfftfreq(size, 1 / sr)
    y = np.fft.irfft(spec * np.sqrt(_k_weighting_power(f, sr)), size)[:n]
    power = y * y
    block, hop = int(0.4 * sr), int(0.1 * sr)
    if n <= block:
        return float(-0.691 + 10 * np.log10(power.mean() + 1e-20))
    c = np.concatenate([[0.0], np.cumsum(power)])
    starts = np.arange(0, n - block + 1, hop)
    z = (c[starts + block] - c[starts]) / block
    z = z[-0.691 + 10 * np.log10(z + 1e-20) > -70]
    if len(z) == 0:
        return -120.0
    relative = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z + 1e-20) > relative]
    return float(-0.691 + 10 * np.log10(z.mean()))


def normalize(x: np.ndarray, target_lufs: float) -> np.ndarray:
    level = loudness(x)
    if level < -100:
        return f32(x)
    return f32(x * db(target_lufs - level))


def _upsample4(x: np.ndarray) -> np.ndarray:
    """4x band-limited interpolation (chunked FFT zero-stuffing)."""
    guard, chunk = 256, 1 << 15
    xp = np.concatenate([np.zeros(guard), np.asarray(x, np.float64), np.zeros(guard)])
    n = len(x)
    out = np.empty(4 * n, np.float32)
    for s in range(0, n, chunk):
        e = min(n, s + chunk)
        seg = xp[s : e + 2 * guard]
        m = len(seg)
        spec = np.fft.rfft(seg)
        if m % 2 == 0:
            spec[-1] *= 0.5
        big = np.zeros(2 * m + 1, np.complex128)
        big[: len(spec)] = spec
        up = np.fft.irfft(big, 4 * m) * 4
        out[4 * s : 4 * e] = up[4 * guard : 4 * (guard + e - s)]
    return out


def peak_envelope(x: np.ndarray) -> np.ndarray:
    """True-peak magnitude around each sample (max of the 4x oversampled values)."""
    if len(x) == 0:
        return np.zeros(0, np.float32)
    up = np.abs(_upsample4(x)).reshape(len(x), 4).max(axis=1)
    return np.maximum(up, np.abs(x))


def true_peak_db(x: np.ndarray) -> float:
    if len(x) == 0:
        return -120.0
    return float(20 * np.log10(peak_envelope(x).max() + 1e-12))


def _sliding_min(x: np.ndarray, w: int) -> np.ndarray:
    """min(x[i : i + w]) for every i (van Herk / Gil-Werman), padding with 1."""
    n = len(x)
    if w <= 1:
        return x.copy()
    total = n + w - 1
    total += (-total) % w
    xp = np.ones(total, x.dtype)
    xp[:n] = x
    blocks = xp.reshape(-1, w)
    prefix = np.minimum.accumulate(blocks, axis=1).ravel()
    suffix = np.minimum.accumulate(blocks[:, ::-1], axis=1)[:, ::-1].ravel()
    return np.minimum(suffix[:n], prefix[w - 1 : w - 1 + n])


def _causal_mean(x: np.ndarray, w: int) -> np.ndarray:
    if w <= 1:
        return x
    xp = np.concatenate([np.full(w - 1, x[0]), x])
    c = np.concatenate([[0.0], np.cumsum(xp, dtype=np.float64)])
    return (c[w:] - c[:-w]) / w


def limit(x: np.ndarray, ceiling_db: float, attack_ms: float = 1.5, smooth_ms: float = 8.0, hold_ms: float = 50.0) -> np.ndarray:
    """Look-ahead true-peak limiter. The smoothed gain never exceeds the gain each peak needs."""
    if len(x) == 0:
        return f32(x)
    ceiling = db(ceiling_db)
    need = np.minimum(1.0, ceiling / np.maximum(peak_envelope(x).astype(np.float64), 1e-9))
    if need.min() >= 1.0:
        return f32(x)
    w1, w2, hold = max(1, ns(attack_ms / 1000)), max(1, ns(smooth_ms / 1000)), ns(hold_ms / 1000)
    look = w1 + w2
    held = _sliding_min(np.concatenate([np.ones(hold), need]), hold + look)[: len(need)]
    gain = _causal_mean(_causal_mean(held, w1), w2)
    return f32(x * gain)


# ── Envelopes and tones ───────────────────────────────────────────────────────


def fade(x: np.ndarray, fade_in: float = 0.0, fade_out: float = 0.0) -> np.ndarray:
    x = f32(x).copy()
    if fade_in > 0:
        n = min(len(x), ns(fade_in))
        x[:n] *= np.sin(np.linspace(0, np.pi / 2, n)) ** 2
    if fade_out > 0:
        n = min(len(x), ns(fade_out))
        if n:
            x[len(x) - n :] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    return x


def envelope(n: int, attack: float, release: float, curve: float = 1.0) -> np.ndarray:
    """Linear attack, exponential-ish release over the last `release` seconds."""
    env = np.ones(n, np.float64)
    a = min(n, ns(attack))
    if a:
        env[:a] = np.linspace(0, 1, a)
    r = min(n, ns(release))
    if r:
        env[n - r :] *= np.linspace(1, 0, r) ** curve
    return env


def phase_of(freq) -> np.ndarray:
    """Phase (radians) of an oscillator following a per-sample frequency curve."""
    return TAU * np.cumsum(freq) / SR


def note(name: str) -> float:
    """'A4' -> 440.0; supports sharps ('C#5') and flats ('Bb3')."""
    letters = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    semis = letters[name[0]]
    rest = name[1:]
    if rest.startswith("#"):
        semis, rest = semis + 1, rest[1:]
    elif rest.startswith("b"):
        semis, rest = semis - 1, rest[1:]
    return 440.0 * 2 ** ((semis + (int(rest) - 4) * 12) / 12)


def place(dest: np.ndarray, clip: np.ndarray, at_seconds: float, gain: float = 1.0) -> None:
    start = ns(at_seconds)
    end = min(len(dest), start + len(clip))
    if end > start:
        dest[start:end] += clip[: end - start] * gain


# ── Reverb ────────────────────────────────────────────────────────────────────


def reverb_ir(rng: np.random.Generator, rt60: float, predelay: float = 0.02, hi: float = 6000, lo: float = 150,
              dark: float = 0.35, early: list[tuple[float, float]] | None = None) -> np.ndarray:
    """Synthetic impulse response: decaying noise that gets darker over time, unit energy."""
    n = ns(rt60 * 1.05)
    t = times(n)
    tail = white(rng, n) * np.exp(-6.91 * t / rt60)
    darker = band(tail, hi=hi * dark)
    mix = np.exp(-t / (rt60 * 0.25))
    ir = band(tail * mix + darker * (1 - mix), lo=lo, hi=hi)
    for delay, gain in early or []:
        k = ns(delay)
        if k < n:
            ir[k] += gain * rng.choice([-1, 1]) * np.abs(ir).max() * 4
    ir = np.concatenate([np.zeros(ns(predelay), np.float32), ir])
    return f32(ir / np.sqrt(np.sum(np.square(ir, dtype=np.float64)) + 1e-20))


def add_reverb(x: np.ndarray, ir: np.ndarray, wet_db: float, dry: float = 1.0) -> np.ndarray:
    wet = convolve(x, ir)
    out = wet * db(wet_db)
    out[: len(x)] += x * dry
    return f32(out)


# ── Shaping ───────────────────────────────────────────────────────────────────


def softclip(x: np.ndarray, drive_db: float) -> np.ndarray:
    """tanh saturation; output peak roughly preserved."""
    peak = float(np.abs(x).max()) if len(x) else 0.0
    if peak <= 0:
        return f32(x)
    g = db(drive_db) / peak
    return f32(np.tanh(x * g) / np.tanh(g * peak) * peak)


def ring_mod(x: np.ndarray, freq: float, mix: float, wobble: float = 0.0, rate: float = 0.5) -> np.ndarray:
    t = times(len(x))
    f = freq * (1 + wobble * np.sin(TAU * rate * t))
    carrier = np.sin(phase_of(f))
    return f32(x * (1 - mix) + x * carrier * mix * 1.41)


def trim_silence(x: np.ndarray, threshold_db: float = -45.0, pad: float = 0.015) -> tuple[np.ndarray, int]:
    """Trim to the region above `threshold_db` relative to the peak; returns (audio, samples cut at start)."""
    if len(x) == 0:
        return x, 0
    peak = float(np.abs(x).max())
    if peak <= 0:
        return x[:0], 0
    loud = np.flatnonzero(np.abs(x) > peak * db(threshold_db))
    p = ns(pad)
    start = max(0, int(loud[0]) - p)
    end = min(len(x), int(loud[-1]) + p + 1)
    return x[start:end], start


# ── ffmpeg ────────────────────────────────────────────────────────────────────


def ffmpeg_filter(x: np.ndarray, chain: str, sr: int = SR) -> np.ndarray:
    """Run audio through an ffmpeg filter chain (mono float32 in, mono float32 at `sr` out)."""
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-nostdin", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
            "-af", chain, "-f", "f32le", "-ar", str(sr), "-ac", "1", "pipe:1",
        ],
        input=f32(x).astype("<f4").tobytes(),
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg filter failed ({chain}): {proc.stderr.decode(errors='replace').strip()}")
    out = np.frombuffer(proc.stdout, dtype="<f4").astype(np.float32)
    if not np.all(np.isfinite(out)):
        raise RuntimeError(f"ffmpeg filter produced NaN/inf samples ({chain})")
    return out


def encode_mp3(x: np.ndarray, path: str, bitrate: str = "48k", sr: int = SR) -> None:
    if not np.all(np.isfinite(x)):
        raise RuntimeError(f"refusing to encode NaN/inf samples into {path}")
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
            "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(sr), "-ac", "1",
            "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0", "-f", "mp3", path,
        ],
        input=f32(x).astype("<f4").tobytes(),
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"mp3 encode failed: {proc.stderr.decode(errors='replace').strip()}")


def decode(path: str, sr: int = SR) -> np.ndarray:
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-f", "f32le", "-ar", str(sr), "-ac", "1", "pipe:1"],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"decode failed for {path}: {proc.stderr.decode(errors='replace').strip()}")
    return np.frombuffer(proc.stdout, dtype="<f4").astype(np.float32)
