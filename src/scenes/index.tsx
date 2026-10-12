// Animated station scenes — public API.
//
// Each station has a pixel-art diorama (src/scenes/defs/*), lazily loaded on first use and
// drawn on a small canvas that the browser upscales. Scenes pause when the tab is hidden or
// the element is offscreen, react subtly to `energy()`, doze when not playing, and go
// near-static with `reducedMotion`.

import type { StationDef } from '../broadcast/types';
import { SceneView } from './SceneView';

export interface StationSceneProps {
  station: StationDef;
  /** True while the station is audibly on air. Scenes can be livelier when playing. */
  playing: boolean;
  /** Current audio level, 0–1. Call it inside your animation loop; may return 0 when silent. */
  energy?: () => number;
  /** Disable or drastically reduce motion. */
  reducedMotion?: boolean;
  className?: string;
}

/** Fills its container (position it yourself). */
export function StationScene({ station, playing, energy, reducedMotion, className }: StationSceneProps) {
  return (
    <SceneView
      sceneId={station.scene}
      accent={station.color}
      playing={playing}
      energy={energy}
      reducedMotion={reducedMotion}
      className={className}
    />
  );
}

export { preloadScene, sceneLabel } from './preload';
