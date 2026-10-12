#!/usr/bin/env python3
"""
Renders the placeholder transmissions for Multiverse Radio.

Writes MP3s into public/audio/<channel>/ and the two sound effects into public/sfx/.
Real episodes can replace any of these files; afterwards run `npm run content:sync`
to refresh durationSeconds in public/episodes.json.

Requirements: ffmpeg on PATH, and a Python env with kokoro-onnx, numpy, soundfile.
    pip install kokoro-onnx soundfile numpy
Kokoro model files (kokoro-v1.0.onnx, voices-v1.0.bin) from
    https://github.com/thewh1teagle/kokoro-onnx/releases

Usage:
    python scripts/generate_placeholders.py --model path/to/kokoro-v1.0.onnx --voices path/to/voices-v1.0.bin
    python scripts/generate_placeholders.py --only hop          # just one channel
    python scripts/generate_placeholders.py --sfx-only          # no TTS needed
Paths can also come from KOKORO_MODEL / KOKORO_VOICES.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
CACHE = Path(__file__).resolve().parent / ".cache"
SR = 24_000  # Kokoro's native rate; everything is mixed at this rate
OUT_SR = 44_100
rng = np.random.default_rng(137)


# ── Script DSL ───────────────────────────────────────────────────────────────


@dataclass
class Say:
    voice: str
    text: str
    speed: float = 1.0
    fx: str | None = None
    gap: float = 0.35
    cut: float | None = None  # keep only this fraction of the line (abrupt channel flip)
    bed: str | None = None  # background under this line
    bed_level: float = 0.15  # relative to the voice (both normalized to -20 dBFS RMS)


@dataclass
class Zap:
    seconds: float = 0.3


@dataclass
class Sting:
    name: str
    gap: float = 0.25


@dataclass
class Pause:
    seconds: float


@dataclass
class Sfx:
    kind: str  # any bed() kind, or "applause"
    seconds: float
    level: float = 0.5


@dataclass
class Episode:
    path: str
    title: str
    channel: str
    master: str
    parts: list = field(default_factory=list)


def say(voice, text, **kw):
    return Say(voice, text, **kw)


# ── Scripts ──────────────────────────────────────────────────────────────────
# Original material, in the spirit of each channel. Numbers are spelled out so the
# TTS reads them the way an announcer would.

DALE = "bm_george"  # The Plumbus Report anchor
KIM = "af_sarah"  # field reporter
SKIP = "am_puck"  # weather
JACE = "am_michael"  # Dimension Hop
MARA = "af_bella"

EPISODES: list[Episode] = [
    # ── Rixty Minutes ────────────────────────────────────────────────────────
    Episode("rixty/episode-001.mp3", "Prime Time in Dimension 35-C", "Rixty Minutes", "tv", [
        Zap(0.35),
        say("am_michael", "In a world where the sun is just a rumor... one man must return a library book... that has not been written yet. This summer. Overdue. Rated V, for vaguely inevitable.", speed=0.88, fx="trailer"),
        Zap(),
        say("af_bella", "Now, you want to fold the egg into itself, until it remembers being a bird. Don't rush it. If it starts to cry, that's how you know it's almost", cut=0.93, bed="sizzle"),
        Zap(),
        say("am_puck", "Are your hands too hands? Try Glovez. It's a glove that wears you back. Glovez. It's mutual.", speed=1.12),
        Zap(),
        say("am_fenrir", "And he's rounding third! He's rounding fourth! He's rounding a fifth base that has never been rounded, the crowd is on its feet, the crowd is becoming one enormous scream", speed=1.2, cut=0.86, bed="crowd", bed_level=0.2),
        Zap(),
        say("af_nicole", "Derek. I can't marry you. You're a hallway.", speed=0.9, bed="organ", gap=0.5),
        say("bm_george", "I can change.", speed=0.9, bed="organ", gap=0.5),
        say("af_nicole", "You're a hallway, Derek. You only go two directions.", speed=0.9, bed="organ", cut=0.9),
        Zap(),
        say("af_kore", "Hi friends! Today we're learning to count backwards from forever! Ready? Forever. Forever minus one. Forever minus", fx="kid", speed=1.05, cut=0.95),
        Zap(),
        say("bm_fable", "Tonight's forecast. A light drizzle of past mistakes, clearing by morning. Dress warm. Dress emotionally warm.", speed=0.95),
        Zap(0.45),
    ]),
    Episode("rixty/episode-002.mp3", "Late Night Surf", "Rixty Minutes", "tv", [
        Zap(0.35),
        say("am_puck", "My next guest is a chair. Not a person who is a chair. Just a chair. Please welcome... Chair!", speed=1.05, gap=0.05),
        Sfx("applause", 2.4, level=0.6),
        say("am_puck", "So, Chair. Big year.", speed=1.05, cut=0.97),
        Zap(),
        say("bm_fable", "Here, in the deep carpet, the remote control lies motionless. It has been lost for eleven years. It does not want to be found. It is waiting for the couch to", speed=0.86, fx="hall", cut=0.92),
        Zap(),
        say("af_aoede", "That was Song About a Song About You, by the band Previously. Up next, a track that is just the sound of a refrigerator, and honestly? It slaps", speed=1.12, cut=0.95),
        Zap(),
        say("bm_george", "The defendant is charged with three counts of being early. How do you plead?", speed=0.95, fx="hall", gap=0.45),
        say("am_michael", "I already pleaded. Last week.", speed=1.0, fx="hall", cut=0.98),
        Zap(),
        say("am_fenrir", "Tired of your shadow following you? Introducing Leader. Now your shadow walks in front! Leader. Finally, somebody else can go first.", speed=1.15),
        Zap(),
        say("am_puck", "For the car! What is the name of the man standing directly behind you? No, don't turn around! Do not turn", speed=1.18, cut=0.9, bed="crowd", bed_level=0.1),
        Zap(),
        say("af_heart", "This concludes our broadcast day. Please return your eyes to their original positions. Good night.", speed=0.9, bed="organ", bed_level=0.08),
        Zap(0.45),
    ]),
    Episode("rixty/episode-003.mp3", "Previously, On", "Rixty Minutes", "tv", [
        Zap(0.35),
        say("bm_fable", "Previously, on Lawyers Who Are Also Ghosts.", speed=0.92, fx="trailer", gap=0.4),
        say("af_nicole", "Objection!", fx="hall", gap=0.25),
        say("bm_george", "Sustained.", fx="hall", gap=0.3),
        say("af_nicole", "I'm not sure I can be sustained, your honor. I'm a ghost.", fx="hall", cut=0.97),
        Zap(),
        say("af_sarah", "Coming up at eleven. Is your house haunted, or just poorly insulated? We'll ask your house", speed=1.05, cut=0.9),
        Zap(),
        say("af_kore", "Mom! Can we get Spoon Crunch?", fx="kid", speed=1.1, gap=0.25),
        say("am_michael", "Spoon Crunch. It's a cereal made of tiny spoons. Eat it with a bigger spoon. Part of a balanced spoon.", speed=1.08),
        Zap(),
        say("bm_fable", "The call is coming from inside the house. The house... is coming from inside the call.", speed=0.82, fx="trailer"),
        Zap(),
        say("af_bella", "And five, six, seven, eight, now lift your second spine, everybody, feel that burn, if you don't have a second spine just lift a friend's", speed=1.3, cut=0.93, bed="crowd", bed_level=0.06),
        Zap(),
        say("bm_george", "I wandered lonely as a cloud. The cloud was also lonely. We did not speak.", speed=0.8, fx="hall"),
        Zap(0.45),
    ]),
    # ── The Plumbus Report ───────────────────────────────────────────────────
    Episode("plumbus/episode-001.mp3", "The Thing in Your Attic", "The Plumbus Report", "news", [
        Sting("news", gap=0.4),
        say(DALE, "Good evening. This is The Plumbus Report. I'm Dale Quarterly, and this is the news, from wherever you are.", gap=0.7),
        say(DALE, "Our top story. Scientists in dimension four B have confirmed that the thing in your attic is, in fact, you, from next Tuesday. Officials say there is no cause for alarm, and ask that you stop going up there, because you are making yourself uncomfortable.", gap=0.7),
        say(DALE, "In economic news, the price of gravity rose sharply this afternoon, before falling, as is its nature.", gap=0.7),
        say(DALE, "Residents across the eastern overlap report that the moon has been looking at them. A spokesperson for the moon declined to comment, but continued looking.", gap=0.7),
        say(DALE, "And finally. A man has been named employee of the month for the four hundredth consecutive month. He does not work here. We are looking into it.", gap=0.8),
        say(DALE, "That's the news. More at eleven. It is always eleven.", gap=0.4),
        Sting("news_out"),
    ]),
    Episode("plumbus/episode-002.mp3", "Live from the Collapse", "The Plumbus Report", "news", [
        Sting("news", gap=0.4),
        say(DALE, "Good evening. Our top story tonight: the collapse. For more, we go live to Kim Halfway, who is standing in it. Kim?", gap=0.5),
        say(KIM, "Thanks, Dale. I'm here at the scene, which is also, technically, every scene. Authorities tell me the collapse began at approximately four p.m., and has since begun at several other times as well. Residents are being told to remain calm, or, failing that, to remain.", fx="phone", bed="wind", bed_level=0.1),
        say(DALE, "Kim, is anyone hurt?", gap=0.4),
        say(KIM, "Dale, nobody here has the concept of hurt. It's actually very nice. A man just handed me a soup. I don't know why. I'm going to eat it.", fx="phone", bed="wind", bed_level=0.1),
        say(DALE, "Kim, please don't eat the soup.", gap=0.3),
        say(KIM, "Back to you, Dale.", fx="phone", cut=0.8, gap=0.0),
        Zap(0.5),
        Pause(0.6),
        say(DALE, "We appear to have lost Kim. Our thoughts are with the soup.", gap=0.8),
        say(DALE, "In sports, the final score tonight was a color. More at eleven.", gap=0.4),
        Sting("news_out"),
    ]),
    Episode("plumbus/episode-003.mp3", "Weather & Traffic Across All Timelines", "The Plumbus Report", "news", [
        Sting("news", gap=0.4),
        say(DALE, "Good evening. Time now for weather and traffic, across all timelines. Here's Skip Tomorrow with the forecast. Skip?", gap=0.45),
        say(SKIP, "Thanks, Dale! Well, it's a beautiful night across most of the timelines. In the northern realities, clear skies and a light breeze. In the southern realities, the sky is looking back at you, so give it a wave!", speed=1.08, bed="organ", bed_level=0.05),
        say(SKIP, "Out west, expect scattered Tuesdays, mostly in the afternoon. And a heads up for commuters: there's a ten mile backup on Interstate Zero, where traffic is being held up by a single, very polite deer. Nobody wants to go first!", speed=1.08, bed="organ", bed_level=0.05),
        say(DALE, "Skip. What about the weekend?", gap=0.4),
        say(SKIP, "The weekend has been cancelled, Dale. But the weekday is being extended, so that's nice!", speed=1.08, gap=0.6),
        say(DALE, "Thank you, Skip.", gap=1.0),
        say(DALE, "That's The Plumbus Report. Good night, and good luck. In whichever order they occur.", gap=0.4),
        Sting("news_out"),
    ]),
    # ── Alien Classifieds ────────────────────────────────────────────────────
    Episode("classifieds/episode-001.mp3", "Gary's Hole Emporium", "Alien Classifieds", "ad", [
        Sting("ad", gap=0.2),
        say("am_fenrir", "Hey! You! With the face! Are you tired of holes that are the wrong size? Come on down to Gary's Hole Emporium!", speed=1.15, gap=0.25),
        say("am_fenrir", "We got big holes! Small holes! Holes you can put in your pocket! That's right, portable holes! Need to get somewhere? Throw down a hole! Need to get out of somewhere? Also a hole!", speed=1.18, gap=0.25),
        say("am_fenrir", "Look at this one! Look at it! You can't! Because it's a hole!", speed=1.15, gap=0.5),
        say("am_fenrir", "Gary's Hole Emporium. Located wherever you fall.", speed=1.0, gap=0.35),
        say("af_kore", "Holes are non refundable. Holes may contain other holes. Gary is not responsible for where you end up. Gary is not responsible.", speed=1.45, fx="disclaimer", gap=0.3),
        Sting("ad_out"),
    ]),
    Episode("classifieds/episode-002.mp3", "Crazy Zorbo's Used Planets", "Alien Classifieds", "ad", [
        Sting("ad", gap=0.2),
        say("am_puck", "Crazy Zorbo's Used Planets is having a blowout sale! Everything must go, because the sun is going!", speed=1.12, fx="alien", gap=0.3),
        say("am_puck", "Look at this one! Barely used! One previous owner, a very quiet civilization that kept to itself! Two moons! Comes with an ocean, and the ocean comes with a guy. Don't worry about the guy. He's fine.", speed=1.12, fx="alien", gap=0.3),
        say("am_puck", "And for you young families, a starter asteroid! No atmosphere, no problem! Hold your breath, save some money!", speed=1.15, fx="alien", gap=0.3),
        say("am_puck", "Financing available for any species with a concept of money! No credit? No body? No problem!", speed=1.15, fx="alien", gap=0.4),
        say("am_puck", "Crazy Zorbo's Used Planets. Our prices are astronomical. So are our planets.", speed=1.0, fx="alien", gap=0.35),
        say("af_kore", "Planets sold as is. Zorbo is not crazy, he has simply seen too much. Gravity sold separately.", speed=1.45, fx="disclaimer", gap=0.3),
        Sting("ad_out"),
    ]),
    Episode("classifieds/episode-003.mp3", "Personals, Lost & Found", "Alien Classifieds", "soft", [
        Sting("chime", gap=0.4),
        say("af_heart", "Welcome back to the Alien Classifieds. Tonight: the personals, and the lost and found.", speed=0.95, gap=0.9),
        say("af_heart", "Lost. One shadow. Answers to Greg. Last seen leaving without me. If found, please do not approach. Greg has made his choice.", speed=0.95, gap=0.9),
        say("af_heart", "For sale. Haunted mirror. Shows you exactly as you are. Very upsetting. Make an offer.", speed=0.95, gap=0.9),
        say("af_heart", "Seeking. A tall, dark stranger, to stand at the end of my bed. Must be patient. Must be quiet. I already have one, looking for a second.", speed=0.95, gap=0.9),
        say("af_heart", "Found. A Tuesday. Mostly intact. Some damage to the afternoon. Claim at the front desk.", speed=0.95, gap=0.9),
        say("af_heart", "Free to a good home. My thoughts. Please take them. They are not house trained.", speed=0.95, gap=1.0),
        say("af_heart", "That's all the listings for tonight. Remember: if you can't find it, it's probably in another reality. If you can find it, it probably isn't yours.", speed=0.95, gap=0.5),
        Sting("chime"),
    ]),
    # ── Dimension Hop ────────────────────────────────────────────────────────
    Episode("hop/episode-001.mp3", "Legs?", "Dimension Hop", "talk", [
        Sting("hop", gap=0.3),
        say(JACE, "Welcome back to Dimension Hop, the show where two people from two different realities talk about it. I'm Jace.", gap=0.3),
        say(MARA, "And I'm Mara, coming to you from a dimension where this microphone is a fish.", fx="remote", gap=0.3),
        say(JACE, "Is it a nice fish?", gap=0.3),
        say(MARA, "It's a professional fish.", fx="remote", gap=0.5),
        say(JACE, "Okay. So, Mara, I wanted to ask you. In your dimension, how do people get places?", gap=0.3),
        say(MARA, "We roll. Mostly downhill. Uphill is for emergencies.", fx="remote", gap=0.3),
        say(JACE, "See, here, we just... walk. With legs.", gap=0.3),
        say(MARA, "With your legs? Both of them? At the same time?", fx="remote", gap=0.25),
        say(JACE, "No, one after the other.", gap=0.4),
        say(MARA, "That's so brave.", fx="remote", gap=0.5),
        say(JACE, "What happens if you need to go uphill, and it's not an emergency?", gap=0.3),
        say(MARA, "Then you live there now. That's just the rules.", fx="remote", gap=0.9),
        say(JACE, "Okay. We're going to take a quick break.", gap=0.3),
        say(MARA, "Don't go anywhere. Or do. Roll, if you have to.", fx="remote", gap=0.4),
        Sting("hop_out"),
    ]),
    Episode("hop/episode-002.mp3", "Four Seconds Ahead", "Dimension Hop", "talk", [
        Sting("hop", gap=0.3),
        say(JACE, "Welcome back to Dimension Hop. Mara, I think something's wrong with the line. I can hear you before you talk.", gap=0.3),
        say(MARA, "Oh, yeah. That's the time zone. I'm about four seconds ahead of you.", fx="remote", gap=0.3),
        say(JACE, "That's not how time zones work.", gap=0.25),
        say(MARA, "It's how mine works. Your next question is about breakfast.", fx="remote", gap=0.8),
        say(JACE, "What do you guys eat for breakfast?", gap=0.3),
        say(MARA, "See? Anyway. We eat the evening before. It saves time.", fx="remote", gap=0.25),
        say(JACE, "That doesn't", cut=0.9, gap=0.0),
        say(MARA, "Yes it does, Jace. You were going to say that.", fx="remote", gap=0.4),
        say(JACE, "So what's it like? Being four seconds ahead?", gap=0.4),
        say(MARA, "Honestly? Lonely. I laugh at every joke before it's told, so people think I'm laughing at them.", fx="remote", gap=0.6),
        say(JACE, "I'm sorry.", gap=0.5),
        say(MARA, "I know. You said that four seconds ago.", fx="remote", gap=0.5),
        Sting("hop_out"),
    ]),
    Episode("hop/episode-003.mp3", "Listener Mail", "Dimension Hop", "talk", [
        Sting("hop", gap=0.3),
        say(MARA, "It's time for listener mail! Jace, read the first one.", fx="remote", gap=0.3),
        say(JACE, "This one's from Doug, who writes: Dear Dimension Hop. In my reality, the dogs own the people. Is that normal?", gap=0.3),
        say(MARA, "Totally normal. In mine, the dogs own the dogs. It's a whole pyramid thing.", fx="remote", gap=0.4),
        say(JACE, "Doug goes on. My dog says I'm a good boy, but I don't think he means it.", gap=0.3),
        say(MARA, "Doug. He means it. Dogs can't lie. That's why they never run for office.", fx="remote", gap=0.7),
        say(JACE, "Next letter. From someone who signs it, The Same Letter. It says: Dear Dimension Hop. This is the same letter.", gap=0.3),
        say(MARA, "Oh, that's the same letter.", fx="remote", gap=0.3),
        say(JACE, "Mara, it's a different letter.", gap=0.4),
        say(MARA, "Is it, Jace? Is it?", fx="remote", gap=0.9),
        say(JACE, "We're out of time.", gap=0.3),
        say(MARA, "We're always out of time. Some of us are just further out than others. Bye, Doug!", fx="remote", gap=0.4),
        Sting("hop_out"),
    ]),
]

# Per-line voice treatments (ffmpeg filter chains at 24 kHz).
VOICE_FX = {
    "trailer": "asetrate=21600,aresample=24000,atempo=1.111,aecho=0.8:0.6:45|90:0.25|0.12",
    "hall": "aecho=0.8:0.7:55|110:0.22|0.12",
    "kid": "asetrate=27360,aresample=24000,atempo=0.877",
    "phone": "highpass=f=380,lowpass=f=3300,acompressor=threshold=-24dB:ratio=5:attack=3:release=60,acrusher=bits=10:mix=0.12,volume=1.3",
    "remote": "highpass=f=140,lowpass=f=5200,chorus=0.7:0.9:45:0.35:0.25:1.6",
    "alien": "asetrate=22320,aresample=24000,atempo=1.075,afreqshift=shift=-35,aecho=0.8:0.5:18:0.2",
    "disclaimer": "highpass=f=320,lowpass=f=5200,volume=0.75",
}

# Channel mastering (applied to the whole episode).
MASTER = {
    "tv": "highpass=f=150,lowpass=f=7000",
    "news": "highpass=f=90,lowpass=f=8500",
    "ad": "highpass=f=110,lowpass=f=8000,acompressor=threshold=-22dB:ratio=4:attack=4:release=90:makeup=2",
    "soft": "highpass=f=80,lowpass=f=8500",
    "talk": "highpass=f=80,lowpass=f=9000",
    "ambient": "highpass=f=30",
}
MASTER_TAIL = "acompressor=threshold=-20dB:ratio=2.5:attack=6:release=150,loudnorm=I=-16:TP=-1.5:LRA=9"


# ── DSP helpers ──────────────────────────────────────────────────────────────


def seconds(n: float, sr: int = SR) -> int:
    return int(round(n * sr))


def silence(sec: float, sr: int = SR) -> np.ndarray:
    return np.zeros(seconds(sec, sr), dtype=np.float32)


def noise(n: int) -> np.ndarray:
    return rng.standard_normal(n).astype(np.float32)


def band(x: np.ndarray, lo: float | None = None, hi: float | None = None, sr: int = SR) -> np.ndarray:
    """Zero-phase 2nd-order-ish band filter in the frequency domain."""
    spectrum = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    gain = np.ones_like(f)
    if lo:
        gain *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi:
        gain *= 1 / np.sqrt(1 + (f / hi) ** 4)
    return np.fft.irfft(spectrum * gain, n=len(x)).astype(np.float32)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)) + 1e-12))


def at_rms(x: np.ndarray, db: float) -> np.ndarray:
    return (x * (10 ** (db / 20) / rms(x))).astype(np.float32)


def fade(x: np.ndarray, fade_in: float = 0.0, fade_out: float = 0.0, sr: int = SR) -> np.ndarray:
    x = x.copy()
    if fade_in > 0:
        n = min(len(x), seconds(fade_in, sr))
        x[:n] *= np.linspace(0, 1, n, dtype=np.float32)
    if fade_out > 0:
        n = min(len(x), seconds(fade_out, sr))
        x[len(x) - n :] *= np.linspace(1, 0, n, dtype=np.float32)
    return x


def wander(n: int, rate: float, sr: int = SR) -> np.ndarray:
    """Smooth random movement between 0 and 1."""
    points = rng.random(int(n / sr * rate) + 3)
    xs = np.linspace(0, len(points) - 1, n)
    i = np.floor(xs).astype(int)
    t = xs - i
    t = (1 - np.cos(np.pi * t)) / 2
    return (points[i] * (1 - t) + points[np.minimum(i + 1, len(points) - 1)] * t).astype(np.float32)


def tone(freq: float, sec: float, decay: float = 3.0, harmonics=(1.0, 0.35, 0.12), sr: int = SR) -> np.ndarray:
    t = np.arange(seconds(sec, sr)) / sr
    out = sum(a * np.sin(2 * np.pi * freq * (k + 1) * t) for k, a in enumerate(harmonics))
    env = np.exp(-t * decay) * np.minimum(1, t / 0.004)
    return (out * env).astype(np.float32)


def place(dest: np.ndarray, clip: np.ndarray, at: float, sr: int = SR) -> None:
    start = seconds(at, sr)
    end = min(len(dest), start + len(clip))
    if end > start:
        dest[start:end] += clip[: end - start]


def run_ffmpeg_filter(x: np.ndarray, chain: str, sr: int = SR) -> np.ndarray:
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp, "in.wav"), Path(tmp, "out.wav")
        sf.write(src, x, sr, subtype="FLOAT")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", chain, "-ar", str(sr), "-ac", "1", str(dst)],
            check=True,
        )
        y, _ = sf.read(dst, dtype="float32")
    return y


def trim(x: np.ndarray, threshold: float = 0.008, pad: float = 0.03) -> np.ndarray:
    loud = np.flatnonzero(np.abs(x) > threshold)
    if len(loud) == 0:
        return x
    p = seconds(pad)
    return x[max(0, loud[0] - p) : min(len(x), loud[-1] + p)]


# ── Sound design ─────────────────────────────────────────────────────────────


def zap(sec: float, sr: int = SR) -> np.ndarray:
    """A channel flip: a burst of bandpassed static with a falling heterodyne chirp."""
    n = seconds(sec, sr)
    t = np.arange(n) / sr
    hiss = band(noise(n), 400, 6000, sr)
    pops = np.zeros(n, dtype=np.float32)
    for pos in rng.integers(0, n, size=max(2, int(sec * 25))):
        pops[pos] = rng.uniform(-1, 1) * 6
    pops = band(pops, 200, 4000, sr)
    chirp_freq = 2600 * (500 / 2600) ** (t / sec)
    chirp = 0.08 * np.sin(2 * np.pi * np.cumsum(chirp_freq) / sr)
    env = np.minimum(1, t / 0.006) * np.minimum(1, (sec - t) / 0.05)
    return ((at_rms(hiss + pops, -18) + chirp) * env).astype(np.float32)


def bed(kind: str, sec: float) -> np.ndarray:
    n = seconds(sec)
    if kind == "crowd":
        roar = band(noise(n), 250, 2200) * (0.55 + 0.45 * wander(n, 0.8))
        return fade(at_rms(roar, -20), 0.3, 0.3)
    if kind == "sizzle":
        fry = band(noise(n), 2500, 9000) * (0.7 + 0.3 * wander(n, 3))
        crackle = np.zeros(n, dtype=np.float32)
        for pos in rng.integers(0, n, size=int(sec * 40)):
            crackle[pos] = rng.uniform(-1, 1) * 8
        return fade(at_rms(fry, -21) + at_rms(band(crackle, 1500, 8000), -24), 0.2, 0.3)
    if kind == "organ":
        t = np.arange(n) / SR
        vib = 0.6 * np.sin(2 * np.pi * 5.5 * t)
        chord = sum(np.sin(2 * np.pi * f * t + vib) + 0.3 * np.sin(4 * np.pi * f * t + 2 * vib) for f in (174.6, 220.0, 261.6, 329.6))
        swell = 0.7 + 0.3 * wander(n, 0.4)
        return fade(at_rms((chord * swell).astype(np.float32), -20), 0.6, 0.6)
    if kind == "wind":
        gust = band(noise(n), 120, 900) * (0.4 + 0.6 * wander(n, 0.5))
        return fade(at_rms(gust, -20), 0.4, 0.4)
    raise ValueError(f"unknown bed {kind}")


def applause(sec: float, claps_per_second: float = 220) -> np.ndarray:
    n = seconds(sec)
    out = np.zeros(n, dtype=np.float32)
    clap_len = seconds(0.02)
    shape = np.exp(-np.arange(clap_len) / (SR * 0.004)).astype(np.float32)
    for pos in rng.integers(0, max(1, n - clap_len), size=int(sec * claps_per_second)):
        out[pos : pos + clap_len] += noise(clap_len) * shape * rng.uniform(0.3, 1)
    return at_rms(band(out, 700, 7000), -20)


def note(name: str) -> float:
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    semis = names[name[0]] + (1 if "#" in name else 0) + (int(name[-1]) - 4) * 12
    return 440.0 * 2 ** (semis / 12)


def sting(name: str) -> np.ndarray:
    if name in ("news", "news_out"):
        seq = ["G5", "E5", "C5"] if name == "news" else ["C5", "E5", "G5"]
        out = silence(2.2)
        for i, nm in enumerate(seq):
            place(out, tone(note(nm), 1.4, 3.2, (1, 0.5, 0.25, 0.1)) * 0.5, 0.05 + i * 0.3)
        place(out, tone(note("C3"), 1.8, 2.2, (1, 0.4)) * 0.6, 0.05 + 2 * 0.3)
        return fade(out, 0, 0.3)
    if name in ("ad", "ad_out"):
        seq = ["C5", "E5", "G5", "C6"]
        out = silence(1.3)
        for i, nm in enumerate(seq):
            place(out, tone(note(nm), 0.18, 8, (1, 0, 0.33, 0, 0.2)) * 0.45, i * 0.085)
        for nm in ("C5", "E5", "G5", "C6"):
            place(out, tone(note(nm), 0.9, 3.5, (1, 0, 0.33, 0, 0.2)) * 0.22, 0.38)
        return fade(out, 0, 0.2)
    if name in ("hop", "hop_out"):
        out = silence(1.2)
        for i, (start, end) in enumerate([(380, 760), (520, 1040)] if name == "hop" else [(1040, 520), (760, 380)]):
            t = np.arange(seconds(0.22)) / SR
            freq = start * (end / start) ** np.minimum(1, t / 0.08)
            blip = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 9)
            place(out, (blip * 0.5).astype(np.float32), i * 0.24)
        place(out, tone(note("C3"), 0.8, 5, (1, 0.2)) * 0.5, 0.48)
        return fade(out, 0, 0.2)
    if name == "chime":
        out = silence(2.0)
        for i, nm in enumerate(["E6", "B5"]):
            place(out, tone(note(nm), 1.6, 2.5, (1, 0.2, 0.05)) * 0.35, i * 0.35)
        return fade(out, 0, 0.3)
    raise ValueError(f"unknown sting {name}")


# ── Voice rendering ──────────────────────────────────────────────────────────


class Voices:
    def __init__(self, model: str, voices: str):
        from kokoro_onnx import Kokoro

        self.kokoro = Kokoro(model, voices)
        CACHE.mkdir(parents=True, exist_ok=True)

    def render(self, voice: str, text: str, speed: float) -> np.ndarray:
        key = hashlib.sha1(f"{voice}|{speed}|{text}".encode()).hexdigest()[:16]
        cached = CACHE / f"{key}.wav"
        if cached.exists():
            audio, _ = sf.read(cached, dtype="float32")
            return audio
        lang = "en-gb" if voice.startswith("b") else "en-us"
        audio, rate = self.kokoro.create(text, voice=voice, speed=speed, lang=lang)
        assert rate == SR, rate
        audio = trim(np.asarray(audio, dtype=np.float32))
        sf.write(cached, audio, SR, subtype="FLOAT")
        return audio


def render_episode(episode: Episode, voices: Voices) -> np.ndarray:
    chunks: list[np.ndarray] = []
    for part in episode.parts:
        if isinstance(part, Pause):
            chunks.append(silence(part.seconds))
        elif isinstance(part, Zap):
            chunks.append(zap(part.seconds))
        elif isinstance(part, Sfx):
            sound = applause(part.seconds) if part.kind == "applause" else bed(part.kind, part.seconds)
            chunks.append(fade(sound, 0.05, part.seconds * 0.6) * part.level)
        elif isinstance(part, Sting):
            chunks.append(sting(part.name))
            chunks.append(silence(part.gap))
        elif isinstance(part, Say):
            line = voices.render(part.voice, part.text, part.speed)
            if part.fx:
                line = run_ffmpeg_filter(line, VOICE_FX[part.fx])
            line = at_rms(line, -20)
            if part.cut:
                line = fade(line[: int(len(line) * part.cut)], 0, 0.008)
            gap = 0.0 if part.cut else part.gap
            segment = np.concatenate([line, silence(gap)])
            if part.bed:
                segment = segment + bed(part.bed, len(segment) / SR) * part.bed_level
            chunks.append(segment.astype(np.float32))
    audio = np.concatenate(chunks)
    # A faint carrier: hiss and mains hum, so silence never sounds digital.
    t = np.arange(len(audio)) / SR
    carrier = at_rms(band(noise(len(audio)), 800, 7000), -54) + 0.0015 * np.sin(2 * np.pi * 60 * t)
    return (audio + carrier).astype(np.float32)


def encode(audio: np.ndarray, sr: int, destination: Path, chain: str, title: str, artist: str) -> float:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp, "mix.wav")
        sf.write(src, audio, sr, subtype="FLOAT")
        subprocess.run(
            [
                "ffmpeg", "-v", "error", "-y", "-i", str(src),
                "-af", chain, "-ar", str(OUT_SR), "-ac", "1",
                "-c:a", "libmp3lame", "-b:a", "96k",
                "-metadata", f"title={title}", "-metadata", f"artist={artist}",
                "-metadata", "album=Multiverse Radio",
                str(destination),
            ],
            check=True,
        )
    return probe_duration(destination)


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


# ── Static channel & SFX ─────────────────────────────────────────────────────


def render_ambient(voices: Voices | None, length: float = 90.0, overlap: float = 6.0) -> np.ndarray:
    """A seamless loop: noise bed, a beating drone, a numbers station and morse, far away."""
    sr = SR
    total = length + overlap
    n = seconds(total, sr)
    t = np.arange(n) / sr

    brown = np.cumsum(noise(n)) * 0.02
    brown = band(brown - np.mean(brown), 40, 600)
    hiss = band(noise(n), 1500, 7000) * (0.5 + 0.5 * wander(n, 0.15))
    drone = sum(np.sin(2 * np.pi * f * t + p) for f, p in ((55.0, 0), (55.4, 1.3), (82.6, 2.1), (110.9, 0.4)))
    drone = drone * (0.6 + 0.4 * np.sin(2 * np.pi * 0.05 * t))
    out = at_rms(brown, -30) + at_rms(hiss, -40) + at_rms(drone.astype(np.float32), -32)

    crackle = np.zeros(n, dtype=np.float32)
    for pos in rng.integers(0, n, size=int(total * 6)):
        crackle[pos] = rng.uniform(-1, 1) * 10
    out += at_rms(band(crackle, 300, 5000), -44)

    # Morse fragments.
    for start in (14.0, 52.0, 77.0):
        pattern = rng.choice([0.06, 0.18], size=9)
        cursor = start
        for dur in pattern:
            place(out, (np.sin(2 * np.pi * 760 * np.arange(seconds(dur)) / sr) * 0.02).astype(np.float32), cursor)
            cursor += dur + 0.07

    if voices:
        far = "highpass=f=500,lowpass=f=2400,aecho=0.8:0.85:140|260:0.35|0.25,volume=0.9"
        events = [
            (8.0, "af_kore", "Seven. Four. Four. Nine. Two. Seven. Four. Four. Nine. Two.", 0.8, False),
            (30.0, "bm_george", "Is anyone receiving this? Repeat. Is anyone receiving this.", 0.9, False),
            (44.0, "af_heart", "the door was never locked", 0.85, True),
            (60.0, "af_kore", "Three. Three. Zero. One. Eight. Three. Three. Zero. One. Eight.", 0.8, False),
            (73.0, "am_michael", "we can hear you listening", 0.8, True),
        ]
        for at, voice, text, speed, reverse in events:
            line = voices.render(voice, text, speed)
            if reverse:
                line = line[::-1].copy()
            line = run_ffmpeg_filter(line, far)
            line = fade(at_rms(line, -36), 0.4, 0.8) * (0.6 + 0.4 * wander(len(line), 1.5))
            place(out, line.astype(np.float32), at)

    # Fold the tail over the head so the file loops without a seam.
    ov = seconds(overlap, sr)
    head, body, tail = out[:ov], out[ov : n - ov], out[n - ov :]
    ramp = np.linspace(0, 1, ov, dtype=np.float32)
    blended = head * ramp + tail * (1 - ramp)
    return np.concatenate([blended, body]).astype(np.float32)


def render_sfx() -> None:
    sr = OUT_SR
    # Static burst: loopable (no envelope), engine loops it while a file loads.
    n = seconds(2.5, sr)
    hiss = band(noise(n), 200, 9000, sr) * 0.6 + band(np.cumsum(noise(n)) * 0.05, 60, 1200, sr) * 0.4
    pops = np.zeros(n, dtype=np.float32)
    for pos in rng.integers(0, n, size=90):
        pops[pos] = rng.uniform(-1, 1) * 9
    t = np.arange(n) / sr
    flutter = 0.8 + 0.2 * np.sin(2 * np.pi * 6.7 * t) * np.sin(2 * np.pi * 0.8 * t)
    burst = (at_rms(hiss, -20) + at_rms(band(pops, 300, 6000, sr), -26)) * flutter
    encode(burst.astype(np.float32), sr, PUBLIC / "sfx/static-burst.mp3", "alimiter=limit=0.5:attack=1:release=30:level=false", "Static burst", "Multiverse Radio")

    # Dial click: a sharp click, a softer clack, and a low thump of the chassis.
    n = seconds(0.09, sr)
    t = np.arange(n) / sr
    grit = band(noise(n), 1500, 12000, sr)
    click = grit * np.exp(-t * 900) + np.where(t > 0.017, grit * 0.5 * np.exp(-(t - 0.017) * 650), 0)
    thump = np.sin(2 * np.pi * 150 * t) * 0.35 * np.exp(-t * 55)
    encode(((click + thump) * 0.6).astype(np.float32), sr, PUBLIC / "sfx/dial-click.mp3", "volume=1", "Dial click", "Multiverse Radio")
    print("  sfx/static-burst.mp3, sfx/dial-click.mp3")


# ── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=os.environ.get("KOKORO_MODEL"))
    parser.add_argument("--voices", default=os.environ.get("KOKORO_VOICES"))
    parser.add_argument("--only", help="render a single channel folder, e.g. 'hop' or 'static'")
    parser.add_argument("--sfx-only", action="store_true")
    args = parser.parse_args()

    print("Rendering sound effects")
    render_sfx()
    if args.sfx_only:
        return 0

    if not args.model or not args.voices:
        parser.error("--model and --voices (or KOKORO_MODEL / KOKORO_VOICES) are required for episodes")
    voices = Voices(args.model, args.voices)

    for episode in EPISODES:
        if args.only and not episode.path.startswith(args.only + "/"):
            continue
        audio = render_episode(episode, voices)
        chain = f"{MASTER[episode.master]},{MASTER_TAIL}"
        duration = encode(audio, SR, PUBLIC / "audio" / episode.path, chain, episode.title, episode.channel)
        print(f"  audio/{episode.path}  {duration:5.1f}s  {episode.title}")

    if not args.only or args.only == "static":
        ambient = render_ambient(voices)
        chain = f"{MASTER['ambient']},loudnorm=I=-21:TP=-3:LRA=11"
        duration = encode(ambient, SR, PUBLIC / "audio/static/ambient-001.mp3", chain, "Between Stations", "Static")
        print(f"  audio/static/ambient-001.mp3  {duration:5.1f}s  Between Stations")

    print("Done. Run `npm run content:sync` to update durations in episodes.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
