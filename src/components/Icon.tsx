import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconEye = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  </Base>
);

export const IconEyeOff = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17.5 17.5 0 0 1-2.4 3.1" />
    <path d="M6.2 6.6C3.8 8.4 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Base>
);

export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4.8h6V7" />
    <path d="M6.5 7l.8 13h9.4l.8-13" />
    <path d="M10 11v5M14 11v5" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconTarget = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Base>
);

export const IconHelp = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9a2.5 2.5 0 1 1 3.8 2.2c-.9.5-1.4 1.1-1.4 2.1v.2" />
    <path d="M12 17.2h.01" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Base>
);

export const IconChevronUp = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 14l6-6 6 6" />
  </Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 10l6 6 6-6" />
  </Base>
);

export const IconReset = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 9.5A8 8 0 1 1 4 14" />
    <path d="M4 4.5v5h5" />
  </Base>
);

export const IconDraw = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20l4.2-1 10.4-10.4a2.2 2.2 0 0 0-3.1-3.1L5.1 15.9 4 20Z" />
    <path d="M13.8 7.2l3 3" />
  </Base>
);

export const IconSelect = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 3l6.5 17 2.2-6.4 6.3-2.2L5 3Z" />
  </Base>
);

export const IconLine = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 19L20 5" />
    <circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="6" r="1.4" fill="currentColor" stroke="none" />
  </Base>
);

export const IconCircle = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Base>
);

export const IconEllipse = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="12" cy="12" rx="9" ry="5.6" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </Base>
);

export const IconParabola = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5c0 8 3.6 14 8 14s8-6 8-14" />
    <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
  </Base>
);

export const IconHyperbola = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5c4 0 7 3 8 7-1 4-4 7-8 7" />
    <path d="M20 5c-4 0-7 3-8 7 1 4 4 7 8 7" />
  </Base>
);

export const IconMagnet = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 4v7a7 7 0 0 0 14 0V4" />
    <path d="M5 9h4M15 9h4" />
    <path d="M5 4h4M15 4h4" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12l4.5 4.5L19 7" />
  </Base>
);

export const IconInfo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
);

export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6l6 6-6 6" />
  </Base>
);
