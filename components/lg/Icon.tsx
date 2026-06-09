import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "people"
  | "groups"
  | "check"
  | "clipboard"
  | "spark"
  | "cal"
  | "cog"
  | "spark2"
  | "sun"
  | "arrow"
  | "plus"
  | "search"
  | "filter"
  | "chev"
  | "chevD"
  | "dots"
  | "bell"
  | "book"
  | "logout"
  | "flag"
  | "heart"
  | "sprout"
  | "list"
  | "grid"
  | "edit"
  | "x"
  | "star"
  | "inbox"
  | "archive"
  | "sparkle"
  | "compass"
  | "shield"
  | "alert";

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M3.5 19c.6-3 3-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <path d="M14.5 16c.5-1.5 2-2.4 3.5-2.4s3 .9 3.5 2.4" />
    </>
  ),
  groups: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <path d="M8 5v14M16 5v14M3.5 12h17" />
    </>
  ),
  check: <path d="M4 12.5 9 17l11-11" />,
  clipboard: (
    <>
      <rect x="6" y="4.5" width="12" height="16" rx="2" />
      <path d="M9 4.5h6v3H9z" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />,
  cal: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" />
    </>
  ),
  spark2: <path d="M12 3 14 10 21 12 14 14 12 21 10 14 3 12 10 10z" />,
  sparkle: <path d="M12 3 14 10 21 12 14 14 12 21 10 14 3 12 10 10z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M5 19l1.8-1.8M17.2 6.8 19 5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  filter: <path d="M4 5h16M7 12h10M10 19h4" />,
  chev: <path d="M9 6l6 6-6 6" />,
  chevD: <path d="M6 9l6 6 6-6" />,
  dots: (
    <>
      <circle cx="6" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18" cy="12" r="1.4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5" />
      <path d="M5 16h14M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z" />
      <path d="M5 4.5v15" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
      <path d="M10 12h10M14 8l-4 4 4 4" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h12l-2.5 4L17 12H5" />,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  sprout: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.5-2-6-5-6 0 3.5 2 6 5 6z" />
      <path d="M12 13c0-3.5 2-6 5-6 0 3.5-2 6-5 6z" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  edit: <path d="M4 20h4l11-11-4-4L4 16v4z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 4 2.4 5 5.6.8-4 4 1 5.6L12 17l-5 2.4 1-5.6-4-4 5.6-.8z" />,
  inbox: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 14h5l1.5 2.5h4L15.5 14h5" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="5" width="17" height="4" rx="1" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m14.8 9.2-3.8 1.6L9.2 14.8l3.8-1.6z" />
    </>
  ),
  shield: <path d="M12 3 19 6v5.2c0 4.4-2.9 7.4-7 9.8-4.1-2.4-7-5.4-7-9.8V6z" />,
  alert: (
    <>
      <path d="M12 4 2.8 19.5h18.4z" />
      <path d="M12 10.5v4M12 17h.01" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  color = "currentColor",
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
