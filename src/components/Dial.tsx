import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useBroadcast } from '../broadcast/store';
import { DIAL } from '../broadcast/types';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import * as act from '../ui/actions';
import { BAND_LABEL, bandOf, dialMarkers, inMainBand, inOuterBand, MAIN_HI, MAIN_LO, OUTER_HI, snapMhz, type DialMarker } from '../ui/dial';
import { formatMhz } from '../ui/format';
import { PHOSPHOR } from '../ui/phosphor';
import { useShipLog } from '../ui/shiplog';
import { useSource, useStatus, useTuned } from '../ui/select';
import { holdDial, moveDial, nudgeDial, useTuning } from '../ui/tuning';
import { linkStatus, SignalMeter } from './SignalMeter';

const SPAN = DIAL.max - DIAL.min;
/** Pixels per MHz on the scale, by the width of the band window. The phone strip is tighter. */
const scaleFor = (width: number, strip: boolean) => (strip ? 96 : width < 520 ? 140 : width < 900 ? 165 : 190);
/** A release faster than this (px/ms) on the phone strip steps to the next station. */
const FLICK = 0.55;

/**
 * The fine-tuning dial: a frequency scale that slides under a fixed needle. Drag it, flick
 * it, scroll it or arrow-key it in 0.05 MHz steps; markers show the stations (and anything
 * secret or pirate this listener has found). Above the main band, the Outer Band; beyond
 * both, the deep band.
 *
 * `strip` is the phone mini-player's thin version: just the scale and needle. Drag to
 * fine-tune; a flick steps to the next or previous station instead of gliding.
 */
export function Dial({ variant = 'full' }: { variant?: 'full' | 'strip' }) {
  const strip = variant === 'strip';
  const stations = useBroadcast((s) => s.stations);
  const discovered = useBroadcast((s) => s.discovered);
  const pirates = useShipLog((s) => s.pirates);
  const stored = useBroadcast((s) => s.frequency);
  const signal = useBroadcast((s) => s.signal);
  const pending = useTuning((s) => s.pending);
  const status = useStatus();
  const tuned = useTuned();
  const source = useSource();
  const reducedMotion = usePrefersReducedMotion();

  const shown = pending ?? stored;
  const markers = useMemo(() => dialMarkers(stations, discovered, pirates), [stations, discovered, pirates]);
  const tunedId = tuned.kind === 'station' || tuned.kind === 'pirate' ? tuned.station.id : null;

  const windowRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const ppm = scaleFor(width, strip);

  // Drag state lives in refs: the strip follows the pointer without re-rendering.
  const drag = useRef<{
    id: number;
    x0: number;
    f0: number;
    moved: boolean;
    samples: { x: number; t: number }[];
  } | null>(null);
  const glide = useRef(0);
  const [held, setHeld] = useState(false);

  useLayoutEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const place = (mhz: number, animate: boolean) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.style.transition = animate && !reducedMotion ? '' : 'none';
    strip.style.transform = `translate3d(${(-(mhz - DIAL.min) * ppm).toFixed(1)}px,0,0)`;
  };

  // Follow the store / pending value whenever the hand isn't on the dial.
  useLayoutEffect(() => {
    if (!held) place(shown, true);
  });

  // Wheel and trackpad: needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const delta = event.deltaMode === 1 ? raw * 40 : event.deltaMode === 2 ? raw * 400 : raw;
      const coarse = event.shiftKey ? 10 : 1;
      let steps: number;
      if (Math.abs(delta) >= 50) {
        steps = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 100));
        acc = 0;
      } else {
        acc += delta;
        steps = Math.trunc(acc / 18);
        acc -= steps * 18;
      }
      if (steps) nudgeDial(steps * coarse * DIAL.step);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => cancelAnimationFrame(glide.current), []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    cancelAnimationFrame(glide.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x0: event.clientX, f0: shownNow(), moved: false, samples: [{ x: event.clientX, t: event.timeStamp }] };
    setHeld(true);
    holdDial(true);
  };

  const shownNow = () => useTuning.getState().pending ?? useBroadcast.getState().frequency;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    d.samples.push({ x: event.clientX, t: event.timeStamp });
    if (d.samples.length > 6) d.samples.shift();
    const f = clamp(d.f0 - dx / ppm);
    place(f, false);
    moveDial(f);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      // A tap: on a marker, tune that station; elsewhere, tune where you tapped.
      const marker = (event.target as HTMLElement).closest<HTMLElement>('[data-marker]');
      endHold();
      const hit = marker ? markers.find((m) => m.id === marker.dataset.marker) : undefined;
      if (hit?.kind === 'station' || hit?.kind === 'secret') act.tune(hit.id);
      else if (hit) act.tuneFrequency(hit.frequency);
      else {
        const rect = windowRef.current!.getBoundingClientRect();
        moveDial(d.f0 + (event.clientX - (rect.left + rect.width / 2)) / ppm, { flush: true });
      }
      return;
    }
    // A flick keeps the scale gliding for a moment, like a weighted tuning knob.
    const first = d.samples[0]!;
    const last = d.samples[d.samples.length - 1]!;
    const dt = Math.max(1, last.t - first.t);
    const velocity = event.timeStamp - last.t > 80 ? 0 : (last.x - first.x) / dt; // px/ms
    const start = clamp(d.f0 - (last.x - d.x0) / ppm);
    if (strip && Math.abs(velocity) >= FLICK) {
      // Dragging the scale left moves up the dial: a flick left is the next station.
      endHold();
      act.step(velocity < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(velocity) < 0.25 || reducedMotion) {
      moveDial(start, { flush: true });
      endHold();
      return;
    }
    const tau = 280;
    const travel = (velocity * tau) / ppm;
    const t0 = performance.now();
    const step = () => {
      const t = performance.now() - t0;
      const f = clamp(start - travel * (1 - Math.exp(-t / tau)));
      place(f, false);
      if (t < tau * 4) {
        moveDial(f);
        glide.current = requestAnimationFrame(step);
      } else {
        moveDial(f, { flush: true });
        endHold();
      }
    };
    glide.current = requestAnimationFrame(step);
  };

  const endHold = () => {
    setHeld(false);
    holdDial(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const dir = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (dir && (event.shiftKey || event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (!event.repeat) act.step(dir);
    } else if (dir) nudgeDial(dir * DIAL.step);
    else if (event.key === 'PageUp' || event.key === 'PageDown') nudgeDial(event.key === 'PageUp' ? 1 : -1);
    else if (event.key === 'Home') moveDial(DIAL.min, { flush: true });
    else if (event.key === 'End') moveDial(DIAL.max, { flush: true });
    else return;
    event.preventDefault();
  };

  const band = bandOf(shown);
  const deep = band === 'deep';
  const link = linkStatus(status, tuned.kind, signal);
  const valueText = `${formatMhz(shown)} MHz, ${tuned.kind === 'static' ? 'no signal' : `${source.name}${tuned.kind === 'pirate' ? ' (pirate)' : ''}`}${band === 'main' ? '' : `, ${BAND_LABEL[band].toLowerCase()}`}`;

  const tuner = (
    <div
      ref={windowRef}
      className="dial-window"
      role="slider"
      tabIndex={0}
      aria-label={strip ? 'Tuning strip' : 'Fine tuning'}
      aria-orientation="horizontal"
      aria-valuemin={DIAL.min}
      aria-valuemax={DIAL.max}
      aria-valuenow={Number(formatMhz(shown))}
      aria-valuetext={valueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      style={{ '--ppm': `${ppm}px` } as CSSProperties}
    >
      <div ref={stripRef} className="dial-strip" style={{ width: SPAN * ppm }}>
        <Scale ppm={ppm} markers={markers} tunedId={tunedId} />
      </div>
      <div className="dial-needle" aria-hidden>
        <span className="dial-needle-tag tabular">{formatMhz(shown)}</span>
      </div>
    </div>
  );

  if (strip) {
    return (
      <div className="dial dial-mini" data-band={band} data-deep={deep} data-held={held}>
        {tuner}
      </div>
    );
  }

  return (
    <div className="dial" data-band={band} data-deep={deep} data-held={held}>
      <div className="dial-readout">
        <span className="dial-label">Freq</span>
        <span className="dial-freq tabular">
          {formatMhz(shown)}
          <small>MHz</small>
        </span>
        <span className="dial-band">{BAND_LABEL[band]}</span>
      </div>

      <button type="button" className="dial-step" onClick={() => act.step(-1)} aria-label="Previous station">
        <span aria-hidden>◂</span>
      </button>

      {tuner}

      <button type="button" className="dial-step" onClick={() => act.step(1)} aria-label="Next station">
        <span aria-hidden>▸</span>
      </button>

      <div className="dial-signal" data-tone={link.tone}>
        <span className="dial-label">Signal</span>
        <SignalMeter signal={signal} bars={8} lit={status === 'playing' && tuned.kind !== 'static'} className="meter-lg" />
        <span className="dial-signal-code">{link.code}</span>
      </div>

      <BandMap frequency={shown} markers={markers} />
    </div>
  );
}

const clamp = (mhz: number) => Math.min(DIAL.max, Math.max(DIAL.min, mhz));

/** The printed scale: band regions, graduations, numbers, the carrier landscape and markers. */
const Scale = memo(function Scale({ ppm, markers, tunedId }: { ppm: number; markers: DialMarker[]; tunedId: string | null }) {
  const numbers = useMemo(() => {
    const out: number[] = [];
    for (let f = Math.ceil(DIAL.min); f <= DIAL.max; f++) out.push(f);
    return out;
  }, []);
  const x = (mhz: number) => (mhz - DIAL.min) * ppm;
  const landscape = useMemo(() => carrierPath(markers), [markers]);

  return (
    <>
      <div className="dial-region dial-region-deep" style={{ left: 0, width: x(MAIN_LO) }} />
      <div className="dial-region dial-region-main" style={{ left: x(MAIN_LO), width: x(MAIN_HI) - x(MAIN_LO) }} />
      <div className="dial-region dial-region-outer" style={{ left: x(MAIN_HI), width: x(OUTER_HI) - x(MAIN_HI) }} />
      <div className="dial-region dial-region-deep" style={{ left: x(OUTER_HI), width: x(DIAL.max) - x(OUTER_HI) }} />
      <span className="dial-edge" style={{ left: x(MAIN_LO) }}>
        ◂ Deep band
      </span>
      <span className="dial-edge dial-edge-end dial-edge-outer" style={{ left: x(MAIN_HI) }}>
        Outer band ▸
      </span>
      <span className="dial-edge dial-edge-end" style={{ left: x(OUTER_HI) }}>
        Deep band ▸
      </span>
      <svg className="dial-carrier" viewBox={`${DIAL.min} 0 ${SPAN} 1`} preserveAspectRatio="none" aria-hidden>
        <path d={landscape} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="dial-ticks" />
      {numbers.map((f) => (
        <span key={f} className="dial-number" data-deep={!inMainBand(f) && !inOuterBand(f)} style={{ left: x(f) }}>
          {f}
        </span>
      ))}
      {markers.map((m, i) => (
        <span
          key={m.id}
          className="dial-marker"
          data-marker={m.id}
          data-kind={m.kind}
          data-row={i % 2}
          data-tuned={m.id === tunedId}
          data-drift={m.drift || undefined}
          style={{ left: x(m.frequency), '--mk': PHOSPHOR[m.phosphor] } as CSSProperties}
        >
          <span className="dial-marker-label">{m.label}</span>
        </span>
      ))}
    </>
  );
});

/**
 * A faint spectrum trace along the scale: a carrier peak at every known station over a
 * gently uneven noise floor. In MHz units (the SVG stretches to the strip).
 */
function carrierPath(markers: DialMarker[]): string {
  const step = DIAL.step;
  const points: string[] = [];
  let seed = 0x2f6b9a1d;
  for (let f = DIAL.min; f <= DIAL.max + 1e-6; f += step) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    let level = 0.06 + ((seed >>> 0) / 4294967296) * (inMainBand(f) || inOuterBand(f) ? 0.07 : 0.12);
    for (const m of markers) {
      const d = (f - m.frequency) / 0.11;
      if (Math.abs(d) < 4) level = Math.max(level, Math.exp(-d * d) * (m.kind === 'station' ? 0.92 : 0.7));
    }
    points.push(`${f.toFixed(2)} ${(1 - level).toFixed(3)}`);
  }
  return `M${points.join('L')}`;
}

/** The whole dial in miniature: where the main and outer bands sit and where the needle is. */
function BandMap({ frequency, markers }: { frequency: number; markers: DialMarker[] }) {
  const pct = (mhz: number) => `${(((mhz - DIAL.min) / SPAN) * 100).toFixed(3)}%`;
  return (
    <div className="bandmap" aria-hidden>
      <span className="bandmap-label">{DIAL.min}</span>
      <div className="bandmap-track">
        <span className="bandmap-main" style={{ left: pct(MAIN_LO), width: `${((MAIN_HI - MAIN_LO) / SPAN) * 100}%` }} />
        <span className="bandmap-outer" style={{ left: pct(MAIN_HI), width: `${((OUTER_HI - MAIN_HI) / SPAN) * 100}%` }} />
        {markers.map((m) => (
          <span key={m.id} className="bandmap-dot" data-kind={m.kind} style={{ left: pct(m.frequency) }} />
        ))}
        <span className="bandmap-needle" style={{ left: pct(snapMhz(frequency)) }} />
      </div>
      <span className="bandmap-label">{DIAL.max}</span>
    </div>
  );
}
