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
lines = [
  { say = "host", text = "You're tuned to Void Beats." },
  { pause = 0.4 },
  { say = "host", text = "The void says hi. The void is lying. Sort of.", speed = 0.9 },
  { sfx = "record-scratch" },
  { say = "caller", text = "Hi, long time listener, first time existing." },
  { sting = "id" },
]
```

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
`distant`

### Beds (`bed`, under a whole clip)

`rain` · `crowd` · `applause` · `stadium` · `sizzle` · `organ` · `room` · `wind` · `space` ·
`static` · `ocean` · `fluorescent` · `cafe`

### SFX (`sfx`)

`zap` (channel flip) · `applause` · `phone-ring` · `phone-hangup` · `ding` · `cash-register` ·
`record-scratch` · `boing` · `laser` · `gong` · `crickets` · `tiny-explosion` · `door-creak` ·
`typing` · `whoosh` · `beep`

### Stings (`sting`)

`id` · `news` · `sports` · `ad` · `weather` · `chime` · `fanfare` · `sad-trombone`

Everything is synthesized by the renderer (no third-party samples), so any name above is
safe to use. Unknown names fail the render with a clear error.

## Writing for TTS (Kokoro)

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
call 30–120 s · sports 20–90 s · story 30–120 s · show 45–180 s · interrupt 3–12 s.
Kokoro speaks roughly 3.2 words per second at speed 1.0.
