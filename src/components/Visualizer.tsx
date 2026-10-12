import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { engine } from '../lib/audio';
import { isLive, useRadio } from '../lib/store';

const SEGMENTS = 12;
const MIN_HZ = 70;
const MAX_HZ = 9000;

/**
 * A segmented VFD-style spectrum meter fed by the engine's analyser. It reads the
 * signal before the volume stage, so it keeps moving when muted.
 */
export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const running = useRadio((s) => isLive(s.status));
  const reducedMotion = usePrefersReducedMotion();
  const runningRef = useRef(running);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    runningRef.current = running;
    if (running) wakeRef.current();
  }, [running]);

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
    let rgb = readAccent(canvas, ctx);
    let frame = 0;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 340 ? 20 : width < 520 ? 26 : 32;
      if (count !== bars) {
        bars = count;
        levels = new Float32Array(bars);
        peaks = new Float32Array(bars);
      }
      draw();
    };

    const step = () => {
      const analyser = engine.getAnalyser();
      if (runningRef.current && analyser) {
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
          // Tilt up the highs, which are always quieter in speech.
          const value = Math.min(1, (sum / (b - a) / 255) * (0.8 + (i / bars) * 0.75));
          const current = levels[i]!;
          levels[i] = value > current ? current + (value - current) * 0.6 : current * 0.85 + value * 0.15;
        }
      } else {
        for (let i = 0; i < bars; i++) levels[i]! *= 0.86;
      }
      for (let i = 0; i < bars; i++) {
        peaks[i] = levels[i]! >= peaks[i]! ? levels[i]! : Math.max(0, peaks[i]! - 0.007);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (!bars) return;
      const gap = width < 400 ? 2 : 3;
      const segGap = 2;
      const barWidth = (width - gap * (bars - 1)) / bars;
      const segHeight = (height - segGap * (SEGMENTS - 1)) / SEGMENTS;
      const [r, g, b] = rgb;
      const hot = `rgb(${mix(r, 255, 0.45)},${mix(g, 245, 0.45)},${mix(b, 225, 0.45)})`;

      for (let i = 0; i < bars; i++) {
        const lit = Math.round(levels[i]! * SEGMENTS);
        const peak = peaks[i]! > 0.05 ? Math.min(SEGMENTS - 1, Math.round(peaks[i]! * SEGMENTS) - 1) : -1;
        const x = i * (barWidth + gap);
        for (let s = 0; s < SEGMENTS; s++) {
          const y = height - (s + 1) * segHeight - s * segGap;
          if (s < lit) ctx.fillStyle = s >= SEGMENTS - 2 ? hot : `rgba(${r},${g},${b},${0.55 + (s / SEGMENTS) * 0.45})`;
          else if (s === peak) ctx.fillStyle = 'rgba(255,240,222,0.7)';
          else ctx.fillStyle = `rgba(${r},${g},${b},0.07)`;
          ctx.fillRect(x, y, barWidth, segHeight);
        }
      }
    };

    const loop = () => {
      frame++;
      if (frame % 15 === 0) rgb = readAccent(canvas, ctx);
      if (!reducedMotion || frame % 3 === 0) {
        step();
        draw();
      }
      const settled = !runningRef.current && levels.every((v) => v < 0.004) && peaks.every((v) => v < 0.004);
      if (settled) {
        raf = 0;
        rgb = readAccent(canvas, ctx);
        draw();
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    wakeRef.current = wake;

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    wake();

    // The accent glides between channels; repaint the idle grid as it does.
    const repaint = () => {
      if (!raf) {
        rgb = readAccent(canvas, ctx);
        draw();
      }
    };
    const interval = window.setInterval(repaint, 250);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
      observer.disconnect();
      wakeRef.current = () => {};
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="block h-full w-full"
      style={{ filter: 'drop-shadow(0 0 6px color-mix(in oklab, var(--accent) 45%, transparent))' }}
    />
  );
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Reads the live --accent as RGB, normalizing whatever color syntax the browser serializes. */
function readAccent(element: Element, ctx: CanvasRenderingContext2D): [number, number, number] {
  const raw = getComputedStyle(element).getPropertyValue('--accent').trim() || '#ff6b35';
  ctx.fillStyle = '#ff6b35';
  ctx.fillStyle = raw;
  const value = String(ctx.fillStyle);
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [255, 107, 53];
}
