# Multiverse Radio

Tune into radio stations broadcasting from other dimensions. A tactile, late-night receiver
for pre-generated audio: five channels, a weighted tuning dial, static between stations, and
a VFD-style spectrum meter. No accounts, no backend, just static files.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

## Controls

| Input | Action |
| --- | --- |
| Click **Tune in** / play | Power on (browsers need a gesture before audio) |
| Drag the dial | Turn through stations; it clicks at each detent and coasts on release |
| Tap the dial | Next station |
| `Space` | Play / pause |
| `←` `→` | Previous / next episode |
| `↑` `↓` | Channel up / down |
| `M` | Mute |

Media keys and lock-screen controls work through the Media Session API. The last channel and
the volume are remembered in `localStorage`.

## Adding content

Content lives entirely in `public/`. No code changes needed.

1. Drop an MP3 into `public/audio/<channel>/`.
2. Add an entry to `public/episodes.json`:

   ```json
   {
     "id": "plumbus-004",
     "title": "Election Night, All Results",
     "description": "Everyone won. Everyone lost. Officials are counting both.",
     "audioUrl": "/audio/plumbus/episode-004.mp3",
     "durationSeconds": 0,
     "publishedAt": "2026-10-20"
   }
   ```

3. Run `npm run content:sync` to fill in `durationSeconds` from the file (needs `ffprobe`).
   `npm run content:check` only reports: missing files, duplicate ids, stale durations.

A new channel is just another object in `channels` (`id`, `name`, `tagline`, `color` hex,
`episodes`). The dial spreads its detents over however many channels exist.
`"loop": true` on an episode makes it repeat forever instead of advancing (the Static channel
uses this). Invalid entries are skipped with a console warning rather than breaking the page.

If you host audio on another origin (a CDN), it must send CORS headers: the audio is routed
through Web Audio for the visualizer and transitions.

## Placeholder audio

The bundled episodes were rendered locally with Kokoro TTS from original scripts in
`scripts/generate_placeholders.py`. The script also synthesizes the stings, applause, static
zaps, the Static channel's ambient loop, and the two sound effects in `public/sfx/`.
Replace any of them freely. To regenerate:

```bash
pip install kokoro-onnx soundfile numpy   # plus ffmpeg on PATH
python scripts/generate_placeholders.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin
python scripts/generate_placeholders.py --sfx-only        # sound effects only, no TTS
npm run content:sync
```

Rendered TTS lines are cached in `scripts/.cache/`, so editing one line re-renders quickly.

## How it works

```
src/
├── App.tsx                  chassis, layout, boot/error screen
├── components/
│   ├── ChannelDial.tsx      dial + channel cards (horizontal strip on phones)
│   ├── ChannelKnob.tsx      draggable SVG knob: detents, inertia, rubber-band stops, ARIA slider
│   ├── NowPlaying.tsx       glass display: status, titles, progress, tune-in / signal-lost overlays
│   ├── PlayerControls.tsx   prev / play / next, mute, volume
│   ├── EpisodeList.tsx      "transmission log" (collapsible on phones)
│   ├── Visualizer.tsx       canvas spectrum meter fed by an AnalyserNode
│   └── Icons.tsx
├── hooks/                   keyboard controls, Media Session + tab title, reduced motion
└── lib/
    ├── audio.ts             AudioEngine: playback, static transitions, analyser, SFX
    ├── store.ts             Zustand store: channel/episode state and every user action
    ├── channels.ts          types, episodes.json loading + validation
    ├── sfx.ts               SFX loading with synthesized fallbacks
    ├── storage.ts           safe localStorage helpers
    └── format.ts
```

**Audio engine** (`lib/audio.ts`). One `<audio>` element is reused for every episode and routed
through Web Audio. Every tune starts a static burst: looping noise through a sweeping bandpass,
plus a faint heterodyne whistle. The new file starts loading muted underneath it. Once the
file is playing and a minimum burst has elapsed (650 ms for a channel, 420 ms for an episode),
the static fades out and the episode fades in. A slow connection just means more static. Each
tune/pause increments a generation counter, so rapid channel spinning cancels stale transitions
cleanly. The visualizer taps the signal *before* the volume stage, so it keeps moving when
muted.

**Failure handling.** A missing or broken file shows *Signal lost* and auto-skips after 2 s.
If every episode on a channel fails, it stops and offers *Try again* instead of looping
forever. If `episodes.json` fails to load or validate, the display shows why, with a retry
button.

**Accessibility.** The dial is a real `role="slider"` (arrows, Home/End). Every control is
keyboard reachable with visible focus, and icon buttons have labels. A live region announces
what's playing. `prefers-reduced-motion` removes grain, scanline roll, flicker and jitter, and
shortens the dial glide.

## Notes on the spec

- **Tailwind v4.** Design tokens live in `src/index.css` (`@theme`), so there's no
  `tailwind.config.js`.
- **Zustand** for state (the spec allowed it): the audio engine and the UI share one store
  without prop drilling.
- **Open questions, as decided here:** the visualizer uses real Web Audio frequency analysis.
  Channels tint the whole UI with their accent color, which transitions smoothly via a
  registered `--accent` property. The TTS half of the generation pipeline is documented as a
  script.
- The channel names reference *Rick and Morty*. That's fine for a personal project, but worth
  renaming before using it as a public portfolio piece.

## Deploying

`npm run build` produces a fully static `dist/` for any static host. To serve under a sub-path
(e.g. GitHub Pages), set `base` in `vite.config.ts`. Paths in `episodes.json` are resolved
against it automatically.
