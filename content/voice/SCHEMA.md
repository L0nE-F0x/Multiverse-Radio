# Voice scripts

Every spoken clip on Multiverse Radio starts life as a script here. The voice renderer
(`scripts/voice/`) turns each script file into MP3 clips plus a manifest:

```
content/voice/<station-id>.toml   →  public/voice/<station-id>/<clip-id>.mp3
                                     public/voice/<station-id>.json   (VoiceManifest, see src/broadcast/types.ts)
content/voice/_shared.toml        →  public/voice/_shared/…  +  public/voice/_shared.json
```

One file per station (ids from `src/stations/roster.ts`). `_shared.toml` holds clips any
station may air: ads for ad breaks, PSAs, cross-station interrupts.

v3 adds a few special pools (same format, `station = "<name>"`):

| File | What |
| --- | --- |
| `_ship.toml` | HUSH, the relay ship's computer: `ship` clips aired over any station (use `level`) |
| `_pirate.toml` | Generic pirate DJs for generated pirate stations: ids, links, ads that never name a station |
| `_oddities.toml` | Voices heard on oddities between stations (time signal announcer, beacon messages) |
| `_events.toml` | `event` clips for the multiverse-wide events (use `event`) |

The renderer also compiles every file's `[[show]]` blocks into `public/voice/_shows.json`.

## Format (TOML)

```toml
station = "void-beats"

# Aliases for `say`. Any raw Kokoro voice id (e.g. "am_puck") also works in `say`.
[voices]
host   = { voice = "af_heart", speed = 0.92, name = "DJ Eventually" }
caller = { voice = "am_echo", fx = "phone", name = "Caller from Sector 9" }

[[clip]]
id = "id-001"                # unique in this file; becomes the file name
category = "id"              # id | dj | ad | news | weather | psa | call | sports | story | show | interrupt
title = "Station ident"      # optional display title (ads: product name; shows: episode title)
over_music = true            # optional; default true for id/dj/interrupt, false otherwise
daypart = "night"            # optional: morning | day | evening | night
bed = "rain"                 # optional ambience baked under the whole clip
stations = ["void-beats"]    # optional, _shared.toml only: restrict to these stations
# v3 (all optional):
part = "open"                # modular part: open | body | close (see "Modular parts")
kit = "news"                 # which set of parts (default: the category)
show = "the-3am-hour"        # belongs to this show ([[show]] id)
serial = { id = "greg-comes-home", episode = 3 }   # daily storyline episode
dates = ["10-31"]            # only on these local dates (MM-DD); preferred that day
level = 2                    # _ship.toml only: strangeness 0-3
event = "dimensional-storm"  # _events.toml only: which event (v4: also "convergence" in station files)
# v4 (all optional):
days = [1]                   # only on these local weekdays (0 = Sunday … 6 = Saturday); preferred that day
arc = { id = "off-course", step = 3 }   # _ship.toml only: airs once, after >= 3 night shifts
lines = [
  { say = "host", text = "You're tuned to Void Beats." },
  { pause = 0.4 },
  { say = "host", text = "The void says hi. The void is lying. Sort of.", speed = 0.9 },
  { sfx = "record-scratch" },
  { say = "caller", text = "Hi, long time listener, first time existing." },
  { sting = "id" },
]
```

### Shows (v3)

Named programmes by the listener's local time. Hours are local; `end` is exclusive and may be
smaller than `start` to wrap past midnight. Gaps between shows are regular programming.

```toml
[[show]]
id = "the-3am-hour"
name = "The 3 AM Hour"
blurb = "For the ones still awake, and the ones who never sleep."
start = 2
end = 5
host = "DJ Eventually"   # optional display name, if not the station host
```

v4: add `days = [0]` (local weekdays, 0 = Sunday) for a weekly show, e.g. Greg's Sunday slot.

Give a show an `id` (category) clip with `show = "<id>"` and `part = "open"` to open it, and
`dj` links with `show = "<id>"` for show-specific chat. Clips without `show` air at any time.

### Modular parts (v3)

Clips with `part` are chained by the director: one `open`, one to three `body`, one `close`,
all from the same station and `kit`. Write bodies that work after any open and before any
close: ten opens, twenty bodies and ten closes make thousands of different segments.
Typical kits: `news` (anchor intro, stories, sign-off), `ads` (pitch, small print, sponsor
tag), `calls` (caller's problem, advice, goodbye), `quiz` (question, wrong answers, score).

### The Convergence (v4)

Every Saturday at 20:00 UTC, for 4–6 minutes, every station notices the same thing. The topic
rotates weekly (weeks since the epoch, mod 6) through these kits:

| kit | What everyone notices |
| --- | --- |
| `missing-moon` | A moon has gone missing. Everyone agrees one is gone; nobody agrees which. |
| `the-smell` | Everywhere, at once, smells faintly of toast. |
| `the-song` | Everyone has the same half-remembered song stuck in their head. Nobody can finish it. |
| `the-knock` | Three knocks on every studio door at the same moment. Nobody is there. |
| `wrong-colour` | The sky is briefly a colour nobody has a word for. |
| `the-pigeon` | The same pigeon has walked into every studio. It seems to know people. |

`_events.toml` holds the shared parts: per kit, an `open` and a `close` (`category = "event"`,
`event = "convergence"`, `kit = "<topic>"`, `part = "open"|"close"`). **Every station's own
script** holds one reaction per kit: `category = "event"`, `event = "convergence"`,
`kit = "<topic>"`, 5–15 s, in the host's voice and the station's style. The event airs open →
the tuned station's reaction → close.

### Line types

| Line | Fields | Notes |
| --- | --- | --- |
| speech | `say`, `text`, optional `speed`, `fx`, `gap`, `cut`, `name` | `gap` = silence after (default 0.35 s). `cut` = keep only this fraction, for an abrupt channel flip. `name` overrides the caption speaker. |
| pause | `pause` (seconds) | |
| sfx | `sfx`, optional `seconds`, `level` | one-shot sound effect |
| sting | `sting` | short musical jingle |

### Voice effects (`fx`)

`clean` (default broadcast voice) · `phone` · `radio` (thin AM) · `megaphone` · `robot` ·
`whisper` · `cave` (big reverb) · `underwater` · `alien` (pitched, ring-modulated) ·
`tiny` (pitched up) · `giant` (pitched down) · `kid` · `trailer` (deep movie-trailer voice) ·
`distant` · v3: `ship` (HUSH: calm ship's-PA voice, slight shimmer) · `cb` (CB radio: narrow,
squelchy) · `vinyl` (an old record) · `ghost` (airy, slightly behind itself)

### Beds (`bed`, under a whole clip)

`rain` · `crowd` · `applause` · `stadium` · `sizzle` · `organ` · `room` · `wind` · `space` ·
`static` · `ocean` · `fluorescent` · `cafe` · v3: `kitchen` · `truckstop` · `sea` (waves and
creaking timbers) · `night` (crickets, an owl) · `fete` (village fête, distant brass) · `hall`
(council-meeting room tone) · `studio` · `storm` (dimensional storm) · `cockpit` (the
Nightjar's hum) · `greenhouse` · `cave-drip`

### SFX (`sfx`)

`zap` (channel flip) · `applause` · `phone-ring` · `phone-hangup` · `ding` · `cash-register` ·
`record-scratch` · `boing` · `laser` · `gong` · `crickets` · `tiny-explosion` · `door-creak` ·
`typing` · `whoosh` · `beep` · v3: `meow` · `purr` · `knock-over` (something falls off a
desk) · `ship-chime` (HUSH notice) · `alarm` · `morse` · `squelch` (CB) · `kettle` · `buzzer`
(wrong answer) · `correct` · `drumroll` · `bell` · `foghorn` · `chopping` · `pips` (time
signal) · `splash` · `tape-rewind`

### Stings (`sting`)

`id` · `news` · `sports` · `ad` · `weather` · `chime` · `fanfare` · `sad-trombone` · v3:
`quiz` · `crime` · `kids` · `community` · `mystic` · `ship` · `halloween`

Everything is synthesized by the renderer (no third-party samples), so any name above is
safe to use. Unknown names fail the render with a clear error.

## Writing for TTS (Kokoro)

- **Mispronounced words: don't respell them in the script** (captions would show the
  respelling). Write the word normally and add it to `scripts/voice/lexicon.toml`
  (`theremin = "therr-a-min"`): the renderer swaps the respelling into the text Kokoro hears
  only. Matching is whole-word, case-insensitive and case-preserving; plurals are separate
  entries. Editing an entry re-renders just the clips that use it. Check a respelling by
  rendering to scratch (`--out`) and listening or transcribing with whisper.cpp. For
  homographs ("read", "live", "present") reword the line instead: the lexicon can't tell
  the senses apart.
- Spell numbers the way an announcer says them ("four thousand", "seven, seven, four").
- No symbols, emoji, URLs or abbreviations the voice can't say. Write "percent", "doctor".
- Keep each `text` under ~300 characters; split long speeches into several lines.
- Punctuation shapes delivery: commas for breath, ellipses for hesitation, short sentences
  for deadpan.
- Kokoro voices: American `af_*` / `am_*`, British `bf_*` / `bm_*`. Best quality: `af_heart`,
  `af_bella`, `af_nicole`, `bf_emma`, then `af_aoede`, `af_kore`, `af_sarah`, `am_fenrir`,
  `am_michael`, `am_puck`, `bm_george`, `bm_fable`, `bf_isabella`. Non-English voices
  (`jf_*`, `ff_siwis`, `im_nicola`, …) reading English text give a strong "alien accent" —
  use sparingly for visitors.

## Lengths (guide)

id 2–8 s · dj 8–30 s · ad 15–45 s · news 20–90 s · weather 15–60 s · psa 10–40 s ·
call 30–120 s · sports 20–90 s · story 30–120 s · show 45–180 s · interrupt 3–12 s ·
ship 3–20 s · event 5–60 s. Modular parts are shorter: open/close 3–10 s, body 8–40 s.
Kokoro speaks roughly 3.2 words per second at speed 1.0.
