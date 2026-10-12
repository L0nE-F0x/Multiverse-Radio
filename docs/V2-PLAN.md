# Multiverse Radio v2 — the endless multiverse

**Vision.** Like the lo-fi generator sites people leave open in a tab for hours, but every
station broadcasts from another dimension. Open the page, press play, and it never runs
out: procedurally generated music in each station's genre, threaded with hosts, idents,
alien adverts, news from parallel realities and call-ins. The interface should be quirky,
funny and gorgeous enough that people keep it open just to look at it.

## How "endless" works

```
 roster (22 stations)          content/voice/*.toml ──render──▶ public/voice/*.mp3 + manifests
        │                                                              │
        ▼                                                              ▼
 scheduler (pure): wall clock + station ──▶ Segment[]  (tracks + voice clips, seeded per hour)
        │
        ▼
 mixer (Web Audio):  music engine (generative, seeded) ─┐
                     voice clips (decoded buffers) ─────┼─ ducking ─ analyser ─ volume ─ out
                     static transitions ────────────────┘
        │
        ▼
 useBroadcast store ──▶ UI (receiver, scenes, captions, tickers)
```

- **Music** is synthesized in the browser from a recipe (genre) + seed. Same seed ⇒ same
  song everywhere. Infinite, and costs nothing to host.
- **Voices** are a large library of short pre-rendered Kokoro clips. Programme clocks shuffle
  them between tracks, so combinations rarely repeat.
- **Stations are live.** The schedule is a pure function of wall-clock time: tune away and
  back and the show has moved on. "Skip" gives that station a private clock offset.
- **Text is procedural too:** track titles, artists, tickers, listener messages.

## Contracts (frozen — additive changes only, and flag them)

| File | What |
| --- | --- |
| `src/broadcast/types.ts` | StationDef, RecipeId, SceneId, VoiceClip/Manifest, Segment, BroadcastStore |
| `src/stations/roster.ts` | The 22 stations: ids, recipes, scenes, hosts, art direction |
| `src/music/index.ts` | `createMusicEngine(ctx)` → MusicEngine (`play`, `stop`, `output`) |
| `src/content/index.ts` | `trackMeta`, `tickerLines`, `listenerMessage`, `receptionReport`, `dimensionWeather` |
| `src/scenes/index.tsx` | `<StationScene station playing energy reducedMotion />` |
| `src/broadcast/store.ts` | `useBroadcast` (zustand) implementing BroadcastStore — simulator for now |
| `src/broadcast/effects.ts` | `useBroadcastEffects()` — media session, title, persistence, deep link |
| `content/voice/SCHEMA.md` | Voice script format (TOML) |

The v1 code (`src/lib/*`, `src/components/*`, `public/episodes.json`, `public/audio/`) is
being replaced. Reuse ideas and code from it freely; the integrator deletes leftovers.

## Workstreams

Each runs in its own git worktree/branch. **Own only your paths**; everything else is
read-only. Dev-server ports are fixed so agents don't collide.

| Agent | Owns | Port |
| --- | --- | --- |
| **music** | `src/music/**`, `src/lab/music.tsx`, `lab/music.html` | 5411 |
| **director** | `src/broadcast/**` except `types.ts`, `src/lab/director.tsx`, `lab/director.html` | 5412 |
| **scenes** | `src/scenes/**`, `src/lab/scenes.tsx`, `lab/scenes.html` | 5413 |
| **ui** | `src/App.tsx`, `src/main.tsx`, `src/components/**`, `src/hooks/**`, `src/ui/**`, `src/index.css`, `public/favicon.svg`, `<body>` of `index.html` | 5414 |
| **infra** | `.github/**`, `tests/e2e/**`, `playwright.config.ts`, `src/pwa/**`, `public/` icons/manifest/robots/og, `netlify.toml`, `<head>` of `index.html`, plugin list in `vite.config.ts` | 5415 |
| **writers-music** | `src/content/**`, `content/voice/` for the 16 music/mixed/ambient stations | 5416 |
| **writers-talk** | `content/voice/` for the 6 talk stations + `_shared.toml` | 5417 |
| **voice** | `scripts/voice/**`, `public/voice/**`, `content/voice/_example.toml` | 5418 |

`package.json` / `package-lock.json`: add dependencies and scripts if you need them; the
integrator resolves conflicts.

## Rules for every agent

1. You're in a fresh worktree: run `npm install` first.
2. Commit in logical steps on your current branch. Don't push, switch branches or merge.
   End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
3. `npm run build` and `npm test` must pass at your final commit.
4. Browser checks: headless Chromium via Playwright
   (`/home/lonefox/.local/share/mise/installs/npm-playwright/latest/node_modules/playwright`,
   browsers in `~/.cache/ms-playwright`) or puppeteer-core with `/usr/bin/google-chrome-stable`.
   For audio use `--autoplay-policy=no-user-gesture-required`. **Never use the Claude-in-Chrome
   extension** — that's the user's real browser. Run dev servers with
   `npx vite --port <yours> --strictPort` and stop them when done.
5. Scratch scripts/screenshots go in your scratch directory (given in your brief), not the repo.
6. **Everything original.** No references to Rick and Morty or any other existing show,
   brand, celebrity or trademark. The v1 placeholder scripts contain some — don't carry those over.
7. Humor: dry, deadpan, occasionally unhinged, never try-hard. Warm rather than mean. PG.
8. Accessibility and `prefers-reduced-motion` matter. Performance matters: this runs for
   hours in a background tab, often on laptops on battery.
9. Final report (≤250 words): branch + last commit, what's done, what isn't, anything the
   integrator must know (contract changes, new deps, new scripts).

## Integration (orchestrator)

Merge order: writers → voice (render full library) → music → director → scenes → ui →
infra. Then delete v1 leftovers, verify end-to-end in a browser at 375/768/1440/1920 px,
update README, push `main` (Netlify deploys).
