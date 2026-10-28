import { useEffect, useMemo, useRef, useState } from 'react';
import { useBroadcast } from '../broadcast/store';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import * as act from '../ui/actions';
import { onFrame } from '../ui/frameloop';
import { phosphorHex, tunedPhosphor } from '../ui/phosphor';
import { useStatus, useTuned } from '../ui/select';
import { renderSstvCard, SSTV_HEIGHT, SSTV_WIDTH, type SstvTarget } from '../ui/sstv';
import { cycleScopeMode, setScopeMode, useScopeMode, type ScopeMode } from '../ui/store';

export { cycleScopeMode, setScopeMode, useScopeMode, type ScopeMode };

function parseHexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 3-mode operator scope:
 *   WAVE – triggered oscilloscope trace + adjacent-carrier bleed ghost trace
 *   FALL – real-time scrolling spectrum waterfall in the station's phosphor palette
 *   SSTV – progressive line-by-line slow-scan telemetry decoder (~12 scanlines/sec)
 */
export function Scope({ awake }: { awake: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const status = useStatus();
  const tuned = useTuned();
  const frequency = useBroadcast((s) => s.frequency);
  const mode = useScopeMode();
  const visible = useDocumentVisible();
  const reducedMotion = usePrefersReducedMotion();
  const color = phosphorHex(tunedPhosphor(tuned));
  const running = status === 'playing' && visible && awake;
  const noisy = tuned.kind === 'static';

  const sstvTarget = useMemo<SstvTarget>(() => {
    if (tuned.kind === 'station') {
      return { id: tuned.station.id, frequency: tuned.station.frequency, kind: 'station', secret: tuned.station.secret };
    }
    if (tuned.kind === 'pirate') {
      return { id: tuned.station.id, frequency: tuned.station.frequency, kind: 'pirate', secret: true };
    }
    if (tuned.kind === 'oddity') {
      return { id: tuned.oddity, frequency, kind: 'oddity' };
    }
    return { id: 'static', frequency, kind: 'static' };
  }, [tuned, frequency]);

  const [decodedClue, setDecodedClue] = useState<string | null>(null);
  const [scanPct, setScanPct] = useState(0);

  // Reset SSTV decode readout when tuning to a different source.
  useEffect(() => {
    setDecodedClue(null);
    setScanPct(0);
  }, [sstvTarget.id, sstvTarget.kind]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let timeSamples: Uint8Array<ArrayBuffer> | null = null;
    let freqSamples: Uint8Array<ArrayBuffer> | null = null;
    let last = 0;
    const frameMs = reducedMotion ? 100 : 33;
    const [cr, cg, cb] = parseHexRgb(color);

    // Offscreen waterfall buffer (128×58).
    const fallW = 128;
    const fallH = 58;
    const fallCanvas = document.createElement('canvas');
    fallCanvas.width = fallW;
    fallCanvas.height = fallH;
    const fallCtx = fallCanvas.getContext('2d');
    const fallRow = fallCtx?.createImageData(fallW, 1) ?? null;

    // Offscreen SSTV raster buffer (64×48).
    const sstvCanvas = document.createElement('canvas');
    sstvCanvas.width = SSTV_WIDTH;
    sstvCanvas.height = SSTV_HEIGHT;
    const sstvCtx = sstvCanvas.getContext('2d');
    const sstvImage = sstvCtx?.createImageData(SSTV_WIDTH, SSTV_HEIGHT) ?? null;
    let sstvFrameIndex = 0;
    let sstvCard = renderSstvCard(sstvTarget, sstvFrameIndex);
    let scanLine = reducedMotion && running ? SSTV_HEIGHT * 0.8 : 0;
    let unlockedClue = false;
    let lastPct = -1;

    const drawGraticule = () => {
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
    };

    const drawWave = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      drawGraticule();

      const state = useBroadcast.getState();
      const analyser = running ? state.getAnalyser() : null;
      const bleed = state.bleed ?? 0;

      // Secondary ghost trace when adjacent-carrier bleed > 0.08.
      if (bleed > 0.08) {
        ctx.save();
        ctx.strokeStyle = `${color}66`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        const ghostPoints = 56;
        const amp = Math.min(0.42, bleed * 0.52) * height;
        const phase = now * 0.008;
        for (let i = 0; i <= ghostPoints; i++) {
          const u = i / ghostPoints;
          const x = u * width;
          const het = Math.sin(u * Math.PI * 10 + phase) * 0.65 + Math.cos(u * Math.PI * 23 - phase * 1.3) * 0.35;
          const y = height / 2 - het * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Primary triggered trace.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      if (analyser) {
        if (timeSamples?.length !== analyser.fftSize) timeSamples = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeSamples);
        let start = 0;
        for (let i = 1; i < timeSamples.length / 2; i++) {
          if (timeSamples[i - 1]! < 128 && timeSamples[i]! >= 128) {
            start = i;
            break;
          }
        }
        const span = Math.min(timeSamples.length - start, 512);
        for (let i = 0; i < span; i++) {
          const v = (timeSamples[start + i]! - 128) / 128;
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

    const pushWaterfallRow = (now: number) => {
      if (!fallCtx || !fallRow) return;
      // Scroll existing rows down by 1px.
      fallCtx.drawImage(fallCanvas, 0, 0, fallW, fallH - 1, 0, 1, fallW, fallH - 1);

      const state = useBroadcast.getState();
      const analyser = running ? state.getAnalyser() : null;
      let hasLiveBins = false;
      if (analyser) {
        if (freqSamples?.length !== analyser.frequencyBinCount) {
          freqSamples = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqSamples);
        for (let i = 0; i < Math.min(32, freqSamples.length); i++) {
          if (freqSamples[i]! > 0) {
            hasLiveBins = true;
            break;
          }
        }
      }

      const signal = Math.max(0, Math.min(1, state.signal ?? 1));
      const bleed = state.bleed ?? 0;
      const data = fallRow.data;

      for (let x = 0; x < fallW; x++) {
        const u = x / (fallW - 1);
        let v = 0;
        if (hasLiveBins && freqSamples) {
          // Logarithmic-ish mapping across lower 65% of bins where musical & vocal energy sits.
          const binIdx = Math.min(
            freqSamples.length - 1,
            Math.floor(Math.pow(u, 1.35) * freqSamples.length * 0.65),
          );
          v = freqSamples[binIdx]! / 255;
        } else if (running) {
          // Synthetic carrier + harmonics + noise spectrum when analyser is idle/mocked.
          const carrierDist = (u - 0.28) / 0.06;
          const harmonicDist = (u - 0.56) / 0.09;
          const bleedDist = (u - 0.78) / 0.05;
          const wobble = 0.75 + 0.25 * Math.sin(now * 0.005 + x * 0.2);
          const carrier = noisy ? 0 : Math.exp(-carrierDist * carrierDist) * signal * 0.85 * wobble;
          const harmonic = noisy ? 0 : Math.exp(-harmonicDist * harmonicDist) * signal * 0.48;
          const ghost = Math.exp(-bleedDist * bleedDist) * bleed * 0.65;
          const floor = (0.08 + (1 - signal) * 0.38) * Math.random();
          v = Math.min(1, carrier + harmonic + ghost + floor);
        } else {
          v = Math.abs(u - 0.5) < 0.015 ? 0.22 : 0.03;
        }

        const p = x * 4;
        const boost = v > 0.78 ? (v - 0.78) / 0.22 : 0;
        data[p] = Math.min(255, Math.round(cr * v + (255 - cr) * boost * 0.65));
        data[p + 1] = Math.min(255, Math.round(cg * v + (255 - cg) * boost * 0.65));
        data[p + 2] = Math.min(255, Math.round(cb * v + (255 - cb) * boost * 0.65));
        data[p + 3] = Math.round(Math.min(1, 0.14 + v * 0.86) * 255);
      }

      fallCtx.putImageData(fallRow, 0, 0);
    };

    const drawFall = (now: number) => {
      if (running) pushWaterfallRow(now);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(fallCanvas, 0, 0, width, height);
      drawGraticule();
    };

    const drawSstv = (now: number, dtSec: number) => {
      ctx.clearRect(0, 0, width, height);
      if (!sstvCtx || !sstvImage) return;

      // Advance at ~12 scanlines/sec while playing (hold completed frame briefly before next cycle).
      if (running && dtSec > 0) {
        scanLine += dtSec * 12;
        if (scanLine >= SSTV_HEIGHT + 24) {
          scanLine = 0;
          sstvFrameIndex++;
          sstvCard = renderSstvCard(sstvTarget, sstvFrameIndex);
        }
      }

      const activeRow = running ? Math.min(SSTV_HEIGHT - 1, Math.floor(scanLine)) : Math.min(SSTV_HEIGHT - 1, Math.max(10, Math.floor(scanLine)));
      const progress = Math.min(1, (activeRow + 1) / SSTV_HEIGHT);
      const pct = Math.round(progress * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        setScanPct(pct);
      }
      if (progress >= 0.75 && !unlockedClue) {
        unlockedClue = true;
        setDecodedClue(sstvCard.clue);
      }

      const state = useBroadcast.getState();
      const signal = Math.max(0, Math.min(1, state.signal ?? 1));
      const noise = noisy ? 0.58 : Math.max(0, 1 - signal);
      const data = sstvImage.data;
      data.fill(0);

      for (let y = 0; y <= activeRow; y++) {
        // Horizontal sync jitter proportional to 1 - signal.
        const jitter =
          noise > 0.02
            ? Math.round((Math.sin(y * 1.9 + now * 0.012) * 0.6 + (Math.random() - 0.5)) * noise * 4)
            : 0;
        const cursorGlow = running && activeRow - y >= 0 && activeRow - y <= 2 ? (3 - (activeRow - y)) * 0.14 : 0;

        for (let x = 0; x < SSTV_WIDTH; x++) {
          const sx = Math.max(0, Math.min(SSTV_WIDTH - 1, x + jitter));
          let v = sstvCard.pixels[y * SSTV_WIDTH + sx]!;
          if (noise > 0.02 && Math.random() < noise * 0.35) {
            v = Math.max(0, Math.min(1, v + (Math.random() - 0.35) * noise * 0.75));
          }
          v = Math.min(1, v + cursorGlow);
          const idx = (y * SSTV_WIDTH + x) * 4;
          const peak = v > 0.85 ? (v - 0.85) / 0.15 : 0;
          data[idx] = Math.min(255, Math.round(cr * v + (255 - cr) * peak * 0.55));
          data[idx + 1] = Math.min(255, Math.round(cg * v + (255 - cg) * peak * 0.55));
          data[idx + 2] = Math.min(255, Math.round(cb * v + (255 - cb) * peak * 0.55));
          data[idx + 3] = v > 0.02 ? Math.round((0.25 + v * 0.75) * 255) : 32;
        }
      }

      sstvCtx.putImageData(sstvImage, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sstvCanvas, 0, 0, width, height);
      ctx.restore();

      // Bright moving scanline cursor.
      if (running && scanLine < SSTV_HEIGHT) {
        const cursorY = (activeRow / SSTV_HEIGHT) * height;
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillRect(0, cursorY, width, Math.max(1.5, height / SSTV_HEIGHT));
        ctx.restore();
      }
    };

    const draw = (now = performance.now(), dtSec = 0) => {
      if (width <= 0 || height <= 0) return;
      if (mode === 'fall') drawFall(now);
      else if (mode === 'sstv') drawSstv(now, dtSec);
      else drawWave(now);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mode === 'fall' && !running) pushWaterfallRow(performance.now());
      draw(performance.now(), 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!running) return () => observer.disconnect();
    const stop = onFrame((now) => {
      if (now - last < frameMs) return;
      const dtSec = last > 0 ? Math.min(0.25, (now - last) / 1000) : frameMs / 1000;
      last = now;
      draw(now, dtSec);
    });
    return () => {
      stop();
      observer.disconnect();
    };
  }, [running, color, reducedMotion, noisy, mode, sstvTarget]);

  const statusText =
    mode === 'sstv'
      ? decodedClue ?? (running ? `Scan ${scanPct}%` : 'SSTV Idle')
      : running
        ? mode === 'fall'
          ? 'Fall ▼'
          : 'Trig ▲'
        : 'Idle';

  return (
    <div className="scope" data-mode={mode}>
      <div
        className="scope-head"
        role="button"
        tabIndex={0}
        title="Cycle scope mode (V)"
        aria-label={`Scope mode ${mode.toUpperCase()}. Activate to cycle scope mode.`}
        onClick={() => act.cycleScope()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            act.cycleScope();
          }
        }}
      >
        <span className="scope-modes">
          {(['wave', 'fall', 'sstv'] as const).map((m) => (
            <span
              key={m}
              className="scope-pill"
              data-active={mode === m || undefined}
              onClick={(event) => {
                event.stopPropagation();
                if (mode === m) act.cycleScope();
                else act.setScope(m);
              }}
            >
              {m.toUpperCase()}
            </span>
          ))}
        </span>
        <span className="scope-status tabular" data-decoded={mode === 'sstv' && decodedClue ? 'true' : undefined}>
          {statusText}
        </span>
      </div>
      <canvas ref={ref} aria-hidden="true" onClick={() => act.cycleScope()} title="Cycle scope mode (V)" />
    </div>
  );
}
