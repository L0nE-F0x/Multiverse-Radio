import { useEffect, useMemo, type CSSProperties } from 'react';
import { useBroadcast } from '../broadcast/store';
import type { BroadcastSceneState, VoiceCategory } from '../broadcast/types';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { preloadScene, StationScene } from '../scenes';
import { MAIN_STATIONS } from '../stations/roster';
import { SHIP } from '../stations/ship';
import { energy } from '../ui/energy';
import { useLastStation, useStatus, useTuned } from '../ui/select';
import { oddityStation } from '../ui/source';
import { StaticNoise } from './StaticNoise';

let speechLevel = 0;
let voiceBins: Uint8Array<ArrayBuffer> | null = null;

/** Live broadcast state reader passed into `<StationScene broadcast={...}>`. */
export function readBroadcastSceneState(): Partial<BroadcastSceneState> {
  const s = useBroadcast.getState();
  const playing = s.status === 'playing';
  const hush = s.caption?.speaker === SHIP.computer.name;
  const isVoice = s.onAir?.kind === 'voice';
  const speaking = playing && (isVoice || s.caption !== null);

  let targetSpeech = 0;
  if (speaking) {
    const bus = s.getBusAnalyser?.(hush ? 'overlay' : 'voice');
    let busEnergy = 0;
    if (bus) {
      if (voiceBins?.length !== bus.frequencyBinCount) {
        voiceBins = new Uint8Array(bus.frequencyBinCount);
      }
      bus.getByteFrequencyData(voiceBins);
      const count = Math.min(24, voiceBins.length);
      let sum = 0;
      for (let i = 1; i < count; i++) sum += voiceBins[i]!;
      busEnergy = count > 1 ? Math.min(1, (sum / (count - 1) / 255) * 1.8) : 0;
    }
    const now = performance.now();
    const cadence =
      0.36 +
      0.48 *
        Math.abs(Math.sin(now * 0.011)) *
        (0.65 + 0.35 * Math.cos(now * 0.027 + (s.caption?.text.length ?? 0)));
    targetSpeech = Math.min(1, Math.max(busEnergy, energy() * 0.85, s.caption ? cadence : cadence * 0.65));
  }

  speechLevel =
    targetSpeech > speechLevel
      ? speechLevel + (targetSpeech - speechLevel) * 0.45
      : speechLevel * 0.82 + targetSpeech * 0.18;
  if (speechLevel < 0.005) speechLevel = 0;

  const segmentKind: BroadcastSceneState['segmentKind'] =
    s.tuned.kind === 'static' || !s.onAir ? 'static' : isVoice ? 'voice' : 'music';

  const voiceCategory: VoiceCategory | null = hush
    ? 'ship'
    : s.onAir?.kind === 'voice'
      ? s.onAir.clip.category
      : s.caption && s.event
        ? 'event'
        : null;

  return {
    segmentKind,
    voiceCategory,
    speech: speechLevel,
    section: s.musicSection ?? 'verse',
    sectionProgress: s.musicSectionProgress ?? 0,
    event: s.event?.id ?? null,
    hush,
    signal: Math.max(0, Math.min(1, Number.isFinite(s.signal) ? s.signal : 1)),
    bleed: Math.max(0, Math.min(1, s.bleed ?? 0)),
  };
}

/**
 * The Nightjar's viewport: the tuned world, full-bleed. Weak signal mixes in snow and a
 * little picture instability in proportion; empty band is snow over the dimmed last scene.
 */
export function Viewport() {
  const tuned = useTuned();
  const last = useLastStation();
  const status = useStatus();
  const signal = useBroadcast((s) => s.signal);
  const event = useBroadcast((s) => s.event?.id ?? null);
  const reducedMotion = usePrefersReducedMotion();
  const visible = useDocumentVisible();

  const oddity = tuned.kind === 'oddity' ? tuned : null;
  const oddityDef = useMemo(
    () => (oddity ? oddityStation(oddity.oddity, oddity.label, oddity.scene) : null),
    [oddity?.oddity, oddity?.label, oddity?.scene],
  );
  const scene = tuned.kind === 'station' || tuned.kind === 'pirate' ? tuned.station : (oddityDef ?? last);

  const isStatic = tuned.kind === 'static';
  const clamped = Math.max(0, Math.min(1, Number.isFinite(signal) ? signal : 1));
  // How much the picture suffers: none at a station's centre, all of it on empty band.
  const distort = isStatic ? 1 : 1 - clamped;
  // Snow rises slowly near a station's centre and quickly further out.
  let noise = status === 'off' ? 0 : isStatic ? 0.64 : Math.min(0.78, distort ** 1.3 * 0.95);
  if (status === 'tuning') noise = Math.max(noise, 0.88);
  if (event === 'dimensional-storm' && status !== 'off') noise = Math.max(noise, 0.22);

  // Fetch the neighbours' scenes in the background so stepping along the dial never waits.
  useEffect(() => {
    if (tuned.kind !== 'station') return;
    const i = MAIN_STATIONS.findIndex((s) => s.id === tuned.station.id);
    if (i < 0) return;
    for (const delta of [1, -1]) {
      const neighbour = MAIN_STATIONS[(i + delta + MAIN_STATIONS.length) % MAIN_STATIONS.length];
      if (neighbour) preloadScene(neighbour.scene);
    }
  }, [tuned]);

  const level = distort < 0.04 ? 'clear' : distort < 0.45 ? 'weak' : 'poor';

  return (
    <div
      className="viewport"
      data-viewport=""
      data-signal={isStatic ? 'none' : level}
      data-event={event ?? undefined}
      style={{ '--distort': distort.toFixed(3) } as CSSProperties}
    >
      <div className="viewport-scene">
        <StationScene
          key={scene.id}
          station={scene}
          playing={status === 'playing' && visible}
          energy={energy}
          broadcast={readBroadcastSceneState}
          reducedMotion={reducedMotion}
          className="viewport-canvas"
        />
      </div>
      <StaticNoise level={noise} />
      <div className="viewport-roll" aria-hidden />
      <div className="viewport-event" aria-hidden />
      <div className="viewport-glass" aria-hidden />
    </div>
  );
}
