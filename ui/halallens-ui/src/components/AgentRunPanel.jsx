import { PipelineGraph } from "./PipelineGraph.jsx";
import { Clock, Copy, Database, DoneDot, ErrorDot, External, PauseDot, QueuedDot, SkipDot, Spinner } from "./Icons.jsx";
import { elapsed } from "../format.js";
import { useNow } from "../hooks.js";

export const AGENT_NODES = [
  { id: "supervisor", name: "Supervisor", hint: "Resolves the ticker, picks agents" },
  { id: "shariah", name: "Shariah agent", hint: "Official SC Shariah list lookup" },
  { id: "technical", name: "Technical agent", hint: "Daily prices · S/R, MA, RSI in code" },
  { id: "news", name: "News agent", hint: "Tavily · The Edge, The Star, Bernama, NST" },
  { id: "writer", name: "Writer", hint: "Joins results, drafts a cited brief" },
];

const LABELS = { done: "Done", running: "Running", pending: "Queued", waiting: "Your turn", skipped: "Kept", error: "Failed" };

function StatusIcon({ status }) {
  if (status === "done") return <DoneDot />;
  if (status === "running") return <Spinner size={20} />;
  if (status === "waiting") return <PauseDot />;
  if (status === "skipped") return <SkipDot />;
  if (status === "error") return <ErrorDot />;
  return <QueuedDot />;
}

export default function AgentRunPanel({ nodes, stage, version, revisionsRequested, threadId, startedAt, endedAt, config, mode, onToast }) {
  const running = stage === "running";
  const now = useNow(running);
  const total = startedAt ? (endedAt ?? now) - startedAt : null;

  const reviewStatus = stage === "approved" ? "done" : stage === "review" ? "waiting" : "pending";
  const status = { ...Object.fromEntries(Object.entries(nodes).map(([k, v]) => [k, v.status])), human_review: reviewStatus };

  const [tone, label] =
    stage === "running"
      ? ["blue", revisionsRequested ? `Revision ${revisionsRequested} running` : "Running"]
      : stage === "review"
        ? ["amber", "Paused for review"]
        : stage === "error"
          ? ["red", "Failed"]
          : ["green", "Complete"];

  const sessionUrl = config?.langfuseSessionUrl && threadId
    ? config.langfuseSessionUrl.replace("{threadId}", encodeURIComponent(threadId))
    : null;

  const copyThread = async () => {
    try {
      await navigator.clipboard.writeText(threadId);
      onToast?.("Thread id copied");
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <aside className="card run" aria-label="Agent run">
      <div className="run__head">
        <span className="run__title">Agent run</span>
        <span className={`pill pill--${tone}`}>{label}</span>
      </div>
      <div className="run__clock" aria-live="off">
        <Clock /> <span className="mono">{total != null ? elapsed(total) : "—"}</span>
        <span className="note">
          {running && revisionsRequested ? `drafting v${revisionsRequested + 1}` : version > 1 ? `draft v${version}` : "first draft"}
        </span>
      </div>

      <PipelineGraph status={status} revising={revisionsRequested > 0} />

      <ol className="run__steps" aria-live="polite">
        {AGENT_NODES.map((n) => {
          const s = nodes[n.id];
          const dur = s.startedAt ? (s.endedAt ?? now) - s.startedAt : null;
          return (
            <li key={n.id} className={`run__step run__step--${s.status}`} aria-current={s.status === "running" ? "step" : undefined}>
              <span className="run__icon"><StatusIcon status={s.status} /></span>
              <span className="run__text">
                <span className="run__name">{n.name}</span>
                <span className="run__detail">{s.detail ?? n.hint}</span>
              </span>
              <span className="run__label">
                {LABELS[s.status]}
                {dur != null && s.status !== "skipped" && <span className="run__dur mono">{elapsed(dur)}</span>}
              </span>
            </li>
          );
        })}
        <li className={`run__step run__step--${reviewStatus}`}>
          <span className="run__icon"><StatusIcon status={reviewStatus} /></span>
          <span className="run__text">
            <span className="run__name">Human review</span>
            <span className="run__detail">{stage === "approved" ? "Approved by you" : "interrupt() waits for your decision"}</span>
          </span>
          <span className="run__label">{LABELS[reviewStatus]}</span>
        </li>
      </ol>

      <div className="run__foot">
        <span className="run__meta"><Database /> Checkpoint saved after every step</span>
        {threadId && (
          <span className="run__meta">
            Thread <code>{threadId}</code>
            <button type="button" className="icon-btn icon-btn--xs" onClick={copyThread} aria-label="Copy thread id">
              <Copy width={13} height={13} />
            </button>
          </span>
        )}
        {mode === "live" && config?.models && (
          <span className="run__meta">
            Agents <code>{config.models.agent.replace(/^\w+:/, "")}</code> · writer <code>{config.models.writer.replace(/^\w+:/, "")}</code>
          </span>
        )}
        {sessionUrl ? (
          <a href={sessionUrl} target="_blank" rel="noreferrer" className="btn btn--ghost btn--block">
            Open this run in Langfuse <External />
          </a>
        ) : (
          <span className="note">{mode === "demo" ? "Langfuse traces are linked in live mode." : "Set Langfuse keys to link traces here."}</span>
        )}
      </div>
    </aside>
  );
}
