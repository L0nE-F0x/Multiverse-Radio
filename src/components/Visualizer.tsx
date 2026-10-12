import { useEffect, useRef } from 'react';
import { useBroadcast } from '../broadcast/store';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useStation, useStatus } from '../ui/select';
import { useUi } from '../ui/store';

const SEGMENTS = 10;
const MIN_HZ = 70;
const MAX_HZ = 9000;

/**
 * A segmented VFD spectrum meter fed by the live analyser (post-mix, pre-volume, so it
 * keeps dancing when muted). With no analyser it plays a slow, obviously-idle ripple.
 * The loop only runs while on air and on screen, at 30 fps (10 with reduced motion),
 * and stops completely once the bars have settled.
 */
export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useStatus();
  const color = useStation().color;
  const ambient = useUi((s) => s.ambient);
  const visible = useDocumentVisible();
  const reducedMotion = usePrefersReducedMotion();
  const running = status === 'playing' && visible && !ambient;

  const runningRef = useRef(running);
  const colorRef = useRef(color);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    runningRef.current = running;
    colorRef.current = color;
    wakeRef.current();
  }, [running, color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let bars = 0;
    let levels = new Float32Array(0);
    let peaks = new Float32Array(0);
    let bins: Uint8Array<ArrayBuffer> | null = null;
    let raf = 0;
    let lastFrame = 0;
    const frameMs = reducedMotion ? 100 : 33;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(12, Math.min(40, Math.floor(width / 9)));
      if (count !== bars) {
        bars = count;
        levels = new Float32Array(bars);
        peaks = new Float32Array(bars);
      }
      draw();
    };

    const step = (t: number) => {
      const analyser = runningRef.current ? useBroadcast.getState().getAnalyser() : null;
      if (analyser) {
        if (bins?.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(bins);
        const nyquist = analyser.context.sampleRate / 2;
        for (let i = 0; i < bars; i++) {
          const lo = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / bars);
          const hi = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((i + 1) / bars);
          const a = Math.floor((lo / nyquist) * bins.length);
          const b = Math.max(a + 1, Math.ceil((hi / nyquist) * bins.length));
          let sum = 0;
          for (let k = a; k < b; k++) sum += bins[k]!;
          // Tilt up the highs, which are always quieter.
          const value = Math.min(1, (sum / (b - a) / 255) * (0.8 + (i / bars) * 0.75));
          const current = levels[i]!;
          levels[i] = value > current ? current + (value - current) * 0.6 : current * 0.82 + value * 0.18;
        }
      } else if (runningRef.current) {
        // No analyser yet: a lazy ripple that says "on, but resting".
        for (let i = 0; i < bars; i++) {
          const x = i / bars;
          const value =
            0.34 +
            0.2 * Math.sin(t * 0.0013 + x * 7) +
            0.12 * Math.sin(t * 0.0031 - x * 13) * Math.sin(t * 0.0007 + x * 3);
          levels[i] = levels[i]! * 0.7 + Math.max(0.04, value * (1 - x * 0.4)) * 0.3;
        }
      } else {
        for (let i = 0; i < bars; i++) levels[i]! *= 0.8;
      }
      for (let i = 0; i < bars; i++) {
        peaks[i] = levels[i]! >= peaks[i]! ? levels[i]! : Math.max(0, peaks[i]! - 0.012);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (!bars) return;
      const [r, g, b] = hexToRgb(colorRef.current);
      const gap = 2;
      const segGap = 2;
      const barWidth = (width - gap * (bars - 1)) / bars;
      const segHeight = (height - segGap * (SEGMENTS - 1)) / SEGMENTS;
      const hot = `rgb(${mix(r, 255, 0.5)},${mix(g, 245, 0.5)},${mix(b, 225, 0.5)})`;
      for (let i = 0; i < bars; i++) {
        const lit = Math.round(levels[i]! * SEGMENTS);
        const peak = peaks[i]! > 0.05 ? Math.min(SEGMENTS - 1, Math.round(peaks[i]! * SEGMENTS) - 1) : -1;
        const x = i * (barWidth + gap);
        for (let s = 0; s < SEGMENTS; s++) {
          const y = height - (s + 1) * segHeight - s * segGap;
          if (s < lit) ctx.fillStyle = s >= SEGMENTS - 2 ? hot : `rgba(${r},${g},${b},${0.55 + (s / SEGMENTS) * 0.45})`;
          else if (s === peak) ctx.fillStyle = 'rgba(255,240,222,0.65)';
          else ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
          ctx.fillRect(x, y, barWidth, segHeight);
        }
      }
    };

    const loop = (t: number) => {
      raf = 0;
      if (t - lastFrame >= frameMs) {
        lastFrame = t;
        step(t);
        draw();
      }
      const settled = !runningRef.current && levels.every((v) => v < 0.01) && peaks.every((v) => v < 0.01);
      if (settled) {
        levels.fill(0);
        peaks.fill(0);
        draw();
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const wake = () => {
      if (raf) return;
      draw();
      raf = requestAnimationFrame(loop);
    };
    wakeRef.current = wake;

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    wake();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      wakeRef.current = () => {};
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />;
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(n) ? [255, 158, 122] : [n >> 16, (n >> 8) & 255, n & 255];
}
