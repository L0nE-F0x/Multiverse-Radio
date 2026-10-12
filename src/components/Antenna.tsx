import { useRef, type PointerEvent } from 'react';
import { useCabinetEvent } from '../hooks/useCabinetEvent';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import * as act from '../ui/actions';

const REST = 16;
const LIMIT = 58;

/**
 * A telescopic antenna with a tag that says not to wiggle it. Drag it and let go and
 * it boings back; click (or press Enter) to give it a flick. Wiggling "improves" the
 * reception for a while, as wiggling always has.
 */
export function Antenna() {
  const rodRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const drag = useRef<{ pointerId: number; pivotX: number; pivotY: number; angle: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const set = (angle: number) => {
    if (rodRef.current) rodRef.current.style.transform = `rotate(${REST + angle}deg)`;
  };

  const boing = (from: number) => {
    const rod = rodRef.current;
    if (!rod) return;
    set(0);
    if (reducedMotion) return;
    const frames: Keyframe[] = [];
    const n = 28;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      frames.push({ transform: `rotate(${REST + from * Math.exp(-3.6 * t) * Math.cos(t * Math.PI * 2 * 3.2)}deg)` });
    }
    rod.animate(frames, { duration: 1300, easing: 'linear' });
  };

  useCabinetEvent(['scan', 'smack', 'power'], (kind) => boing(kind === 'smack' ? 22 : kind === 'scan' ? -16 : 9));

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, pivotX: rect.left + rect.width / 2, pivotY: rect.bottom - 8, angle: 0, moved: false };
    rodRef.current?.getAnimations().forEach((a) => a.cancel());
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const raw = (Math.atan2(event.clientX - current.pivotX, current.pivotY - event.clientY) * 180) / Math.PI - REST;
    const angle = Math.max(-LIMIT, Math.min(LIMIT, raw));
    if (Math.abs(angle) > 4) current.moved = true;
    if (!current.moved) return;
    current.angle = angle;
    set(angle);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.moved) {
      suppressClick.current = true;
      boing(current.angle);
      act.wiggleAntenna();
    }
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    boing(26);
    act.wiggleAntenna();
  };

  return (
    <button
      type="button"
      className="antenna"
      aria-label="Wiggle the antenna"
      title="Do not wiggle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        boing(0);
      }}
      onClick={onClick}
    >
      <span ref={rodRef} className="antenna-rod" style={{ transform: `rotate(${REST}deg)` }} aria-hidden>
        <span className="antenna-seg antenna-seg-1" />
        <span className="antenna-seg antenna-seg-2" />
        <span className="antenna-seg antenna-seg-3" />
        <span className="antenna-foil" />
        <span className="antenna-tip" />
        <span className="antenna-tag">
          Do not
          <br />
          wiggle
        </span>
      </span>
      <span className="antenna-base" aria-hidden />
    </button>
  );
}
