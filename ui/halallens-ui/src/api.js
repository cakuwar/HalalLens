/**
 * HalalLens client: one event protocol, two transports (live FastAPI backend or demo mock).
 *
 * Events passed to onEvent (same shapes as app/api/main.py):
 *   { type: "start",     threadId }
 *   { type: "node",      node, status: "running" | "done", detail?, agents? }
 *   { type: "interrupt", threadId, version, maxRevisions, brief }   graph paused at human_review
 *   { type: "final",     threadId, savedId, brief }                 approved + saved
 *   { type: "error",     message }
 *
 * Mode: VITE_USE_MOCK=true forces demo data, VITE_USE_MOCK=false forces the backend,
 * unset = use the backend if /api/config answers, otherwise fall back to demo mode.
 */

import { MOCK_CONFIG, mockGetBrief, mockListBriefs, mockResume, mockStart } from "./mockAgent.js";

const FORCE = import.meta.env.VITE_USE_MOCK; // "true" | "false" | undefined
let mode = FORCE === "true" ? "demo" : "live";

export const getMode = () => mode;

/** Decide live vs demo and load the UI config (SC list date, revision cap, trace links). */
export async function connect() {
  if (FORCE === "true") return { mode: (mode = "demo"), config: MOCK_CONFIG, reason: "forced" };
  try {
    const res = await fetchWithTimeout("/api/config", 3500);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { mode: (mode = "live"), config: await res.json() };
  } catch (err) {
    if (FORCE === "false") throw err;
    return { mode: (mode = "demo"), config: MOCK_CONFIG, reason: "offline" };
  }
}

export function startResearch(query, threadId, onEvent) {
  if (mode === "demo") return mockStart(query, threadId, onEvent);
  return streamSSE("/api/research", { query, thread_id: threadId || undefined }, onEvent);
}

export function resumeResearch(threadId, decision, onEvent) {
  if (mode === "demo") return mockResume(threadId, decision, onEvent);
  return streamSSE(`/api/resume/${encodeURIComponent(threadId)}`, decision, onEvent);
}

export async function listBriefs() {
  if (mode === "demo") return mockListBriefs();
  const res = await fetch("/api/briefs");
  if (!res.ok) throw new Error(`Could not load saved briefs (${res.status})`);
  return res.json();
}

export async function getBrief(savedId) {
  if (mode === "demo") return mockGetBrief(savedId);
  const res = await fetch(`/api/briefs/${encodeURIComponent(savedId)}`);
  if (!res.ok) throw new Error(`Could not open this brief (${res.status})`);
  return res.json();
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** POST a JSON body and parse the Server-Sent Events response. Returns { cancel }. */
function streamSSE(url, body, onEvent) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let message = `Backend returned ${res.status}`;
        try {
          message = (await res.json()).detail || message;
        } catch {
          /* not JSON */
        }
        onEvent({ type: "error", message });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const data = chunk
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data) continue;
          try {
            onEvent(JSON.parse(data));
          } catch {
            /* ignore keep-alives / malformed lines */
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        onEvent({ type: "error", message: `Lost connection to the backend: ${err.message}` });
      }
    }
  })();

  return { cancel: () => controller.abort() };
}
