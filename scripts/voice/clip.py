"""Render one clip: TTS lines, voice fx, sfx and stings on a timeline, an optional bed,
loudness mastering and MP3 encoding. Runs inside worker processes."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

import dsp
import sounds
import voicefx
from dsp import SR, ns
import voicescript
from tts import TTS
from voicescript import STING_GAP, STING_SECONDS, Clip, Pause, Sfx, Speech, Sting

# The validator's catalog and the engine must agree on every name.
for _kind, _catalog, _engine in (
    ("fx", voicescript.FX, voicefx.PRESETS),
    ("bed", voicescript.BEDS, sounds.BEDS),
    ("sfx", voicescript.SFX, sounds.SFX),
    ("sting", voicescript.STINGS, sounds.STINGS),
):
    if set(_catalog) != set(_engine):
        raise RuntimeError(f"{_kind} catalog mismatch: {sorted(set(_catalog) ^ set(_engine))}")

TARGET_LUFS = -16.0
LOUDNESS_TOLERANCE = 0.3
CODEC_LOSS_LU = 0.3  # 48 kbps MP3 shaves about this much loudness (mostly highs)
LIMIT_CEILING_DB = -3.0  # limiter ceiling before encoding; 48 kbps MP3 adds ~0.5-1.2 dB of peaks
TARGET_TRUE_PEAK_DB = -1.8  # aimed for on the decoded MP3 (4x oversampled; margin for 8x meters)
MAX_TRUE_PEAK_DB = -1.5  # never exceeded
EDGE = 0.05  # silence kept at each end
BED_LEAD, BED_TAIL = 0.4, 0.6  # bed before the first and after the last sound
BITRATE = voicescript.BITRATE  # default; render.py picks per clip (voicescript.bitrate_for)
CUT_FADE = 0.008

# Bump to force a full re-render after changes that the source fingerprints wouldn't catch
# (see fingerprint.py: each clip's hash covers the engine code it actually uses).
ENGINE_VERSION = 1


@dataclass
class Job:
    station: str
    clip: Clip
    out_path: str
    seed: int
    bitrate: str = BITRATE


@dataclass
class Result:
    station: str
    id: str
    duration_ms: int
    lines: list[dict]
    loudness: float
    true_peak: float
    tts_seconds: float
    elapsed: float
    warnings: list[str] = field(default_factory=list)


_tts: TTS | None = None


def init_worker(model: str, voices: str, cache_dir: str, threads: int, nice: int = 0) -> None:
    global _tts
    os.environ.setdefault("OMP_NUM_THREADS", str(threads))
    if nice > 0 and hasattr(os, "nice"):
        try:
            os.nice(nice)  # a long render shouldn't crowd out interactive work on a busy machine
        except OSError:
            pass
    _tts = TTS(Path(model), Path(voices), Path(cache_dir), threads)


def caption_text(line: Speech) -> str:
    if line.cut is None or line.cut >= 1:
        return line.text
    words = line.text.split()
    keep = max(1, round(len(words) * line.cut))
    return " ".join(words[:keep]).rstrip(",;:.") + "—"


def speech(line: Speech, rng: np.random.Generator) -> tuple[np.ndarray, int]:
    """The treated line and how far it moves the timeline (its dry length, before tails)."""
    assert _tts is not None, "init_worker() not called"
    raw = _tts.say(line.voice, line.text, line.speed, line.lang)
    body, _ = dsp.trim_silence(raw, -45.0, 0.015)
    if len(body) == 0:
        raise RuntimeError(f"TTS produced silence for {line.text!r}")
    body = dsp.normalize(body, voicefx.VOICE_LUFS)
    treated = voicefx.apply(line.fx, body, rng)
    advance = len(body)
    if line.cut is not None and line.cut < 1:
        advance = max(1, int(len(body) * line.cut))
        treated = dsp.fade(treated[:advance], 0, CUT_FADE)
    if line.gain != 0.0:
        treated = dsp.f32(treated * dsp.db(line.gain))
    return treated, advance


def assemble(clip: Clip, rng: np.random.Generator) -> tuple[np.ndarray, list[dict]]:
    stereo = any(isinstance(line, Speech) and line.pan != 0.0 for line in clip.lines)
    events: list[tuple[int, np.ndarray]] = []
    captions: list[tuple[int, str, str]] = []
    cursor = 0
    for line in clip.lines:
        if isinstance(line, Speech):
            audio, advance = speech(line, rng)
            events.append((cursor, dsp.pan(audio, line.pan) if stereo else audio))
            captions.append((cursor, line.speaker, caption_text(line)))
            cursor = max(0, cursor + advance + int(round(line.gap * SR)))
        elif isinstance(line, Pause):
            cursor += ns(line.seconds)
        elif isinstance(line, Sfx):
            sfx = sounds.make_sfx(line.name, line.seconds, line.level, rng)
            events.append((cursor, dsp.pan(sfx, 0.0) if stereo else sfx))
            cursor += ns(line.seconds)
        elif isinstance(line, Sting):
            audio = sounds.make_sting(line.name, rng)
            events.append((cursor, dsp.pan(audio, 0.0) if stereo else audio))
            cursor += min(len(audio), ns(STING_SECONDS[line.name])) + ns(STING_GAP)

    length = max((start + len(audio) for start, audio in events), default=0)
    mix = np.zeros((max(length, 1), 2) if stereo else max(length, 1), np.float32)
    for start, audio in events:
        mix[start : start + len(audio)] += audio

    # Trim to the audible region, keeping EDGE seconds of silence at each end.
    mag = np.abs(mix).max(axis=1) if stereo else np.abs(mix)
    peak = float(mag.max())
    loud = np.flatnonzero(mag > peak * dsp.db(-50)) if peak > 0 else np.array([0, len(mix) - 1])
    first, last = int(loud[0]), int(loud[-1])
    start = first - ns(EDGE)
    end = last + 1 + ns(EDGE)
    padded = np.zeros((end - start, 2) if stereo else end - start, np.float32)
    src_from, src_to = max(0, start), min(len(mix), end)
    padded[src_from - start : src_to - start] = mix[src_from:src_to]
    mix = dsp.fade(padded, 0, EDGE)
    offset = -start

    if clip.bed:
        lead, tail = ns(BED_LEAD), ns(BED_TAIL)
        total = lead + len(mix) + tail
        bed = sounds.make_bed(clip.bed, total / SR, rng)
        bed = dsp.fade(bed, BED_LEAD, BED_TAIL + 0.2)
        out = dsp.pan(bed[:total], 0.0) if stereo else bed[:total].copy()
        out[lead : lead + len(mix)] += mix
        mix, offset = out, offset + lead

    lines = [
        {"speaker": speaker, "text": text, "startMs": int(round(max(0, at + offset) / SR * 1000))}
        for at, speaker, text in captions
    ]
    return mix, lines


def master(x: np.ndarray) -> np.ndarray:
    x = dsp.band(x, lo=55)
    for attempt in range(4):
        level = dsp.loudness(x)
        if level < -70:
            return x
        gain = float(np.clip(TARGET_LUFS + CODEC_LOSS_LU - level, -30, 30))
        if attempt and abs(gain) < 0.15:
            break
        x = dsp.limit(x * dsp.db(gain), LIMIT_CEILING_DB)
    return x


def encode(x: np.ndarray, path: Path, target: float | None = TARGET_LUFS, bitrate: str = BITRATE) -> tuple[np.ndarray, float]:
    """Encode, decode and measure: the codec shaves some loudness and can add inter-sample
    peaks, so correct and re-encode until the decoded file is on target. Peaks win ties."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.stem}.{os.getpid()}.tmp.mp3")
    ceiling = LIMIT_CEILING_DB
    try:
        attempts = 5
        for attempt in range(attempts):
            dsp.encode_mp3(x, str(tmp), bitrate)
            decoded = dsp.decode(str(tmp))
            tp = dsp.true_peak_db(decoded)
            level = dsp.loudness(decoded)
            peak_ok = tp <= TARGET_TRUE_PEAK_DB
            level_ok = target is None or level < -70 or abs(target - level) <= LOUDNESS_TOLERANCE
            if (peak_ok and level_ok) or attempt == attempts - 1:
                break
            if not peak_ok:  # the codec overshoots: limit harder rather than turning everything down
                ceiling -= tp - TARGET_TRUE_PEAK_DB + 0.2
            gain = 0.0 if target is None or level < -70 else target - level
            x = dsp.limit(x * dsp.db(gain), ceiling)
        for _ in range(4):  # last resort: the hard peak limit wins over loudness
            if tp <= MAX_TRUE_PEAK_DB:
                break
            x = x * dsp.db(TARGET_TRUE_PEAK_DB - tp)
            dsp.encode_mp3(x, str(tmp), bitrate)
            decoded = dsp.decode(str(tmp))
            tp = dsp.true_peak_db(decoded)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
    return decoded, tp


@dataclass
class Failure:
    station: str
    id: str
    error: str


def render_safe(job: Job) -> Result | Failure:
    """render(), but errors come back as values so one bad clip doesn't stop the batch."""
    try:
        return render(job)
    except Exception as e:  # noqa: BLE001 - reported to the user with the clip id
        return Failure(job.station, job.clip.id, f"{type(e).__name__}: {e}")


def render(job: Job) -> Result:
    began = time.time()
    assert _tts is not None, "init_worker() not called"
    tts_before = _tts.generated_seconds
    rng = np.random.default_rng(job.seed)
    mix, lines = assemble(job.clip, rng)
    mastered = master(mix)
    decoded, tp = encode(mastered, Path(job.out_path), bitrate=job.bitrate)
    duration_ms = int(round(len(decoded) / SR * 1000))
    warnings = []
    lo, hi = job.clip.length_guide()
    seconds = duration_ms / 1000
    if seconds < lo * 0.8 or seconds > hi * 1.2:
        what = f"{job.clip.part} part" if job.clip.part else job.clip.category
        warnings.append(f"{seconds:.1f} s is outside the {what} guide ({lo}-{hi} s)")
    if tp > MAX_TRUE_PEAK_DB:
        warnings.append(f"true peak {tp:.1f} dBTP is above {MAX_TRUE_PEAK_DB} dBTP")
    return Result(
        station=job.station,
        id=job.clip.id,
        duration_ms=duration_ms,
        lines=[{**line, "startMs": min(line["startMs"], duration_ms)} for line in lines],
        loudness=dsp.loudness(decoded),
        true_peak=tp,
        tts_seconds=_tts.generated_seconds - tts_before,
        elapsed=time.time() - began,
        warnings=warnings,
    )
