// Small shared pieces. Status is always text + icon, never colour alone.
import { ArrowDownRight, ArrowSide, ArrowUpRight, Shield, ShieldAlert } from "./Icons.jsx";
import { cap } from "../format.js";

export function ShariahBadge({ shariah, size = "lg" }) {
  if (!shariah) return null;
  if (shariah.error) return <span className={`sbadge sbadge--${size} sbadge--unknown`}>Status unavailable</span>;
  const ok = shariah.status === "compliant";
  return (
    <span className={`sbadge sbadge--${size} ${ok ? "sbadge--ok" : "sbadge--no"}`}>
      {ok ? <Shield /> : <ShieldAlert />}
      {ok ? "Shariah-compliant" : "Shariah non-compliant"}
    </span>
  );
}

const SENTIMENT = { positive: "Positive", neutral: "Neutral", negative: "Negative", mixed: "Mixed" };

export function Sentiment({ value }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <span className={`sent sent--${value}`}>
      <i aria-hidden="true" />
      {SENTIMENT[value] ?? cap(value)}
    </span>
  );
}

export function Confidence({ value, note }) {
  if (!value) return null;
  return (
    <span className={`conf conf--${value}`} title={note || undefined}>
      <span className="conf__bars" aria-hidden="true">
        <i /><i /><i />
      </span>
      {cap(value)} confidence
    </span>
  );
}

const TREND = {
  uptrend: { label: "Uptrend", Icon: ArrowUpRight },
  downtrend: { label: "Downtrend", Icon: ArrowDownRight },
  sideways: { label: "Sideways", Icon: ArrowSide },
};

export function Trend({ value }) {
  const t = TREND[value];
  if (!t) return <span className="muted">{value || "—"}</span>;
  return (
    <span className={`trend trend--${value}`}>
      <t.Icon />
      {t.label}
    </span>
  );
}

export const rsiZone = (v) =>
  v == null ? "" : v < 30 ? "Oversold zone (below 30)" : v > 70 ? "Overbought zone (above 70)" : "Neutral zone (30 to 70)";

export function SectionError({ title, message }) {
  return (
    <div className="section-error" role="note">
      <strong>{title}</strong> {message}
    </div>
  );
}
