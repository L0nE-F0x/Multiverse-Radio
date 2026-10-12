import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useBroadcast } from '../broadcast/store';
import * as act from '../ui/actions';
import * as sfx from '../ui/sfx';
import { KnobFace, polar } from './KnobFace';
import { VolumeIcon } from './Icons';

const SWEEP = 270;
const RADIUS = 60;

/** Mute toggle that sits beside the volume knob. */
export function MuteToggle() {
  const volume = useBroadcast((s) => s.volume);
  const muted = useBroadcast((s) => s.muted);
  const audible = muted ? 0 : volume;
  const level = audible === 0 ? 'muted' : audible < 0.5 ? 'low' : 'high';
  return (
    <button
      type="button"
      className="mini-key"
      onClick={act.toggleMute}
      aria-pressed={muted}
      aria-keyshortcuts="M"
      aria-label="Mute"
      data-on={muted}
      title="Mute (M)"
    >
      <VolumeIcon level={level} className="h-4 w-4" />
      <span className="mini-key-label">{muted ? 'Muted' : 'Mute'}</span>
    </button>
  );
}

/** Volume knob: drag up or right, scroll, or use the arrow keys. */
export function VolumeKnob() {
  const volume = useBroadcast((s) => s.volume);
  const muted = useBroadcast((s) => s.muted);
  return <VolumeDial value={muted ? 0 : volume} />;
}

function VolumeDial({ value }: { value: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; start: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rotation = -SWEEP / 2 + value * SWEEP;
  const setVolume = (v: number) => useBroadcast.getState().setVolume(Math.min(1, Math.max(0, v)));

  // Wheel needs a non-passive listener to stop the page scrolling under the knob.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      act.nudgeVolume(event.deltaY < 0 ? 0.04 : -0.04);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<SVGGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    sfx.unlock();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: value };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<SVGGElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const delta = (event.clientX - current.x - (event.clientY - current.y)) / 160;
    setVolume(current.start + delta);
  };

  const onPointerEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 };
    if (event.key === 'Home') setVolume(0);
    else if (event.key === 'End') setVolume(1);
    else if (steps[event.key] !== undefined) act.nudgeVolume(steps[event.key]!);
    else return;
    event.preventDefault();
  };

  const dots = Array.from({ length: 11 }, (_, i) => -SWEEP / 2 + (i * SWEEP) / 10);
  const scale = (
    <g>
      {dots.map((angle, i) => {
        const p = polar(angle, RADIUS + 17);
        const lit = i / 10 <= value + 0.001 && value > 0;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === 0 || i === 10 ? 3.2 : 2.4}
            style={{ fill: lit ? 'var(--accent)' : 'rgb(240 225 200 / 0.25)', transition: 'fill 0.2s ease' }}
          />
        );
      })}
      <text x={polar(-SWEEP / 2, RADIUS + 36).x + 4} y={polar(-SWEEP / 2, RADIUS + 36).y + 10} textAnchor="middle" className="knob-scale-text">
        shh
      </text>
      <text x={polar(SWEEP / 2, RADIUS + 36).x - 6} y={polar(SWEEP / 2, RADIUS + 36).y + 10} textAnchor="middle" className="knob-scale-text">
        neighbours
      </text>
    </g>
  );

  return (
    <div
      ref={ref}
      className="knob knob-volume"
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={value === 0 ? 'Silent' : `${Math.round(value * 100)}%`}
      onKeyDown={onKeyDown}
      title="Volume · drag, scroll or use the arrow keys"
    >
      <KnobFace
        rotation={rotation}
        glideMs={dragging ? 0 : 160}
        radius={RADIUS}
        scale={scale}
        grabbing={dragging}
        ridges={30}
        grip={{ onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onLostPointerCapture: onPointerEnd }}
      />
    </div>
  );
}
