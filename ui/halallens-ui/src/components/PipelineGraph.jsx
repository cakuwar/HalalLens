import { useEffect, useState } from "react";
import { useElementWidth, usePrefersReducedMotion } from "../hooks.js";
import { Check } from "./Icons.jsx";

const H = 262;
const LAYOUT = [
  { id: "supervisor", label: "Supervisor", fx: 0.5, y: 24 },
  { id: "shariah", label: "Shariah", fx: 1 / 6, y: 96 },
  { id: "technical", label: "Technical", fx: 0.5, y: 96 },
  { id: "news", label: "News", fx: 5 / 6, y: 96 },
  { id: "writer", label: "Writer", fx: 0.5, y: 168 },
  { id: "human_review", label: "Human review", fx: 0.5, y: 238 },
];
const EDGES = [
  ["supervisor", "shariah"],
  ["supervisor", "technical"],
  ["supervisor", "news"],
  ["shariah", "writer"],
  ["technical", "writer"],
  ["news", "writer"],
  ["writer", "human_review"],
];
const HALF = 15; // half the node height

function edgeState(from, to, status) {
  const t = status[to];
  if (t === "running" || t === "waiting") return status[from] === "done" || from === "supervisor" ? "active" : "idle";
  if (t === "done") return status[from] === "skipped" ? "idle" : "done";
  return "idle";
}

/**
 * The LangGraph as a live diagram: supervisor fans out to three agents in parallel,
 * the writer joins them, and the run pauses at human review. Decorative (aria-hidden):
 * the step list next to it carries the same information as text.
 */
export function PipelineGraph({ status, revising = false }) {
  const [ref, width] = useElementWidth(300);
  const pos = Object.fromEntries(LAYOUT.map((n) => [n.id, { x: n.fx * width, y: n.y }]));
  const loopActive = revising && status.supervisor === "running";

  return (
    <div className="pg" ref={ref} style={{ height: H }} aria-hidden="true">
      <svg width={width} height={H} className="pg__edges">
        {EDGES.map(([a, b]) => {
          const p = pos[a], q = pos[b];
          const y1 = p.y + HALF, y2 = q.y - HALF, mid = (y1 + y2) / 2;
          return (
            <path
              key={`${a}-${b}`}
              d={`M${p.x},${y1} C${p.x},${mid} ${q.x},${mid} ${q.x},${y2}`}
              className={`pg__edge pg__edge--${edgeState(a, b, status)}`}
            />
          );
        })}
        <path
          d={`M${pos.human_review.x + 62},${pos.human_review.y} H${width - 8} V${pos.supervisor.y} H${pos.supervisor.x + 56}`}
          className={`pg__edge pg__edge--loop ${loopActive ? "pg__edge--active" : ""}`}
        />
        <text x={width - 12} y={(pos.writer.y + pos.human_review.y) / 2 - 18} textAnchor="end" className="pg__loop-label">
          revise ≤ 2
        </text>
      </svg>
      {LAYOUT.map((n) => (
        <div
          key={n.id}
          className={`pg__node pg__node--${status[n.id] || "pending"} ${n.id === "human_review" ? "pg__node--review" : ""}`}
          style={{ left: pos[n.id].x, top: pos[n.id].y }}
        >
          {status[n.id] === "done" && <Check width={12} height={12} />}
          {status[n.id] === "running" && <span className="pg__pulse" />}
          {n.label}
        </div>
      ))}
    </div>
  );
}

// A scripted run for the landing page, looping. Static (all done) with reduced motion.
const SCRIPT = [
  { supervisor: "running" },
  { supervisor: "done", shariah: "running", technical: "running", news: "running" },
  { supervisor: "done", shariah: "done", technical: "running", news: "running" },
  { supervisor: "done", shariah: "done", technical: "done", news: "running" },
  { supervisor: "done", shariah: "done", technical: "done", news: "done", writer: "running" },
  { supervisor: "done", shariah: "done", technical: "done", news: "done", writer: "done", human_review: "waiting" },
  { supervisor: "done", shariah: "done", technical: "done", news: "done", writer: "done", human_review: "waiting" },
  { supervisor: "done", shariah: "done", technical: "done", news: "done", writer: "done", human_review: "done" },
];

export function PipelineDemo() {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) return undefined;
    const id = setInterval(() => setStep((s) => (s + 1) % (SCRIPT.length + 1)), 900);
    return () => clearInterval(id);
  }, [reduced]);
  const status = reduced ? SCRIPT.at(-1) : SCRIPT[step] || {};
  return <PipelineGraph status={status} />;
}
