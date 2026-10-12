import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { channelFrequency, type Channel } from '../lib/channels';

const SIZE = 260;
const C = SIZE / 2;
const KNOB_R = 70;
/** How far past the end stops the knob gives before resisting completely. */
const OVERTRAVEL = 16;

interface ChannelKnobProps {
  channels: Channel[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** A detent was crossed mid-drag. */
  onTick: () => void;
  /** The knob was touched; a chance to unlock audio inside the gesture. */
  onGrab: () => void;
}

interface Drag {
  pointerId: number;
  lastPointerAngle: number;
  start: number;
  raw: number;
  moved: boolean;
  detent: number;
  samples: { t: number; angle: number }[];
}

/** Detent angles in degrees, clockwise from 12 o'clock, spread over at most 270°. */
function detentAngles(count: number): number[] {
  if (count <= 1) return [0];
  const sweep = Math.min(270, (count - 1) * 60);
  return Array.from({ length: count }, (_, i) => -sweep / 2 + (i * sweep) / (count - 1));
}

function polar(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: C + radius * Math.sin(rad), y: C - radius * Math.cos(rad) };
}

function nearestIndex(angles: number[], value: number): number {
  let best = 0;
  angles.forEach((angle, i) => {
    if (Math.abs(angle - value) < Math.abs(angles[best]! - value)) best = i;
  });
  return best;
}

export function ChannelKnob({ channels, activeIndex, onSelect, onTick, onGrab }: ChannelKnobProps) {
  const reducedMotion = usePrefersReducedMotion();
  const angles = useMemo(() => detentAngles(channels.length), [channels.length]);
  const min = angles[0]!;
  const max = angles[angles.length - 1]!;

  const surfaceRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragAngle, setDragAngle] = useState<number | null>(null);

  const rotation = dragAngle ?? angles[activeIndex] ?? 0;
  // Heavy knob: the longer the travel, the longer the glide into the detent.
  const previousRotation = useRef(rotation);
  const travel = Math.abs(rotation - previousRotation.current);
  const glideMs = dragAngle !== null ? 0 : reducedMotion ? 100 : Math.min(950, 360 + travel * 2.4);
  useEffect(() => {
    previousRotation.current = rotation;
  });

  const ticks = useMemo(() => {
    const result: number[] = [];
    for (let a = min - 12; a <= max + 12.01; a += 6) result.push(a);
    return result;
  }, [min, max]);

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
    if (Math.hypot(x, y) < 8) return null; // too close to the axis to read an angle
    return (Math.atan2(x, -y) * 180) / Math.PI;
  };

  const handlePointerDown = (event: PointerEvent<SVGGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const angle = pointerAngle(event);
    if (angle === null) return;
    onGrab();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = angles[activeIndex] ?? 0;
    dragRef.current = {
      pointerId: event.pointerId,
      lastPointerAngle: angle,
      start,
      raw: start,
      moved: false,
      detent: activeIndex,
      samples: [{ t: event.timeStamp, angle: start }],
    };
  };

  const handlePointerMove = (event: PointerEvent<SVGGElement>) => {
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
      onTick();
    }
    drag.samples.push({ t: event.timeStamp, angle: shown });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0]!.t > 90) drag.samples.shift();
    setDragAngle(shown);
  };

  const handlePointerUp = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    if (!drag.moved) {
      // A tap nudges the knob to the next station.
      setDragAngle(null);
      onSelect((activeIndex + 1) % channels.length);
      return;
    }

    // Let it coast: project the release velocity forward, then settle on a detent.
    const shown = rubberBand(drag.raw);
    const first = drag.samples[0]!;
    const velocity = (shown - first.angle) / Math.max(16, event.timeStamp - first.t);
    const projected = Math.min(max, Math.max(min, shown + velocity * 180));
    const index = nearestIndex(angles, projected);
    setDragAngle(null);
    if (index !== activeIndex) onSelect(index);
    else onTick();
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setDragAngle(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = channels.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: activeIndex + 1,
      ArrowUp: activeIndex + 1,
      PageUp: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      ArrowDown: activeIndex - 1,
      PageDown: activeIndex - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const index = Math.min(last, Math.max(0, target));
    if (index !== activeIndex) onSelect(index);
  };

  const active = channels[activeIndex];
  const pointerStart = polar(0, 27);
  const pointerEnd = polar(0, KNOB_R - 13);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Channel dial"
      aria-orientation="horizontal"
      aria-valuemin={1}
      aria-valuemax={channels.length}
      aria-valuenow={activeIndex + 1}
      aria-valuetext={active ? `${active.name}, ${channelFrequency(activeIndex)} megahertz` : undefined}
      onKeyDown={handleKeyDown}
      className="relative aspect-square w-full max-w-[210px] rounded-full outline-offset-4 xl:max-w-[225px]"
    >
      <svg ref={surfaceRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full touch-none select-none" aria-hidden>
        <defs>
          <radialGradient id="mvr-knob-body" cx="50%" cy="38%" r="70%">
            <stop offset="0" stopColor="#30271f" />
            <stop offset="0.7" stopColor="#17120e" />
            <stop offset="1" stopColor="#0c0907" />
          </radialGradient>
          <linearGradient id="mvr-knob-sheen" x1="0.15" y1="0.1" x2="0.85" y2="0.95">
            <stop offset="0" stopColor="#fff" stopOpacity="0.13" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="mvr-knob-cap" cx="40%" cy="32%" r="75%">
            <stop offset="0" stopColor="#4a3d31" />
            <stop offset="1" stopColor="#15110d" />
          </radialGradient>
          <radialGradient id="mvr-knob-skirt" cx="50%" cy="50%" r="50%">
            <stop offset="0.82" stopColor="#0b0907" />
            <stop offset="0.97" stopColor="#1d1712" />
            <stop offset="1" stopColor="#0b0907" />
          </radialGradient>
          <filter id="mvr-knob-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* Scale */}
        {ticks.map((angle) => {
          const a = polar(angle, 97);
          const b = polar(angle, 102);
          return <line key={angle} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(240 230 210 / 0.16)" strokeWidth={1} />;
        })}
        {angles.map((angle, i) => {
          const isActive = i === activeIndex;
          const a = polar(angle, 92);
          const b = polar(angle, 104);
          const label = polar(angle, 116);
          return (
            <g key={channels[i]!.id}>
              {isActive && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={7} strokeLinecap="round" style={{ stroke: 'var(--accent)', opacity: 0.25 }} />
              )}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={2.2}
                strokeLinecap="round"
                style={{ stroke: isActive ? 'var(--accent)' : 'rgb(240 230 210 / 0.4)', transition: 'stroke 0.4s ease' }}
              />
              <g className="cursor-pointer" onClick={() => onSelect(i)}>
                <circle cx={label.x} cy={label.y} r={13} fill="transparent" />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono"
                  fontSize={11}
                  fontWeight={isActive ? 600 : 400}
                  style={{ fill: isActive ? 'var(--accent)' : 'rgb(240 230 210 / 0.45)', transition: 'fill 0.4s ease' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </text>
              </g>
            </g>
          );
        })}

        {/* Knob */}
        <circle cx={C} cy={C + 6} r={KNOB_R + 6} fill="#000" opacity={0.6} filter="url(#mvr-knob-shadow)" />
        <circle cx={C} cy={C} r={KNOB_R + 8} fill="url(#mvr-knob-skirt)" stroke="rgb(255 230 200 / 0.06)" />
        <g
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          className={dragAngle !== null ? 'cursor-grabbing' : 'cursor-grab'}
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: `transform ${glideMs}ms cubic-bezier(0.2, 0.85, 0.25, 1)`,
          }}
        >
          <circle cx={C} cy={C} r={KNOB_R} fill="url(#mvr-knob-body)" />
          {Array.from({ length: 60 }, (_, i) => {
            const angle = i * 6;
            const a = polar(angle, KNOB_R - 7);
            const b = polar(angle, KNOB_R - 0.5);
            const h1 = polar(angle + 1.6, KNOB_R - 7);
            const h2 = polar(angle + 1.6, KNOB_R - 0.5);
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(0 0 0 / 0.65)" strokeWidth={2} />
                <line x1={h1.x} y1={h1.y} x2={h2.x} y2={h2.y} stroke="rgb(255 235 210 / 0.07)" strokeWidth={1} />
              </g>
            );
          })}
          {/* Pointer, with a soft glow drawn as a wider translucent stroke. */}
          <line
            x1={pointerStart.x}
            y1={pointerStart.y}
            x2={pointerEnd.x}
            y2={pointerEnd.y}
            strokeWidth={11}
            strokeLinecap="round"
            style={{ stroke: 'var(--accent)', opacity: 0.22 }}
          />
          <line
            x1={pointerStart.x}
            y1={pointerStart.y}
            x2={pointerEnd.x}
            y2={pointerEnd.y}
            strokeWidth={4.5}
            strokeLinecap="round"
            style={{ stroke: 'var(--accent)' }}
          />
        </g>
        {/* Lighting stays put while the knob turns underneath it. */}
        <circle cx={C} cy={C} r={KNOB_R} fill="url(#mvr-knob-sheen)" pointerEvents="none" />
        <circle cx={C} cy={C} r={21} fill="url(#mvr-knob-cap)" stroke="rgb(0 0 0 / 0.7)" pointerEvents="none" />
        <circle cx={C - 5} cy={C - 7} r={6} fill="#fff" opacity={0.06} pointerEvents="none" />
      </svg>
    </div>
  );
}
