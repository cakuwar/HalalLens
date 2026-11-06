import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import EmptyState from "./components/EmptyState.jsx";
import AgentRunPanel, { AGENT_NODES } from "./components/AgentRunPanel.jsx";
import BriefView from "./components/BriefView.jsx";
import SavedBriefs from "./components/SavedBriefs.jsx";
import { ApprovedBar, ReviewBar } from "./components/ReviewBar.jsx";
import { ArrowLeft, External, Info, Moon, Spinner, Sun } from "./components/Icons.jsx";
import { connect, getBrief, listBriefs, resumeResearch, startResearch } from "./api.js";
import { briefFilename, briefTitle, downloadText, fmtDate, storageGet, storageSet } from "./format.js";

const AGENTS = ["shariah", "technical", "news"];
// Developer hints (like "start uvicorn") only make sense on your own machine, not on a public deploy.
const IS_LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const freshNodes = () =>
  Object.fromEntries(AGENT_NODES.map((n) => [n.id, { status: "pending", detail: null, startedAt: null, endedAt: null }]));

const initial = {
  view: "research", // research | saved | savedDetail
  stage: "idle", // idle | running | review | approved | error
  asked: "",
  threadId: null,
  version: 1,
  maxRevisions: 2,
  feedbacks: [], // revision requests sent in this run
  nodes: freshNodes(),
  startedAt: null,
  endedAt: null,
  brief: null,
  savedId: null,
  approving: false,
  error: null,
  earlier: [], // earlier questions in this thread (follow-ups)
};

function onNodeEvent(state, ev, now) {
  const prev = state.nodes[ev.node];
  if (!prev) return state;
  const nodes = { ...state.nodes };
  if (ev.status === "running") {
    nodes[ev.node] = { ...prev, status: "running", startedAt: prev.startedAt ?? now };
  } else {
    nodes[ev.node] = { ...prev, status: "done", endedAt: now, startedAt: prev.startedAt ?? now, detail: ev.detail ?? prev.detail };
    if (ev.node === "supervisor" && Array.isArray(ev.agents)) {
      AGENTS.filter((a) => !ev.agents.includes(a)).forEach((a) => {
        nodes[a] = {
          ...nodes[a],
          status: "skipped",
          detail: state.feedbacks.length ? "Kept from the previous draft" : "Not needed for this question",
        };
      });
    }
  }
  return { ...state, nodes };
}

function reducer(state, action) {
  const now = Date.now();
  switch (action.type) {
    case "start": {
      const keepThread = action.followUp && state.threadId;
      return {
        ...initial,
        stage: "running",
        asked: action.query,
        threadId: keepThread ? state.threadId : null,
        startedAt: now,
        earlier: keepThread && state.brief ? [...state.earlier, { asked: state.asked, brief: state.brief, stage: state.stage }] : [],
      };
    }
    case "revise":
      return { ...state, stage: "running", feedbacks: [...state.feedbacks, action.feedback], nodes: freshNodes(), startedAt: now, endedAt: null, error: null };
    case "approving":
      return { ...state, approving: true };
    case "event": {
      const ev = action.event;
      switch (ev.type) {
        case "start":
          return { ...state, threadId: ev.threadId };
        case "node":
          return onNodeEvent(state, ev, now);
        case "interrupt": {
          const nodes = Object.fromEntries(
            Object.entries(state.nodes).map(([k, v]) => [k, v.status === "pending" ? { ...v, status: "skipped", detail: v.detail ?? "Not needed" } : v])
          );
          return { ...state, stage: "review", nodes, brief: ev.brief, threadId: ev.threadId, version: ev.version ?? state.version, maxRevisions: ev.maxRevisions ?? state.maxRevisions, endedAt: now };
        }
        case "final":
          return { ...state, stage: "approved", brief: ev.brief ?? state.brief, savedId: ev.savedId ?? null, approving: false };
        case "error": {
          const nodes = Object.fromEntries(Object.entries(state.nodes).map(([k, v]) => [k, v.status === "running" ? { ...v, status: "error" } : v]));
          return { ...state, stage: "error", error: ev.message, nodes, approving: false, endedAt: now };
        }
        default:
          return state;
      }
    }
    case "view":
      return { ...state, view: action.view };
    case "reset":
      return initial;
    default:
      return state;
  }
}

function useTheme() {
  const [theme, setTheme] = useState(() => storageGet("hl-theme"));
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    storageSet("hl-theme", theme);
  }, [theme]);
  const effective = theme ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  return [effective, () => setTheme(effective === "dark" ? "light" : "dark")];
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [conn, setConn] = useState({ mode: null, config: null, reason: null });
  const [saved, setSaved] = useState({ items: [], loading: false, error: null });
  const [savedBrief, setSavedBrief] = useState(null);
  const [toast, setToast] = useState(null);
  const [theme, toggleTheme] = useTheme();
  const runRef = useRef(null);

  const onEvent = useCallback((event) => dispatch({ type: "event", event }), []);
  const cancelRun = () => runRef.current?.cancel?.();
  const showToast = useCallback((message) => setToast({ message, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const refreshSaved = useCallback(async () => {
    setSaved((s) => ({ ...s, loading: true, error: null }));
    try {
      setSaved({ items: await listBriefs(), loading: false, error: null });
    } catch (err) {
      setSaved((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const start = (q, { followUp = false } = {}) => {
    const asked = (q || "").trim() || "Analyse Tenaga";
    cancelRun();
    setQuery("");
    setFeedback("");
    setMenuOpen(false);
    dispatch({ type: "start", query: asked, followUp });
    runRef.current = startResearch(asked, followUp ? state.threadId : null, onEvent);
  };

  const openSaved = async (savedId) => {
    setMenuOpen(false);
    dispatch({ type: "view", view: "savedDetail" });
    setSavedBrief({ loading: true });
    try {
      setSavedBrief({ brief: await getBrief(savedId) });
    } catch (err) {
      setSavedBrief({ error: err.message });
    }
  };

  // Connect once: live backend if it answers, otherwise demo mode. Then honour ?q= and ?saved=.
  useEffect(() => {
    let alive = true;
    connect()
      .then((c) => {
        if (!alive) return;
        setConn(c);
        refreshSaved();
        const params = new URLSearchParams(window.location.search);
        if (params.get("q")) start(params.get("q"));
        else if (params.get("saved")) openSaved(params.get("saved"));
      })
      .catch((err) => alive && setConn({ mode: "error", config: null, reason: err.message }));
    return () => {
      alive = false;
      cancelRun();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.stage === "approved") refreshSaved();
  }, [state.stage, refreshSaved]);

  const revise = (fb) => {
    cancelRun();
    dispatch({ type: "revise", feedback: fb });
    setFeedback("");
    runRef.current = resumeResearch(state.threadId, { action: "revise", feedback: fb }, onEvent);
  };

  const approve = () => {
    if (state.approving) return;
    cancelRun();
    dispatch({ type: "approving" });
    runRef.current = resumeResearch(state.threadId, { action: "approve" }, onEvent);
  };

  const newResearch = () => {
    cancelRun();
    setQuery("");
    setFeedback("");
    setMenuOpen(false);
    dispatch({ type: "reset" });
  };

  const { stage, view, config } = { ...state, config: conn.config };
  const hasThread = stage !== "idle";
  const sessionUrl = config?.langfuseSessionUrl && state.threadId ? config.langfuseSessionUrl.replace("{threadId}", encodeURIComponent(state.threadId)) : null;

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar
        view={view}
        onNew={newResearch}
        onSaved={() => {
          setMenuOpen(false);
          dispatch({ type: "view", view: "saved" });
          refreshSaved();
        }}
        saved={saved.items}
        onOpenSaved={openSaved}
        open={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
        mode={conn.mode}
        config={config}
      />

      <main className="main" id="main">
        <header className="topbar">
          <div className="crumbs">
            {view === "research" ? (
              <>
                <strong>{!hasThread ? "New research" : state.brief?.companies?.length ? briefTitle(state.brief) : "Research"}</strong>
                {state.threadId && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span className="mono">thread {state.threadId}</span>
                  </>
                )}
              </>
            ) : (
              <strong>Saved briefs</strong>
            )}
          </div>
          <div className="topbar__meta">
            {config?.scListDate && (
              <span className="status-dot" title={`Next scheduled SC update: ${fmtDate(config.nextScUpdate)}`}>
                SC list effective {fmtDate(config.scListDate)}
              </span>
            )}
            {sessionUrl && view === "research" && (
              <a href={sessionUrl} target="_blank" rel="noreferrer" className="link-inline">
                Langfuse trace <External />
              </a>
            )}
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Toggle theme">
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>

        {conn.mode === "demo" && (
          <div className="banner" role="status">
            <Info />
            <span>
              <strong>Demo mode.</strong>{" "}
              {!IS_LOCAL
                ? "This deployment runs a simulated agent with synthetic prices and placeholder headlines, so you can try the full flow. Shariah statuses match the SC list."
                : conn.reason === "forced"
                  ? "VITE_USE_MOCK=true, so the UI runs a simulated agent with synthetic prices."
                  : "The backend isn't reachable, so the UI runs a simulated agent with synthetic prices. Start it with "}
              {IS_LOCAL && conn.reason !== "forced" && <code>uvicorn app.api.main:app --reload --port 8010</code>}
            </span>
          </div>
        )}
        {conn.mode === "error" && (
          <div className="section-error" role="alert">Can't reach the backend: {conn.reason}</div>
        )}
        {conn.mode === null && (
          <div className="booting"><Spinner /> Connecting…</div>
        )}

        {conn.mode && conn.mode !== "error" && view === "research" && stage === "idle" && (
          <EmptyState query={query} setQuery={setQuery} onSubmit={start} config={config} />
        )}

        {view === "research" && hasThread && (
          <div className={`workspace ${stage === "running" ? "" : "workspace--settled"}`}>
            <section className="thread" aria-label="Conversation">
              {state.earlier.map((e, i) => (
                <details key={i} className="earlier">
                  <summary>
                    <span className="bubble bubble--small">{e.asked}</span>
                    <span className="note">Earlier in this thread · {briefTitle(e.brief)} · {e.stage === "approved" ? "approved" : "not approved"}</span>
                  </summary>
                  <BriefView brief={e.brief} stage={e.stage === "approved" ? "approved" : "review"} nextUpdate={config?.nextScUpdate} onToast={showToast} />
                </details>
              ))}

              <div className="bubble">{state.asked}</div>
              {state.feedbacks.map((fb, i) => (
                <div key={i} className="revision-note">
                  <span className="thread__note">Draft v{i + 1} sent back for revision</span>
                  <div className="bubble bubble--amber">{fb}</div>
                </div>
              ))}

              {stage === "running" && (
                <div className="card loading">
                  <div className="loading__head">
                    <Spinner size={18} />
                    {state.feedbacks.length
                      ? "Re-running only the agents your feedback needs, then redrafting."
                      : "Agents are gathering facts in parallel. The writer drafts once they all report back."}
                  </div>
                  <div className="skeleton pulse" aria-hidden="true">
                    <div className="sk sk--title" />
                    <div className="sk sk--line" />
                    <div className="sk sk--line sk--short" />
                    <div className="sk-row">
                      <div className="sk sk--block" />
                      <div className="sk sk--block" />
                    </div>
                    <div className="sk sk--wide" />
                  </div>
                </div>
              )}

              {stage === "error" && (
                <div className="card error" role="alert">
                  <div>
                    <strong>The run failed.</strong> {state.error}
                  </div>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => start(state.asked)}>
                    Try again
                  </button>
                </div>
              )}

              {(stage === "review" || stage === "approved") && state.brief && (
                <BriefView
                  brief={state.brief}
                  stage={stage}
                  version={state.version}
                  nextUpdate={config?.nextScUpdate}
                  onToast={showToast}
                  onAskAgain={(q) => start(q, { followUp: true })}
                />
              )}

              {stage === "review" && state.brief?.companies?.length > 0 && (
                <ReviewBar
                  feedback={feedback}
                  setFeedback={setFeedback}
                  onRevise={revise}
                  onApprove={approve}
                  version={state.version}
                  maxRevisions={state.maxRevisions}
                  approving={state.approving}
                />
              )}

              {stage === "approved" && (
                <ApprovedBar
                  savedId={state.savedId}
                  onDownload={() => downloadText(briefFilename(state.brief), state.brief.markdown)}
                  onOpenSaved={() => dispatch({ type: "view", view: "saved" })}
                  onFollowUp={(q) => start(q, { followUp: true })}
                />
              )}
            </section>

            <AgentRunPanel
              nodes={state.nodes}
              stage={stage}
              version={state.version}
              revisionsRequested={state.feedbacks.length}
              threadId={state.threadId}
              startedAt={state.startedAt}
              endedAt={state.endedAt}
              config={config}
              mode={conn.mode}
              onToast={showToast}
            />
          </div>
        )}

        {view === "saved" && (
          <SavedBriefs items={saved.items} loading={saved.loading} error={saved.error} onOpen={openSaved} onNew={newResearch} />
        )}

        {view === "savedDetail" && (
          <div className="saved-detail">
            <button type="button" className="btn btn--ghost btn--sm back" onClick={() => dispatch({ type: "view", view: "saved" })}>
              <ArrowLeft /> All saved briefs
            </button>
            {savedBrief?.loading && <div className="booting"><Spinner /> Opening brief…</div>}
            {savedBrief?.error && <div className="section-error">{savedBrief.error}</div>}
            {savedBrief?.brief && <BriefView brief={savedBrief.brief} stage="saved" nextUpdate={config?.nextScUpdate} onToast={showToast} />}
          </div>
        )}
      </main>

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
