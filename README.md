# Multiverse Radio

Endless radio from other dimensions. Open the page, press play, leave it on. Twenty-two
stations broadcast live from elsewhere: generative lo-fi, synthwave, lounge, dub, polka and
baroque robots, threaded with deadpan hosts, alien adverts, news from parallel realities and
call-ins. Every station is drawn as a little animated pixel-art window into its dimension.

No accounts and no backend. It's a static site, and the music is generated in your browser.

```bash
npm install
npm run dev            # http://localhost:5173 (use --port if that's taken)
npm run build          # typecheck + production build into dist/
npm test               # unit tests (Vitest)
npm run test:e2e       # build + Playwright smoke/CSP/PWA tests against dist/ with Netlify headers
```

Pushes to `main` deploy to Netlify (`netlify.toml`); GitHub Actions runs typecheck, unit
tests, build and the Playwright suite on every push and pull request.

## Controls

| Key | Action |
| --- | --- |
| `Space` | Power / play / pause |
| `←` `→` | Previous / next station |
| `S` | Scan: hop to a random station |
| `N` | Skip to the next segment |
| `M` | Mute · `-` / `+` volume |
| `G` | Channel guide |
| `C` | Captions on/off |
| `F` | "Leave it on" ambient mode |
| `?` | The manual |

Media keys and lock-screen controls work through the Media Session API. `?station=<id>`
links straight to a station; the last station and the volume are remembered.

## How "endless" works

```
 src/stations/roster.ts (22 stations)     content/voice/*.toml ──voice:render──▶ public/voice/
            │                                                                       │
            ▼                                                                       ▼
 scheduler (pure): station + wall clock ──▶ segments  (tracks + voice clips, seeded per UTC hour)
            │
            ▼
 mixer (Web Audio): music engine (generative, seeded) ─┐
                    voice clips (decoded buffers) ─────┼─ ducking ─ analyser ─ volume ─ out
                    static between stations ───────────┘
            │
            ▼
 useBroadcast store ──▶ UI (receiver, scenes, captions, program log, tickers)
```

- **Music** is synthesized in the browser from a genre recipe and a seed (`src/music`). The
  same seed gives the same song on every machine, and it never runs out.
- **Voices** are about 600 short pre-rendered Kokoro TTS clips (3½ hours): idents, host links,
  ads, news, weather, call-ins, sports, stories. Programme clocks per station format (music,
  mixed, talk, ambient) weave them between tracks, ducking the music under hosts.
- **Stations are live.** The schedule is a pure function of wall-clock time, so tuning away and
  back means you missed things. *Skip* gives a station a private clock offset.
- **Text is procedural too** (`src/content`): track titles and artists, ticker headlines,
  listener messages, reception reports and dimension weather, all seeded grammars.

## Layout

```
src/
├── stations/roster.ts   the 22 stations: recipe, scene, host persona, colors, art direction
├── broadcast/           types (the shared contract), scheduler, clip library, mixer, director,
│                        useBroadcast store, effects (media session, title, ?station=)
├── music/               generative music engine and genre recipes
├── content/             procedural text grammars
├── scenes/              pixel-art scenes: shared kit, one lazily loaded module per scene
├── components/, ui/, hooks/   the Yondertone YT-22 receiver UI
├── pwa/                 service worker, registration, icon/social-card rendering
└── lab/                 developer labs (below)
content/voice/           voice scripts (TOML) + SCHEMA.md
scripts/voice/           Kokoro renderer → public/voice/
tests/e2e/               Playwright suite
docs/V2-PLAN.md          the v2 architecture and how it was built
```

## Labs

Developer pages for poking at each subsystem on its own, in dev and in production builds:

- `/lab/music.html`: audition every music recipe and seed, tweak it, export WAVs.
- `/lab/scenes.html`: gallery of all 22 scenes, with energy, rare events and aspect ratios.
- `/lab/director.html`: the live schedule timeline, bus meters, ducking and captions.

## Adding content

**A voice clip:** add a `[[clip]]` to `content/voice/<station>.toml` (format in
`content/voice/SCHEMA.md`), then:

```bash
npm run voice:check    # validates every script (no audio; plain Python 3.11+)
npm run voice:render   # renders only what changed into public/voice/
```

Rendering needs ffmpeg and Python with `kokoro-onnx`, `numpy` and `soundfile`, plus the Kokoro
model files. See `scripts/voice/README.md`.

**A station:** add it to `src/stations/roster.ts` (with a recipe, scene and host), write its
script file, render, and add a scene in `src/scenes/defs/` if it needs a new one. The roster
tests check that ids, frequencies and scene ids line up.

## Notes

- Everything is original: stations, characters, sponsors and jokes. Generated text is checked
  against a banned-words list in `src/content/banned.ts`.
- The audio graph runs through Web Audio, so audio hosted on another origin would need CORS.
- The service worker caches the app shell for offline boot and a small number of voice clips;
  navigations are network-first, so a new deploy is picked up without stale shells.
