# Multiverse Radio v4 — off course

Decided with the user on 2026-10-14, after v3 shipped. Same fan-out pattern as v3
(`docs/V3-PLAN.md`); this file is the plan and the build brief.

## The pitch

The Nightjar is drifting. HUSH says the heading is within tolerance; the heading readout
disagrees, a little more every shift. The drift has brought the ship into range of a new
**Outer Band** (108–118 MHz): disco that never stopped, techno in a dead reactor, reggae from a
farm moon, 1958's idea of the future, a radio serial, a courtroom, traffic for wormholes, and a
pirate who knows far too much about the Nightjar. Further out, secrets that open for the
patient, the punctual, and the operators HUSH has learned to trust.

Meanwhile on phones the receiver finally gets out of the way of the view, and the whole ship
can be stowed for a flight with no signal.

## Decisions

| Topic | Decision |
| --- | --- |
| New genres | **Disco/funk, house/techno, reggae, exotica/space-age.** Two stations each, each with its own recipe. |
| Scale | **+12 stations** (8 genre-led, 4 talk) → 54 on the dial, plus 4 new secrets. |
| Dial | **New Outer Band, 108–118 MHz**, open from day one, explained in-world by the drift. The main band is full, and hosts speak their frequencies aloud, so no retuning. The guide gets an Outer Band section; ◂ ▸ step through both bands. |
| Secrets | **All four mechanisms:** dial sequences, clock-gated broadcasts, patience in static, and HUSH-granted frequencies. One secret station per mechanism. |
| HUSH arc | **Off course.** Over many shifts the heading changes, HUSH grows evasive, and the arc resolves at a secret destination station that HUSH finally grants. |
| Running gags | **Greg gets a show** (a weekly late slot nobody can hear; other hosts review it), and **The Convergence**, a weekly UTC event when every station briefly talks about the same thing. |
| Phone UI | **Pull-up drawer.** The scene fills the screen; a slim mini-player (station, frequency, dial strip, play) sits at the bottom; swipe or tap up for the full console. |
| Offline | **Flight-mode packs:** "Prepare for dead space" with Essentials (~25 MB: HUSH and the pools + your 6 most-played), Half the dial (~90 MB) or Everything (~190 MB). Progress, cancel, remove; sizes shown before download. |
| Tone | Unchanged from v3: the interface plays it straight, the content is the joke. Original names only. |

## The twelve new stations (Outer Band)

Writers refine names, hosts and bits; frequencies are fixed once voiced.

| MHz | Station | Format | Recipe | Pitch |
| --- | --- | --- | --- | --- |
| 108.4 | **Saturday Night Forever** | music | `disco` | A timeline where one Saturday night in 1977 never ended. The host counts its hours (into the millions). Strings, four-on-the-floor, a crowd that has stopped asking what time it is. |
| 109.3 | **Orbit Roots** | mixed | `roots-reggae` | Roots reggae from a hydroponic farm moon. Sister Meridian: conscious talk, greenhouse crop reports, irrigation dub plates. |
| 110.2 | **Small Claims of the Multiverse** | talk | `court-bed` | A live courtroom. Judge Alvarez-Penhallow rules on absurd disputes between dimensions; modular cases (claim × defence × ruling). |
| 111.1 | **Substation Null** | music | `warehouse-techno` | Techno from the reactor room of a derelict freighter. The host barely speaks: BPM counts, coolant warnings. |
| 112.0 | **Tiki Satellite** | music | `exotica` | A 1958 "space station of tomorrow" that still believes it's 1958. Lyle Mercury: vibraphone, bongos, theremin, optimism. |
| 112.9 | **The Long Dark** | talk | `theatre-organ` | Old-time radio theatre: a serialised space-noir drama with cliffhangers, one episode per night (`serial`), plus "previously on" recaps. |
| 113.8 | **Island Time Observatory** | music | `island-reggae` | An island that drifted out of time. Slow skank, tide tables that never agree, nobody late since 1983. |
| 114.8 | **Traffic on the 8s** | talk | `traffic-bed` | Round-the-clock traffic for wormholes, timelines and the bypass. A gridlock that has lasted since the Big Bang. |
| 115.6 | **The Atomic Bachelor Pad** | music | `space-age-pop` | A hi-fi demonstration show: "now hear the bongos travel to your LEFT speaker." Hard-panned stereo ping-pong, played as a gag and as a genuine pleasure. |
| 116.5 | **The Velvet Collapse** | music | `space-funk` | A casino lounge on a dying star. Every night at 04:00 local the star goes supernova with a dance-floor countdown; by morning it's fine again. |
| 117.4 | **Afterparty at the Heat Death** | music | `heat-death-house` | The last rave in the universe, at the top of the dial. DJ Entropy's sets lose BPM through the night; the crowd is three guys and a nebula. |
| *drifts* | **Free Frequency** | talk | `pirate-bed` | A hand-made pirate broadcasting theories about the Nightjar, some of them right. Moves to a different Outer Band gap every local night and announces tomorrow's frequency in code. HUSH sometimes jams it mid-sentence. |

## Secrets (one per mechanism)

| Mechanism | Secret | Where | How |
| --- | --- | --- | --- |
| Dial sequence | **The Switchboard**: an operator connecting calls between universes since 1946 | 131.1 | Tune 97.8 → 89.3 → 114.8 (Grenda, the news, the traffic), each held ≥ 2 s, within 90 s. Hosts drop clues ("the operator answers if you ring advice, then the news, then the traffic"). After that it's an ordinary discovered secret. |
| Clock-gated | **The Minute Between**: a broadcast from the gap between 3:33 and 3:34 | 133.3 | Only on air 03:33–03:46 local; dead static at that frequency otherwise (with a faint "come back later" carrier). Also a full-moon quirk: Moon Dub gets a full-moon show (`dates` computed per year). |
| Patience | **Something Listening**: the static notices you | wherever you are | Sit in pure static (signal below `TUNED_MIN`, no bleed) for 3 min while playing. The static resolves into a voice that tunes into *you*. Logged as found; afterwards reachable at 144.4. |
| HUSH-granted | **The Harbour**: where the Nightjar has been going all along | 140.0 | Unlocked after 7 shifts. HUSH tells you the frequency in her last arc notice; the station resolves the off-course arc. |

**Shifts:** a shift is a local night (06:00 to 06:00) with at least 10 minutes of listening. Count and total
listening time persist (localStorage). The arc, The Harbour and some HUSH notices key off shifts.

## Arcs and gags

- **Off course (HUSH).** 8 arc steps keyed to shifts (`arc: { id: 'off-course', step }`), each aired once
  when the shift count reaches it; ordinary HUSH notices gain evasive variants at higher shift counts. The
  heading readout in the status bar drifts deterministically with shifts. Free Frequency's theories
  track the same arc; the final step names 140.0.
- **Greg gets a show.** *The Quiet Corner with Greg*, Sundays 02:00–03:00 local on The Lounge at the End
  of Time (where Greg drinks). Whispered, barely audible (`fx = "whisper"`, low gain). On Mondays, hosts
  on other stations review it (weekday-gated clips).
- **The Convergence.** Every Saturday at 20:00 UTC, 4–6 minutes: the multiverse's stations all notice the
  same thing (a topic that rotates weekly from a pool of 6: a missing moon, a smell, a song everyone
  half-remembers, a knock, …). Each station's host has a line per topic; the event plays an open, the
  tuned station's reaction, and a close.
- **Bev, Teodor, Grumbel's** carry on as background gags (no payoff this round).

## Phone and PWA improvements

Found by a Playwright pass at 320, 393, 430 px and phone landscape (2026-10-14):

- The status bar overflows at 320 px (clock runs into LINK; LOCKED cut off).
- In portrait the console takes ~60% of the screen; in landscape it covers nearly all of the scene.
- Ten equal buttons in the dock; keyboard hints (ESC, key letters) shown on touch devices.

The fix is the **pull-up drawer**: below ~700 px wide (or landscape phones) the scene is full-bleed;
a mini-player bar (name, frequency, a thin swipeable dial strip, play/pause) sits in the safe area at the
bottom; drag or tap the handle for the full console as a sheet. Also: safe-area insets everywhere, 44 px
touch targets, no keyboard hints on coarse pointers, a compact status bar, captions above the
mini-player, and Media Session metadata/actions (lock-screen next/previous station).

## Offline: flight-mode packs

- A **Prepare for dead space** panel (from the drawer / function keys): Essentials, Half the dial,
  Everything, with sizes from `/voice/_index.json` and what's already stowed.
- Packs fill a dedicated `mvr-packs` cache that the service worker checks before the network (and
  before the 60-clip runtime cache). Downloads run in the page with a progress bar and cancel
  (resumable: already-stored files are skipped). `navigator.storage.persist()` is requested;
  `storage.estimate()` is shown.
- "Most-played" comes from per-station listening time (persisted). New stations added by a deploy
  aren't auto-downloaded; the panel shows "N stations not stowed".
- Remove: per pack or everything. Clip URLs aren't content-hashed (`/voice/<station>/<clip>.mp3`), so
  `/voice/_index.json` carries a per-station `version` (a hash of its clips' bytes); when it changes, the
  panel offers "update stowed stations" and replaces that station's entries.
- iOS: storage can be evicted after weeks unused unless installed; say so in the panel.

## Still open from v3

- TTS respellings: whalesong/dj-close-01 ("rest" → "rust"), waystation-9/id-003 ("Waystation" →
  "were station"). → writers-crossover.

---

# Build plan (session 5)

## Contracts (the orchestrator lands these on `main` and pushes before fan-out)

| File | v4 additions |
| --- | --- |
| `src/broadcast/types.ts` | 12 RecipeIds, 16 SceneIds, `DIAL.outerBand`, `StationDef.drift` (candidate MHz list) and `StationDef.unlock` (`SecretUnlock`), `ShowDef.days` (local weekdays 0–6), `VoiceClip.arc` and `VoiceClip.days`, `EVENT_IDS += 'convergence'`, store `shifts` / `heading`, a `VoiceIndex` type for `/voice/_index.json` |
| `src/stations/roster.ts` | the 12 Outer Band stations and 4 secrets (writers refine copy; ids, frequencies, recipes, scenes are fixed) |
| `src/pwa/offline.ts` | `PACKS`, `packPlan()`, `downloadPack()`, `removePacks()`, `offlineStatus()` (stubs) |
| `content/voice/SCHEMA.md` | `arc`, `days`, `[[show]] days`, the convergence kit convention |

`main` builds and tests pass with stubs and fallbacks, as in v3.

**Branching:** v4 is built on the `v4` integration branch, not `main`, so the live site (which deploys
from `main`) keeps v3 until v4 is integrated and verified. Agent worktrees branch from `origin/main`,
so each agent's first step is `git reset --hard origin/v4` on its own branch. Completeness tests
relaxed for pending work are marked `TODO(v4 integration)`; the integrator re-tightens them.

## Workstreams

| Agent | Owns | Port |
| --- | --- | --- |
| **director** | `src/broadcast/**` except `types.ts`: Outer Band, Free Frequency drift, the four unlock mechanisms, shifts and heading, arc picking, weekday shows/clips, the Convergence; `src/lab/director.tsx` | 5431 |
| **ui** | `src/App.tsx`, `src/components/**`, `src/hooks/**`, `src/ui/**`, `src/index.css`: pull-up drawer, phone fixes, Outer Band in dial and guide, heading readout, Media Session, mounting `<OfflinePanel>` | 5432 |
| **offline** | `src/pwa/sw.js`, `src/pwa/offline.ts`, `src/offline/**` (`<OfflinePanel>`), `tests/e2e/offline.spec.ts`, `tests/e2e/pwa.spec.ts` | 5433 |
| **music-groove** | `src/music/recipes/v4-groove.ts` + files: `disco`, `space-funk`, `warehouse-techno`, `heat-death-house` | 5434 |
| **music-world** | `src/music/recipes/v4-world.ts` + files: `roots-reggae`, `island-reggae`, `exotica`, `space-age-pop`, beds `court-bed`, `theatre-organ`, `traffic-bed`, `pirate-bed` | 5435 |
| **scenes-music** | the 8 genre-station scenes, `src/scenes/registry-v4a.ts` | 5436 |
| **scenes-talk** | the 4 talk-station scenes + 4 secret scenes, `src/scenes/registry-v4b.ts` | 5437 |
| **writers-groove** | scripts + packs for saturday-night-forever, velvet-collapse, substation-null, heat-death-afterparty; `src/content/packs/v4a.ts` | — |
| **writers-world** | orbit-roots, island-time, tiki-satellite, atomic-bachelor-pad; `src/content/packs/v4b.ts` | — |
| **writers-talk** | the-long-dark, small-claims, traffic-8s, free-frequency; `src/content/packs/v4c.ts` | — |
| **writers-arcs** | `_ship.toml` off-course arc + evasive variants, the 4 secret stations' scripts, `_events.toml` convergence open/close + topics | — |
| **writers-crossover** | edits to the 45 existing scripts only: convergence reaction lines, switchboard clues, Greg's show (end-lounge) and Monday reviews, full-moon Moon Dub show, Outer Band mentions, the two TTS respellings | — |
| **voice** | `scripts/voice/**`, `public/voice/**`: `arc`/`days` fields, `/voice/_index.json` (bytes, clips, version per station and pool), render everything | — |

The 12 new stations each also get a convergence line per topic (their writers do it). Rules for
every agent: as in V2/V3 (own your files; additive contract changes only, flagged; tests green; keep
the main bundle lean, lazy-load anything big; original names only).

## Integration order

writers ×5 → voice (render) → music ×2 → scenes ×2 → director → offline → ui → `npm run share:all`
(new stations' share pages) → re-tighten relaxed tests → verify at 320 / 393 / 768 / 1440 px and phone
landscape, offline with a pack installed → push.
