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

const stroke = (props: IconProps): IconProps =>
  base({ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...props });

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

export const PowerIcon = (props: IconProps) => (
  <svg {...stroke(props)} strokeWidth={2.4}>
    <path d="M12 3.5v8" />
    <path d="M6.6 7.2a7.5 7.5 0 1 0 10.8 0" />
  </svg>
);

export const SkipIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 6.3v11.4a.9.9 0 0 0 1.38.76l8.7-5.7a.9.9 0 0 0 0-1.52l-8.7-5.7A.9.9 0 0 0 5 6.3Z" />
    <rect x="16.5" y="5.5" width="2.6" height="13" rx="1" />
  </svg>
);

export const StepLeftIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 6.4v11.2a.8.8 0 0 1-1.25.66L3.4 13.3a1.6 1.6 0 0 1 0-2.6l7.35-4.96A.8.8 0 0 1 12 6.4Z" />
    <path d="M20.5 6.4v11.2a.8.8 0 0 1-1.25.66l-7.35-4.96a1.6 1.6 0 0 1 0-2.6l7.35-4.96a.8.8 0 0 1 1.25.66Z" />
  </svg>
);

export const StepRightIcon = (props: IconProps) => (
  <svg {...base(props)} style={{ transform: 'scaleX(-1)', ...props.style }}>
    <path d="M12 6.4v11.2a.8.8 0 0 1-1.25.66L3.4 13.3a1.6 1.6 0 0 1 0-2.6l7.35-4.96A.8.8 0 0 1 12 6.4Z" />
    <path d="M20.5 6.4v11.2a.8.8 0 0 1-1.25.66l-7.35-4.96a1.6 1.6 0 0 1 0-2.6l7.35-4.96a.8.8 0 0 1 1.25.66Z" />
  </svg>
);

/** A little orbit with a hopping dot: "jump somewhere random". */
export const ScanIcon = (props: IconProps) => (
  <svg {...stroke(props)}>
    <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-25 12 12)" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="19.2" cy="7.4" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const VolumeIcon = ({ level, ...props }: IconProps & { level: 'muted' | 'low' | 'high' }) => (
  <svg {...stroke(props)} strokeWidth={1.9}>
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

export const RetryIcon = (props: IconProps) => (
  <svg {...stroke(props)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);

export const GuideIcon = (props: IconProps) => (
  <svg {...stroke(props)} strokeWidth={1.8}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
    <path d="M6.5 8h2M6.5 11h2M15.5 8h2M15.5 11h2M15.5 14h2" />
  </svg>
);

export const AmbientIcon = (props: IconProps) => (
  <svg {...stroke(props)} strokeWidth={1.9}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    <path d="M14.5 9.2a3.4 3.4 0 1 0 .3 5.4 3 3 0 0 1-.3-5.4Z" fill="currentColor" stroke="none" />
  </svg>
);

export const ExitAmbientIcon = (props: IconProps) => (
  <svg {...stroke(props)} strokeWidth={1.9}>
    <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />
  </svg>
);

export const MoonIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a.6.6 0 0 0-.8-.7 8.6 8.6 0 1 0 11.7 11.7.6.6 0 0 0-.7-.8Z" />
  </svg>
);

export const CaptionsIcon = (props: IconProps) => (
  <svg {...stroke(props)} strokeWidth={1.8}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6" />
  </svg>
);

export const HelpIcon = (props: IconProps) => (
  <svg {...stroke(props)} strokeWidth={2.1}>
    <path d="M9.2 9.2a2.9 2.9 0 1 1 4 2.7c-.8.4-1.2 1-1.2 1.9v.5" />
    <circle cx="12" cy="17.6" r="0.6" fill="currentColor" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...stroke(props)} strokeWidth={2.2}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const NoteIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M18 3.6v11.2a3.2 3.2 0 1 1-1.8-2.9V7.4l-7 1.6v8a3.2 3.2 0 1 1-1.8-2.9V6.3a1 1 0 0 1 .8-1l8.6-2a1 1 0 0 1 1.2 1Z" />
  </svg>
);

export const MicIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M12 18v3.5M8.5 21.5h7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const PinIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 2.5a7 7 0 0 0-7 7c0 5 6 11.3 6.3 11.6a1 1 0 0 0 1.4 0C13 20.8 19 14.5 19 9.5a7 7 0 0 0-7-7Zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
  </svg>
);
