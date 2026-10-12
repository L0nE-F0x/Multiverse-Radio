"""Kokoro TTS with a content-addressed cache (one float WAV per unique line)."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import numpy as np
import soundfile as sf

from dsp import SR


class TTS:
    def __init__(self, model: Path, voices: Path, cache_dir: Path, threads: int = 2):
        self.model = Path(model)
        self.voices = Path(voices)
        self.dir = Path(cache_dir) / "tts"
        self.threads = threads
        self._kokoro = None
        self.generated_seconds = 0.0
        self.identity = model_identity(self.model, self.voices)

    def _engine(self):
        if self._kokoro is None:
            import onnxruntime as rt
            from kokoro_onnx import Kokoro

            for path in (self.model, self.voices):
                if not path.exists():
                    raise FileNotFoundError(f"Kokoro file not found: {path} (set KOKORO_MODEL / KOKORO_VOICES)")
            options = rt.SessionOptions()
            options.intra_op_num_threads = self.threads
            options.inter_op_num_threads = 1
            session = rt.InferenceSession(str(self.model), options, providers=["CPUExecutionProvider"])
            self._kokoro = Kokoro.from_session(session, str(self.voices))
        return self._kokoro

    def key(self, voice: str, text: str, speed: float, lang: str) -> str:
        payload = f"{self.identity}|{voice}|{speed:.4f}|{lang}|{text}"
        return hashlib.sha256(payload.encode()).hexdigest()[:24]

    def say(self, voice: str, text: str, speed: float, lang: str) -> np.ndarray:
        key = self.key(voice, text, speed, lang)
        path = self.dir / key[:2] / f"{key}.wav"
        if path.exists():
            try:
                audio, _ = sf.read(path, dtype="float32")
                return audio
            except (RuntimeError, sf.LibsndfileError):
                path.unlink(missing_ok=True)  # a torn write; regenerate
        audio, rate = self._engine().create(text, voice=voice, speed=speed, lang=lang)
        if rate != SR:
            raise RuntimeError(f"Kokoro returned {rate} Hz, expected {SR}")
        audio = np.asarray(audio, dtype=np.float32)
        self.generated_seconds += len(audio) / SR
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f"{key}.{os.getpid()}.tmp.wav")
        sf.write(tmp, audio, SR, subtype="FLOAT")
        os.replace(tmp, path)
        return audio


def model_identity(model: Path, voices: Path) -> str:
    """Cheap, stable identity for the model files (name + size), part of every cache key."""

    def ident(p: Path) -> str:
        try:
            return f"{p.name}:{p.stat().st_size}"
        except OSError:
            return f"{p.name}:missing"

    return f"{ident(Path(model))}+{ident(Path(voices))}"
