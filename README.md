# Multiverse Radio

Endless radio from other dimensions, heard from the night shift aboard the relay ship
*Nightjar*. Open the page, press play, leave it on. Forty-two stations broadcast live from
elsewhere (generative lo-fi, jazz trios, city pop, drum and bass, shanties, dub, polka,
baroque robots) threaded with deadpan hosts, alien adverts, news from parallel realities,
call-ins and named shows that follow your local time. Each station's world fills the ship's
viewport as an animated pixel-art scene; an amber terminal glows over it. HUSH, the ship's
computer, keeps the log, and gets a little stranger the longer your shift runs.

The dial never ends. Between and beyond the stations: pirate stations, odd signals, and a few
secret stations at exact frequencies. Now and then something happens across the whole
multiverse at once, and every listener hears it at the same moment.

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
| `←` `→` | Fine-tune (0.05 MHz) |
| `Shift` + `←` `→`, or `↑` `↓` | Previous / next station |
| `S` | Scan: hop to a random station |
| `N` | Skip to the next segment |
| `M` | Mute · `-` / `+` volume |
| `G` | Station guide |
| `L` | Ship's log |
| `C` | Captions on/off |
| `H` | Hide / show the HUD (it also withdraws on its own when idle) |
| `?` | The manual |

Media keys and lock-screen controls work through the Media Session API. Every main station has
a share page at `/station/<id>/`; `?station=<id>` and `?f=<MHz>` also work. First-time visitors
get a welcome card that offers to install the app (Android/desktop prompt, iOS steps).

## How "endless" works

```
 src/stations/roster.ts (45 stations)     content/voice/*.toml ──voice:render──▶ public/voice/
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
- **Voices** are about 2,300 short pre-rendered Kokoro TTS clips (nearly 9 hours): idents, host
  links, ads, news, call-ins, sports, stories, HUSH, pirate DJs and multiverse events. Many are
  modular parts (open × body × close) that the scheduler recombines, so segments rarely repeat.
  Programme clocks per station format weave them between tracks, ducking the music under hosts.
- **The living schedule:** named shows follow the listener's local time (`/voice/_shows.json`),
  serials advance one episode per day, holiday clips air on their dates, and multiverse events
  are seeded from UTC so every listener hears them at the same instant.
- **The infinite dial** (`src/broadcast/dial.ts`): reception falls off around each station, with
  faint bleed between them; pirate stations and oddities are generated deterministically per
  frequency, densest in the deep band beyond 108 MHz; secret stations sit at exact frequencies.
- **Stations are live.** The schedule is a pure function of wall-clock time, so tuning away and
  back means you missed things. *Skip* gives a station a private clock offset.
- **Text is procedural too** (`src/content`): track titles and artists, ticker headlines,
  listener messages, reception reports and dimension weather, all seeded grammars.

## Layout

```
src/
├── stations/            roster (45 stations: recipe, scene, host, phosphor, art direction), ship.ts (the Nightjar, HUSH)
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
docs/V2-PLAN.md, V3-PLAN.md   architecture, decisions and how each version was built
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
