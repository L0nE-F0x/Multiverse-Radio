# Multiverse Radio

Endless radio from other dimensions, heard from the night shift aboard the relay ship
*Nightjar*. Open the page, press play, leave it on. Fifty-four main stations broadcast live from
elsewhere across the Main Band and Outer Band (generative lo-fi, jazz trios, city pop, drum and
bass, shanties, dub, polka, baroque robots, disco, space funk, warehouse techno, roots reggae,
exotica) threaded with deadpan hosts, alien adverts, news from parallel realities,
call-ins, cross-station serials, and named shows that follow your local time. Each station's
world fills the ship's viewport as a broadcast-reactive pixel-art scene; an amber terminal glows
over it. HUSH, the ship's computer, keeps the log, tracks your night shifts, and gets a little
stranger the longer your shift runs.

The dial never ends. Between and beyond the stations: pirate stations, odd signals, and seven
secret stations unlocked by exact frequencies, dial sequences, clock windows, patience in static,
and night shifts. Faint phosphor pips along the dial show sister relay vessels on the band, and
now and then something happens across the whole multiverse at once.

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
| `A` | Toggle *Nightjar* cabin ambience |
| `V` | Cycle Scope mode (`WAVE` · `FALL` waterfall · `SSTV` slow-scan telemetry decoder) |
| `P` | Transmit a subspace reception ping to the wire |
| `G` | Station guide |
| `L` | Ship's log & subspace wire |
| `O` | Offline flight-mode voice packs |
| `C` | Captions on/off |
| `H` | Hide / show the HUD (it also withdraws on its own when idle) |
| `?` | The manual |

Media keys and lock-screen controls work through the Media Session API. Every main station has
a share page at `/station/<id>/`; `?station=<id>` and `?f=<MHz>` also work. First-time visitors
get a welcome card that offers to install the app (Android/desktop prompt, iOS steps).

## How "endless" works

```
 src/stations/roster.ts (61 stations)     content/voice/*.toml ──voice:render──▶ public/voice/
            │                                                                       │
            ▼                                                                       ▼
 scheduler (pure): station + wall clock ──▶ segments  (tracks + voice clips, seeded per UTC hour)
            │
            ▼
 mixer (Web Audio): music engine (generative, seeded, formant vocals & jingles) ─┐
                    voice clips (decoded buffers, beat-matched talkover intros) ──┼─ ducking ─ analyser ─ volume ─ out
                    dual-heterodyne dial static, bleed & cabin ambience ──────────┘
            │
            ▼
 useBroadcast store ──▶ UI (receiver, broadcast-reactive scenes, 3-mode scope, subspace wire)
```

- **Music** is synthesized in the browser from 55 genre recipes and a seed (`src/music`), including
  formant choirs, vocoder pads, melodic station call-sign jingles, and beat-matched talkover intros
  that hit the post as the DJ finishes. The same seed gives the same song on every machine.
- **Voices** are ~3,530 short pre-rendered Kokoro TTS clips (over 14 hours): idents, host
  links, ads, news, call-ins, sports, stories, HUSH, pirate DJs and multiverse events. Many are
  modular parts (open × body × close) that the scheduler recombines, so segments rarely repeat.
  Programme clocks per station format weave them between tracks, ducking the music under hosts.
- **The living schedule:** named shows follow the listener's local time (`/voice/_shows.json`),
  serials advance one episode per day across stations, holiday and full-moon clips air on their
  dates, and multiverse events (including Saturday's *Convergence*) are seeded from UTC so every
  listener hears them at the same instant.
- **The infinite dial** (`src/broadcast/dial.ts`): reception falls off around each station, with
  dual-heterodyne whistles and adjacent-station bleed between them; pirate stations and oddities
  are generated deterministically per frequency; secret stations open via tuning, dial sequences,
  clock windows, patience in static, and night shifts.
- **Operator instruments & fleet presence:** the console's Scope switches between a triggered
  waveform (`WAVE`), spectrum waterfall (`FALL`), and an `SSTV` slow-scan telemetry decoder that
  scans hidden pixel-art cards and secret frequency clues out of the signal. Sister relay ships
  appear as phosphor pips along the dial and exchange reception pings on the subspace wire.
- **Stations are live.** The schedule is a pure function of wall-clock time, so tuning away and
  back means you missed things. *Skip* gives a station a private clock offset.
- **Text is procedural too** (`src/content`): track titles and artists, ticker headlines,
  listener messages, reception reports and dimension weather, all seeded grammars.

## Layout

```
src/
├── stations/            roster (61 stations: recipe, scene, host, phosphor, art direction), ship.ts (the Nightjar, HUSH)
├── broadcast/           types (the shared contract), scheduler, clip library, mixer, cabin, presence,
│                        director, useBroadcast store, effects (media session, title, ?station=)
├── music/               generative music engine, formant/vocal synthesis, station jingles, 55 genre recipes
├── content/             procedural text grammars (tracks, tickers, weather, listeners, reception)
├── scenes/              69 pixel-art scenes: shared kit, broadcast-reactive lens, lazy-loaded modules
├── components/, ui/, hooks/   the Nightjar intercept console UI, 3-mode Scope & SSTV decoder
├── pwa/, offline/       service worker, flight-mode voice packs, icon/social-card rendering
└── lab/                 developer labs (below)
content/voice/           voice scripts (TOML) + SCHEMA.md
scripts/voice/           Kokoro renderer → public/voice/
tests/e2e/               Playwright suite
docs/V2-PLAN.md .. V5-PLAN.md   architecture, decisions and how each version was built
```

## Labs

Developer pages for poking at each subsystem on its own, in dev and in production builds:

- `/lab/music.html`: audition every music recipe and seed, tweak it, export WAVs.
- `/lab/scenes.html`: gallery of all 69 scenes, with energy, rare events and aspect ratios.
- `/lab/director.html`: the live schedule timeline, bus meters, ducking and captions.
- `/lab/onboarding.html`: preview the welcome and PWA install flows across platforms.
- `/lab/offline.html`: test flight-mode offline voice packs.

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
