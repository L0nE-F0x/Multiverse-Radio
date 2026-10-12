import { memo, type ReactNode } from 'react';
import { hash, rng } from '../ui/format';

const SKINS = ['#9fd8c5', '#f2c6a0', '#c8a2f0', '#ffd27a', '#a8c8ff', '#f59f9f', '#b5e08a', '#e8dcc4', '#ffb3d9', '#8fe0e0'];
const INK = '#1d130e';

/**
 * A procedurally drawn ID photo for a host: same name, same face, every time.
 * Heads, eye counts, mouths and hats are all chosen by a hash of the name.
 */
export const Portrait = memo(function Portrait({ name, color, className = '' }: { name: string; color: string; className?: string }) {
  const r = rng(hash(name));
  const pick = <T,>(items: T[]): T => items[Math.floor(r() * items.length)]!;
  const skin = pick(SKINS);
  const head = pick(['round', 'tall', 'wide', 'bean', 'square'] as const);
  const eyeCount = pick([1, 2, 2, 2, 3, 3, 4]);
  const eyeKind = pick(['round', 'sleepy', 'wide', 'dot'] as const);
  const mouth = pick(['smile', 'flat', 'o', 'wave', 'grin'] as const);
  const extra = pick(['none', 'antenna', 'headphones', 'hat', 'bow', 'monocle', 'tuft', 'horns', 'halo'] as const);
  const cheeks = r() > 0.45;

  const shape: Record<typeof head, ReactNode> = {
    round: <circle cx="50" cy="56" r="27" />,
    tall: <rect x="27" y="26" width="46" height="60" rx="22" />,
    wide: <ellipse cx="50" cy="58" rx="33" ry="24" />,
    bean: <path d="M30 40c4-14 34-18 42 0 6 14-2 18 2 30 4 14-20 22-36 14-14-6-14-26-8-44Z" />,
    square: <rect x="25" y="32" width="50" height="50" rx="12" />,
  };

  const eyeY = head === 'tall' ? 50 : 52;
  const spread = eyeCount === 1 ? [50] : eyeCount === 2 ? [40, 60] : eyeCount === 3 ? [36, 50, 64] : [33, 44.5, 55.5, 67];
  const eyeR = eyeCount >= 4 ? 4 : eyeKind === 'wide' ? 6.5 : 5.2;

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <rect width="100" height="100" fill={color} opacity="0.32" />
      <rect width="100" height="100" fill="url(#portrait-dots)" opacity="0.4" />
      <defs>
        <pattern id="portrait-dots" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill={INK} opacity="0.35" />
        </pattern>
      </defs>
      <path d="M18 100c2-18 16-24 32-24s30 6 32 24Z" fill={color} stroke={INK} strokeWidth="2.5" />
      {extra === 'halo' && <ellipse cx="50" cy="20" rx="18" ry="5" fill="none" stroke="#ffe27a" strokeWidth="3" />}
      {extra === 'antenna' && (
        <g stroke={INK} strokeWidth="2.5" fill={color}>
          <path d="M50 32V14" />
          <circle cx="50" cy="12" r="4.5" />
        </g>
      )}
      {extra === 'horns' && (
        <g fill="#f4ead6" stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M33 38 28 20l14 12Z" />
          <path d="M67 38l5-18-14 12Z" />
        </g>
      )}
      <g fill={skin} stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
        {shape[head]}
      </g>
      {extra === 'tuft' && <path d="M44 32c0-8 6-10 6-14 2 5 8 6 6 14" fill={skin} stroke={INK} strokeWidth="2.5" />}
      {cheeks && (
        <g fill="#ff6f6f" opacity="0.35">
          <circle cx="33" cy={eyeY + 12} r="4.5" />
          <circle cx="67" cy={eyeY + 12} r="4.5" />
        </g>
      )}
      <g className="portrait-eyes" style={{ transformOrigin: `50px ${eyeY}px` }}>
        {spread.map((x, i) => {
          const y = eyeY + (eyeCount === 3 && i === 1 ? -5 : 0);
          if (eyeKind === 'dot') return <circle key={i} cx={x} cy={y} r={2.6} fill={INK} />;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={eyeR} fill="#fff" stroke={INK} strokeWidth="2" />
              <circle cx={x + 0.8} cy={y + 0.8} r={eyeR * 0.45} fill={INK} />
              {eyeKind === 'sleepy' && <path d={`M${x - eyeR - 1} ${y - 0.5}h${eyeR * 2 + 2}`} stroke={INK} strokeWidth="2.4" />}
            </g>
          );
        })}
      </g>
      <g fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round">
        {mouth === 'smile' && <path d="M42 68q8 7 16 0" />}
        {mouth === 'flat' && <path d="M43 69h14" />}
        {mouth === 'o' && <ellipse cx="50" cy="69" rx="3.5" ry="4.5" fill={INK} />}
        {mouth === 'wave' && <path d="M40 69q3-3 5 0t5 0 5 0 5 0" />}
        {mouth === 'grin' && <path d="M40 66q10 10 20 0Z" fill="#fff" />}
      </g>
      {extra === 'monocle' && (
        <g fill="none" stroke="#c99a3a" strokeWidth="2">
          <circle cx={spread[spread.length - 1]} cy={eyeY} r={eyeR + 3} />
          <path d={`M${spread[spread.length - 1]! + eyeR + 3} ${eyeY}q6 14 2 30`} />
        </g>
      )}
      {extra === 'headphones' && (
        <g stroke={INK} strokeWidth="2.5">
          <path d="M22 56c0-24 56-24 56 0" fill="none" strokeWidth="4" />
          <rect x="16" y="50" width="11" height="18" rx="4" fill={color} />
          <rect x="73" y="50" width="11" height="18" rx="4" fill={color} />
        </g>
      )}
      {extra === 'hat' && (
        <g fill={INK}>
          <rect x="36" y="16" width="28" height="20" rx="2" />
          <rect x="28" y="34" width="44" height="5" rx="2" />
          <rect x="36" y="29" width="28" height="4" fill={color} />
        </g>
      )}
      {extra === 'bow' && (
        <g fill={color} stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M50 34 38 26v16Z" />
          <path d="M50 34l12-8v16Z" />
          <circle cx="50" cy="34" r="3" />
        </g>
      )}
    </svg>
  );
});
