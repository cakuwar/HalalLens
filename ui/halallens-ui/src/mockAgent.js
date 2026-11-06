/**
 * Demo mode: a simulated LangGraph run that emits the same events and brief shape as the
 * real backend (app/api/main.py + app/brief.py), so the UI works with no backend.
 *
 * Prices are a synthetic random walk and headlines are placeholders. Every demo brief is
 * labelled as demo data in the UI. Shariah statuses below match the SC list of 28 Nov 2025.
 */

const STEP_MS = 650;

export const MOCK_CONFIG = {
  scListDate: "2025-11-28",
  scCompliantCount: 859,
  nextScUpdate: "2026-11-27",
  maxRevisions: 2,
  models: { agent: "demo", writer: "demo" },
  langfuseSessionUrl: null,
  version: "demo",
};

const SC_SOURCE = "Securities Commission Malaysia, List of Shariah-compliant Securities";

const COMPANIES = {
  5347: { name: "Tenaga Nasional Berhad", sector: "Utilities", market: "Main", status: "compliant", seed: 7, start: 13.4 },
  6742: { name: "YTL Power International Berhad", sector: null, market: null, status: "non_compliant", seed: 11, start: 3.9 },
  1155: { name: "Malayan Banking Berhad", sector: null, market: null, status: "non_compliant", seed: 5, start: 10.2 },
};

// --- Synthetic market data -------------------------------------------------------------

function rng(seed) {
  let s = seed * 9973;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function businessDays(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

const round = (v, dp = 3) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function rolling(values, n) {
  return values.map((_, i) => (i + 1 < n ? null : values.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));
}

function wilderRsi(values, period = 14) {
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return loss === 0 ? 100 : round(100 - 100 / (1 + gain / loss), 1);
}

function swingLevels(values, price, window = 5, top = 3) {
  const lows = [], highs = [];
  for (let i = window; i < values.length - window; i++) {
    const slice = values.slice(i - window, i + window + 1);
    if (values[i] === Math.min(...slice)) lows.push(round(values[i]));
    if (values[i] === Math.max(...slice)) highs.push(round(values[i]));
  }
  return {
    supports: [...new Set(lows.filter((v) => v < price))].sort((a, b) => b - a).slice(0, top),
    resistances: [...new Set(highs.filter((v) => v > price))].sort((a, b) => a - b).slice(0, top),
  };
}

function technicalFor(code) {
  const c = COMPANIES[code];
  const r = rng(c.seed);
  const n = 250;
  const raw = [];
  let v = c.start;
  for (let i = 0; i < n; i++) {
    v *= 1 + (r() - 0.5) * 0.024 + Math.sin(i / 23) * 0.0018;
    raw.push(Math.max(0.05, v));
  }
  const close = raw.map((x) => round(x, 2));
  const ma20 = rolling(close, 20);
  const ma50 = rolling(close, 50);
  const price = close.at(-1);
  const { supports, resistances } = swingLevels(close, price);
  const m20 = round(ma20.at(-1)), m50 = round(ma50.at(-1));
  const trend = price > m20 && m20 > m50 ? "uptrend" : price < m20 && m20 < m50 ? "downtrend" : "sideways";
  const dates = businessDays(n);
  const days = 130;
  return {
    price, supports, resistances, ma20: m20, ma50: m50, rsi14: wilderRsi(close), trend,
    patterns: [{ date: dates.at(-2), pattern: "doji" }],
    asOf: dates.at(-1), bars: n, stale: false, source: "Demo data (synthetic prices)",
    chart: {
      dates: dates.slice(-days),
      close: close.slice(-days),
      ma20: ma20.slice(-days).map((x) => round(x)),
      ma50: ma50.slice(-days).map((x) => round(x)),
    },
    explanation: {
      trendSummary: `Demo: the last close sits ${price > m20 ? "above" : "below"} MA20 and MA20 is ${m20 > m50 ? "above" : "below"} MA50, so the trend reads as ${trend}.`,
      levelsCommentary: `Demo: the nearest support is ${supports[0] ?? "not found"} and the nearest resistance is ${resistances[0] ?? "not found"}.`,
      momentumCommentary: "Demo: RSI14 between 30 and 70 is usually read as neither overbought nor oversold.",
      candleCommentary: "Demo: one doji on the previous session, a sign of indecision.",
      confidence: "medium",
      confidenceNote: "Demo data: synthetic prices.",
    },
  };
}

function newsFor(code) {
  const name = COMPANIES[code].name;
  return {
    summary: `Demo: placeholder coverage for ${name}. In live mode this lists real headlines from The Edge, The Star, Bernama and NST, retrieved by Tavily.`,
    sentiment: "neutral",
    confidence: "low",
    confidenceNote: "Demo headlines are placeholders.",
    keyPoints: [
      { claim: "Demo key point backed by headline 1.", sources: [1] },
      { claim: "Demo key point backed by headlines 2 and 3.", sources: [2, 3] },
    ],
    headlines: [
      { n: 1, title: `[Demo headline] ${name} quarterly results`, url: "#", source: "theedgemalaysia.com", publishedDate: null, snippet: "", cited: true },
      { n: 2, title: `[Demo headline] ${name} in sector news`, url: "#", source: "thestar.com.my", publishedDate: null, snippet: "", cited: true },
      { n: 3, title: "[Demo headline] Bursa market wrap", url: "#", source: "bernama.com", publishedDate: null, snippet: "", cited: true },
      { n: 4, title: "[Demo headline] Unrelated business story", url: "#", source: "nst.com.my", publishedDate: null, snippet: "", cited: false },
    ],
  };
}

function companyFor(code) {
  const c = COMPANIES[code];
  const listDate = MOCK_CONFIG.scListDate;
  return {
    code, symbol: `${code}.KL`, name: c.name, sector: c.sector, market: c.market,
    shariah: {
      status: c.status, listDate, source: SC_SOURCE, reclassified: false,
      note: c.status === "compliant" ? null : `Not on the SC list dated ${listDate}, which includes only Shariah-compliant securities.`,
    },
    technical: technicalFor(code),
    news: newsFor(code),
  };
}

function narrativeFor(companies, query) {
  const advice = /\b(buy|sell|target)\b/i.test(query) ? "HalalLens provides research only and does not make buy or sell calls.\n\n" : "";
  return advice + companies.map((c) => {
    const t = c.technical;
    return [
      `### ${c.name} (${c.code})`,
      `**Summary**: Demo write-up for ${c.name}. In live mode the writer agent drafts this from the tool results.`,
      `**Shariah status**: ${c.shariah.status === "compliant" ? "Compliant" : "Non-compliant"}, per the SC list dated ${MOCK_CONFIG.scListDate}.`,
      `**Technicals**: ${t.trend}, last close ${t.price}, support ${t.supports.join(", ") || "none"}, resistance ${t.resistances.join(", ") || "none"}, RSI14 ${t.rsi14}, MA20 ${t.ma20}, MA50 ${t.ma50}.`,
      "**News and sentiment**: demo key point [1]; another demo point [2] [3].",
      "**Confidence**: Shariah high, technicals medium, news low (demo data).",
    ].join("\n\n");
  }).join("\n\n");
}

function briefFor(query, threadId, version, status = "draft", savedId = null) {
  const q = query.toLowerCase();
  let codes = ["5347"];
  let scopeMessage = null;
  if (/\b(apple|tesla|nvidia|microsoft|amazon)\b/.test(q)) {
    codes = [];
    scopeMessage = "HalalLens only covers stocks listed on Bursa Malaysia. Apple is listed in the US.";
  } else if (/\bytl\b(?!\s*pow)/.test(q) && !/compare|vs/.test(q)) {
    codes = [];
    scopeMessage = "'YTL' could mean YTL Power International Berhad (6742) or YTL Corporation Berhad (4677). Which one did you mean?";
  } else if (/compare|\bvs\b|versus/.test(q)) codes = ["5347", "6742"];
  else if (/may ?b|maybnk|malayan/.test(q)) codes = ["1155"];

  const companies = codes.map(companyFor);
  const narrative = companies.length ? narrativeFor(companies, query) : "";
  return {
    query, threadId, savedId, status, version,
    generatedAt: new Date().toISOString(),
    scopeMessage, narrative,
    markdown: narrative,
    disclaimer: "HalalLens provides research only, not financial advice. It does not make buy or sell recommendations or price predictions. Shariah status is quoted from the Securities Commission Malaysia list as at the date shown; check the latest list before acting.",
    companies,
    demo: true,
  };
}

// --- Simulated graph run -----------------------------------------------------------------

const threads = new Map(); // threadId -> { query, version }
const saved = [];

function schedule(events, onEvent) {
  const timers = events.map(([delay, ev]) => setTimeout(() => onEvent(typeof ev === "function" ? ev() : ev), delay));
  return { cancel: () => timers.forEach(clearTimeout) };
}

function runGraph(threadId, onEvent, { revise = false } = {}) {
  const thread = threads.get(threadId);
  const brief = () => briefFor(thread.query, threadId, thread.version);
  const preview = briefFor(thread.query, threadId, thread.version);
  const codes = preview.companies.map((c) => c.code);
  const t = (n) => n * STEP_MS;

  if (!codes.length) {
    return schedule([
      [0, { type: "start", threadId }],
      [t(0.2), { type: "node", node: "supervisor", status: "running" }],
      [t(1.2), { type: "node", node: "supervisor", status: "done", detail: preview.scopeMessage, agents: [] }],
      [t(1.3), { type: "node", node: "writer", status: "running" }],
      [t(1.8), { type: "node", node: "writer", status: "done", detail: "Explained why nothing was researched" }],
      [t(2), () => ({ type: "interrupt", threadId, version: thread.version, maxRevisions: 2, brief: brief() })],
    ], onEvent);
  }

  const agents = revise ? ["news"] : ["shariah", "technical", "news"];
  const names = preview.companies.map((c) => `${c.name} · ${c.code}`).join(", ");
  const detail = (node) => preview.companies.map((c) => {
    if (node === "shariah") return `${c.code} ${c.shariah.status === "compliant" ? "Compliant" : "Non-compliant"} · SC list 28 Nov 2025`;
    if (node === "technical") return `${c.code} RM${c.technical.price} · ${c.technical.trend} · RSI ${c.technical.rsi14}`;
    return `${c.code} ${c.news.headlines.length} headlines · ${c.news.sentiment}`;
  }).join(" | ");

  const events = [
    [0, { type: "start", threadId }],
    [t(0.2), { type: "node", node: "supervisor", status: "running" }],
    [t(1.3), { type: "node", node: "supervisor", status: "done", agents, detail: revise ? `Revising with ${agents.join(", ")} agents` : `Resolved ${names} · ${agents.length} agents` }],
  ];
  const finish = { shariah: 2.0, technical: 3.1, news: 3.8 };
  agents.forEach((a) => {
    events.push([t(1.4), { type: "node", node: a, status: "running" }]);
    events.push([t(finish[a]), { type: "node", node: a, status: "done", detail: detail(a) }]);
  });
  events.push([t(3.9), { type: "node", node: "writer", status: "running" }]);
  events.push([t(5.6), { type: "node", node: "writer", status: "done", detail: `Draft ready · ${preview.narrative.split(/\s+/).length} words` }]);
  events.push([t(5.7), () => ({ type: "interrupt", threadId, version: thread.version, maxRevisions: 2, brief: brief() })]);
  return schedule(events, onEvent);
}

export function mockStart(query, threadId, onEvent) {
  const id = threadId || `demo${Math.random().toString(16).slice(2, 8)}`;
  threads.set(id, { query, version: 1 });
  return runGraph(id, onEvent);
}

export function mockResume(threadId, decision, onEvent) {
  const thread = threads.get(threadId);
  if (!thread) return schedule([[0, { type: "error", message: "This thread is not waiting for review." }]], onEvent);
  if (decision.action === "approve") {
    const hasCompanies = briefFor(thread.query, threadId, thread.version).companies.length > 0;
    const savedId = hasCompanies ? `demo-${Date.now()}` : null;
    const brief = briefFor(thread.query, threadId, thread.version, "approved", savedId);
    if (savedId) saved.unshift(brief);
    return schedule([[350, { type: "final", threadId, savedId, brief }]], onEvent);
  }
  thread.version = Math.min(thread.version + 1, 3);
  return runGraph(threadId, onEvent, { revise: true });
}

export async function mockListBriefs() {
  return saved.map((b) => ({
    savedId: b.savedId,
    query: b.query,
    generatedAt: b.generatedAt,
    companies: b.companies.map((c) => ({ code: c.code, name: c.name, shariahStatus: c.shariah.status })),
  }));
}

export async function mockGetBrief(savedId) {
  const brief = saved.find((b) => b.savedId === savedId);
  if (!brief) throw new Error("Brief not found");
  return brief;
}
