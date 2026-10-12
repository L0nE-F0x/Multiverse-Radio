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

CATEGORIES = (
    "id", "dj", "ad", "news", "weather", "psa", "call", "sports", "story", "show", "interrupt",
    "ship", "event",
)
DAYPARTS = ("morning", "day", "evening", "night")
PARTS = ("open", "body", "close")
FX = (
    "clean", "phone", "radio", "megaphone", "robot", "whisper", "cave", "underwater",
    "alien", "tiny", "giant", "kid", "trailer", "distant",
    "ship", "cb", "vinyl", "ghost",
)
BEDS = (
    "rain", "crowd", "applause", "stadium", "sizzle", "organ", "room", "wind", "space",
    "static", "ocean", "fluorescent", "cafe",
    "kitchen", "truckstop", "sea", "night", "fete", "hall", "studio", "storm", "cockpit",
    "greenhouse", "cave-drip",
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
    # v3
    "meow": 1.0,
    "purr": 3.0,
    "knock-over": 1.6,
    "ship-chime": 1.1,
    "alarm": 2.4,
    "morse": 2.5,
    "squelch": 0.35,
    "kettle": 3.5,
    "buzzer": 0.9,
    "correct": 0.9,
    "drumroll": 2.5,
    "bell": 2.0,
    "foghorn": 3.0,
    "chopping": 2.0,
    "pips": 5.6,
    "splash": 1.2,
    "tape-rewind": 1.8,
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
    # v3
    "quiz": 2.0,
    "crime": 2.6,
    "kids": 1.7,
    "community": 2.0,
    "mystic": 2.6,
    "ship": 2.2,
    "halloween": 2.8,
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
    "ship": (3, 20),
    "event": (5, 60),
}
# Modular parts are shorter than whole segments, whatever their category.
PART_LENGTH_GUIDE = {"open": (3, 10), "body": (8, 40), "close": (3, 10)}
OVER_MUSIC_BY_DEFAULT = {"id", "dj", "interrupt"}
DEFAULT_GAP = 0.35
WORDS_PER_SECOND = 3.1  # measured on the rendered library (SCHEMA.md says ~2.5 to be safe)
MAX_TEXT = 300
SPEED_RANGE = (0.5, 2.0)  # what Kokoro accepts
SHIP_LEVELS = (0, 3)
# MP3 encoding (mono, 24 kHz): LAME VBR quality 8. On this library it averages ~36 kbps on
# long speech and ~43 on short or noisy clips (v2 used CBR 48k), keeping the same ~9.5 kHz
# bandwidth; see bitrate_for(). "48k"-style values mean constant bitrate.
BITRATE = "v8"
# Average kbps by setting, for size projections (measured on rendered clips).
KBPS_ESTIMATE = {"v6": 44, "v7": 40, "v8": 38, "v9": 34}

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
DATE = re.compile(r"^(\d\d)-(\d\d)$")
DAYS_IN_MONTH = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

# Pools: underscore files that are rendered and aired (other underscore files are drafts).
SHARED = "_shared"
SHIP = "_ship"
PIRATE = "_pirate"
ODDITIES = "_oddities"
EVENTS = "_events"
POOLS = (SHARED, SHIP, PIRATE, ODDITIES, EVENTS)
# Pools whose clips may be restricted to some roster stations with `stations`.
STATION_FILTER_POOLS = (SHARED, SHIP, EVENTS)

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


@dataclass(frozen=True)
class Serial:
    id: str
    episode: int


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
    # v3 (all optional)
    part: str | None = None
    kit: str | None = None
    show: str | None = None
    serial: Serial | None = None
    dates: list[str] | None = None
    level: int | None = None
    event: str | None = None

    @property
    def kit_key(self) -> str:
        """The set of parts this clip belongs to (SCHEMA: `kit`, default the category)."""
        return self.kit or self.category

    @property
    def is_show_bumper(self) -> bool:
        """A show's opening/closing ident (`id` + `show` + `part`), not a modular kit part."""
        return self.part is not None and self.show is not None and self.kit is None and self.category == "id"

    def length_guide(self) -> tuple[float, float]:
        return PART_LENGTH_GUIDE[self.part] if self.part else LENGTH_GUIDE[self.category]

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


@dataclass(frozen=True)
class Show:
    """A named programme (`[[show]]`), compiled into /voice/_shows.json (ShowDef)."""

    id: str
    name: str
    blurb: str
    start: int
    end: int
    host: str | None = None
    lineno: int | None = None

    def hours(self) -> set[int]:
        if self.end > self.start:
            return set(range(self.start, self.end))
        return set(range(self.start, 24)) | set(range(0, self.end))

    def to_json(self) -> dict:
        out: dict = {"id": self.id, "name": self.name, "blurb": self.blurb, "start": self.start, "end": self.end}
        if self.host:
            out["host"] = self.host
        return out


@dataclass
class Script:
    path: Path
    station: str
    clips: list[Clip] = field(default_factory=list)
    shows: list[Show] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not any(i.level == "error" for i in self.issues)

    @property
    def is_pool(self) -> bool:
        """`_shared`, `_ship`, `_pirate`, `_oddities`, `_events`: rendered like stations."""
        return self.station in POOLS

    @property
    def is_draft(self) -> bool:
        """`_example.toml` and other underscore files that aren't pools: validated, not aired."""
        return self.station.startswith("_") and not self.is_pool


# ── Helpers ───────────────────────────────────────────────────────────────────


def roster_station_ids(roster_ts: Path) -> list[str]:
    """Pull the station ids out of src/stations/roster.ts without running TypeScript."""
    text = roster_ts.read_text(encoding="utf-8")
    return re.findall(r"^\s{4}id:\s*'([a-z0-9-]+)'", text, flags=re.M)


def ts_string_array(types_ts: Path, name: str) -> list[str]:
    """The strings in `export const <name> = [ ... ] as const;` (e.g. EVENT_IDS in types.ts)."""
    text = types_ts.read_text(encoding="utf-8")
    match = re.search(rf"export const {re.escape(name)}\s*=\s*\[(.*?)\]\s*as const", text, flags=re.S)
    if not match:
        return []
    body = re.sub(r"//[^\n]*", "", match.group(1))
    return re.findall(r"'([^']+)'", body)


def bitrate_for(clip: "Clip") -> str:
    """MP3 bitrate for a clip (part of its render hash)."""
    return BITRATE


def valid_date(value: str) -> bool:
    """"MM-DD" with a real month and day (02-29 allowed: it exists in leap years)."""
    m = DATE.match(value)
    if not m:
        return False
    month, day = int(m.group(1)), int(m.group(2))
    return 1 <= month <= 12 and 1 <= day <= DAYS_IN_MONTH[month - 1]


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

SCRIPT_KEYS = {"station", "voices", "clip", "show"}
ALIAS_KEYS = {"voice", "speed", "fx", "name"}
SHOW_KEYS = {"id", "name", "blurb", "start", "end", "host"}
CLIP_KEYS = {
    "id", "category", "title", "over_music", "daypart", "bed", "stations", "lines",
    "part", "kit", "show", "serial", "dates", "level", "event",
}
SERIAL_KEYS = {"id", "episode"}
LINE_KEYS = {
    "say": {"say", "text", "speed", "fx", "gap", "cut", "name"},
    "pause": {"pause"},
    "sfx": {"sfx", "seconds", "level"},
    "sting": {"sting"},
}


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


class _Loader:
    def __init__(self, path: Path, voices: list[str], roster: list[str], events: list[str]):
        self.path = path
        self.voices = set(voices)
        self.voice_list = voices
        self.roster = roster
        self.events = events
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
        script.shows = self.load_shows(data.get("show", []), station)

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

        self.check_clip_set(script)
        script.issues = self.issues
        return script

    def load_shows(self, raw, station: str) -> list[Show]:
        shows: list[Show] = []
        if not isinstance(raw, list):
            self.error("`show` must be an array of tables ([[show]])")
            return shows
        if raw and station.startswith("_"):
            self.error(f"[[show]] blocks belong in station scripts, not {station}.toml", self.find_line("[[show]]"))
            return shows
        seen: dict[str, int | None] = {}
        search_from = 0
        for index, entry in enumerate(raw):
            lineno = self.find_line("[[show]]", search_from)
            if lineno:
                search_from = lineno
            label = f"show #{index + 1}"
            if not isinstance(entry, dict):
                self.error(f"{label} must be a table", lineno)
                continue
            for key in sorted(set(entry) - SHOW_KEYS):
                self.error(f"{label}: unknown key {key!r}{_suggest(key, sorted(SHOW_KEYS))}", lineno)
            show_id = entry.get("id")
            if not isinstance(show_id, str) or not CLIP_ID.match(show_id):
                self.error(f"{label}: id must be lowercase kebab-case like \"the-3am-hour\", got {show_id!r}", lineno)
                continue
            label = f"show {show_id!r}"
            if show_id in seen:
                first = f" (first used on line {seen[show_id]})" if seen[show_id] else ""
                self.error(f"duplicate show id {show_id!r}{first}", lineno)
                continue
            seen[show_id] = lineno
            ok = not (set(entry) - SHOW_KEYS)
            for key in ("name", "blurb"):
                value = entry.get(key)
                if not isinstance(value, str) or not value.strip():
                    self.error(f"{label}: needs a non-empty `{key}`", lineno)
                    ok = False
            host = entry.get("host")
            if host is not None and (not isinstance(host, str) or not host.strip()):
                self.error(f"{label}: host must be a non-empty string", lineno)
                ok = False
            start, end = entry.get("start"), entry.get("end")
            if not _is_int(start) or not 0 <= start <= 23:
                self.error(f"{label}: start must be a whole local hour 0-23, got {start!r}", lineno)
                ok = False
            if not _is_int(end) or not 1 <= end <= 24:
                self.error(f"{label}: end must be a whole local hour 1-24 (exclusive), got {end!r}", lineno)
                ok = False
            if ok and start == end:
                self.error(f"{label}: start and end are both {start}; a show needs at least an hour", lineno)
                ok = False
            if not ok:
                continue
            show = Show(show_id, " ".join(entry["name"].split()), " ".join(entry["blurb"].split()), start, end,
                        " ".join(host.split()) if host else None, lineno)
            if len(show.blurb) > 160:
                self.warn(f"{label}: blurb is {len(show.blurb)} characters; the guide shows one line (~120)", lineno)
            for other in shows:
                both = show.hours() & other.hours()
                if both:
                    hours = ", ".join(f"{h:02d}:00" for h in sorted(both))
                    self.error(f"{label} overlaps show {other.id!r} (line {other.lineno}) at {hours}", lineno)
                    ok = False
            if ok:
                shows.append(show)
        return shows

    def check_clip_set(self, script: Script) -> None:
        """Rules across a file's clips: show refs, show openers, complete kits. (Serials can hop
        between stations, so check_serials() looks at every file at once.)"""
        show_ids = {s.id for s in script.shows}
        for clip in script.clips:
            if clip.show and clip.show not in show_ids:
                known = f"; shows here: {', '.join(sorted(show_ids))}" if show_ids else "; this file has no [[show]] blocks"
                self.error(f"clip {clip.id!r}: show {clip.show!r} doesn't exist{known}", clip.lineno)
        for show in script.shows:
            opener = any(c.show == show.id and c.category == "id" and c.part == "open" for c in script.clips)
            if not opener:
                self.warn(f"show {show.id!r} has no opening ident (an `id` clip with show = {show.id!r} and "
                          "part = \"open\")", show.lineno)

        kits: dict[str, dict[str, list[Clip]]] = {}
        for clip in script.clips:
            if clip.part and not clip.is_show_bumper:
                kits.setdefault(clip.kit_key, {}).setdefault(clip.part, []).append(clip)
        for kit, parts in sorted(kits.items()):
            missing = [p for p in PARTS if not parts.get(p)]
            if missing:
                first = min((c for group in parts.values() for c in group), key=lambda c: c.lineno or 0)
                have = ", ".join(f"{len(parts[p])} {p}" for p in PARTS if parts.get(p))
                self.warn(f"kit {kit!r} has {have} but no {' or '.join(missing)}; the director chains "
                          "open, body and close from the same kit", first.lineno)

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
            if station not in STATION_FILTER_POOLS:
                allowed = ", ".join(f"{p}.toml" for p in STATION_FILTER_POOLS)
                self.error(f"{label}: `stations` is only allowed in {allowed}", lineno)
                ok = False
            elif not isinstance(stations, list) or not stations or not all(isinstance(s, str) for s in stations):
                self.error(f"{label}: stations must be a non-empty list of station ids", lineno)
                ok = False
            else:
                for s in stations:
                    if s not in self.roster:
                        self.error(f"{label}: station {s!r} is not in the roster{_suggest(s, self.roster)}", lineno)
                        ok = False

        v3, v3_ok = self.load_v3_fields(raw, label, category, station, lineno)
        ok = ok and v3_ok

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

        clip = Clip(clip_id, category, title, over_music, daypart, bed, stations, lines, lineno, **v3)
        lo, hi = clip.length_guide()
        est = clip.estimate_seconds()
        if est < lo * 0.8 or est > hi * 1.2:
            what = f"a {clip.part} part" if clip.part else category
            self.warn(f"{label}: estimated {est:.0f} s, guide for {what} is {lo}-{hi} s", lineno)
        return clip

    def load_v3_fields(self, raw: dict, label: str, category, station: str, lineno: int | None) -> tuple[dict, bool]:
        """part, kit, show, serial, dates, level, event (all optional; see SCHEMA.md)."""
        out: dict = {}
        ok = True

        def bad(message: str) -> None:
            nonlocal ok
            self.error(f"{label}: {message}", lineno)
            ok = False

        part = raw.get("part")
        if part is not None:
            if part not in PARTS:
                bad(f"part must be one of {', '.join(PARTS)}; got {part!r}")
            else:
                out["part"] = part

        kit = raw.get("kit")
        if kit is not None:
            if not isinstance(kit, str) or not CLIP_ID.match(kit):
                bad(f"kit must be a kebab-case name like \"news\" or \"late-calls\", got {kit!r}")
            else:
                out["kit"] = kit
                if part is None:
                    self.warn(f"{label}: kit {kit!r} only matters on modular parts (add `part`)", lineno)

        show = raw.get("show")
        if show is not None:
            if not isinstance(show, str) or not CLIP_ID.match(show):
                bad(f"show must be the kebab-case id of a [[show]] in this file, got {show!r}")
            else:
                out["show"] = show  # existence is checked once every show is loaded

        serial = raw.get("serial")
        if serial is not None:
            if not isinstance(serial, dict) or set(serial) != SERIAL_KEYS:
                bad("serial must look like { id = \"greg-comes-home\", episode = 3 }")
            elif not isinstance(serial["id"], str) or not CLIP_ID.match(serial["id"]):
                bad(f"serial id must be kebab-case, got {serial['id']!r}")
            elif not _is_int(serial["episode"]) or serial["episode"] < 1:
                bad(f"serial episode must be a whole number from 1, got {serial['episode']!r}")
            else:
                out["serial"] = Serial(serial["id"], serial["episode"])

        dates = raw.get("dates")
        if dates is not None:
            if not isinstance(dates, list) or not dates or not all(isinstance(d, str) for d in dates):
                bad("dates must be a non-empty list of \"MM-DD\" strings, e.g. [\"10-31\"]")
            else:
                wrong = [d for d in dates if not valid_date(d)]
                if wrong:
                    bad(f"dates must be real \"MM-DD\" dates (month first); not: {', '.join(repr(d) for d in wrong)}")
                elif len(set(dates)) != len(dates):
                    bad("dates lists the same date twice")
                else:
                    out["dates"] = sorted(dates)

        level = raw.get("level")
        if level is not None:
            lo, hi = SHIP_LEVELS
            if station != SHIP:
                bad(f"level (HUSH's strangeness) is only for {SHIP}.toml")
            elif not _is_int(level) or not lo <= level <= hi:
                bad(f"level must be a whole number {lo}-{hi}, got {level!r}")
            else:
                out["level"] = level

        event = raw.get("event")
        if event is not None:
            if station != EVENTS:
                bad(f"event is only for {EVENTS}.toml")
            elif event not in self.events:
                bad(f"unknown event {event!r}{_suggest(str(event), self.events)}")
            else:
                out["event"] = event
        elif station == EVENTS:
            self.warn(f"{label}: no `event`; the director can't tell which event it belongs to", lineno)

        if category == "ship" and station != SHIP:
            self.warn(f"{label}: ship clips (HUSH) belong in {SHIP}.toml", lineno)
        if category == "event" and station != EVENTS:
            self.warn(f"{label}: event clips belong in {EVENTS}.toml", lineno)
        return out, ok

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


def check_serials(scripts: list[Script]) -> None:
    """Serials run 1, 2, 3, ... per serial id across every aired script: a storyline may hop
    between stations, one episode here and the next there. Adds issues to the scripts."""
    by_id: dict[str, list[tuple[Script, Clip]]] = {}
    for script in scripts:
        if not script.is_draft:
            for clip in script.clips:
                if clip.serial:
                    by_id.setdefault(clip.serial.id, []).append((script, clip))
    for serial_id, entries in sorted(by_id.items()):
        episodes: dict[int, tuple[Script, Clip]] = {}
        for script, clip in entries:
            assert clip.serial is not None
            episode = clip.serial.episode
            if episode in episodes:
                other_script, other = episodes[episode]
                script.issues.append(Issue("error", script.path, f"clip {clip.id!r}: serial {serial_id!r} episode "
                                           f"{episode} is already {other_script.station}/{other.id}", clip.lineno))
            else:
                episodes[episode] = (script, clip)
        gaps = sorted(set(range(1, max(episodes) + 1)) - set(episodes))
        if gaps:
            script, clip = entries[0]
            where = ", ".join(sorted({s.station for s, _ in entries}))
            script.issues.append(Issue("error", script.path, f"serial {serial_id!r} skips episode(s) "
                                       f"{', '.join(map(str, gaps))} (episodes found in {where}); they must run "
                                       "1, 2, 3, ... without gaps", clip.lineno))


def load_script(path: Path, voices: list[str], roster: list[str], events: list[str]) -> Script:
    return _Loader(path, voices, roster, events).load()
