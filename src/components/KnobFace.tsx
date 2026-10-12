import { useId, type ReactNode } from 'react';

const SIZE = 200;
export const KNOB_C = SIZE / 2;

export function polar(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: KNOB_C + radius * Math.sin(rad), y: KNOB_C - radius * Math.cos(rad) };
}

interface KnobFaceProps {
  /** Degrees, clockwise from 12 o'clock. */
  rotation: number;
  /** Glide time into the new angle. */
  glideMs: number;
  radius: number;
  /** Scale printed around the knob (not rotating). */
  scale?: ReactNode;
  /** Rotating part gets these handlers. */
  grip?: React.SVGProps<SVGGElement>;
  grabbing?: boolean;
  ridges?: number;
}

/** A chunky bakelite knob with a brass cap and a glowing pointer. Lighting stays put while it turns. */
export function KnobFace({ rotation, glideMs, radius, scale, grip, grabbing, ridges = 36 }: KnobFaceProps) {
  const id = useId().replace(/:/g, '');
  const pointerStart = polar(0, radius * 0.42);
  const pointerEnd = polar(0, radius * 0.86);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full touch-none select-none overflow-visible" aria-hidden>
      <defs>
        <radialGradient id={`${id}-body`} cx="50%" cy="35%" r="72%">
          <stop offset="0" stopColor="#4a3326" />
          <stop offset="0.65" stopColor="#24160f" />
          <stop offset="1" stopColor="#120a06" />
        </radialGradient>
        <linearGradient id={`${id}-sheen`} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id={`${id}-cap`} cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#f6dc9a" />
          <stop offset="0.45" stopColor="#c69a4a" />
          <stop offset="1" stopColor="#6b4a1c" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {scale}

      <circle cx={KNOB_C} cy={KNOB_C + 7} r={radius + 4} fill="#000" opacity={0.65} filter={`url(#${id}-shadow)`} />
      <circle cx={KNOB_C} cy={KNOB_C} r={radius + 7} fill="#120b07" stroke="rgb(255 220 170 / 0.12)" strokeWidth={1.5} />
      <g
        {...grip}
        className={grabbing ? 'cursor-grabbing' : 'cursor-grab'}
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${KNOB_C}px ${KNOB_C}px`,
          transition: `transform ${glideMs}ms cubic-bezier(0.2, 0.85, 0.25, 1)`,
        }}
      >
        <circle cx={KNOB_C} cy={KNOB_C} r={radius} fill={`url(#${id}-body)`} />
        {Array.from({ length: ridges }, (_, i) => {
          const angle = (i * 360) / ridges;
          const a = polar(angle, radius - 8);
          const b = polar(angle, radius - 0.5);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(0 0 0 / 0.55)" strokeWidth={2.4} />;
        })}
        <line
          x1={pointerStart.x}
          y1={pointerStart.y}
          x2={pointerEnd.x}
          y2={pointerEnd.y}
          strokeWidth={12}
          strokeLinecap="round"
          style={{ stroke: 'var(--accent)', opacity: 0.25 }}
        />
        <line
          x1={pointerStart.x}
          y1={pointerStart.y}
          x2={pointerEnd.x}
          y2={pointerEnd.y}
          strokeWidth={5}
          strokeLinecap="round"
          style={{ stroke: 'var(--accent)' }}
        />
      </g>
      <circle cx={KNOB_C} cy={KNOB_C} r={radius} fill={`url(#${id}-sheen)`} pointerEvents="none" />
      <circle cx={KNOB_C} cy={KNOB_C} r={radius * 0.3} fill={`url(#${id}-cap)`} stroke="rgb(0 0 0 / 0.6)" pointerEvents="none" />
      <circle cx={KNOB_C - radius * 0.08} cy={KNOB_C - radius * 0.1} r={radius * 0.09} fill="#fff" opacity={0.35} pointerEvents="none" />
    </svg>
  );
}
