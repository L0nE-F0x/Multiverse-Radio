import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'currentColor',
  'aria-hidden': true,
  focusable: false,
  ...props,
});

export const PlayIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 5.2v13.6a1 1 0 0 0 1.52.86l10.9-6.8a1 1 0 0 0 0-1.72L9.52 4.34A1 1 0 0 0 8 5.2Z" />
  </svg>
);

export const PauseIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
    <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
  </svg>
);

export const NextIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 6.3v11.4a.9.9 0 0 0 1.38.76l8.7-5.7a.9.9 0 0 0 0-1.52l-8.7-5.7A.9.9 0 0 0 5 6.3Z" />
    <rect x="16.5" y="5.5" width="2.6" height="13" rx="1" />
  </svg>
);

export const PrevIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M19 6.3v11.4a.9.9 0 0 1-1.38.76l-8.7-5.7a.9.9 0 0 1 0-1.52l8.7-5.7A.9.9 0 0 1 19 6.3Z" />
    <rect x="4.9" y="5.5" width="2.6" height="13" rx="1" />
  </svg>
);

export const VolumeIcon = ({ level, ...props }: IconProps & { level: 'muted' | 'low' | 'high' }) => (
  <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" />
    {level === 'muted' ? (
      <path d="m16 9.5 5 5m0-5-5 5" />
    ) : (
      <>
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
        {level === 'high' && <path d="M18.3 6.5a8 8 0 0 1 0 11" />}
      </>
    )}
  </svg>
);

export const ChevronIcon = (props: IconProps) => (
  <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const RetryIcon = (props: IconProps) => (
  <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);

/** Simple geometric channel symbols, chosen by channel position. */
const GLYPHS = [
  <circle key="c" cx="12" cy="12" r="6.5" />,
  <path key="t" d="M12 4.8 19.4 18H4.6L12 4.8Z" />,
  <rect key="s" x="5.8" y="5.8" width="12.4" height="12.4" rx="1" />,
  <path key="d" d="m12 3.8 8.2 8.2-8.2 8.2L3.8 12 12 3.8Z" />,
  <path key="h" d="m12 4 7 4v8l-7 4-7-4V8l7-4Z" />,
  <path key="x" d="M12 4.5v15M4.5 12h15M6.7 6.7l10.6 10.6M17.3 6.7 6.7 17.3" />,
];

export function ChannelGlyph({ index, className }: { index: number; className?: string }) {
  const glyph = GLYPHS[index % GLYPHS.length];
  const isStroke = index % GLYPHS.length === GLYPHS.length - 1;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable={false}
      fill="none"
      stroke="currentColor"
      strokeWidth={isStroke ? 2 : 1.8}
      strokeLinejoin="round"
    >
      {glyph}
    </svg>
  );
}
