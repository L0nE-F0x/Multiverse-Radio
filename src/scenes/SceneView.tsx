// Mounts a lazily loaded scene on a pixel canvas that covers its container.
// StationScene is the public wrapper; the lab uses this directly for its extra knobs.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SceneId } from '../broadcast/types';
import { hashString } from './kit/rng';
import { loadScene, sceneEntry } from './registry';
import { type RunnerInputs, SceneRunner } from './runner';

export interface SceneViewProps {
  sceneId: SceneId;
  /** Station accent (hex). Used by scene palettes and the loading placeholder. */
  accent: string;
  /** Per-station variation key (the station id): scenes shared by many stations vary by it. */
  variantKey?: string;
  playing: boolean;
  energy?: () => number;
  reducedMotion?: boolean;
  className?: string;
  /** Overrides the default aria-label. */
  label?: string;
  /** Lab: change this number to start a rare event. */
  rareNonce?: number;
  /** Lab: which rare event to start (default: next in turn). */
  rareKind?: number;
  /** Lab: receives the runner (stats, advance). */
  onRunner?: (runner: SceneRunner | null) => void;
  /** Lab: show the raw raster, without the grade/vignette/grain/bloom pass. */
  raw?: boolean;
}

export function SceneView({
  sceneId,
  accent,
  variantKey,
  playing,
  energy,
  reducedMotion = false,
  className = '',
  label,
  rareNonce,
  rareKind,
  onRunner,
  raw = false,
}: SceneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<SceneRunner | null>(null);
  const inputs = useRef<RunnerInputs>({ playing, energy, reducedMotion });
  const onRunnerRef = useRef(onRunner);
  const rawRef = useRef(raw);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const i = inputs.current;
    const changed = i.playing !== playing || i.reducedMotion !== reducedMotion;
    i.playing = playing;
    i.energy = energy;
    i.reducedMotion = reducedMotion;
    onRunnerRef.current = onRunner;
    const r = runnerRef.current;
    if (r && r.postEnabled === raw) {
      r.postEnabled = !raw;
      r.refresh();
    } else if (changed) r?.refresh();
    rawRef.current = raw;
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    let cancelled = false;
    setReady(false);
    loadScene(sceneId)
      .then((def) => {
        if (cancelled) return;
        const runner = new SceneRunner(container, canvas, def, accent, inputs.current, variantKey ? hashString(variantKey) : 0);
        runner.postEnabled = !rawRef.current;
        runnerRef.current = runner;
        onRunnerRef.current?.(runner);
        setReady(true);
      })
      .catch((err: unknown) => {
        console.error(`Scene "${sceneId}" failed to load`, err);
      });
    return () => {
      cancelled = true;
      runnerRef.current?.destroy();
      runnerRef.current = null;
      onRunnerRef.current?.(null);
    };
    // A new variant (another pirate on the same scene) rebuilds the scene with its own layout.
  }, [sceneId, accent, variantKey]);

  useEffect(() => {
    if (rareNonce) runnerRef.current?.trigger(rareKind);
  }, [rareNonce, rareKind]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label ?? sceneEntry(sceneId).label}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // Shown while the scene's chunk loads: a dim glow of the accent in the dark.
        background: `radial-gradient(ellipse 80% 70% at 50% 55%, ${accent}26, #07080f 75%)`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          imageRendering: 'pixelated',
          opacity: ready ? 1 : 0,
          transition: 'opacity 500ms ease',
        }}
      />
    </div>
  );
}
