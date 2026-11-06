// Display helpers. They format tool values; they never invent or round them away.

const toDate = (iso) => (iso && iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso));

export function fmtDate(iso, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  const d = toDate(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", opts);
}

export const fmtShortDate = (iso) => fmtDate(iso, { day: "numeric", month: "short" });
export const fmtLongDate = (iso) => fmtDate(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Up to 3 decimals, at least 2: shows 13.0 as 13.00 and 0.285 as 0.285, never rounds a tool value. */
export function num(v, min = 2, max = 3) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("en-MY", { minimumFractionDigits: min, maximumFractionDigits: max });
}

export const rm = (v) => (v === null || v === undefined ? "—" : `RM${num(v)}`);

export function signedPct(value, base) {
  if (value == null || !base) return "";
  const pct = ((value - base) / base) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function elapsed(ms) {
  if (ms == null || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return fmtDate(iso);
}

export const MARKET_LABEL = { Main: "Main Market", ACE: "ACE Market", LEAP: "LEAP Market" };

/** Download text as a file. */
export function downloadText(filename, text, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function briefTitle(brief) {
  const names = (brief?.companies || []).map((c) => c.name);
  if (!names.length) return brief?.query || "Research brief";
  return names.length === 1 ? names[0] : names.join(" vs ");
}

export function briefFilename(brief) {
  const codes = (brief?.companies || []).map((c) => c.code).join("-") || "brief";
  return `halallens_${codes}_${(brief?.generatedAt || "").slice(0, 10) || "draft"}.md`;
}

/** Scroll to a headline in the news list and flash it (opens a collapsed "not used" group first). */
export function flashHeadline(code, n) {
  const el = document.getElementById(`news-${code}-${n}`);
  if (!el) return false;
  const details = el.closest("details");
  if (details) details.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("is-flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("is-flash");
  return true;
}

/** Read a localStorage key without throwing (private mode, blocked storage). */
export function storageGet(key, fallback = null) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference just isn't remembered */
  }
}
