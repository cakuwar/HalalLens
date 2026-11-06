import { Bookmark, Logo, Menu, Plus, Star } from "./Icons.jsx";
import { timeAgo } from "../format.js";

export default function Sidebar({ view, onNew, onSaved, saved, onOpenSaved, open, onToggle, mode, config }) {
  const recent = (saved || []).slice(0, 5);
  return (
    <nav className={`sidebar ${open ? "is-open" : ""}`} aria-label="Main">
      <div className="sidebar__brand">
        <Logo />
        <div className="sidebar__brand-text">
          <span className="sidebar__name">HalalLens</span>
          <span className="sidebar__tag">Bursa research agent</span>
        </div>
        <button type="button" className="sidebar__menu-btn" aria-label="Toggle menu" aria-expanded={open} onClick={onToggle}>
          <Menu />
        </button>
      </div>

      <div className="sidebar__body">
        <div className="sidebar__group">
          <button type="button" className={`sidebar__link ${view === "research" ? "is-active" : ""}`} onClick={onNew}>
            <Plus /> New research
          </button>
          <button
            type="button"
            className={`sidebar__link ${view === "saved" || view === "savedDetail" ? "is-active" : ""}`}
            onClick={onSaved}
          >
            <Bookmark /> Saved briefs
            {saved?.length > 0 && <span className="sidebar__count">{saved.length}</span>}
          </button>
          <button type="button" className="sidebar__link" disabled title="Stretch goal: remember a watchlist across sessions">
            <Star /> Watchlist <span className="sidebar__soon">Soon</span>
          </button>
        </div>

        <div className="sidebar__group">
          <span className="sidebar__label">Recent briefs</span>
          {recent.length === 0 && <span className="sidebar__empty">Approved briefs appear here.</span>}
          {recent.map((b) => (
            <button type="button" key={b.savedId} className="sidebar__recent" onClick={() => onOpenSaved(b.savedId)}>
              <span className="sidebar__recent-name">{b.companies.map((c) => c.name).join(" vs ") || b.query}</span>
              <span className="sidebar__recent-meta">
                {b.companies.map((c) => (
                  <span key={c.code} className="sidebar__code">
                    <i
                      className={`sdot sdot--${c.shariahStatus === "compliant" ? "ok" : c.shariahStatus ? "no" : "unknown"}`}
                      aria-hidden="true"
                    />
                    {c.code}
                  </span>
                ))}
                <span>{timeAgo(b.generatedAt)}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar__foot">
          <div className={`mode mode--${mode}`}>
            <i aria-hidden="true" />
            {mode === "live" ? (
              <span>
                Live backend · <code>{config?.models?.agent?.replace(/^\w+:/, "") ?? "?"}</code>
              </span>
            ) : (
              <span>Demo mode · simulated data</span>
            )}
          </div>
          <div className="sidebar__note">
            <strong>Research only</strong>
            <span>HalalLens never gives buy or sell calls. Not financial advice.</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
