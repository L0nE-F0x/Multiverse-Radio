import { useEffect, useRef } from 'react';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { onFrame } from '../ui/frameloop';

/** Screen pixels per noise cell: coarse enough to read as the same pixel world as the scenes. */
const CELL = 3;
const MAX_W = 480;
const MAX_H = 320;

/**
 * Analogue snow: generated a frame at a time into a small canvas the browser scales up.
 * Runs at ~15 fps (4 with reduced motion) only while visible and `level` is above zero.
 */
export function StaticNoise({ level }: { level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const visible = useDocumentVisible();
  const active = level > 0.01 && visible;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!active || !canvas || !ctx) return;

    let image: ImageData | null = null;
    let pixels: Uint32Array | null = null;
    let seed = (Math.random() * 0xffffffff) >>> 0;
    let roll = 0;
    let last = 0;
    const frameMs = reducedMotion ? 250 : 66;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(32, Math.min(MAX_W, Math.round(rect.width / CELL)));
      const h = Math.max(32, Math.min(MAX_H, Math.round(rect.height / CELL)));
      if (canvas.width !== w || canvas.height !== h || !image) {
        canvas.width = w;
        canvas.height = h;
        image = ctx.createImageData(w, h);
        pixels = new Uint32Array(image.data.buffer);
      }
      draw();
    };

    const draw = () => {
      if (!image || !pixels) return;
      const { width: w, height: h } = image;
      roll = (roll + 1 + (seed & 3)) % h;
      for (let y = 0; y < h; y++) {
        // Rows vary in gain (streaks), and a soft bright band rolls down the picture.
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const streak = (seed >>> 0) / 4294967296;
        const band = Math.max(0, 1 - Math.abs(y - roll) / (h * 0.08));
        const gain = 0.55 + streak * streak * 0.5 + band * 0.35;
        const row = y * w;
        for (let x = 0; x < w; x++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          const v = Math.min(255, ((seed >>> 24) * gain) | 0);
          // Faintly blue-grey snow; ABGR on little-endian.
          pixels[row + x] = 0xff000000 | (Math.min(255, v + 10) << 16) | (v << 8) | Math.max(0, v - 6);
        }
      }
      ctx.putImageData(image, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const stop = onFrame((now) => {
      if (now - last < frameMs) return;
      last = now;
      draw();
    });
    return () => {
      stop();
      observer.disconnect();
    };
  }, [active, reducedMotion]);

  return <canvas ref={ref} className="static-noise" aria-hidden style={{ opacity: Math.min(1, level) }} data-on={active} />;
}
