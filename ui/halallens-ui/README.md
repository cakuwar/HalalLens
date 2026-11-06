# HalalLens UI

React (Vite) front end for HalalLens, the Shariah-first research agent for Bursa Malaysia stocks.

## Run it

```bash
cd ui/halallens-ui
npm install
npm run dev          # http://localhost:5180
```

Start the backend too (from the project root): `uvicorn app.api.main:app --reload --port 8010`.
The dev server proxies `/api` to `http://localhost:8010`; set `HALALLENS_API_URL` to point it elsewhere.

**Demo mode.** If the backend doesn't answer, the UI falls back to a simulated LangGraph run with
synthetic prices, and says so in a banner. `VITE_USE_MOCK=true` forces demo mode;
`VITE_USE_MOCK=false` forces the backend (see `.env.example`).

**Deep links.** `/?q=Analyse%20Tenaga` starts a run on load; `/?saved=<id>` opens a saved brief.

## What's on screen

- **Live agent graph.** The LangGraph drawn as it runs: the supervisor fans out to three agents in
  parallel, the writer joins them, and the run pauses at human review. Each step shows what the node
  wrote and how long it took. A revise loop re-runs only the agents the feedback needs; the rest show "Kept".
- **Brief, three views.** *Overview* (Shariah status, price chart, levels, news), *Write-up* (the
  writer agent's Markdown, with hoverable citations) and *Evidence* (the raw tool output the writer
  was allowed to use).
- **Price chart.** Six months of daily closes with MA20, MA50 and the nearest support and resistance,
  a crosshair tooltip, keyboard navigation (arrow keys) and a table view. Every number comes from the
  technical tool; the chart only positions it. Series colours are validated for colour-vision deficiency
  in light and dark mode, and lines are direct-labelled.
- **Compare.** "Compare TENAGA vs YTLPOWR" adds a side-by-side table with the same structure for each company.
- **Review.** Approve and save, or revise (two revisions at most) with quick suggestions.
  Ctrl+Enter approves.
- **Saved briefs and follow-ups.** Approved briefs reopen exactly as reviewed. A follow-up ("now compare
  with CIMB") stays in the same thread, so the checkpointer keeps the context.
- **Langfuse.** In live mode, "Open this run in Langfuse" links straight to the thread's session.
- Dark mode, print/PDF, Markdown download, phone layout, reduced-motion support.

## Event protocol

The backend streams Server-Sent Events; each `data:` line is one JSON event:

| Event | Fields |
| --- | --- |
| `start` | `threadId` |
| `node` | `node` (supervisor, shariah, technical, news, writer), `status` (running, done), `detail`, `agents` |
| `interrupt` | `threadId`, `version`, `maxRevisions`, `brief` (graph paused at human review) |
| `final` | `threadId`, `savedId`, `brief` (approved and saved) |
| `error` | `message` |

| Endpoint | Body |
| --- | --- |
| `POST /research` | `{"query": "Analyse Tenaga", "thread_id": "optional, for follow-ups"}` |
| `POST /resume/{thread_id}` | `{"action": "approve"}` or `{"action": "revise", "feedback": "..."}` |
| `GET /config` | SC list date, next SC update, revision cap, models, Langfuse session URL |
| `GET /briefs`, `GET /briefs/{id}` | Saved briefs |

The brief object is built by `app/brief.py`; `src/mockAgent.js` produces the same shape.

## Files

```text
src/
  App.jsx                   state machine: idle → running → review → approved, views, theme
  api.js                    live/demo transport, SSE client, saved briefs
  mockAgent.js              demo run with synthetic prices (same events and brief shape)
  format.js, hooks.js       display helpers, resize/clock/reduced-motion hooks
  components/
    Sidebar.jsx             nav, recent briefs, live/demo indicator
    EmptyState.jsx          hero, ask box, examples, animated pipeline, SC stats
    PipelineGraph.jsx       the LangGraph diagram (live and looping demo)
    AgentRunPanel.jsx       live node status, timers, thread id, Langfuse link
    BriefView.jsx           header, tabs, scope message, evidence, sources
    CompanyCard.jsx         Shariah strip, stat tiles, RSI meter, levels ladder, agent explanation
    PriceChart.jsx          SVG chart with crosshair tooltip and table view
    NewsPanel.jsx           sentiment, key points with citations, headlines
    CompareTable.jsx        side-by-side metrics
    Markdown.jsx            writer Markdown with citation links (no raw HTML)
    ReviewBar.jsx           approve / revise bar, approved bar with follow-up
    SavedBriefs.jsx         saved brief grid
  styles.css                design tokens (light + dark), layout, print
Dockerfile, nginx.conf      production image used by docker compose (port 8080)
```

Research only. Not financial advice.
