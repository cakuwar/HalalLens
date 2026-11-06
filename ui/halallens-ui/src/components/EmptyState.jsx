import { useEffect, useRef } from "react";
import { PipelineDemo } from "./PipelineGraph.jsx";
import { ArrowRight, Newspaper, Search, Shield, TrendLine } from "./Icons.jsx";
import { fmtDate } from "../format.js";

const EXAMPLES = [
  { q: "Analyse Tenaga", tag: "Full brief" },
  { q: "Compare TENAGA vs YTLPOWR", tag: "Compare" },
  { q: "Is Public Bank halal?", tag: "Shariah" },
  { q: "analisa maybnk", tag: "Typo + Malay" },
  { q: "Should I buy CIMB now?", tag: "Advice bait" },
  { q: "Analyse Apple", tag: "Out of scope" },
];

const AGENTS = [
  {
    Icon: Shield,
    name: "Shariah agent",
    rule: "Lookup, no LLM",
    text: "Looks the stock up on the official SC list and cites the list date. The model never judges compliance.",
  },
  {
    Icon: TrendLine,
    name: "Technical agent",
    rule: "Numbers from code",
    text: "Support, resistance, moving averages and RSI are computed in pandas. The model only explains them.",
  },
  {
    Icon: Newspaper,
    name: "News agent",
    rule: "Every claim cited",
    text: "Searches The Edge, The Star, Bernama and NST, tags sentiment, and links each claim to its headline.",
  },
];

export default function EmptyState({ query, setQuery, onSubmit, config }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="empty">
      <div className="empty__hero">
        <div className="empty__intro">
          <span className="pill pill--green">LangGraph · 3 parallel agents · human-in-the-loop</span>
          <h1 className="empty__title">
            Research any Bursa stock, <span className="accent-text">Shariah status first.</span>
          </h1>
          <p className="empty__lead">
            Three agents check Shariah status, technicals and news in parallel. A writer drafts a cited brief, and
            nothing is saved until you approve it.
          </p>

          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(query);
            }}
          >
            <label htmlFor="hl-query" className="sr-only">Ask about a Bursa Malaysia stock</label>
            <div className="ask__box">
              <Search className="ask__icon" />
              <input
                ref={inputRef}
                id="hl-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Analyse Maybank, or Compare TENAGA vs YTLPOWR"
                autoComplete="off"
              />
              <kbd className="ask__kbd" aria-hidden="true">/</kbd>
              <button type="submit" className="btn btn--primary btn--lg">
                Analyse <ArrowRight />
              </button>
            </div>
          </form>

          <div className="examples" aria-label="Example questions">
            {EXAMPLES.map((ex) => (
              <button key={ex.q} type="button" className="chip chip--example" onClick={() => onSubmit(ex.q)}>
                <span>{ex.q}</span>
                <span className="chip__tag">{ex.tag}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card empty__graph">
          <div className="empty__graph-head">
            <span className="eyebrow">How a question flows</span>
            <span className="note">One LangGraph StateGraph</span>
          </div>
          <PipelineDemo />
          <p className="note">The supervisor fans out to three agents at once. The writer waits for all of them, then the run pauses for you.</p>
        </div>
      </div>

      {config && (
        <dl className="stats">
          <div>
            <dt>Shariah-compliant securities</dt>
            <dd>{config.scCompliantCount?.toLocaleString("en-MY") ?? "—"}</dd>
          </div>
          <div>
            <dt>SC list effective</dt>
            <dd>{fmtDate(config.scListDate)}</dd>
          </div>
          <div>
            <dt>Next scheduled SC update</dt>
            <dd>{fmtDate(config.nextScUpdate)}</dd>
          </div>
          <div>
            <dt>Revisions per brief</dt>
            <dd>Up to {config.maxRevisions}</dd>
          </div>
        </dl>
      )}

      <div className="agents">
        {AGENTS.map(({ Icon, name, rule, text }) => (
          <div key={name} className="agent-card">
            <div className="agent-card__top">
              <span className="agent-card__icon"><Icon width={24} height={24} /></span>
              <span className="tag">{rule}</span>
            </div>
            <span className="agent-card__name">{name}</span>
            <span className="muted">{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
