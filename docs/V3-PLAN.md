# Multiverse Radio v3 — the night shift

Decided with the user on 2026-10-12, after v2 shipped. Build this in the next session.

## The pitch

You are the night-shift operator of a lonely relay ship drifting between dimensions. The
ship's viewport shows whatever world you're tuned to; an amber terminal glows over it. The
dial never ends: between the 42 big stations there are pirates, beacons, ghosts of other
signals and a few secrets. Shows follow your local night; now and then something happens
across the whole multiverse at once, and every listener hears it at the same moment.

The interface plays it completely straight. The content is the joke.

## Decisions

| Topic | Decision |
| --- | --- |
| Look | **Viewport + HUD.** The station's scene fills the screen as the ship's viewport; a translucent "used future" terminal overlays it: amber monochrome type, readouts, F-key style controls, subtle scanlines. Retire everything cartoonish: walnut cabinet, stickers, googly eyes, handwritten fonts, doodles. |
| Colour | **Station phosphors.** Amber by default; each station has its own phosphor colour (amber, green, cyan, white, red, …), so tuning still changes the mood. |
| Scenes | **Moodier, finer pixel art.** Keep one scene per station, but at a higher internal resolution, with muted cinematic palettes and fewer gags in frame. They must hold up full-bleed at 1920 px and on phones. |
| Listener role | **Night-shift operator.** The ship's computer speaks occasionally (deadpan system notices over the station, ducked like a host) and keeps a log of what you've intercepted. |
| Infinite dial | Fine-tuning between main stations finds **pirate stations** (procedural name, genre, frequency and idents from a shared pirate-DJ pool), **faint bleed** of neighbouring stations through the static, **beacons and oddities** (test tones, distress beacons, numbers, a song stuck on loop since 1974), and **secret hand-made stations** at exact frequencies. |
| Living schedule | **Hybrid clock.** Named shows follow the listener's local time (the 3 AM show airs at your 3 AM). Multiverse-wide events (dimensional storms, emergency broadcasts, crossovers) are seeded from UTC so everyone hears them at the same instant. Daily serialized storylines. Holiday specials, starting with Halloween (31 Oct). |
| Scale | **+20 hand-made stations (42 total)**, about 30 clips each, each with a scene and a recipe: more music genres, new talk formats, local community radio, concept stations. |
| Freshness | **Procedural only.** No ongoing content pipeline, so variety has to come from combinatorics: modular voice parts, grammars, pirate stations, events, more recipes and per-artist sound signatures. |
| First visit | A welcome card that also serves as the "tap to tune in" gesture and offers to install the PWA: Chromium/Android uses `beforeinstallprompt` (a real Install button); iOS Safari gets illustrated *Share → Add to Home Screen* steps. Never shown in standalone mode; dismissal remembered. |
| Sharing | The OG image and tags already work. Restyle the card to the new look and add **per-station share pages** (prerendered `/station/<id>/` with that station's own card image and tags) so shared links show the station. |

## Variety without a content pipeline

- **Modular voice parts.** Render talk segments as parts that recombine: news = anchor intro ×
  story × field report × sign-off; ads = pitch × small print × sponsor tag; DJ links = opener ×
  observation × hand-off; calls = caller problem × (generic-but-kind) advice × outro. The
  scheduler emits the parts as back-to-back voice segments. Ten of each part gives
  thousands of combinations.
- **Pirate stations** are generated from a seed per frequency: name, slogan, genre/recipe,
  phosphor colour, a generic scene, idents from a shared pirate pool.
- **Recurring artists** get a sound signature (instrument palette, tempo range, a motif), so
  "another one by The Late Bus" sounds like The Late Bus.
- **Events and storylines** are deterministic from the date, so each day sounds different.

## Candidate new stations (writers refine; the user can veto)

Music: **Smoke Ring Trio** (late-night jazz piano trio in a club inside a cloud) ·
**Bubble Economy FM** (city pop from a city where it's always 1986 and always Friday) ·
**Breakbeat Observatory** (drum & bass; the telescopes are subwoofers) · **Piano for Empty
Rooms** (ambient solo piano for rooms nobody has entered yet) · **Wall of Fog** (shoegaze from
a dimension made of reverb) · **The Drowned Shanty Hour** (a crew at sea since before water) ·
**Event Horizon Surf Report** (surf rock; the waves are gravitational).

Talk: **Tomorrow's Leftovers** (cooking with ingredients that don't exist yet) · **Horoscopes for
Other Universes** · **Unsolved Dimensions** (true crime: the crime is mild, the dimension is the
suspect) · **Win This Planet!** (quiz show) · **Bedtime for Giants** (sleep stories, very slow) ·
**The Tiny Hour** (a kids' programme for very small listeners).

Community: **Lower Hollow Community Radio** (lost pets, bake sales, council meetings about the
hole) · **Gristwick Parish Radio** (the village fête that never ends) · **Waystation 9 CB**
(truckers hauling cargo between dimensions).

Concept: **The Infinite Song** (one song since the beginning of time; callers discuss which verse
they're on) · **Cat FM** (run by a cat: long silences, sudden enthusiasm, things knocked off the
desk) · **Yesterday FM** (broadcasting from yesterday; the news is reassuringly over) ·
**Plant FM** (programming for houseplants, very slow).

## Proposed workstreams (same fan-out pattern as v2; see V2-PLAN.md for the rules)

1. **ui-v3** — viewport + HUD redesign, phosphor theming, welcome/install card, fine-tune dial
   UX (continuous frequency, signal strength), ship log panel, ship-computer captions.
2. **scenes-v3** — finer, moodier pass over the 22 scenes; 20 new scenes; generic procedural
   scenes for pirate stations and beacons; must read full-bleed.
3. **director-v3** — continuous dial model (signal strength vs. distance, bleed mixing, pirate
   and beacon frequencies, secret stations), living schedule (local-time shows, UTC events,
   daily storylines, holidays), modular segment composition. Contract additions in
   `src/broadcast/types.ts` first.
4. **writers ×3** — 20 new stations; modular parts for the talk formats; the pirate-DJ pool; the
   ship computer; events, storylines, show intros and Halloween specials.
5. **music-v3** — recipes for the new genres; artist signatures; fix the weak ones
   (sports-fanfare, polka, dub, chiptune repetition).
6. **voice** — modular-part support in the renderer and manifests; render everything.
7. **share/infra** — prerendered per-station share pages + card images, restyled OG card,
   install-prompt e2e tests (Chromium + a WebKit/iOS user-agent pass).

## Still to decide next session

- The ship's name (placeholder: RELAY-9) and whether the Yondertone / Gloaming & Daughters
  brand survives.
- The user's own station ideas, and which 20 make the cut.
- How strange the ship computer gets over a long night shift.

---

# Build plan (session 3)

**Settled by the orchestrator (the user gave free rein):** the ship is the relay ship
***Nightjar*** (`R/S NIGHTJAR · RELAY 7`); its computer is **HUSH** (`src/stations/ship.ts`).
Yondertone is retired; *Gloaming & Daughters* survives as the console maker's plate. The 20
candidate stations above all made the cut, plus three secret stations: **HUSH: After Hours**
(99.15, HUSH's own show while it thinks you're asleep), **The Last Lighthouse** (121.5, deep
band), **Transmission Zero** (76.0, the bottom of the dial: the first broadcast ever). HUSH
grows stranger over a long session: `level` 0 at first, 1 after ~45 min, 2 after ~2 h, 3 after ~4 h.

## Contracts (read these first; additive changes only, and flag them)

| File | v3 additions |
| --- | --- |
| `src/broadcast/types.ts` | 24 new RecipeIds, 31 new SceneIds, `PHOSPHOR_IDS`, `StationDef.phosphor/secret`, `ShowDef`/`ShowIndex`, voice categories `ship`/`event`, `VoiceClip.part/kit/show/serial/dates/level/event`, `DIAL`, `ODDITY_IDS`, `EVENT_IDS`, `ActiveEvent`, `Tuned`, store `frequency/signal/tuned/show/event/discovered`, actions `tuneFrequency/nudge` |
| `src/stations/roster.ts` | 45 stations (42 main + 3 secret), `MAIN_STATIONS` |
| `src/stations/ship.ts` | The Nightjar and HUSH |
| `content/voice/SCHEMA.md` | `[[show]]`, modular parts, new fields, pools (`_ship`, `_pirate`, `_oddities`, `_events`), new fx/beds/sfx/stings |
| `src/content/index.ts` | `pirateIdentity(seed)`, `shipLogNote(seed)` (stubs) |
| `src/onboarding/index.tsx` | `<Welcome onTuneIn />`, `useInstall()` (stubs) |
| `src/pwa/install.ts` | `captureInstallPrompt()` (stub, already called in `main.tsx`) |

`main` builds and tests pass with stubs and fallbacks: unknown recipes play lo-fi, unknown scenes
show a TV full of snow, recipes without a name pack borrow the station's. Some completeness tests
are relaxed with `TODO(v3 integration)`; the integrator re-tightens them.

## Workstreams

| Agent | Owns | Port |
| --- | --- | --- |
| **ui** | `src/App.tsx`, `src/main.tsx`, `src/components/**`, `src/hooks/**`, `src/ui/**`, `src/index.css`, `public/favicon.svg`, `<body>` of `index.html` | 5421 |
| **onboarding** | `src/onboarding/**`, `src/pwa/install.ts`, `tests/e2e/onboarding.spec.ts` | 5422 |
| **share** | `scripts/share/**`, `public/share/**`, `public/og-image.png`, `src/pwa/vite-plugins.mjs`, `<head>` of `index.html`, `netlify.toml`, `tests/e2e/share.spec.ts` | 5423 |
| **director** | `src/broadcast/**` except `types.ts`, `src/lab/director.tsx` | 5424 |
| **scenes-kit** | `src/scenes/kit/**`, `runner.ts`, `SceneView.tsx`, `viewport.ts`, the 22 v2 scene defs and their entries in `registry.ts`, `src/lab/scenes.tsx` | 5425 |
| **scenes-new** | the 20 v3 station scene defs, `src/scenes/registry-stations.ts` | 5426 |
| **scenes-deep** | secret, pirate and oddity scene defs, `src/scenes/registry-deep.ts` | 5427 |
| **music-genres** | `src/music/recipes/v3-genres.ts` + new recipe files for its 11 recipes, artist signatures | 5428 |
| **music-beds** | `src/music/recipes/v3-beds.ts` + new files for its 13 recipes, fixes to sports-fanfare/polka/dub/chiptune | 5429 |
| **writers-new-a** | scripts for smoke-ring-trio, lower-hollow, bubble-economy, breakbeat-observatory, piano-empty-rooms, wall-of-fog, drowned-shanty-hour, event-horizon-surf, gristwick-parish, waystation-9; `src/content/packs/v3a.ts` | — |
| **writers-new-b** | scripts for tomorrows-leftovers, other-horoscopes, unsolved-dimensions, win-this-planet, bedtime-for-giants, tiny-hour, infinite-song, cat-fm, yesterday-fm, plant-fm; `src/content/packs/v3b.ts` | — |
| **writers-deep** | `_ship`, `_pirate`, `_oddities`, `_events`, the 3 secret stations' scripts; `src/content/packs/deep.ts`; `pirateIdentity`/`shipLogNote` (new files under `src/content/`, wired in `index.ts`) | — |
| **writers-depth** | the 22 existing station scripts + `_shared.toml`: shows, modular parts, serials, Halloween | — |
| **voice** | `scripts/voice/**`, `public/voice/**` | — |

`src/music/index.ts` (RECIPE_INFO) and `package.json`: small additive edits are fine; the
integrator resolves conflicts. Rules for every agent are the same as v2 (`docs/V2-PLAN.md`,
"Rules for every agent"), plus: **keep the main bundle lean** (budget warning at 200 kB gzip
initial JS; lazy-load anything big).

## Art direction

**Interface (ui).** The station's scene fills the screen as the Nightjar's viewport. Over it, a
translucent "used future" terminal HUD in the station's phosphor colour: thin rules, monospace
caps, terse system language, faint scanlines and phosphor glow. Think 1970s–80s ship computers,
mission-control readouts and broadcast monitoring desks, but restrained and legible. No cartoon
elements (retire the walnut cabinet, stickers, googly eyes, handwritten fonts, portrait
doodles). The jokes live in the content; the interface reports it with a straight face.
Phosphor hex values live in the UI theme (amber ≈ #ffb000, green ≈ #33ff88, cyan ≈ #5ce1ff,
white ≈ #e8eef5, red ≈ #ff5a4a, violet ≈ #b48cff, rose ≈ #ff7aa8; tune for contrast).

**Scenes (scenes-kit, scenes-new, scenes-deep).** Same 320×180 world and kit. Moodier and
finer: muted cinematic palettes, deeper shadows, few light sources with soft glow, atmospheric
depth (haze, fog layers), careful dithering. At most one quiet gag in frame; the humour lives in
the rare events. The HUD covers the top ~12% and bottom ~25%, so keep the subject central and
those bands calm. Use the station accent sparingly. Kit improvements must stay backward
compatible (scenes-new and scenes-deep build on the current kit in parallel).

## Test hooks the UI must keep

`<main>` landmark; a play/power button whose accessible name matches /play|tune in|power/i;
onboarding: `data-testid="welcome"`, `welcome-tune-in`, `welcome-dismiss`, `install-button`,
`ios-install-steps`.

## Integration order

writers ×4 → voice (render everything) → music ×2 → scenes ×3 → director → onboarding → ui →
share (regenerate cards from the final scenes) → re-tighten the relaxed tests → verify at 375 /
768 / 1440 / 1920 → push.
