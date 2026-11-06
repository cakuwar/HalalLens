import { useId, useMemo, useState } from "react";
import { useElementWidth } from "../hooks.js";
import { fmtLongDate, fmtShortDate, num, rm } from "../format.js";

const SERIES = [
  { key: "close", label: "Close", cls: "pc-close" },
  { key: "ma20", label: "MA20", cls: "pc-ma20" },
  { key: "ma50", label: "MA50", cls: "pc-ma50" },
];

function niceTicks(lo, hi, count = 4) {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Spread labels at least `gap` px apart vertically, keeping each as close to its target as possible. */
function spread(items, gap, min, max) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  sorted.forEach((it, i) => {
    it.ly = i === 0 ? Math.max(it.y, min) : Math.max(it.y, sorted[i - 1].ly + gap);
  });
  for (let i = sorted.length - 1; i >= 0; i--) {
    const limit = i === sorted.length - 1 ? max : sorted[i + 1].ly - gap;
    sorted[i].ly = Math.min(sorted[i].ly, limit);
  }
  return sorted;
}

/**
 * Daily close with MA20/MA50 and the nearest support/resistance levels.
 * Every number drawn comes from the technical tool; the chart only positions them.
 */
export default function PriceChart({ chart, supports = [], resistances = [], code }) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, "");

  const model = useMemo(() => {
    if (!chart?.close?.length) return null;
    const n = chart.close.length;
    const H = width < 520 ? 230 : 280;
    const M = { top: 16, right: 62, bottom: 28, left: 46 };
    const nearest = [resistances[0], supports[0]].filter((v) => v != null);
    const values = SERIES.flatMap((s) => chart[s.key] || []).filter((v) => v != null);
    let lo = Math.min(...values, ...nearest);
    let hi = Math.max(...values, ...nearest);
    const pad = (hi - lo) * 0.08 || hi * 0.02;
    lo -= pad;
    hi += pad;
    const iw = Math.max(width - M.left - M.right, 40);
    const ih = H - M.top - M.bottom;
    const x = (i) => M.left + (n === 1 ? iw : (i / (n - 1)) * iw);
    const y = (v) => M.top + (1 - (v - lo) / (hi - lo)) * ih;

    const line = (series) => {
      let d = "";
      series.forEach((v, i) => {
        if (v == null) return;
        d += `${d && series[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      });
      return d;
    };
    const closePath = line(chart.close);
    const firstIdx = chart.close.findIndex((v) => v != null);
    const area = `${closePath}L${x(n - 1).toFixed(1)},${M.top + ih}L${x(firstIdx).toFixed(1)},${M.top + ih}Z`;

    const months = [];
    chart.dates.forEach((d, i) => {
      if (i > 0 && d.slice(0, 7) !== chart.dates[i - 1].slice(0, 7)) months.push(i);
    });

    // Only the nearest level on each side: labelled sparingly, the ladder beside the chart lists the rest.
    const levels = [
      ...resistances.slice(0, 1).map((v) => ({ v, label: "R1" })),
      ...supports.slice(0, 1).map((v) => ({ v, label: "S1" })),
    ].filter((l) => l.v >= lo && l.v <= hi);

    const ends = SERIES.map((s) => {
      const arr = chart[s.key] || [];
      const v = arr[n - 1];
      return v == null ? null : { ...s, v, y: y(v) };
    }).filter(Boolean);

    return {
      n, H, M, iw, ih, x, y, area, months, levels,
      paths: Object.fromEntries(SERIES.map((s) => [s.key, line(chart[s.key] || [])])),
      ticks: niceTicks(lo, hi, 4),
      ends: spread(ends, 14, M.top + 4, M.top + ih),
      levelLabels: spread(levels.map((l) => ({ ...l, y: y(l.v) })), 15, M.top + 6, M.top + ih),
    };
  }, [chart, supports, resistances, width]);

  if (!model) return null;
  const { n, H, M, iw, ih, x, y } = model;
  const last = n - 1;

  const indexAt = (clientX, rect) => {
    const px = clientX - rect.left;
    return Math.max(0, Math.min(last, Math.round(((px - M.left) / iw) * last)));
  };
  const onMove = (e) => setHover(indexAt(e.clientX, e.currentTarget.ownerSVGElement.getBoundingClientRect()));
  const onKey = (e) => {
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last) - 1));
    else if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? last) + 1));
    else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(last);
    else return;
    e.preventDefault();
  };

  const h = hover;
  const tipLeft = h == null ? 0 : x(h) + 14 > width - 190 ? x(h) - 190 : x(h) + 14;
  const summary = `Daily close for ${code}, ${n} trading days to ${fmtLongDate(chart.dates[last])}: last close ${rm(chart.close[last])}, MA20 ${num(chart.ma20?.[last])}, MA50 ${num(chart.ma50?.[last])}.`;

  return (
    <figure className="pc">
      <div className="pc__legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="pc__key">
            <svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" className={s.cls} /></svg>
            {s.label}
          </span>
        ))}
        <span className="pc__key">
          <svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" className="pc-level" /></svg>
          Nearest support (S1) / resistance (R1)
        </span>
      </div>

      <div className="pc__plot" ref={ref}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setHover((v) => v ?? last)}
          onBlur={() => setHover(null)}
          className="pc__svg"
        >
          <defs>
            <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--series-close)", stopOpacity: 0.16 }} />
              <stop offset="100%" style={{ stopColor: "var(--series-close)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {model.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} className="pc-grid" />
              <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="pc-tick">{num(t)}</text>
            </g>
          ))}
          <line x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} className="pc-axis" />
          {model.months.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="pc-tick">
              {new Date(`${chart.dates[i]}T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}
            </text>
          ))}

          {model.levels.map((l) => (
            <line key={l.label} x1={M.left} x2={M.left + iw} y1={y(l.v)} y2={y(l.v)} className="pc-level" />
          ))}

          <path d={model.area} fill={`url(#area-${gid})`} />
          <path d={model.paths.ma50} className="pc-ma50" />
          <path d={model.paths.ma20} className="pc-ma20" />
          <path d={model.paths.close} className="pc-close" />

          {model.levelLabels.map((l) => (
            <text key={l.label} x={M.left + 6} y={l.ly - 4} className="pc-level-label">
              {l.label} {num(l.v)}
            </text>
          ))}

          {model.ends.map((e) => (
            <g key={e.key}>
              {Math.abs(e.ly - e.y) > 2 && (
                <line x1={x(last) + 3} y1={e.y} x2={x(last) + 9} y2={e.ly} className="pc-leader" />
              )}
              <text x={x(last) + 11} y={e.ly + 4} className={e.key === "close" ? "pc-end pc-end--strong" : "pc-end"}>
                {e.key === "close" ? num(e.v) : e.label}
              </text>
            </g>
          ))}
          <circle cx={x(last)} cy={y(chart.close[last])} r="4.5" className="pc-dot" />

          {h != null && (
            <g pointerEvents="none">
              <line x1={x(h)} x2={x(h)} y1={M.top} y2={M.top + ih} className="pc-crosshair" />
              {SERIES.map((s) =>
                chart[s.key]?.[h] != null ? (
                  <circle key={s.key} cx={x(h)} cy={y(chart[s.key][h])} r="4" className={`pc-hover-dot ${s.cls}`} />
                ) : null
              )}
            </g>
          )}
          <rect
            x={M.left}
            y={M.top}
            width={iw}
            height={ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {h != null && (
          <div className="pc__tip" style={{ left: tipLeft, top: M.top }} role="status">
            <div className="pc__tip-date">{fmtLongDate(chart.dates[h])}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="pc__tip-row">
                <svg width="14" height="8" aria-hidden="true"><line x1="1" y1="4" x2="13" y2="4" className={s.cls} /></svg>
                <strong>{chart[s.key]?.[h] != null ? num(chart[s.key][h]) : "—"}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="pc__table">
        <summary>Show the data as a table</summary>
        <div className="pc__table-scroll">
          <table>
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Close</th><th scope="col">MA20</th><th scope="col">MA50</th></tr>
            </thead>
            <tbody>
              {chart.dates.map((d, i) => i).reverse().map((i) => (
                <tr key={chart.dates[i]}>
                  <td>{fmtShortDate(chart.dates[i])}</td>
                  <td>{num(chart.close[i])}</td>
                  <td>{num(chart.ma20?.[i])}</td>
                  <td>{num(chart.ma50?.[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
