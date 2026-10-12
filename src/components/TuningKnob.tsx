import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import * as act from '../ui/actions';
import { useStationIndex, useStations } from '../ui/select';
import * as sfx from '../ui/sfx';
import { KnobFace, polar } from './KnobFace';

const SWEEP = 300;
const RADIUS = 66;
/** How far past the end stops the knob gives before resisting completely. */
const OVERTRAVEL = 18;

interface Drag {
  pointerId: number;
  lastPointerAngle: number;
  start: number;
  raw: number;
  moved: boolean;
  detent: number;
  overtravelled: boolean;
  samples: { t: number; angle: number }[];
}

function nearestIndex(angles: number[], value: number): number {
  let best = 0;
  angles.forEach((angle, i) => {
    if (Math.abs(angle - value) < Math.abs(angles[best]! - value)) best = i;
  });
  return best;
}

/**
 * The big heavy tuning knob: drag it round and it clicks through every station, coasts
 * on release and settles into a detent. Tap it to go up one station. Pointer-only; the
 * tuning band is the keyboard and screen-reader control for the same thing.
 */
export function TuningKnob() {
  const stations = useStations();
  const activeIndex = useStationIndex();
  const reducedMotion = usePrefersReducedMotion();
  const angles = useMemo(
    () => stations.map((_, i) => -SWEEP / 2 + (i * SWEEP) / Math.max(1, stations.length - 1)),
    [stations],
  );
  const min = angles[0]!;
  const max = angles[angles.length - 1]!;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragAngle, setDragAngle] = useState<number | null>(null);

  const rotation = dragAngle ?? angles[activeIndex] ?? 0;
  const previousRotation = useRef(rotation);
  const travel = Math.abs(rotation - previousRotation.current);
  const glideMs = dragAngle !== null ? 0 : reducedMotion ? 80 : Math.min(950, 320 + travel * 2.6);
  useEffect(() => {
    previousRotation.current = rotation;
  });

  const rubberBand = (value: number) => {
    const resist = (over: number) => OVERTRAVEL * (1 - Math.exp(-over / 28));
    if (value < min) return min - resist(min - value);
    if (value > max) return max + resist(value - max);
    return value;
  };

  const pointerAngle = (event: PointerEvent): number | null => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(x, y) < 6) return null;
    return (Math.atan2(x, -y) * 180) / Math.PI;
  };

  const onPointerDown = (event: PointerEvent<SVGGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const angle = pointerAngle(event);
    if (angle === null) return;
    sfx.unlock();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = angles[activeIndex] ?? 0;
    dragRef.current = {
      pointerId: event.pointerId,
      lastPointerAngle: angle,
      start,
      raw: start,
      moved: false,
      detent: activeIndex,
      overtravelled: false,
      samples: [{ t: event.timeStamp, angle: start }],
    };
  };

  const onPointerMove = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const angle = pointerAngle(event);
    if (angle === null) return;
    let delta = angle - drag.lastPointerAngle;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    drag.lastPointerAngle = angle;
    drag.raw += delta;
    if (!drag.moved && Math.abs(drag.raw - drag.start) < 4) return;
    drag.moved = true;

    const shown = rubberBand(drag.raw);
    const detent = nearestIndex(angles, shown);
    if (detent !== drag.detent) {
      drag.detent = detent;
      sfx.tick(0.5);
      navigator.vibrate?.(4);
    }
    if (!drag.overtravelled && (drag.raw > max + 40 || drag.raw < min - 40)) {
      drag.overtravelled = true;
      act.overtravel(drag.raw > max ? 1 : -1);
    }
    drag.samples.push({ t: event.timeStamp, angle: shown });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0]!.t > 90) drag.samples.shift();
    setDragAngle(shown);
  };

  const onPointerUp = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) {
      setDragAngle(null);
      sfx.tick(0.5);
      act.step(1);
      return;
    }
    // Let it coast: project the release velocity forward, then settle on a detent.
    const shown = rubberBand(drag.raw);
    const first = drag.samples[0]!;
    const velocity = (shown - first.angle) / Math.max(16, event.timeStamp - first.t);
    const projected = Math.min(max, Math.max(min, shown + velocity * 180));
    const index = nearestIndex(angles, projected);
    setDragAngle(null);
    if (index !== activeIndex) act.tune(stations[index]!.id);
    else sfx.tick(0.4);
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setDragAngle(null);
  };

  const scale = (
    <g>
      {angles.map((angle, i) => {
        const a = polar(angle, RADIUS + 13);
        const b = polar(angle, RADIUS + (i === activeIndex ? 24 : 19));
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={i === activeIndex ? 3.5 : 2}
            strokeLinecap="round"
            style={{
              stroke: i === activeIndex ? 'var(--accent)' : 'rgb(240 225 200 / 0.35)',
              transition: 'stroke 0.4s ease',
            }}
          />
        );
      })}
      <text x={polar(min, RADIUS + 34).x} y={polar(min, RADIUS + 34).y + 4} textAnchor="middle" className="knob-scale-text">
        LO
      </text>
      <text x={polar(max, RADIUS + 34).x} y={polar(max, RADIUS + 34).y + 4} textAnchor="middle" className="knob-scale-text">
        HI
      </text>
    </g>
  );

  return (
    <div ref={surfaceRef} className="knob knob-tuning" title="Drag to tune · tap for the next station">
      <KnobFace
        rotation={rotation}
        glideMs={glideMs}
        radius={RADIUS}
        scale={scale}
        grabbing={dragAngle !== null}
        ridges={40}
        grip={{
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel,
          onLostPointerCapture: onPointerCancel,
        }}
      />
    </div>
  );
}
