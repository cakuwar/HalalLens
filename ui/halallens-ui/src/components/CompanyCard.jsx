import PriceChart from "./PriceChart.jsx";
import NewsPanel from "./NewsPanel.jsx";
import { Confidence, SectionError, ShariahBadge, Trend, rsiZone } from "./bits.jsx";
import { Shield, ShieldAlert } from "./Icons.jsx";
import { MARKET_LABEL, cap, fmtDate, fmtShortDate, num, rm, signedPct } from "../format.js";

function ShariahStrip({ shariah, nextUpdate }) {
  if (!shariah) return null;
  if (shariah.error) return <SectionError title="Shariah status unavailable." message={shariah.error} />;
  const ok = shariah.status === "compliant";
  const headline = ok
    ? "On the SC Shariah-compliant list"
    : shariah.reclassified
      ? "Reclassified as Shariah non-compliant"
      : "Not on the SC Shariah-compliant list";
  const explanation = ok
    ? null
    : shariah.reclassified
      ? "Moved to the non-compliant table in this SC update."
      : "The SC list includes only Shariah-compliant securities, so a listed stock that is not on it is non-compliant as at that date.";
  return (
    <section className={`shariah ${ok ? "shariah--ok" : "shariah--no"}`} aria-label="Shariah status">
      <span className="shariah__icon">{ok ? <Shield width={22} height={22} /> : <ShieldAlert width={22} height={22} />}</span>
      <div className="shariah__text">
        <strong>{headline}</strong>
        <span>
          SC Shariah Advisory Council list effective <b>{fmtDate(shariah.listDate)}</b>
          {nextUpdate ? ` · next scheduled update ${fmtDate(nextUpdate)}` : ""}
        </span>
        {(explanation || shariah.note) && <span className="note">{explanation || shariah.note}</span>}
      </div>
      <span className="shariah__rule">Looked up from the official list. The model never judges compliance.</span>
    </section>
  );
}

function Tile({ label, value, sub, children }) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      {children}
      {sub && <span className="tile__sub">{sub}</span>}
    </div>
  );
}

function RsiMeter({ value }) {
  if (value == null) return null;
  const pos = Math.max(0, Math.min(100, value));
  return (
    <div className="rsi" aria-hidden="true">
      <div className="rsi__track">
        <span className="rsi__zone" style={{ left: 0, width: "30%" }} />
        <span className="rsi__zone" style={{ left: "70%", width: "30%" }} />
        <span className="rsi__tick" style={{ left: "30%" }} />
        <span className="rsi__tick" style={{ left: "70%" }} />
        <span className="rsi__marker" style={{ left: `${pos}%` }} />
      </div>
    </div>
  );
}

function LevelsLadder({ price, supports, resistances }) {
  const rows = [
    ...resistances.map((v, i) => ({ label: `R${i + 1}`, v, kind: "res" })).reverse(),
    { label: "Close", v: price, kind: "price" },
    ...supports.map((v, i) => ({ label: `S${i + 1}`, v, kind: "sup" })),
  ];
  const maxDist = Math.max(...rows.map((r) => Math.abs(r.v - price)), 1e-9);
  return (
    <div className="ladder">
      <h4 className="mini-title">Support and resistance</h4>
      <ol>
        {rows.map((r) => (
          <li key={r.label} className={`ladder__row ladder__row--${r.kind}`}>
            <span className="ladder__label">{r.label}</span>
            <span className="ladder__bar" aria-hidden="true">
              {r.kind !== "price" && <i style={{ width: `${(Math.abs(r.v - price) / maxDist) * 100}%` }} />}
            </span>
            <span className="ladder__value">{num(r.v)}</span>
            <span className="ladder__pct">{r.kind === "price" ? "" : signedPct(r.v, price)}</span>
          </li>
        ))}
      </ol>
      {!supports.length && !resistances.length && <p className="note">No swing levels found in the last year.</p>}
    </div>
  );
}

function Technicals({ t, code }) {
  const e = t.explanation;
  return (
    <section className="sect" aria-label="Technicals">
      <div className="sect__head">
        <span className="eyebrow">Technicals · daily prices</span>
        <span className="note">
          {t.source} · data to {fmtDate(t.asOf)}
          {t.stale ? " · cached copy, may be stale" : ""}
        </span>
      </div>

      <div className="tiles">
        <Tile label="Last close" value={rm(t.price)} sub={`as of ${fmtShortDate(t.asOf)}`} />
        <Tile label="Trend" value={<Trend value={t.trend} />} sub="Close vs MA20 vs MA50" />
        <Tile label="RSI (14)" value={num(t.rsi14, 1, 1)} sub={rsiZone(t.rsi14)}>
          <RsiMeter value={t.rsi14} />
        </Tile>
        <Tile
          label="MA20 / MA50"
          value={
            <>
              {num(t.ma20)}
              <small className="tile__pair"> / {num(t.ma50)}</small>
            </>
          }
          sub={t.ma20 != null && t.ma50 != null ? `MA20 ${t.ma20 > t.ma50 ? "above" : "below"} MA50` : ""}
        />
      </div>

      <PriceChart chart={t.chart} supports={t.supports} resistances={t.resistances} code={code} />

      <div className="tech-grid">
        <LevelsLadder price={t.price} supports={t.supports} resistances={t.resistances} />
        <div className="explain">
          <div className="explain__head">
            <h4 className="mini-title">What the technical agent says</h4>
            {e && <Confidence value={e.confidence} note={e.confidenceNote} />}
          </div>
          {e ? (
            <dl className="explain__list">
              {[
                ["Trend", e.trendSummary],
                ["Levels", e.levelsCommentary],
                ["Momentum", e.momentumCommentary],
                ["Candles", e.candleCommentary],
              ]
                .filter(([, text]) => text)
                .map(([k, text]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="muted">No explanation for this draft.</p>
          )}
          {t.patterns.length > 0 && (
            <div className="patterns" aria-label="Candlestick patterns">
              {t.patterns.map((p, i) => (
                <span key={i} className="tag">
                  {cap(p.pattern)} · {fmtShortDate(p.date)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="note">Every level is computed in code from daily prices. The model only explains it.</p>
    </section>
  );
}

export default function CompanyCard({ company, nextUpdate }) {
  const { code, symbol, name, sector, market, shariah, technical, news } = company;
  return (
    <article className="card company" id={`company-${code}`} aria-label={`${name} (${code})`}>
      <header className="company__head">
        <div className="company__id">
          <div className="company__codes">
            <span className="ticker">{code}</span>
            <span className="mono muted">{symbol}</span>
            {market && <span className="tag">{MARKET_LABEL[market] ?? market}</span>}
          </div>
          <h3 className="company__name">{name}</h3>
          {sector && <span className="muted">{sector}</span>}
        </div>
        <ShariahBadge shariah={shariah} />
      </header>

      <ShariahStrip shariah={shariah} nextUpdate={nextUpdate} />

      {technical &&
        (technical.error ? (
          <SectionError title="Technical data unavailable." message={technical.error} />
        ) : (
          <Technicals t={technical} code={code} />
        ))}

      <NewsPanel news={news} code={code} />
    </article>
  );
}
