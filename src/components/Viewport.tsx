import { useEffect, useMemo, type CSSProperties } from 'react';
import { useBroadcast } from '../broadcast/store';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { preloadScene, StationScene } from '../scenes';
import { MAIN_STATIONS } from '../stations/roster';
import { energy } from '../ui/energy';
import { useLastStation, useStatus, useTuned } from '../ui/select';
import { oddityStation } from '../ui/source';
import { StaticNoise } from './StaticNoise';

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
  let noise = status === 'off' ? 0 : isStatic ? 0.8 : Math.min(0.78, distort * 1.05);
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
