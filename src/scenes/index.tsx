// Animated station scenes — public API.
//
// STUB: the scenes workstream replaces this with real generative scenes for every
// SceneId. Keep the exported names and props stable; the UI codes against them.

import type { StationDef } from '../broadcast/types';

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
export function StationScene({ station, className = '' }: StationSceneProps) {
  return (
    <div
      role="img"
      aria-label={station.sceneBrief}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        background: `radial-gradient(circle at 50% 70%, ${station.color}55, #0a0a0c 70%)`,
      }}
    />
  );
}
