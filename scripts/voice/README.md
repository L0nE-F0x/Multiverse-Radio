# Voice renderer

Turns the voice scripts in `content/voice/*.toml` (format: `content/voice/SCHEMA.md`) into
the clips the director airs:

```
content/voice/<station>.toml  ->  public/voice/<station>/<clip-id>.mp3   (mono, 24 kHz, LAME VBR V8)
                                  public/voice/<station>.json            (VoiceManifest)
every station's [[show]]      ->  public/voice/_shows.json               (ShowIndex)
every manifest's size/version ->  public/voice/_index.json               (VoiceIndex, v4)
```

The pools `_shared`, `_ship`, `_pirate`, `_oddities` and `_events` render like stations
(`public/voice/_ship.json` and so on, with `station` set to the pool name).

Every clip is mastered to about -16 LUFS integrated with true peaks at or below -1.8 dBTP
(measured on the decoded MP3), with about 50 ms of silence at each end. `durationMs`
comes from the encoded file. Caption `startMs` values are the real offsets of each line
after trimming, speed and fx; they're accurate to about a millisecond.

## Commands

```sh
npm run voice:check                                # validate every script; no audio, stdlib-only Python
npm run voice:render                               # render everything that changed into public/voice
npm run voice:render -- --station void-beats       # one station or pool (repeat --station for more)
npm run voice:render -- --station _example --out /tmp/voice   # test render outside public/
npm run voice:render -- --station cat-fm --clip 'call-*' --out /tmp/voice   # a few clips (subset render)
npm run voice:render -- --index                    # only regenerate public/voice/_index.json (no rendering, stdlib only)
npm run voice:render -- --force                    # re-render even unchanged clips
npm run voice:render -- --jobs 4                   # worker processes (default: by load and free memory, max 8)
npm run voice:render -- --gallery --out /tmp/voice # every fx, bed, sfx and sting + index.html to audition
npm run voice:render -- --gallery --only 'bed-*' --out /tmp/voice   # just some of them
```

`--check` reports TOML errors, unknown voices/fx/beds/sfx/stings (with did-you-mean),
duplicate ids, station ids missing from `src/stations/roster.ts`, unsayable text (digits,
symbols, URLs) and estimated length against the category (or part) guide. For v3 it also
checks:

- `[[show]]`: kebab-case ids unique per station, `name` and `blurb`, whole hours (`start`
  0-23, `end` 1-24, wrapping past midnight allowed), no overlapping shows, and only in
  station files. A show without an opening ident (`id` + `show` + `part = "open"`) is a warning.
- clips: `show` must exist in the same file; `part` is open/body/close; `kit` is kebab-case
  (a warning without `part`); `serial` episodes run 1, 2, 3... with no gaps or repeats;
  `dates` are real `MM-DD` dates; `level` (0-3) only in `_ship`; `event` only in `_events`
  and one of `EVENT_IDS` in `src/broadcast/types.ts` (a warning if an `_events` clip has
  none); `stations` only in `_shared`, `_ship` and `_events`.
- kits: per file and kit (default: the category), at least one open, body and close
  (warning). Show openers aren't kit parts and are left out.

And for v4:

- `days` (clips and `[[show]]`): a non-empty list of distinct weekdays 0-6 (0 = Sunday).
  Shows overlap only on the same (weekday, hour); a show's `days` are its start hour's day,
  so Saturday 22-2 also takes Sunday 00:00-02:00.
- `arc = { id, step }`: only in `_ship`; kebab-case id, whole step from 1; per arc each step
  exactly once and no gaps (errors). Not a `ship` clip: warning.
- The Convergence: in `_events`, `event = "convergence"` needs a topic `kit` (the six in
  SCHEMA, `CONVERGENCE_KITS` in `voicescript.py`) and `part` open or close; a warning lists
  topics missing either. In station scripts, `event` may only be `"convergence"`, with
  `category = "event"`, a topic `kit` and no `part`; an `event` clip there without it is an
  error, and a station missing reactions gets one warning naming the topics. Convergence
  kits are left out of the open/body/close kit check.
- Stand-alone kits (no `part`, no warning): convergence topics, `jam` in `_ship` (HUSH
  jamming Free Frequency), `full-moon` anywhere, and `tomorrow-<MHz>`: only on a station with
  a roster `drift` list and only for one of its frequencies, written as in roster.ts
  (`tomorrow-114.3`, not `114.30`). A drifting station missing some tomorrows gets a warning.
- Manifests carry `arc` and `days` (sorted); `_shows.json` carries show `days`. Like the
  other metadata they don't change clip hashes, so adding them re-renders nothing.

It prints a summary with the projected library size and exits 1 on errors. Rendering
refuses to start while any script has errors. Underscore files that aren't pools (like
`_example.toml`) are drafts: checked, but only rendered when named with `--station`.

## Setup

- ffmpeg (with libmp3lame and rubberband) on `PATH`
- Python >= 3.11 with `numpy`, `soundfile`, `kokoro-onnx`
- Kokoro model files: `KOKORO_MODEL` (default `~/.local/share/bb-tts/kokoro-v1.0.onnx`) and
  `KOKORO_VOICES` (default `~/.local/share/bb-tts/voices-v1.0.bin`)

The npm scripts pick Python from `VOICE_PYTHON`, then `~/.local/share/bb-tts/venv/bin/python`,
then `python3`.

## Speed, resuming and incremental renders

- **Throughput:** Kokoro TTS is about 90% of the work. It runs best single-threaded (about
  1.65x realtime per core; 4 threads per process only reach 70% efficiency), so the
  renderer runs single-threaded workers at `nice` 10: they soak up idle time and yield to
  everything else. The default count treats half the current load as taken, keeps a core
  spare, and is capped by free memory (about 0.9 GB each) and at 8. Clips go longest
  first. Re-renders with cached TTS run at 15-20x realtime.
- **Progress:** one line per clip (length, loudness, true peak, encoder, time) with an ETA.
- **Resuming:** progress is saved every 10 seconds and on Ctrl-C or `kill`; just run the
  same command again. A station's manifest is only written once all its clips exist.
- **TTS cache:** each unique (voice, speed, text, model) line is cached as a WAV in
  `scripts/voice/.cache/tts/`. Override the location with `VOICE_CACHE`. The cache is
  gitignored, so a git worktree starts without one: point it at the main checkout's, e.g.
  `VOICE_CACHE="/path/to/main/scripts/voice/.cache" npm run voice:render`. (Render state
  under it is keyed by output path, so worktrees don't collide; with no state for a
  worktree the committed lock and manifests make unchanged clips a no-op anyway.)
- **Clip hashes:** a clip's hash covers its `bed` and `lines`, the encoder setting, the
  model, and fingerprints of the engine code it uses (`fingerprint.py`: the core plus each
  fx, bed, sfx and sting it names, following every engine function and constant they
  reach). Adding a sting re-renders nothing; editing `dsp.band` re-renders everything.
  Metadata edits (title, category, daypart, over_music, stations and the v3 fields) only
  rewrite the manifest. Noise and reverb seeds come from the clip itself, not the engine.
- **`render-lock.json`:** hash and size of every clip in `public/voice`, committed with
  the library, so a fresh checkout (no `.cache`) only renders what actually changed.
- Clips and stations that no longer exist in the scripts are removed from the output.
  A full run (no `--station`/`--clip`) also removes the manifests of deleted stations.
- If a clip fails, the others still render; that station's manifest is left as it was
  and the command exits 1.

## The index (`_index.json`, v4)

Every render into a directory (and `--index`) rewrites `<out>/_index.json` from the
manifests on disk, whatever the run rendered, so it's never partial:

```json
{ "version": 1, "entries": { "void-beats": { "clips": 53, "bytes": 2996328, "version": "327430d5542e" } } }
```

- One entry per manifest: every station and the pools `_shared`, `_ship`, `_events`,
  `_pirate`, `_oddities` (and a draft like `_example` only if it was rendered into that
  directory). Keys are sorted.
- `bytes` is the sum of the entry's MP3 sizes. The manifest JSON itself isn't counted
  (about 35 KB per station, 1.7 MB for the whole v3 library).
- `version` is the first 12 hex digits of sha256(the manifest file's bytes, then each
  clip's MP3 bytes in manifest order). Any changed clip, caption or metadata changes it;
  nothing else does. `manifest.test.ts` recomputes it, so a stale index fails `npm test`.
- `_shows.json` is not an entry: it's one small file (~27 KB) the guide always needs, so
  offline packs should stow it with every pack (and refresh it whenever they update).

## Encoding

LAME VBR quality 8, mono, 24 kHz. Measured on this library it averages about 36 kbps on
long speech and 38 kbps over a typical mix (43 on short or noisy clips: VBR spends the bits
where beds and stings need them), with the same ~9.5 kHz bandwidth as the CBR 48 kbps
used in v2. On spectrograms, speech holds up like CBR 48 and better than CBR 40, which
starves noisy beds. `voicescript.BITRATE` / `bitrate_for()` set it ("48k" style values
mean constant bitrate).

## Semantics the schema leaves open

- A line's `speed` and `fx` replace the alias's values; they don't multiply.
- Speakers come from the line's `name`, then the alias's `name`, else `""`.
- `cut` lines default to `gap = 0`, because a cut is usually followed by a `zap`. Their
  caption is shortened to the words actually heard, ending in "—".
- `sfx` `seconds` is how long the effect holds the timeline. Ringing effects (gong, ding,
  bell, foghorn) carry on under the next line. `level` is a linear multiplier (default 1).
  `chopping` and `morse` always sound at least once (a short `chopping` is a single tap).
- The `cb` fx adds a squelch burst before and after each line, so the line starts about
  0.1 s after its caption and the tail rings into the gap.
- `bed` starts 0.4 s before the first sound and fades out 0.6 s after the last.
- `dates` are sorted in the manifest; `kit` is only written when set.

## Code map

| File | What |
| --- | --- |
| `render.py` | CLI: discovery, validation report, hashing, lock and state, process pool, manifests, `_shows.json`, orphans, gallery |
| `voicescript.py` | TOML loading and validation (stdlib only) plus the catalog of names, length guides and bitrate |
| `fingerprint.py` | Source fingerprints of the engine core and of each fx, bed, sfx and sting |
| `clip.py` | One clip: timeline, captions, bed, mastering, MP3 encode and verify |
| `voicefx.py` | The 18 voice treatments |
| `sounds.py` | Synthesized beds, sfx and stings (no samples) |
| `dsp.py` | Filters, BS.1770 loudness, true-peak limiter, reverb, ffmpeg I/O |
| `tts.py` | Kokoro wrapper with the line cache |
| `render-lock.json` | What's in `public/voice` (written by renders into it) |
| `manifest.test.ts` | Vitest: manifests, `_shows.json` and `_index.json` in `public/voice` match the contracts (pools, parts, shows, serials, dates, levels, events, arcs, days), their files exist, no MP3s are orphaned and the index is current (`VOICE_DIR=/tmp/voice npx vitest run scripts/voice` checks a `--out` render) |
| `voicescript.test.ts` | Vitest: runs `--check` and `--index` on fixture scripts and libraries in a temp dir (the v4 rules above); skipped without Python >= 3.11 |

Adding a name (fx, bed, sfx, sting) takes three steps. Add it to the catalog in
`voicescript.py`, implement it in `voicefx.py` or `sounds.py`, and list it in
`content/voice/SCHEMA.md`. Existing clips don't re-render unless they use it.
