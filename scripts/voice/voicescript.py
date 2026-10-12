"""Voice script loading and validation (content/voice/*.toml, see content/voice/SCHEMA.md).

Standard library only, so `--check` works with any Python >= 3.11.
"""

from __future__ import annotations

import difflib
import re
import tomllib
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# ── Catalog (keep in sync with content/voice/SCHEMA.md) ───────────────────────

CATEGORIES = ("id", "dj", "ad", "news", "weather", "psa", "call", "sports", "story", "show", "interrupt")
DAYPARTS = ("morning", "day", "evening", "night")
FX = (
    "clean", "phone", "radio", "megaphone", "robot", "whisper", "cave", "underwater",
    "alien", "tiny", "giant", "kid", "trailer", "distant",
)
BEDS = (
    "rain", "crowd", "applause", "stadium", "sizzle", "organ", "room", "wind", "space",
    "static", "ocean", "fluorescent", "cafe",
)
# Default length of each sound effect in seconds (how long it occupies the timeline).
SFX_SECONDS = {
    "zap": 0.3,
    "applause": 2.5,
    "phone-ring": 2.4,
    "phone-hangup": 1.5,
    "ding": 1.0,
    "cash-register": 1.2,
    "record-scratch": 0.7,
    "boing": 0.8,
    "laser": 0.35,
    "gong": 2.5,
    "crickets": 3.0,
    "tiny-explosion": 0.9,
    "door-creak": 1.6,
    "typing": 2.0,
    "whoosh": 0.9,
    "beep": 0.4,
}
SFX = tuple(SFX_SECONDS)
# Length of each sting in seconds (plus a short gap before the next line).
STING_SECONDS = {
    "id": 1.7,
    "news": 2.2,
    "sports": 2.2,
    "ad": 1.3,
    "weather": 2.0,
    "chime": 1.6,
    "fanfare": 2.9,
    "sad-trombone": 2.7,
}
STINGS = tuple(STING_SECONDS)
STING_GAP = 0.25

# Length guide per category in seconds (SCHEMA.md "Lengths").
LENGTH_GUIDE = {
    "id": (2, 8),
    "dj": (8, 30),
    "ad": (15, 45),
    "news": (20, 90),
    "weather": (15, 60),
    "psa": (10, 40),
    "call": (30, 120),
    "sports": (20, 90),
    "story": (30, 120),
    "show": (45, 180),
    "interrupt": (3, 12),
}
OVER_MUSIC_BY_DEFAULT = {"id", "dj", "interrupt"}
DEFAULT_GAP = 0.35
WORDS_PER_SECOND = 3.1  # measured on the rendered library (SCHEMA.md says ~2.5 to be safe)
MAX_TEXT = 300
SPEED_RANGE = (0.5, 2.0)  # what Kokoro accepts

# Used when the Kokoro voices file isn't available (e.g. CI). Matches voices-v1.0.bin.
KNOWN_VOICES = (
    "af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river af_sarah "
    "af_sky am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa "
    "bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis ef_dora em_alex "
    "em_santa ff_siwis hf_alpha hf_beta hm_omega hm_psi if_sara im_nicola jf_alpha jf_gongitsune "
    "jf_nezumi jf_tebukuro jm_kumo pf_dora pm_alex pm_santa zf_xiaobei zf_xiaoni zf_xiaoxiao "
    "zf_xiaoyi zm_yunjian zm_yunxi zm_yunxia zm_yunyang"
).split()

CLIP_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SHARED = "_shared"

# ── Model ─────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Speech:
    voice: str
    text: str
    speed: float
    fx: str
    gap: float
    cut: float | None
    speaker: str

    @property
    def lang(self) -> str:
        return "en-gb" if self.voice.startswith("b") else "en-us"


@dataclass(frozen=True)
class Pause:
    seconds: float


@dataclass(frozen=True)
class Sfx:
    name: str
    seconds: float
    level: float


@dataclass(frozen=True)
class Sting:
    name: str


Line = Speech | Pause | Sfx | Sting


@dataclass
class Clip:
    id: str
    category: str
    title: str | None
    over_music: bool
    daypart: str | None
    bed: str | None
    stations: list[str] | None
    lines: list[Line]
    lineno: int | None = None

    def estimate_seconds(self) -> float:
        total = 0.0
        for line in self.lines:
            if isinstance(line, Speech):
                words = len(line.text.split())
                spoken = words / (WORDS_PER_SECOND * line.speed)
                total += spoken * (line.cut or 1.0) + line.gap
            elif isinstance(line, Pause):
                total += line.seconds
            elif isinstance(line, Sfx):
                total += line.seconds
            elif isinstance(line, Sting):
                total += STING_SECONDS[line.name] + STING_GAP
        return total

    def audio_canonical(self) -> dict:
        """Everything that affects the rendered audio and captions. Metadata (title,
        category, daypart, over_music, stations) is left out: editing it only rewrites
        the manifest."""
        return {
            "bed": self.bed,
            "lines": [{"type": type(line).__name__, **line.__dict__} for line in self.lines],
        }


@dataclass
class Issue:
    level: str  # "error" | "warning"
    path: Path
    message: str
    lineno: int | None = None

    def __str__(self) -> str:
        where = f"{self.path}:{self.lineno}" if self.lineno else str(self.path)
        return f"{where}: {self.level}: {self.message}"


@dataclass
class Script:
    path: Path
    station: str
    clips: list[Clip] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not any(i.level == "error" for i in self.issues)

    @property
    def is_draft(self) -> bool:
        """`_example.toml` and other underscore files except `_shared.toml`: validated, not aired."""
        return self.station.startswith("_") and self.station != SHARED


# ── Helpers ───────────────────────────────────────────────────────────────────


def roster_station_ids(roster_ts: Path) -> list[str]:
    """Pull the station ids out of src/stations/roster.ts without running TypeScript."""
    text = roster_ts.read_text(encoding="utf-8")
    return re.findall(r"^\s{4}id:\s*'([a-z0-9-]+)'", text, flags=re.M)


def available_voices(voices_bin: Path | None) -> list[str]:
    """Voice ids in the Kokoro voices file (an .npz archive); falls back to the built-in list."""
    if voices_bin and voices_bin.exists():
        try:
            with zipfile.ZipFile(voices_bin) as z:
                names = sorted(n.removesuffix(".npy") for n in z.namelist() if n.endswith(".npy"))
            if names:
                return names
        except zipfile.BadZipFile:
            pass
    return list(KNOWN_VOICES)


def _suggest(value: str, options) -> str:
    close = difflib.get_close_matches(value, list(options), n=3, cutoff=0.6)
    if close:
        return f" (did you mean {' or '.join(repr(c) for c in close)}?)"
    return f" (known: {', '.join(options)})" if len(options) <= 20 else ""


_PUNCTUATION = set(".,!?;:'\"()-—–…’‘“”")
_DIGIT = re.compile(r"\d")
_URL = re.compile(r"https?://|www\.|\.(com|org|net|io)\b", re.I)


def _text_warnings(text: str) -> list[str]:
    warnings = []
    if len(text) > MAX_TEXT:
        warnings.append(f"text is {len(text)} characters; keep it under {MAX_TEXT} (split into several lines)")
    if _DIGIT.search(text):
        warnings.append("text contains digits; spell numbers out the way an announcer says them")
    if _URL.search(text):
        warnings.append("text looks like it contains a URL; write it out as words")
    odd = sorted({c for c in text if not (c.isalpha() or c.isspace() or c.isdigit() or c in _PUNCTUATION)})
    if odd:
        warnings.append(f"text contains characters the voice may not say: {' '.join(odd)}")
    return warnings


# ── Loading ───────────────────────────────────────────────────────────────────

SCRIPT_KEYS = {"station", "voices", "clip"}
ALIAS_KEYS = {"voice", "speed", "fx", "name"}
CLIP_KEYS = {"id", "category", "title", "over_music", "daypart", "bed", "stations", "lines"}
LINE_KEYS = {
    "say": {"say", "text", "speed", "fx", "gap", "cut", "name"},
    "pause": {"pause"},
    "sfx": {"sfx", "seconds", "level"},
    "sting": {"sting"},
}


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


class _Loader:
    def __init__(self, path: Path, voices: list[str], roster: list[str]):
        self.path = path
        self.voices = set(voices)
        self.voice_list = voices
        self.roster = roster
        self.issues: list[Issue] = []
        self.raw_lines: list[str] = []

    def error(self, message: str, lineno: int | None = None) -> None:
        self.issues.append(Issue("error", self.path, message, lineno))

    def warn(self, message: str, lineno: int | None = None) -> None:
        self.issues.append(Issue("warning", self.path, message, lineno))

    def find_line(self, needle: str, start: int = 0, pattern: re.Pattern | None = None) -> int | None:
        """1-based line number of the first raw line (from `start`, 0-based) containing `needle`."""
        for i in range(max(0, start), len(self.raw_lines)):
            line = self.raw_lines[i]
            if (pattern.search(line) if pattern else needle in line):
                return i + 1
        return None

    def find_key(self, key: str) -> int | None:
        return self.find_line("", pattern=re.compile(rf"^\s*(\[\w+\.)?\"?{re.escape(key)}\"?\]?\s*[=\]]"))

    def number(self, value, what: str, lo: float, hi: float, where, lo_open: bool = False) -> float | None:
        if not _is_number(value):
            self.error(f"{what} must be a number, got {value!r}", where)
            return None
        value = float(value)
        if value < lo or value > hi or (lo_open and value == lo):
            bracket = "(" if lo_open else "["
            self.error(f"{what} must be in {bracket}{lo:g}, {hi:g}], got {value:g}", where)
            return None
        return value

    def load(self) -> Script:
        station = self.path.stem
        script = Script(self.path, station)
        try:
            raw = self.path.read_text(encoding="utf-8")
            self.raw_lines = raw.splitlines()
            data = tomllib.loads(raw)
        except tomllib.TOMLDecodeError as e:
            self.error(f"invalid TOML: {e}")
            script.issues = self.issues
            return script
        except OSError as e:
            self.error(f"cannot read file: {e}")
            script.issues = self.issues
            return script

        for key in sorted(set(data) - SCRIPT_KEYS):
            self.error(f"unknown top-level key {key!r}{_suggest(key, sorted(SCRIPT_KEYS))}", self.find_key(key))

        declared = data.get("station")
        if declared is None:
            self.error('missing `station = "..."` at the top of the file')
        elif declared != station:
            self.error(f"station {declared!r} doesn't match the file name {station!r}", self.find_key("station"))
        if not station.startswith("_") and station not in self.roster:
            self.error(f"station {station!r} is not in src/stations/roster.ts{_suggest(station, self.roster)}")

        aliases = self.load_aliases(data.get("voices", {}))

        clips_raw = data.get("clip", [])
        if not isinstance(clips_raw, list):
            self.error("`clip` must be an array of tables ([[clip]])")
            clips_raw = []
        seen: dict[str, int | None] = {}
        search_from = 0
        for index, raw_clip in enumerate(clips_raw):
            lineno = None
            raw_id = raw_clip.get("id") if isinstance(raw_clip, dict) else None
            if isinstance(raw_id, str):
                lineno = self.find_line("", search_from, re.compile(rf"^\s*id\s*=\s*[\"']{re.escape(raw_id)}[\"']"))
                if lineno:
                    search_from = lineno
                if raw_id in seen:
                    first = f" (first used on line {seen[raw_id]})" if seen[raw_id] else ""
                    self.error(f"duplicate clip id {raw_id!r}{first}", lineno)
                    continue
                seen[raw_id] = lineno
            clip = self.load_clip(raw_clip, index, aliases, station, lineno)
            if clip is not None:
                script.clips.append(clip)

        script.issues = self.issues
        return script

    def load_aliases(self, raw) -> dict[str, dict]:
        aliases: dict[str, dict] = {}
        if not isinstance(raw, dict):
            self.error("[voices] must be a table of aliases")
            return aliases
        for alias, spec in raw.items():
            where = self.find_key(alias)
            if isinstance(spec, str):  # shorthand: host = "af_heart"
                spec = {"voice": spec}
            if not isinstance(spec, dict):
                self.error(f"voice alias {alias!r} must be a table like {{ voice = \"af_heart\" }}", where)
                continue
            for key in sorted(set(spec) - ALIAS_KEYS):
                self.error(f"voice alias {alias!r}: unknown key {key!r}{_suggest(key, sorted(ALIAS_KEYS))}", where)
            voice = spec.get("voice")
            if not isinstance(voice, str):
                self.error(f"voice alias {alias!r} needs `voice = \"<kokoro voice id>\"`", where)
                continue
            if voice not in self.voices:
                self.error(f"voice alias {alias!r}: unknown Kokoro voice {voice!r}{_suggest(voice, self.voice_list)}", where)
                continue
            entry = {"voice": voice, "speed": 1.0, "fx": "clean", "name": None}
            if "speed" in spec:
                speed = self.number(spec["speed"], f"voice alias {alias!r}: speed", *SPEED_RANGE, where)
                if speed is not None:
                    entry["speed"] = speed
            if "fx" in spec:
                if spec["fx"] not in FX:
                    self.error(f"voice alias {alias!r}: unknown fx {spec['fx']!r}{_suggest(str(spec['fx']), FX)}", where)
                else:
                    entry["fx"] = spec["fx"]
            if "name" in spec:
                if not isinstance(spec["name"], str):
                    self.error(f"voice alias {alias!r}: name must be a string", where)
                else:
                    entry["name"] = spec["name"]
            aliases[alias] = entry
        return aliases

    def load_clip(self, raw, index: int, aliases: dict, station: str, lineno: int | None) -> Clip | None:
        label = f"clip #{index + 1}"
        if not isinstance(raw, dict):
            self.error(f"{label} must be a table", lineno)
            return None
        ok = True
        for key in sorted(set(raw) - CLIP_KEYS):
            self.error(f"{label}: unknown key {key!r}{_suggest(key, sorted(CLIP_KEYS))}", lineno)
            ok = False

        clip_id = raw.get("id")
        if not isinstance(clip_id, str) or not CLIP_ID.match(clip_id):
            self.error(f"{label}: id must be lowercase kebab-case like \"dj-003\", got {clip_id!r}", lineno)
            return None
        label = f"clip {clip_id!r}"

        category = raw.get("category")
        if category not in CATEGORIES:
            self.error(f"{label}: category must be one of {', '.join(CATEGORIES)}; got {category!r}", lineno)
            ok = False

        title = raw.get("title")
        if title is not None and (not isinstance(title, str) or not title.strip()):
            self.error(f"{label}: title must be a non-empty string", lineno)
            ok = False

        over_music = raw.get("over_music", category in OVER_MUSIC_BY_DEFAULT)
        if not isinstance(over_music, bool):
            self.error(f"{label}: over_music must be true or false", lineno)
            ok = False

        daypart = raw.get("daypart")
        if daypart is not None and daypart not in DAYPARTS:
            self.error(f"{label}: daypart must be one of {', '.join(DAYPARTS)}; got {daypart!r}", lineno)
            ok = False

        bed = raw.get("bed")
        if bed is not None and bed not in BEDS:
            self.error(f"{label}: unknown bed {bed!r}{_suggest(str(bed), BEDS)}", lineno)
            ok = False

        stations = raw.get("stations")
        if stations is not None:
            if station != SHARED:
                self.error(f"{label}: `stations` is only allowed in {SHARED}.toml", lineno)
                ok = False
            elif not isinstance(stations, list) or not stations or not all(isinstance(s, str) for s in stations):
                self.error(f"{label}: stations must be a non-empty list of station ids", lineno)
                ok = False
            else:
                for s in stations:
                    if s not in self.roster:
                        self.error(f"{label}: station {s!r} is not in the roster{_suggest(s, self.roster)}", lineno)
                        ok = False

        raw_lines = raw.get("lines")
        if not isinstance(raw_lines, list) or not raw_lines:
            self.error(f"{label}: needs a non-empty `lines = [...]` array", lineno)
            return None
        lines: list[Line] = []
        cursor = (lineno or 1) - 1
        for n, raw_line in enumerate(raw_lines, start=1):
            where = f"{label} line {n}"
            at = self.locate_line(raw_line, cursor) or lineno
            if at and at - 1 > cursor:
                cursor = at - 1
            line = self.load_line(raw_line, where, aliases, at)
            if line is None:
                ok = False
            else:
                lines.append(line)
        if not ok:
            return None
        if all(isinstance(line, Pause) for line in lines):
            self.error(f"{label}: has only pauses; add something to hear", lineno)
            return None

        clip = Clip(clip_id, category, title, over_music, daypart, bed, stations, lines, lineno)
        lo, hi = LENGTH_GUIDE[category]
        est = clip.estimate_seconds()
        if est < lo * 0.8 or est > hi * 1.2:
            self.warn(f"{label}: estimated {est:.0f} s, guide for {category} is {lo}-{hi} s", lineno)
        return clip

    def locate_line(self, raw, start: int) -> int | None:
        """Best-effort source line of a `lines` entry (inline tables carry no positions)."""
        if not isinstance(raw, dict):
            return None
        if isinstance(raw.get("text"), str):
            words = raw["text"].split()
            needle = " ".join(words[:4]) if words else ""
            return self.find_line(needle, start) if needle else None
        for key in ("sfx", "sting"):
            if isinstance(raw.get(key), str):
                return self.find_line("", start, re.compile(rf"{key}\s*=\s*[\"']{re.escape(raw[key])}[\"']"))
        if "pause" in raw:
            return self.find_line("", start, re.compile(r"\bpause\s*="))
        return None

    def load_line(self, raw, where: str, aliases: dict, lineno: int | None) -> Line | None:
        if not isinstance(raw, dict):
            self.error(f"{where}: each line must be an inline table like {{ say = \"host\", text = \"...\" }}", lineno)
            return None
        kinds = [k for k in LINE_KEYS if k in raw]
        if len(kinds) != 1:
            if kinds:
                self.error(f"{where}: a line has exactly one of say / pause / sfx / sting; got {', '.join(kinds)}", lineno)
            else:
                self.error(f"{where}: a line needs one of say / pause / sfx / sting; got keys {', '.join(sorted(raw))}", lineno)
            return None
        kind = kinds[0]
        allowed = LINE_KEYS[kind]
        bad = sorted(set(raw) - allowed)
        if bad:
            for key in bad:
                self.error(f"{where}: unknown key {key!r} for a {kind} line{_suggest(key, sorted(allowed))}", lineno)
            return None

        if kind == "pause":
            seconds = self.number(raw["pause"], f"{where}: pause", 0, 15, lineno, lo_open=True)
            return None if seconds is None else Pause(seconds)

        if kind == "sting":
            name = raw["sting"]
            if name not in STINGS:
                self.error(f"{where}: unknown sting {name!r}{_suggest(str(name), STINGS)}", lineno)
                return None
            return Sting(name)

        if kind == "sfx":
            name = raw["sfx"]
            if name not in SFX:
                self.error(f"{where}: unknown sfx {name!r}{_suggest(str(name), SFX)}", lineno)
                return None
            seconds = SFX_SECONDS[name]
            if "seconds" in raw:
                seconds = self.number(raw["seconds"], f"{where}: seconds", 0, 30, lineno, lo_open=True)
            level = 1.0
            if "level" in raw:
                level = self.number(raw["level"], f"{where}: level", 0, 4, lineno, lo_open=True)
            if seconds is None or level is None:
                return None
            return Sfx(name, seconds, level)

        # speech
        who = raw["say"]
        if not isinstance(who, str):
            self.error(f"{where}: say must be a voice alias or Kokoro voice id", lineno)
            return None
        if who in aliases:
            alias = aliases[who]
        elif who in self.voices:
            alias = {"voice": who, "speed": 1.0, "fx": "clean", "name": None}
        else:
            hint = _suggest(who, sorted(aliases) + self.voice_list)
            if not hint.startswith(" (did"):
                hint = f" (aliases: {', '.join(sorted(aliases))})" if aliases else ""
            self.error(f"{where}: {who!r} is neither a voice alias in [voices] nor a Kokoro voice id{hint}", lineno)
            return None
        text = raw.get("text")
        if not isinstance(text, str) or not text.strip():
            self.error(f"{where}: speech needs a non-empty `text`", lineno)
            return None
        text = " ".join(text.split())
        for message in _text_warnings(text):
            self.warn(f"{where}: {message}", lineno)

        speed = alias["speed"]
        if "speed" in raw:
            speed = self.number(raw["speed"], f"{where}: speed", *SPEED_RANGE, lineno)
        fx = raw.get("fx", alias["fx"])
        if fx not in FX:
            self.error(f"{where}: unknown fx {fx!r}{_suggest(str(fx), FX)}", lineno)
            return None
        cut = None
        if "cut" in raw:
            cut = self.number(raw["cut"], f"{where}: cut", 0, 1, lineno, lo_open=True)
            if cut is None:
                return None
        gap = 0.0 if cut is not None else DEFAULT_GAP
        if "gap" in raw:
            gap = self.number(raw["gap"], f"{where}: gap", 0, 15, lineno)
        name = raw.get("name", alias["name"])
        if name is not None and not isinstance(name, str):
            self.error(f"{where}: name must be a string", lineno)
            return None
        if speed is None or gap is None:
            return None
        return Speech(alias["voice"], text, round(speed, 4), fx, round(gap, 4), cut, name or "")


def load_script(path: Path, voices: list[str], roster: list[str]) -> Script:
    return _Loader(path, voices, roster).load()
