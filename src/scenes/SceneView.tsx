// Mounts a lazily loaded scene on a pixel canvas that covers its container.
// StationScene is the public wrapper; the lab uses this directly for its extra knobs.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SceneId } from '../broadcast/types';
import { loadScene, sceneEntry } from './registry';
import { type RunnerInputs, SceneRunner } from './runner';

export interface SceneViewProps {
  sceneId: SceneId;
  /** Station accent (hex). Used by scene palettes and the loading placeholder. */
  accent: string;
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
}

export function SceneView({
  sceneId,
  accent,
  playing,
  energy,
  reducedMotion = false,
  className = '',
  label,
  rareNonce,
  rareKind,
  onRunner,
}: SceneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<SceneRunner | null>(null);
  const inputs = useRef<RunnerInputs>({ playing, energy, reducedMotion });
  const onRunnerRef = useRef(onRunner);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const i = inputs.current;
    const changed = i.playing !== playing || i.reducedMotion !== reducedMotion;
    i.playing = playing;
    i.energy = energy;
    i.reducedMotion = reducedMotion;
    onRunnerRef.current = onRunner;
    if (changed) runnerRef.current?.refresh();
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
        const runner = new SceneRunner(container, canvas, def, accent, inputs.current);
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
  }, [sceneId, accent]);

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
        background: `radial-gradient(ellipse 80% 70% at 50% 60%, ${accent}40, #0a0a0c 75%)`,
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
      {/* A soft shared vignette ties every scene into the same "window". */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 60%, rgb(0 0 0 / 0.32) 100%)',
        }}
      />
    </div>
  );
}
