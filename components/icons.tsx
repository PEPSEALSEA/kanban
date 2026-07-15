'use client';

import React from 'react';

export type IconProps = {
  className?: string;
  title?: string;
  style?: React.CSSProperties;
};

const base = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

function Svg({ className, title, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" {...base}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconKanban(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="5" height="15" rx="1.5" />
      <rect x="9.5" y="4.5" width="5" height="10" rx="1.5" />
      <rect x="15.5" y="4.5" width="5" height="12" rx="1.5" />
    </Svg>
  );
}

export function IconArchive(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5.5" width="17" height="14" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 13.5h3" />
    </Svg>
  );
}

export function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </Svg>
  );
}

export function IconTimeline(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 6h10M5 12h14M5 18h8" />
      <circle cx="5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconChat(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 18.5 6.2 15.8A7.5 7.5 0 1 1 10 19.4L5 18.5Z" />
    </Svg>
  );
}

export function IconAdmin(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
    </Svg>
  );
}

export function IconGraduation(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 9.5 12 5l9 4.5-9 4.5L3 9.5Z" />
      <path d="M7 12v4.5c0 .8 2.2 2.5 5 2.5s5-1.7 5-2.5V12" />
      <path d="M21 10v5" />
    </Svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 20 20" />
    </Svg>
  );
}

export function IconBooks(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 5.5h5.5v13H5a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 5 5.5Z" />
      <path d="M10.5 5.5H19a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-8.5" />
      <path d="M10.5 9h7M10.5 12.5h5" />
    </Svg>
  );
}

export function IconImage(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m6.5 17 3.8-4.2 2.7 2.5 2.5-2.8L17.5 17" />
    </Svg>
  );
}

export function IconFile(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3.5h6.5L18.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M13.5 3.5V8.5H18.5" />
    </Svg>
  );
}

export function IconCamera(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 7.5 9.2 5.5h5.6L16 7.5h2.5A1.5 1.5 0 0 1 20 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5V9a1.5 1.5 0 0 1 1.5-1.5H8Z" />
      <circle cx="12" cy="13" r="3.2" />
    </Svg>
  );
}

export function IconMusic(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M11.5 15.5V5.5l8-1.5v9.5" />
      <path d="M19.5 13.5a2.5 2.5 0 1 0 0-5" />
    </Svg>
  );
}

export function IconPaperclip(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m15.5 8-6.8 6.8a2.5 2.5 0 0 0 3.5 3.5L18.8 11.7a4 4 0 0 0-5.7-5.7L6.5 12.7a5.5 5.5 0 0 0 7.8 7.8l6-6" />
    </Svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function IconX(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </Svg>
  );
}

export function IconAlert(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4.5 20.5 19H3.5L12 4.5Z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </Svg>
  );
}

export function IconLoader(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4v3.2M12 16.8V20M4 12h3.2M16.8 12H20M6.2 6.2l2.3 2.3M15.5 15.5l2.3 2.3M17.8 6.2l-2.3 2.3M8.5 15.5l-2.3 2.3" />
    </Svg>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 18.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <circle cx="16.5" cy="9.5" r="2.4" />
      <path d="M15 13.5c2.2.3 4 2 4 4.5" />
    </Svg>
  );
}

export function IconDashboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="5" rx="1.5" />
      <rect x="13" y="10.5" width="7.5" height="10" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
    </Svg>
  );
}

export function IconTag(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 12.5V5.5A2 2 0 0 1 5.5 3.5h7l8 8-7 7-8-8Z" />
      <circle cx="8" cy="8" r="1.3" />
    </Svg>
  );
}

export function IconEdit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 16.5 4 20l3.5-.5L18.5 8.5 15.5 5.5 4.5 16.5Z" />
      <path d="m13.5 7.5 3 3" />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconFolder(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 8.5V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-7.5Z" />
    </Svg>
  );
}

export function IconSparkles(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4.5 13.2 9.3 18 10.5 13.2 11.7 12 16.5 10.8 11.7 6 10.5l4.8-1.2L12 4.5Z" />
      <path d="M18.5 14.5 19.1 16.7 21.3 17.3 19.1 17.9 18.5 20.1 17.9 17.9 15.7 17.3l2.2-.6.6-2.2Z" />
    </Svg>
  );
}

export function IconZap(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 3.5 6.5 13h5L11 20.5 17.5 11h-5L13 3.5Z" />
    </Svg>
  );
}

export function IconScissors(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="7" cy="17" r="2.5" />
      <path d="m9 8.5 11-4M9 15.5l11 4M9.2 8.8 14.5 12 9.2 15.2" />
    </Svg>
  );
}

export function IconTurtle(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="13" rx="6.5" ry="4.5" />
      <path d="M7 13.5c1-.8 2.8-1.3 5-1.3s4 .5 5 1.3" />
      <path d="M17.5 11.5c1.2-.2 3-.2 3.8.8M6.5 11.5c-1.2-.2-3-.2-3.8.8" />
      <path d="M8.5 17v2M15.5 17v2M8 10.5 6.5 8M16 10.5 17.5 8" />
    </Svg>
  );
}

export function IconMegaphone(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 11.5v3a2 2 0 0 0 2 2H8l1.5 3.5h2L10 16.5h1.5L19.5 19V7.5L11.5 10H6.5a2 2 0 0 0-2 1.5Z" />
    </Svg>
  );
}

export function IconFlame(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 20.5c3.5 0 6-2.4 6-5.8 0-2.4-1.3-4.1-2.5-5.3.2 1.5-.3 2.5-1.2 3.3C14 9.5 12.5 6.5 12 4.5c-.8 2.2-2.8 4.2-3.8 6.3C7.3 12.2 6 13.7 6 15.5c0 2.9 2.4 5 6 5Z" />
    </Svg>
  );
}

export function IconShell(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 19.5c4.5 0 7.5-2.8 7.5-6.5C19.5 8.5 12 4.5 12 4.5S4.5 8.5 4.5 13c0 3.7 3 6.5 7.5 6.5Z" />
      <path d="M12 19.5V8M8.5 17c1-2 1.5-4 1.5-6.5M15.5 17c-1-2-1.5-4-1.5-6.5" />
    </Svg>
  );
}

export function IconClock(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </Svg>
  );
}

export function IconExit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 5.5H6.5A2 2 0 0 0 4.5 7.5v9a2 2 0 0 0 2 2H10" />
      <path d="M14 8.5 18.5 12 14 15.5M18.5 12H9.5" />
    </Svg>
  );
}

export function IconBan(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="m7 7 10 10" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </Svg>
  );
}

export function IconHourglass(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 4.5h10M7 19.5h10" />
      <path d="M8 4.5c0 3.5 2 4.8 4 7.5-2 2.7-4 4-4 7.5M16 4.5c0 3.5-2 4.8-4 7.5 2 2.7 4 4 4 7.5" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 7h14M5 12h14M5 17h14" />
    </Svg>
  );
}
