import { useEffect, useRef } from 'react';
import { useBroadcast } from '../broadcast/store';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { onFrame } from '../ui/frameloop';
import { phosphorHex, tunedPhosphor } from '../ui/phosphor';
import { useStatus, useTuned } from '../ui/select';

/**
 * A small oscilloscope trace of the live mix. Draws only while on air, on screen and with
 * the HUD awake (30 fps, or 10 with reduced motion); otherwise a still, flat line.
 */
export function Scope({ awake }: { awake: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const status = useStatus();
  const tuned = useTuned();
  const visible = useDocumentVisible();
  const reducedMotion = usePrefersReducedMotion();
  const color = phosphorHex(tunedPhosphor(tuned));
  const running = status === 'playing' && visible && awake;
  const noisy = tuned.kind === 'static';

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let width = 0;
    let height = 0;
    let samples: Uint8Array<ArrayBuffer> | null = null;
    let last = 0;
    const frameMs = reducedMotion ? 100 : 33;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      // Graticule.
      ctx.strokeStyle = `${color}22`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const x = Math.round((width * i) / 4) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      const mid = Math.round(height / 2) + 0.5;
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();

      const analyser = running ? useBroadcast.getState().getAnalyser() : null;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      if (analyser) {
        if (samples?.length !== analyser.fftSize) samples = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(samples);
        // Find a rising zero crossing so the trace holds still, like a triggered scope.
        let start = 0;
        for (let i = 1; i < samples.length / 2; i++) {
          if (samples[i - 1]! < 128 && samples[i]! >= 128) {
            start = i;
            break;
          }
        }
        const span = Math.min(samples.length - start, 512);
        for (let i = 0; i < span; i++) {
          const v = (samples[start + i]! - 128) / 128;
          const x = (i / (span - 1)) * width;
          const y = height / 2 - v * height * 0.42;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        const n = 48;
        for (let i = 0; i <= n; i++) {
          const x = (i / n) * width;
          const jitter = running && noisy ? (Math.random() - 0.5) * height * 0.5 : 0;
          if (i === 0) ctx.moveTo(x, height / 2 + jitter);
          else ctx.lineTo(x, height / 2 + jitter);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!running) return () => observer.disconnect();
    const stop = onFrame((now) => {
      if (now - last < frameMs) return;
      last = now;
      draw();
    });
    return () => {
      stop();
      observer.disconnect();
    };
  }, [running, color, reducedMotion, noisy]);

  return (
    <div className="scope" aria-hidden>
      <p className="scope-head">
        <span>Scope · Ch 1</span>
        <span>{running ? 'Trig ▲' : 'Idle'}</span>
      </p>
      <canvas ref={ref} />
    </div>
  );
}
