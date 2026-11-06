// Inline stroke icons (no icon library). Decorative by default: aria-hidden.

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const icon = (paths, { size = 18, sw } = {}) =>
  function Icon(p) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...base} {...(sw ? { strokeWidth: sw } : {})} {...p}>
        {paths}
      </svg>
    );
  };

export const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
    <defs>
      <linearGradient id="hl-logo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#36b37e" />
        <stop offset="1" stopColor="#0e5b43" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#hl-logo)" />
    <circle cx="14.5" cy="14.5" r="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
    <path d="M19.5 19.5L24 24" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M11.8 14.6l1.9 1.9 3.4-3.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Plus = icon(<path d="M12 5v14M5 12h14" />);
export const Star = icon(<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />);
export const Bookmark = icon(<path d="M6 3h12v18l-6-4-6 4z" />);
export const ArrowRight = icon(<path d="M5 12h14M13 6l6 6-6 6" />, { size: 16, sw: 2.2 });
export const ArrowLeft = icon(<path d="M19 12H5M11 6l-6 6 6 6" />, { size: 16, sw: 2.2 });
export const External = icon(<path d="M7 17L17 7M9 7h8v8" />, { size: 14 });
export const Check = icon(<path d="M5 12l5 5 9-10" />, { size: 16, sw: 2.6 });
export const Shield = icon(
  <>
    <path d="M12 3l7 3v6c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </>
);
export const ShieldAlert = icon(
  <>
    <path d="M12 3l7 3v6c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z" />
    <path d="M12 8v4M12 15.5v.01" />
  </>
);
export const TrendLine = icon(
  <>
    <path d="M3 17l5-5 4 3 8-8" />
    <path d="M3 21h18" />
  </>,
  { size: 28, sw: 1.8 }
);
export const Newspaper = icon(
  <>
    <path d="M4 5h13v14H6a2 2 0 0 1-2-2z" />
    <path d="M17 9h3v8a2 2 0 0 1-2 2" />
    <path d="M8 9h5M8 13h5" />
  </>,
  { size: 28, sw: 1.8 }
);
export const Database = icon(
  <>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </>,
  { size: 16 }
);
export const Menu = icon(<path d="M4 7h16M4 12h16M4 17h16" />, { size: 20 });
export const Search = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </>,
  { size: 20 }
);
export const Sun = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);
export const Moon = icon(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />);
export const Copy = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </>,
  { size: 16 }
);
export const Download = icon(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />, { size: 16 });
export const Printer = icon(
  <>
    <path d="M7 9V3h10v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M7 14h10v7H7z" />
  </>,
  { size: 16 }
);
export const Clock = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
  { size: 14 }
);
export const Sparkle = icon(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />, { size: 16 });
export const Info = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </>,
  { size: 18 }
);
export const ArrowUpRight = icon(<path d="M7 17L17 7M9 7h8v8" />, { size: 16, sw: 2.4 });
export const ArrowDownRight = icon(<path d="M7 7l10 10M17 9v8H9" />, { size: 16, sw: 2.4 });
export const ArrowSide = icon(<path d="M4 12h16M14 6l6 6-6 6" />, { size: 16, sw: 2.4 });
export const Layers = icon(<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />, { size: 16 });
export const Code = icon(<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />, { size: 16 });
export const FileText = icon(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h6" />
  </>,
  { size: 16 }
);
export const Grid = icon(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>,
  { size: 16 }
);
export const Send = icon(<path d="M4 12l16-8-6 16-2.5-6.5z" />, { size: 16 });

export const Spinner = ({ size = 18 }) => (
  <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" className="spin__track" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" className="spin__head" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const DoneDot = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" className="dot-done" />
    <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PauseDot = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" className="dot-wait" />
    <path d="M9.5 8v8M14.5 8v8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const QueuedDot = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" className="dot-queued" strokeWidth="1.6" strokeDasharray="3 3" />
  </svg>
);

export const SkipDot = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" className="dot-queued" strokeWidth="1.6" />
    <path d="M8 12h8" className="dot-queued" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const ErrorDot = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" className="dot-error" />
    <path d="M12 7v6M12 16.5v.01" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
