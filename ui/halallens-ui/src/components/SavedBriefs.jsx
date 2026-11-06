import { ShariahBadge } from "./bits.jsx";
import { Bookmark, Plus, Spinner } from "./Icons.jsx";
import { fmtDateTime } from "../format.js";

export default function SavedBriefs({ items, loading, error, onOpen, onNew }) {
  return (
    <section className="saved" aria-label="Saved briefs">
      <header className="saved__head">
        <div>
          <h1 className="saved__title">Saved briefs</h1>
          <p className="muted">Every brief you approved. Each one keeps its tool outputs, so it reopens exactly as reviewed.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={onNew}>
          <Plus /> New research
        </button>
      </header>

      {loading && (
        <div className="saved__state"><Spinner /> Loading saved briefs…</div>
      )}
      {error && <div className="section-error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="card saved__empty">
          <Bookmark width={28} height={28} />
          <strong>No saved briefs yet</strong>
          <span className="muted">Approve a brief and it lands here, as Markdown and structured JSON in data/briefs/.</span>
        </div>
      )}

      <div className="saved__grid">
        {items.map((b) => (
          <button key={b.savedId} type="button" className="card saved__card" onClick={() => onOpen(b.savedId)}>
            <span className="note">{fmtDateTime(b.generatedAt)}</span>
            <strong className="saved__names">{b.companies.map((c) => c.name).join(" vs ") || b.query}</strong>
            <span className="saved__query">“{b.query}”</span>
            <span className="saved__badges">
              {b.companies.map((c) => (
                <span key={c.code} className="saved__company">
                  <span className="ticker ticker--sm">{c.code}</span>
                  <ShariahBadge shariah={c.shariahStatus ? { status: c.shariahStatus } : null} size="sm" />
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
