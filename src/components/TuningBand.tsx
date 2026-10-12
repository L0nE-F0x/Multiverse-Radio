import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useCabinetEvent } from '../hooks/useCabinetEvent';
import * as act from '../ui/actions';
import { BAND_MAX, BAND_MIN, bandFrequency, bandPosition, dialName, nearestStation } from '../ui/dial';
import { formatFrequency } from '../ui/format';
import { useStationIndex, useStations, useStatus } from '../ui/select';
import * as sfx from '../ui/sfx';

interface Drag {
  pointerId: number;
  startX: number;
  moved: boolean;
  nearest: number;
  overtravelled: boolean;
}

/**
 * The backlit slide-rule dial: every station printed on the glass at its frequency, and
 * a needle you can drag. It's the accessible tuning control (a slider over stations);
 * the big knob is a pointer-only extra.
 */
export function TuningBand() {
  const stations = useStations();
  const index = useStationIndex();
  const status = useStatus();
  const station = stations[index]!;
  const printRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<{ position: number; nearest: number } | null>(null);
  const [sweep, setSweep] = useState<'tune' | 'scan'>('tune');
  const previousPosition = useRef(bandPosition(station.frequency));

  useCabinetEvent(['scan', 'tune'], (kind) => setSweep(kind === 'scan' ? 'scan' : 'tune'));

  const ticks = useMemo(() => {
    const out: { f: number; major: boolean }[] = [];
    for (let f = Math.ceil(BAND_MIN * 2) / 2; f <= BAND_MAX + 0.001; f += 0.5) out.push({ f, major: f % 2 === 0 });
    return out;
  }, []);

  const position = drag ? drag.position : bandPosition(station.frequency);
  // Heavy needle: the further it goes, the longer the glide.
  const travel = Math.abs(position - previousPosition.current);
  useEffect(() => {
    previousPosition.current = position;
  });
  const needleMs = drag ? 0 : sweep === 'scan' ? 1000 : Math.round(260 + travel * 1300);

  const read = (event: PointerEvent) => {
    const rect = printRef.current!.getBoundingClientRect();
    const raw = (event.clientX - rect.left) / rect.width;
    const clamped = Math.min(1, Math.max(0, raw));
    return { raw, clamped, nearest: nearestStation(stations, bandFrequency(clamped)) };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    sfx.unlock();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { clamped, nearest } = read(event);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, moved: false, nearest, overtravelled: false };
    setDrag({ position: clamped, nearest });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.abs(event.clientX - current.startX) < 4) return;
    current.moved = true;
    const { raw, clamped, nearest } = read(event);
    if (nearest !== current.nearest) {
      current.nearest = nearest;
      sfx.tick(0.35);
      navigator.vibrate?.(3);
    }
    if (!current.overtravelled && (raw < -0.04 || raw > 1.04)) {
      current.overtravelled = true;
      act.overtravel(raw > 1 ? 1 : -1);
    }
    setDrag({ position: clamped, nearest });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    const target = stations[current.nearest];
    if (target) act.tune(target.id);
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = stations.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      PageUp: index + 5,
      PageDown: index - 5,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    if (target > last || target < 0) {
      if (!event.repeat) act.overtravel(target > last ? 1 : -1);
      return;
    }
    act.tune(stations[target]!.id);
  };

  const highlighted = drag ? drag.nearest : index;

  return (
    <div className="band" data-on={status !== 'off'} data-status={status}>
      <div
        className="band-glass"
        role="slider"
        tabIndex={0}
        aria-label="Tuning dial"
        aria-orientation="horizontal"
        aria-valuemin={stations[0]!.frequency}
        aria-valuemax={stations[stations.length - 1]!.frequency}
        aria-valuenow={station.frequency}
        aria-valuetext={`${station.name}, ${formatFrequency(station)} megahertz`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        <div ref={printRef} className="band-print" aria-hidden>
          <span className="band-unit">MHz</span>
          {ticks.map(({ f, major }) => (
            <span key={f} className="band-tick" data-major={major} style={{ left: `${bandPosition(f) * 100}%` }}>
              {major && <span className="band-number">{f}</span>}
            </span>
          ))}
          {stations.map((s, i) => (
            <span
              key={s.id}
              className="band-station"
              data-active={i === highlighted}
              style={{ left: `${bandPosition(s.frequency) * 100}%`, '--ch': s.color } as CSSProperties}
            >
              <span className="band-dot" />
              <span className="band-label">{dialName(s)}</span>
            </span>
          ))}
          <div
            className="band-needle"
            data-sweep={sweep}
            style={{ left: `${position * 100}%`, transitionDuration: `${needleMs}ms` }}
          >
            {drag && <span className="band-bubble">{stations[drag.nearest]!.name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
