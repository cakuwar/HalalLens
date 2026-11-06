import { Sentiment, ShariahBadge, Trend, rsiZone } from "./bits.jsx";
import { num, rm } from "../format.js";

const ROWS = [
  { label: "Shariah status", cell: (c) => <ShariahBadge shariah={c.shariah} size="sm" /> },
  { label: "Last close", cell: (c) => <span className="mono">{rm(c.technical?.price)}</span> },
  { label: "Trend", cell: (c) => <Trend value={c.technical?.trend} /> },
  {
    label: "RSI (14)",
    cell: (c) => (
      <span>
        <span className="mono">{num(c.technical?.rsi14, 1, 1)}</span>{" "}
        <span className="note">{rsiZone(c.technical?.rsi14).replace(/ \(.*\)/, "")}</span>
      </span>
    ),
  },
  { label: "Nearest support", cell: (c) => <span className="mono">{num(c.technical?.supports?.[0])}</span> },
  { label: "Nearest resistance", cell: (c) => <span className="mono">{num(c.technical?.resistances?.[0])}</span> },
  { label: "News sentiment", cell: (c) => <Sentiment value={c.news?.sentiment} /> },
];

export default function CompareTable({ companies }) {
  return (
    <section className="card compare" aria-label="Side-by-side comparison">
      <div className="compare__head">
        <span className="eyebrow">Side by side</span>
        <span className="note">Same structure for every company. Values come straight from the tools.</span>
      </div>
      <div className="compare__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col" className="compare__metric">Metric</th>
              {companies.map((c) => (
                <th scope="col" key={c.code}>
                  <a href={`#company-${c.code}`}>{c.name}</a>
                  <span className="mono muted">{c.code}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="compare__metric">{r.label}</th>
                {companies.map((c) => (
                  <td key={c.code}>{r.cell(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
