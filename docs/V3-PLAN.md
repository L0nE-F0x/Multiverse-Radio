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
