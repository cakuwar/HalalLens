import { useState } from "react";
import CompanyCard from "./CompanyCard.jsx";
import CompareTable from "./CompareTable.jsx";
import Markdown from "./Markdown.jsx";
import { Check, Code, Copy, Download, FileText, Grid, Info, Printer, Send } from "./Icons.jsx";
import { briefFilename, briefTitle, downloadText, fmtDate, fmtDateTime } from "../format.js";

const TABS = [
  { id: "overview", label: "Overview", Icon: Grid },
  { id: "writeup", label: "Write-up", Icon: FileText },
  { id: "evidence", label: "Evidence", Icon: Code },
];

function StatusPill({ stage, version }) {
  if (stage === "review") return <span className="pill pill--amber">Draft v{version} · awaiting your review</span>;
  if (stage === "approved") return <span className="pill pill--green"><Check width={14} height={14} /> Approved and saved</span>;
  if (stage === "saved") return <span className="pill pill--green"><Check width={14} height={14} /> Saved brief</span>;
  return null;
}

/** Shown when the supervisor found nothing to research (out of scope, ambiguous, not found). */
function ScopeCard({ message, onAskAgain }) {
  const [text, setText] = useState("");
  // "'YTL' could mean YTL Power International Berhad (6742) or ..." -> one chip per candidate
  const options = [...(message || "").matchAll(/([A-Z][\w&.'-]*(?:\s(?:[A-Z][\w&.'-]*|&|\(M\)))*)\s\((\d{4,5})\)/g)].map((m) => ({
    name: m[1].trim(),
    code: m[2],
  }));
  return (
    <div className="card scope" role="status">
      <span className="scope__icon"><Info width={22} height={22} /></span>
      <div className="scope__body">
        <h3>Nothing to research yet</h3>
        <p>{message}</p>
        {options.length > 0 && (
          <div className="scope__options">
            {options.map((o) => (
              <button key={o.code} type="button" className="chip" onClick={() => onAskAgain?.(`Analyse ${o.name}`)}>
                {o.name} <span className="mono muted">{o.code}</span>
              </button>
            ))}
          </div>
        )}
        {onAskAgain && (
          <form
            className="inline-ask"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) onAskAgain(text.trim());
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Rephrase, e.g. Analyse YTL Power"
              aria-label="Rephrase your question"
            />
            <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim()}>
              Ask <Send />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Evidence({ companies }) {
  return (
    <div className="evidence">
      <p className="muted">
        Everything the agents returned for this draft. The writer may only use these facts, and every number in the brief
        must appear here. The price series is summarised; the full series is in the chart&apos;s table view.
      </p>
      {companies.map((c) => {
        const t = c.technical && !c.technical.error ? { ...c.technical, chart: `${c.technical.chart?.close?.length ?? 0} daily points` } : c.technical;
        return (
          <details key={c.code} className="evidence__item" open={companies.length === 1}>
            <summary>
              <span className="mono">{c.code}</span> {c.name}
            </summary>
            <pre>{JSON.stringify({ shariah: c.shariah, technical: t, news: c.news }, null, 2)}</pre>
          </details>
        );
      })}
    </div>
  );
}

function Sources({ brief }) {
  const rows = [];
  const sc = brief.companies.find((c) => c.shariah?.listDate)?.shariah;
  if (sc) rows.push(`Securities Commission Malaysia, List of Shariah-compliant Securities (effective ${fmtDate(sc.listDate)})`);
  brief.companies.forEach((c) => {
    if (c.technical?.source) rows.push(`${c.code} prices: ${c.technical.source}, daily data to ${fmtDate(c.technical.asOf)}`);
    if (c.news?.headlines?.length) {
      const domains = [...new Set(c.news.headlines.map((h) => h.source))].join(", ");
      rows.push(`${c.code} news: ${c.news.headlines.length} headlines from ${domains}, via Tavily`);
    }
  });
  return (
    <footer className="sources">
      <strong>Sources</strong>
      <ul>
        {rows.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="sources__disclaimer">{brief.disclaimer}</p>
    </footer>
  );
}

export default function BriefView({ brief, stage, version, nextUpdate, onToast, onAskAgain }) {
  const [tab, setTab] = useState("overview");
  const companies = brief.companies || [];

  if (!companies.length) return <ScopeCard message={brief.scopeMessage} onAskAgain={onAskAgain} />;

  const headlines = Object.fromEntries(companies.map((c) => [c.code, c.news?.headlines || []]));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.markdown);
      onToast?.("Copied the brief as Markdown");
    } catch {
      onToast?.("Couldn't copy: the browser blocked clipboard access");
    }
  };

  return (
    <article className="brief" aria-label="Research brief">
      <header className="card brief__head">
        <div className="brief__top">
          <div className="brief__title-wrap">
            <div className="brief__eyebrow">
              <span className="eyebrow">Research brief</span>
              {brief.demo && <span className="tag tag--demo">Demo data</span>}
            </div>
            <h2 className="brief__title">{briefTitle(brief)}</h2>
            <div className="brief__meta">
              <span className="mono">{companies.map((c) => c.code).join(" · ")}</span>
              <span aria-hidden="true">·</span>
              <span>Generated {fmtDateTime(brief.generatedAt)}</span>
            </div>
          </div>
          <StatusPill stage={stage} version={version ?? brief.version} />
        </div>

        {brief.scopeMessage && (
          <div className="callout" role="note">
            <Info /> {brief.scopeMessage}
          </div>
        )}

        <div className="brief__toolbar">
          <div className="tabs" role="tablist" aria-label="Brief views">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`tab ${tab === id ? "is-active" : ""}`}
                onClick={() => setTab(id)}
              >
                <Icon /> {label}
              </button>
            ))}
          </div>
          <div className="brief__actions no-print">
            <button type="button" className="icon-btn" onClick={copy} title="Copy as Markdown" aria-label="Copy as Markdown">
              <Copy />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => downloadText(briefFilename(brief), brief.markdown)}
              title="Download .md"
              aria-label="Download as Markdown file"
            >
              <Download />
            </button>
            <button type="button" className="icon-btn" onClick={() => window.print()} title="Print or save as PDF" aria-label="Print or save as PDF">
              <Printer />
            </button>
          </div>
        </div>
      </header>

      <div role="tabpanel" className="tabpanel" hidden={tab !== "overview"}>
        {companies.length > 1 && <CompareTable companies={companies} />}
        {companies.map((c) => (
          <CompanyCard key={c.code} company={c} nextUpdate={nextUpdate} />
        ))}
      </div>

      <div role="tabpanel" className="tabpanel tabpanel--writeup card" hidden={tab !== "writeup"}>
        <div className="writeup__head">
          <span className="eyebrow">Writer agent&apos;s brief</span>
          <span className="note">Numbers are quoted from the tools. Hover a citation to see its headline.</span>
        </div>
        <Markdown text={brief.narrative} headlines={headlines} />
      </div>

      <div role="tabpanel" className="tabpanel card no-print" hidden={tab !== "evidence"}>
        <Evidence companies={companies} />
      </div>

      <Sources brief={brief} />
    </article>
  );
}
