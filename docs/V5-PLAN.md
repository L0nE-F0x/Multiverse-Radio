# Multiverse Radio v5 — synesthesia, instruments, and the fleet

Decided with the user on 2026-10-28 after v4 + Season 2 shipped.

## The pitch

The Nightjar's viewport and intercept console are no longer disconnected from the broadcast:
when a host steps to the microphone, the studio's `ON AIR` lamp glows and the booth comes alive;
when a caller rings in, the switchboard lamps blink; when a track hits its breakdown or drop, the
stage lights shift with the score; and when a multiverse event sweeps the band, the viewport raster
itself distorts, ghosts, or shimmers.

At the console, the operator gets real instruments: a 3-mode Scope (**WAVE**, **FALL** spectrum
waterfall, and an **SSTV** slow-scan telemetry decoder that raster-scans hidden pixel-art star
charts and frequency clues out of the signal), a true dual-heterodyne carrier whistle and adjacent
station bleed when sweeping the dial, and a diegetic **Ship Cabin** ambience sub-mix.

Under the hood, the music engine learns to sing with formant choirs, vocoder pads, melodic station
call-sign jingles, and beat-matched talkover intros (*hitting the post* right as the DJ finishes).
And across the dial, faint phosphor pips and subspace wire pings reveal the other relay vessels on
the night shift.

## Pillars in scope (Session 6)

| # | Pillar | Summary |
| --- | --- | --- |
| **1** | **Broadcast-Reactive Scenes** | Pass live broadcast state (`segmentKind`, `voiceCategory`, `speech`, `section`, `sectionProgress`, `event`, `hush`, `signal`, `bleed`) into `Frame` and a post-raster broadcast lens (`src/scenes/kit/broadcast.ts`). Upgrade flagship studio, talk, and club scenes to react to host speech, call-ins, and musical sections (`intro`/`breakdown`/`drop`). |
| **3** | **Active Operator Instruments** | **Scope modes (`WAVE` / `FALL` / `SSTV`)** with deterministic line-by-line SSTV pixel-art telemetry cards (`src/ui/sstv.ts`); **dual-tuner heterodyne whistle & bleed** in `Mixer` + `dial.ts`; **Nightjar Cabin Ambience** procedural generator (`src/broadcast/cabin.ts`) with console toggle (`A` key). |
| **4** | **Next-Level Generative Music** | **Formant choir / vocoder / vocal-chop synthesis** (`src/music/dsp/formant.ts`) woven into key recipes; **melodic station call-sign jingles** (`src/music/jingle.ts`) harmonized to track key/BPM; **beat-matched talkover intros ("hitting the post")** via `talkoverSeconds` on `MusicRun` and `TrackRequest`. |
| **5** | **Ghost Presence Across the Multiverse** | **Relay fleet presence engine** (`src/broadcast/presence.ts`): deterministic UTC-bucketed fleet telemetry + real-time cross-tab `BroadcastChannel` + optional edge WebSocket (`VITE_RELAY_WS_URL`). **Dial strip relay pips** (`Dial.tsx`, `StatusBar.tsx`) and **Subspace Wire** operator pings (`ShipLogPanel.tsx`). |

## Parked for next session

- **In-Browser "Dub to Tape" Clip Recorder (`[REC]`):** Rolling ring-buffer / live `MediaRecorder` capture of the composited viewport canvas + HUD + captions + Web Audio into a one-click shareable MP4 video postcard.
- **24/7 YouTube / Twitch Relay Stream:** Headless Chromium + `ffmpeg` live relay built on `promo/recorder.mjs` where chat commands (`!tune`, `!scan`, `!ping`) vote to steer the Nightjar's receiver.

---

## Workstreams & file ownership

1. **Contracts (orchestrator, first):**
   - `src/broadcast/types.ts`, `src/scenes/types.ts`, `src/music/score.ts`, `src/music/index.ts`
2. **music-v5:**
   - `src/music/dsp/formant.ts`, `src/music/dsp/synths.ts`, `src/music/jingle.ts`, `src/music/recipes/**`, `src/music/engine/engine.ts`, `src/music/v5-music.test.ts`
3. **scenes-v5:**
   - `src/scenes/kit/broadcast.ts`, `src/scenes/runner.ts`, `src/scenes/SceneView.tsx`, `src/scenes/index.tsx`, `src/scenes/defs/**`, `src/lab/scenes.tsx`, `src/scenes/v5-scenes.test.ts`
4. **director-audio-v5 (Pillar 3 audio + Pillar 4 talkover/jingle wiring + Pillar 5 presence engine):**
   - `src/broadcast/cabin.ts`, `src/broadcast/presence.ts`, `src/broadcast/mixer.ts`, `src/broadcast/dial.ts`, `src/broadcast/scheduler.ts`, `src/broadcast/director.ts`, `src/broadcast/storage.ts`, `src/broadcast/store.ts`, `src/broadcast/v5.test.ts`
5. **ui-instruments-v5 (Pillar 1 Viewport wiring + Pillar 3 Scope/SSTV/Cabin UI + Pillar 5 Dial pips & Subspace Wire):**
   - `src/ui/sstv.ts`, `src/ui/sstv.test.ts`, `src/ui/actions.ts`, `src/components/Scope.tsx`, `src/components/Viewport.tsx`, `src/components/Dial.tsx`, `src/components/StatusBar.tsx`, `src/components/FunctionKeys.tsx`, `src/components/ShipLogPanel.tsx`, `src/components/Manual.tsx`, `src/hooks/useKeyboardControls.ts`, `src/index.css`
