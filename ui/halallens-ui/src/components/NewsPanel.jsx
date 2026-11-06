import { Confidence, SectionError, Sentiment } from "./bits.jsx";
import { External } from "./Icons.jsx";
import { flashHeadline, fmtDate } from "../format.js";

function Headline({ h, code }) {
  const live = h.url && h.url !== "#";
  return (
    <li id={`news-${code}-${h.n}`} className="headline">
      <span className="headline__n mono">{h.n}</span>
      <div className="headline__text">
        {live ? (
          <a href={h.url} target="_blank" rel="noreferrer">
            {h.title} <External />
          </a>
        ) : (
          <span className="headline__title">{h.title}</span>
        )}
        <span className="note">
          {h.source}
          {h.publishedDate ? ` · ${fmtDate(h.publishedDate)}` : ""}
        </span>
      </div>
    </li>
  );
}

export default function NewsPanel({ news, code }) {
  if (!news) return null;
  if (news.error) return <SectionError title="News unavailable." message={news.error} />;

  const cited = news.headlines.filter((h) => h.cited);
  const unused = news.headlines.filter((h) => !h.cited);

  return (
    <section className="sect" aria-label="News and sentiment">
      <div className="sect__head">
        <span className="eyebrow">News and sentiment</span>
        <div className="sect__chips">
          <Sentiment value={news.sentiment} />
          <Confidence value={news.confidence} note={news.confidenceNote} />
        </div>
      </div>

      {news.summary && <p className="sect__lead">{news.summary}</p>}

      {news.keyPoints?.length > 0 && (
        <ul className="keypoints">
          {news.keyPoints.map((kp, i) => (
            <li key={i}>
              <span>{kp.claim}</span>
              {kp.sources.map((n) => (
                <button
                  type="button"
                  key={n}
                  className="cite"
                  onClick={() => flashHeadline(code, n)}
                  aria-label={`Show headline ${n}`}
                >
                  {n}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}

      {cited.length > 0 && (
        <ol className="headlines" aria-label="Headlines used">
          {cited.map((h) => <Headline key={h.n} h={h} code={code} />)}
        </ol>
      )}

      {unused.length > 0 && (
        <details className="headlines__more">
          <summary>
            {unused.length} more {unused.length === 1 ? "headline" : "headlines"} retrieved but not used
          </summary>
          <ol className="headlines">
            {unused.map((h) => <Headline key={h.n} h={h} code={code} />)}
          </ol>
        </details>
      )}

      {news.headlines.length === 0 && <p className="muted">No recent headlines were found on the sites searched.</p>}
      {news.confidenceNote && <p className="note">{news.confidenceNote}</p>}
    </section>
  );
}
