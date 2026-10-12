# Voice renderer

Turns the voice scripts in `content/voice/*.toml` (format: `content/voice/SCHEMA.md`) into
the clips the director airs:

```
content/voice/<station>.toml  ->  public/voice/<station>/<clip-id>.mp3   (mono, 24 kHz, 48 kbps)
                                  public/voice/<station>.json            (VoiceManifest)
```

Every clip is mastered to about -16 LUFS integrated with true peaks at or below -1.8 dBTP
(measured on the decoded MP3), with about 50 ms of silence at each end. `durationMs`
comes from the encoded file. Caption `startMs` values are the real offsets of each line
after trimming, speed and fx; they're accurate to about a millisecond.

## Commands

```sh
npm run voice:check                                # validate every script; no audio, stdlib-only Python
npm run voice:render                               # render everything that changed into public/voice
npm run voice:render -- --station void-beats       # one station (repeat --station for more)
npm run voice:render -- --station _example --out /tmp/voice   # test render outside public/
npm run voice:render -- --force                    # re-render even unchanged clips
npm run voice:render -- --jobs 4                   # worker processes (default: half the cores, max 6)
npm run voice:render -- --gallery --out /tmp/voice # every fx, bed, sfx and sting as MP3s to audition
```

`--check` reports TOML errors, unknown voices/fx/beds/sfx/stings (with did-you-mean),
duplicate ids, station ids missing from `src/stations/roster.ts`, unsayable text (digits,
symbols, URLs), and estimated length against the category guide. It exits 1 on errors.
Rendering refuses to start while any script has errors.

Underscore files other than `_shared.toml` (like `_example.toml`) are drafts: they're
checked, but only rendered when named with `--station`.

## Setup

- ffmpeg (with libmp3lame and rubberband) on `PATH`
- Python >= 3.11 with `numpy`, `soundfile`, `kokoro-onnx`
- Kokoro model files: `KOKORO_MODEL` (default `~/.local/share/bb-tts/kokoro-v1.0.onnx`) and
  `KOKORO_VOICES` (default `~/.local/share/bb-tts/voices-v1.0.bin`)

The npm scripts pick Python from `VOICE_PYTHON`, then `~/.local/share/bb-tts/venv/bin/python`,
then `python3`.

## Caching and incremental renders

- **TTS:** each unique (voice, speed, text, model) line is cached as a WAV in
  `scripts/voice/.cache/tts/`. Override the location with `VOICE_CACHE`.
- **Clips:** each clip's hash covers its resolved script, the model and the source of the
  audio engine. A re-run with no changes renders nothing and takes well under a second.
  Editing DSP code re-renders everything, but TTS comes from the cache.
- Clips and stations that no longer exist in the scripts are removed from the output.
  A full run (no `--station`) also removes the manifests of deleted stations and drafts.
- If a clip fails, the others still render. That station's manifest is left untouched
  and the command exits 1.

## Semantics the schema leaves open

- A line's `speed` and `fx` replace the alias's values; they don't multiply.
- Speakers come from the line's `name`, then the alias's `name`, else `""`.
- `cut` lines default to `gap = 0`, because a cut is usually followed by a `zap`. Their
  caption is shortened to the words actually heard, ending in "—".
- `sfx` `seconds` is how long the effect holds the timeline. Ringing effects (gong, ding)
  carry on under the next line. `level` is a linear multiplier (default 1).
- `bed` starts 0.4 s before the first sound and fades out 0.6 s after the last.

## Code map

| File | What |
| --- | --- |
| `render.py` | CLI: discovery, validation report, cache decisions, process pool, manifests, orphans |
| `voicescript.py` | TOML loading and validation (stdlib only) plus the catalog of names and length guide |
| `clip.py` | One clip: timeline, captions, bed, mastering, MP3 encode and verify |
| `voicefx.py` | The 14 voice treatments |
| `sounds.py` | Synthesized beds, sfx and stings (no samples) |
| `dsp.py` | Filters, BS.1770 loudness, true-peak limiter, reverb, ffmpeg I/O |
| `tts.py` | Kokoro wrapper with the line cache |
| `manifest.test.ts` | Vitest: manifests in `public/voice` match `VoiceManifest`, and their files exist |

Adding a name (fx, bed, sfx, sting) takes three steps. Add it to the catalog in
`voicescript.py`, implement it in `voicefx.py` or `sounds.py`, and list it in
`content/voice/SCHEMA.md`.
