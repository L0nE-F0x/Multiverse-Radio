# Multiverse Radio — Vibe-Coded App Specification

**Version:** 1.0  
**Date:** 2026-10-12  
**Created by:** Vibe Spec Creator for an Interdimensional Cable-inspired web radio station  
**Intended For:** Claude Opus 5.5

---

## 🚀 Handoff Prompt for Coding AI (Copy This Block)

```
You are an expert frontend engineer specializing in delightful, high-quality interactive web applications. You excel at rapid prototyping ("vibe coding") while producing clean, well-structured, and polished code.

Implement the application exactly according to the full specification below.

Start by creating a beautiful, fully functional prototype that captures the core experience and visual vibe perfectly.

Always use a modern Vite + TypeScript + Tailwind CSS project structure from the very first version. 
Do NOT create a single-file HTML prototype. Single-file projects create immediate technical debt and become painful as soon as real iteration begins.

Use a clean, scalable folder structure (src/components/, src/lib/, src/assets/, etc.). This gives proper modularity, TypeScript safety, and a foundation that can grow without a painful rewrite.

Key rules:
- Prioritize a working core loop in the first iteration.
- Follow the spec's explicit recommendation on stack and architecture.
- Pay extreme attention to micro-interactions, visual feedback, accessibility, performance, and mobile responsiveness.
- Make it feel premium and fun.
- After the core is working, suggest clear next steps for polish, deeper systems, or additional features.

Here is the complete specification:

[PASTE THE ENTIRE SPEC BELOW THIS LINE]
```

*(User: Copy the block above + the full spec below when sending to your coding AI.)*

---

## 1. Vision & Concept

### Project Name
**Multiverse Radio**

### One-Liner
Tune into radio stations broadcasting from other dimensions — procedurally generated podcasts, alien advertisements, news from parallel realities, and music that shouldn't exist.

### Full Vision Statement
Multiverse Radio is a web application that recreates the chaotic delight of Rick and Morty's Interdimensional Cable, but as a radio experience. Users open a single-page site and "tune in" to channels broadcasting from infinite realities. Each channel plays pre-generated audio episodes created by an LLM writing absurd scripts and a text-to-speech model performing them. There is no live generation, no accounts, and no friction — just a dial, a player, and the feeling of eavesdropping on the multiverse.

The MVP is a polished listening experience with five channels, static between tracks, and a sense of discovery. The content is weird, funny, and slightly unsettling in the best way. Future versions can add live generation, user-submitted prompts, and more channels, but the first version must feel complete and delightful on its own.

### Target Audience
People who enjoy weird internet experiences, generative art, AI experiments, and the absurd humor of shows like Rick and Morty. Also useful as a portfolio piece demonstrating LLM + TTS + clean frontend integration.

### Core Emotional Vibe / Aesthetic Direction
Late-night radio from a slightly broken dimension. Dark, warm, and analog. Think: a glowing vacuum tube, CRT scanlines, a tuning dial that clicks with weight, and the soft hiss of cosmic static. The humor is dry, deadpan, and occasionally unhinged — never try-hard. The interface should feel like a piece of equipment you found in a junk shop, not a modern SaaS dashboard.

---

## 2. Core Experience & User Loops

### Primary User Journey (First 60–90 seconds)
1. User lands on the page and sees a large, tactile tuning dial or channel selector surrounded by soft static noise and a dim, warm glow.
2. They click or drag to select a channel (e.g., "Rixty Minutes"). The dial snaps into place with a satisfying click sound.
3. Audio begins playing immediately (or after a short static burst). The "Now Playing" panel populates with the episode title, channel name, a one-line description, and a waveform or simple visualizer.
4. User can skip to the next episode on that channel, switch channels, or just leave it running while they do something else.
5. They notice the episode list for the current channel and click an older one. The player crossfades or static-transitions into it.
6. They close the tab. Nothing is saved except optionally the last channel (localStorage). The experience is ephemeral and low-commitment.

### Core Interaction Loop
Select channel → hear static transition → audio plays → glance at Now Playing → optionally skip or switch → repeat. The loop should feel effortless and slightly hypnotic.

### Key User Stories (MVP)
- As a visitor, I want to select a channel and immediately hear audio so that I can start exploring without friction.
- As a visitor, I want to see what is currently playing and skip to the next episode so that I can control the experience.
- As a visitor, I want the interface to feel like analog radio equipment so that the absurd content feels grounded in a tactile world.
- As a visitor, I want to browse previous episodes on a channel so that I can revisit something I liked.
- As a developer, I want episode metadata and audio files to live in a simple structure so that new content can be added without code changes.

### Success Metrics for v1 Prototype
- A first-time visitor can start listening within 5 seconds of page load.
- Switching channels feels responsive and includes a short static transition.
- The visual design feels intentional and atmospheric, not generic.
- The site works well on both desktop and mobile.
- Adding a new episode requires only dropping an MP3 and updating a JSON file.

---

## 3. Feature Breakdown

### MVP Features (Must Have for First Working Version)

| Priority | Feature | Description | Acceptance Criteria |
|----------|---------|-------------|---------------------|
| P0 | Channel selector | Visual dial or card grid of 5 channels | User can switch channels; selection is visually clear |
| P0 | Audio player | Play/pause, skip next, progress, volume | Plays local MP3s; controls work on desktop and mobile |
| P0 | Now Playing panel | Title, channel, description, duration | Updates correctly when episode or channel changes |
| P0 | Episode list | Scrollable list of episodes for current channel | Clicking an episode starts it |
| P0 | Static transitions | Short static/noise burst between episodes or channels | Plays during transitions; not jarring |
| P1 | Last channel memory | Remembers last selected channel via localStorage | On reload, returns to previous channel |
| P1 | Visualizer | Simple animated bars or waveform that reacts to audio | Animates while playing; subtle, not distracting |
| P1 | Keyboard controls | Space = play/pause, arrows = skip/switch | Works without mouse |

### Phase 2 / Nice-to-Have
- Channel-specific visual themes (different glow colors or backgrounds)
- "Shuffle all channels" mode
- Episode favorites (localStorage)
- Shareable link to a specific episode (`?channel=rixty&episode=3`)
- Light/dark mode toggle (default dark)
- More channels

### Future / Stretch Goals
- Live script generation on demand (user types a prompt, gets a short radio bit)
- User-submitted episode ideas
- Scheduled "broadcast" times (cosmetic only)
- Mobile PWA with background audio
- Integration with a real TTS pipeline that runs on a schedule

---

## 4. Technical Architecture & Stack

### Recommended Stack & Rationale
**Vite + TypeScript + Tailwind CSS.** This provides a clean, modular structure from day one, excellent DX, and a foundation that can grow. A single-file HTML project would become painful the moment we want components, TypeScript safety, or easy asset management. Tailwind handles the atmospheric dark UI quickly. The audio is pre-generated and served as static files — no backend is required for the MVP.

For audio playback, use the native Web Audio API or a lightweight library like Howler.js if cross-browser quirks appear. Start with native `<audio>` and Web Audio for the visualizer and static mixing.

### High-Level Architecture
```
multiverse-radio/
├── public/
│   ├── audio/
│   │   ├── rixty/
│   │   │   ├── episode-001.mp3
│   │   │   └── episode-002.mp3
│   │   ├── plumbus/
│   │   ├── classifieds/
│   │   ├── hop/
│   │   └── static/
│   │       └── ambient-001.mp3
│   ├── sfx/
│   │   ├── dial-click.mp3
│   │   └── static-burst.mp3
│   └── episodes.json
├── src/
│   ├── components/
│   │   ├── ChannelDial.tsx
│   │   ├── NowPlaying.tsx
│   │   ├── EpisodeList.tsx
│   │   ├── PlayerControls.tsx
│   │   └── Visualizer.tsx
│   ├── lib/
│   │   ├── audio.ts          # playback, transitions, visualizer
│   │   ├── channels.ts       # channel definitions & metadata
│   │   └── storage.ts        # localStorage helpers
│   ├── assets/
│   │   └── (generated images or SVGs)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

### State Management Approach
Lightweight React state (or Zustand if preferred). The main state is:
- `currentChannelId`
- `currentEpisodeIndex`
- `isPlaying`
- `volume`
- `episodes` (loaded from JSON)

No complex global state is needed.

### Data Models / Key Entities
```ts
interface Channel {
  id: string;           // e.g. "rixty"
  name: string;         // "Rixty Minutes"
  tagline: string;      // "Channel-surfing chaos from infinite realities"
  color: string;        // accent color hex
  episodes: Episode[];
}

interface Episode {
  id: string;
  title: string;
  description: string;  // one line
  audioUrl: string;     // path to MP3
  durationSeconds: number;
  publishedAt: string;  // ISO date
}
```

Example `episodes.json` structure:
```json
{
  "channels": [
    {
      "id": "rixty",
      "name": "Rixty Minutes",
      "tagline": "Channel-surfing chaos from infinite realities",
      "color": "#ff6b35",
      "episodes": [
        {
          "id": "rixty-001",
          "title": "Two Brothers vs. the Asteroid",
          "description": "A trailer for a movie that only exists in one timeline.",
          "audioUrl": "/audio/rixty/episode-001.mp3",
          "durationSeconds": 87,
          "publishedAt": "2026-10-12"
        }
      ]
    }
  ]
}
```

### Persistence Strategy
- Episode metadata and audio files are static (JSON + MP3s in `/public`).
- Last selected channel and volume stored in `localStorage`.
- No user accounts or server-side state in v1.

---

## 5. User Interface & Interaction Design

### Overall Layout & Screens/Views
Single-page application. On desktop: a centered "radio unit" with the channel dial on the left, Now Playing and visualizer in the center, and episode list on the right (or below on smaller screens). On mobile: stacked vertically — dial at top, player in the middle, episode list scrollable below. The entire page has a dark background with subtle noise texture and a warm vignette.

### Visual Design Language
- **Color Palette**: Near-black background (`#0a0a0c`), warm amber/orange accents (`#ff6b35`, `#ffaa44`), muted teal for secondary elements (`#4ecdc4`), soft off-white text (`#f0e6d2`). Each channel has a unique accent color that tints the glow when selected.
- **Typography**: A distinctive display font for channel names (e.g., "Bebas Neue" or "Orbitron" for a slightly sci-fi feel) paired with a clean sans-serif (Inter or system-ui) for body text. Monospace for episode metadata.
- **Iconography & Assets**: Minimal SVG icons. Optional: a subtle CRT scanline overlay or film grain via CSS. Channel icons can be simple geometric symbols.
- **Animation & Micro-interactions Philosophy**: Heavy but slow. Dial rotation has inertia. Channel switches trigger a brief static visual flicker. The visualizer is smooth and reactive. Transitions use easing that feels mechanical, not bouncy. Hover states glow softly.

### Key Screens / Components (Detailed)

#### ChannelDial
- Purpose: Primary navigation between the five channels.
- Elements: Circular dial or vertical stack of channel cards with names and accent colors. Current channel is highlighted with a glow and a small "ON AIR" indicator.
- Interactions: Click or drag to select. Plays a short dial-click sound. Triggers static transition before new audio starts.
- Responsive behavior: On mobile, becomes a horizontal scrollable row or a simple dropdown/grid.

#### NowPlaying
- Purpose: Show the user what they're hearing.
- Elements: Channel name, episode title, one-line description, elapsed/total time, visualizer bars.
- Interactions: None required beyond display. Time updates in real time.
- Responsive behavior: Stacks cleanly; title wraps gracefully.

#### PlayerControls
- Purpose: Basic playback control.
- Elements: Play/pause button, skip next, volume slider (or mute toggle).
- Interactions: Immediate feedback. Skip triggers static transition.
- Responsive behavior: Larger touch targets on mobile.

#### EpisodeList
- Purpose: Browse and select past episodes on the current channel.
- Elements: Scrollable list with title, short description, and duration. Current episode is highlighted.
- Interactions: Click to play that episode (with static transition).
- Responsive behavior: Becomes a collapsible section or bottom sheet on mobile.

#### Visualizer
- Purpose: Give the audio a visual presence.
- Elements: 16–32 animated bars that scale with audio frequency data (or simulated if Web Audio analysis is too complex for v1).
- Interactions: Runs only while audio is playing.
- Responsive behavior: Scales down on mobile; can be hidden if performance is an issue.

### Accessibility & Inclusivity Notes
- All controls are keyboard accessible (Tab, Space, Arrow keys).
- Sufficient color contrast on text.
- `aria-labels` on icon-only buttons.
- Respect `prefers-reduced-motion` by reducing or removing scanlines and heavy animations.
- Audio does not autoplay with sound on page load (user must interact first, per browser policy). Show a clear "Click to tune in" state if needed.

---

## 6. Implementation Roadmap

### Phase 1: Core Prototype (Target: 1–3 focused sessions)
- [ ] Scaffold Vite + TypeScript + Tailwind project
- [ ] Create `episodes.json` with 5 channels and 2–3 placeholder episodes each
- [ ] Build ChannelDial, NowPlaying, PlayerControls, and EpisodeList components
- [ ] Implement audio playback with native `<audio>` element
- [ ] Wire up channel switching and episode selection
- [ ] Add basic static transition (play a short noise clip before new audio)
- [ ] Style the page with the dark, warm, analog aesthetic
- [ ] Ensure mobile layout works

### Phase 2: Polish & Delight
- [ ] Add dial-click sound effect
- [ ] Implement simple audio visualizer
- [ ] Add localStorage for last channel and volume
- [ ] Keyboard shortcuts
- [ ] Smooth transitions and hover glows
- [ ] Empty state and loading states
- [ ] Test on real devices

### Phase 3: Expansion
- [ ] Channel-specific accent colors and subtle theme shifts
- [ ] Shareable episode links
- [ ] More episodes and channels
- [ ] Optional: connect to a real generation pipeline

---

## 7. Non-Functional Requirements

- **Performance**: Page should be interactive within 2 seconds on a mid-range connection. Audio should start within 500ms of selection (assuming files are cached or small). Visualizer at 60fps.
- **Responsive**: Mobile-first. Test at 375px, 768px, and 1440px+. Touch targets ≥ 44px.
- **Browser Support**: Modern evergreen browsers (Chrome, Firefox, Safari, Edge). No IE.
- **Offline / Installable**: Not required for v1. Audio files are large; offline is a future consideration.
- **Error Handling & Resilience**: If an audio file fails to load, show a clear message and offer to skip. If JSON fails to load, show a fallback message.
- **Extensibility**: Channel and episode data live in JSON so new content can be added without touching component code. Audio playback logic is isolated in `lib/audio.ts`.

---

## 8. Assets, Media & Content Strategy

For the MVP prototype, use **placeholder audio**. Generate 2–3 short (30–90 second) MP3s per channel using any TTS tool (ElevenLabs, OpenAI TTS, or even free alternatives) reading sample scripts written in the style of each channel. Store them in `/public/audio/<channel>/`. Also create one short static burst MP3 and one dial-click sound.

**Sample channel concepts and script styles:**

- **Rixty Minutes** — Rapid-fire channel surfing. Short clips of shows, ads, and news that cut off abruptly. Example: "Coming up next on Ball Fondlers... wait, no. This is the weather. In dimension C-137 it's raining... people. We'll be right back after these messages from Real Fake Doors."
- **The Plumbus Report** — Deadpan news anchor. "Good evening. Scientists in dimension 4-B have confirmed that the thing in your attic is, in fact, you from next Tuesday. More at eleven."
- **Alien Classifieds** — Over-the-top product ads. "Tired of real doors? Come on down to Real Fake Doors. We got doors that don't open. That's right — they just sit there. Look at that. Won't open."
- **Dimension Hop** — Two hosts casually discussing their reality. "So in your dimension, people just... walk places? With their legs? That's wild. Here we mostly roll."
- **Static** — No voice. Just layered ambient noise, distant radio chatter, and low drones. Can be a single looping file.

The coding agent does not need to generate the audio — the user will provide the MP3s. The agent should structure the project so that dropping new files and updating `episodes.json` is all that's required to add content.

Visual assets: Use CSS and SVG for the UI. Optional: generate a subtle noise texture or grain overlay. No external image dependencies required for v1.

---

## 9. Edge Cases, Risks & Mitigations

| Risk / Edge Case | Mitigation / Handling in Spec |
|------------------|-------------------------------|
| Browser blocks autoplay | Require a user click ("Tune In") before first audio plays. Subsequent switches can autoplay. |
| Audio file missing or 404 | Catch error, show "Signal lost" message, auto-skip after 2 seconds or offer manual skip. |
| Large MP3 files slow initial load | Keep episodes short (under 2 minutes for v1). Use `<audio preload="metadata">`. |
| Mobile data usage | Show a small note that audio is streaming. Consider a "low data" toggle later. |
| Visualizer performance on low-end devices | Make visualizer optional or use a CSS-only fake visualizer as fallback. |
| JSON structure mismatch | Validate on load; show clear error if channels array is missing. |
| User on very slow connection | Show a loading state on the player. Don't block the entire UI. |

---

## 10. Definition of Done for v1

The prototype is considered complete when:
- [ ] User can select any of the 5 channels and hear audio within a few seconds
- [ ] Now Playing panel correctly displays title, channel, and description
- [ ] User can skip to the next episode and select any episode from the list
- [ ] Short static transition plays when switching episodes or channels
- [ ] Interface matches the dark, warm, analog radio aesthetic
- [ ] Works on desktop and mobile without broken layouts
- [ ] Last channel is remembered on reload (localStorage)
- [ ] Keyboard controls work for play/pause and skip
- [ ] Code is organized in components and the data lives in `episodes.json`
- [ ] Adding a new episode requires only an MP3 and a JSON entry

---

## 11. Open Questions & Decisions for Later

- Should the visualizer use real Web Audio frequency analysis or a simulated CSS animation for simplicity?
- Do we want channel-specific background tints, or keep the aesthetic uniform?
- Is a "Shuffle" mode worth adding in Phase 2, or does it dilute the channel identity?
- How many episodes per channel feels right before the experience feels repetitive? (Current recommendation: 3–5 for v1)
- Should the generation pipeline (LLM scripts + TTS) be documented as a separate script the user can run, or is it out of scope for the coding agent?

---

**End of Specification**

*This document was generated to maximize first-try success with AI coding assistants. Refine with the Vibe Spec Creator as needed.*
