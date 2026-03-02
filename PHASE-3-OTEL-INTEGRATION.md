# Phase 3: OpenTelemetry Integration

## Status: Not started (depends on Phase 1)

## Goal

Add a lightweight OTLP receiver to the Express server so Claude Code can stream real-time usage metrics directly to the dashboard, filling the gaps between Playwright scrapes.

## Background

Claude Code has built-in OpenTelemetry export. When enabled, it sends:
- **Metrics:** token usage, cost, session count, lines of code, commits, PRs, active time
- **Events:** user prompts, tool results, API requests/errors, tool decisions

See https://code.claude.com/docs/en/monitoring-usage for full documentation.

## Features

### 3.1 — OTLP HTTP/JSON receiver
- Add endpoints: `POST /v1/metrics` and `POST /v1/logs`
- Parse OTLP JSON payloads (no need for protobuf or gRPC)
- Authenticate with a simple bearer token
- No Docker, no Prometheus, no external collector — just Express routes

### 3.2 — OTel database tables
```sql
CREATE TABLE otel_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metric_name TEXT,
  value REAL,
  unit TEXT,
  attributes TEXT,  -- JSON
  session_id TEXT
);

CREATE TABLE otel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_name TEXT,
  attributes TEXT,  -- JSON
  session_id TEXT,
  prompt_id TEXT
);
```

### 3.3 — Dashboard OTel section
- Real-time token usage (input vs output) between scrapes
- Cost accumulation since last scrape
- Active sessions indicator
- Tool usage breakdown (Edit, Write, Bash, etc.)

### 3.4 — Claude Code configuration
User adds to `~/.zshrc`:
```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:8080
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer your-token"
```

## Key OTel metrics from Claude Code

| Metric | Unit | Attributes |
|--------|------|-----------|
| `claude_code.token.usage` | tokens | type (input/output/cacheRead/cacheCreation), model |
| `claude_code.cost.usage` | USD | model |
| `claude_code.session.count` | count | — |
| `claude_code.lines_of_code.count` | count | type (added/removed) |
| `claude_code.active_time.total` | seconds | type (user/cli) |
| `claude_code.commit.count` | count | — |
| `claude_code.pull_request.count` | count | — |

---

## Implementation Notes (from first attempt)

### What's Done — Backend (complete, kept in branch)

Three new files are fully working and tested:

1. **`server/middleware/otelAuth.js`** — Bearer token auth middleware. Reads `OTEL_BEARER_TOKEN` from env; skips auth if not set. Returns 401 for invalid/missing tokens.

2. **`server/routes/otel.js`** — OTLP HTTP/JSON receiver with `POST /v1/metrics` and `POST /v1/logs`.
   - Parses the deeply nested OTLP structure: `resourceMetrics[].scopeMetrics[].metrics[].sum.dataPoints[]`
   - Helper `flattenAttributes()` converts OTLP KeyValue `[{key, value:{stringValue}}]` to flat objects
   - Helper `extractSessionId()` pulls `session.id` from resource attributes
   - Helper `extractValue()` handles `asInt` / `asDouble` / `value` variants
   - Returns `{}` on success per OTLP spec

3. **`server/routes/otelApi.js`** — Dashboard-facing API with `GET /api/otel/summary`, `/metrics`, `/events`.
   - Summary returns aggregated `tokenUsage`, `totalCost`, `activeSessions`, `toolUsage`

### What's Missing — Integration into existing files

The following files need **minimal, additive changes** to wire in the backend:

1. **`server/db.js`** — Add 2 new tables (`otel_metrics`, `otel_events`) to `initDb()` and add 5 functions: `insertOtelMetricsBatch`, `insertOtelEventsBatch`, `getOtelMetrics`, `getOtelEvents`, `getOtelSummary`. The OTel summary uses `json_extract(attributes, '$.type')` for token type aggregation and `json_extract(attributes, '$.tool_name')` for tool usage.

2. **`server/index.js`** — Mount 2 route files (`/v1` for OTLP receiver, `/api/otel` for dashboard API), increase JSON body limit to 5MB with `express.json({ limit: '5mb' })`.

3. **`public/index.html`** — Add OTel inline elements **inside existing dashboard sections** (not as a new standalone section):
   - Token counts inside Plan Usage Limits section
   - API cost inside Extra Usage details row
   - Sessions count inside Account Info row
   - Tool usage as a new `<section>` inside the `#dashboard` div
   - All OTel elements start `hidden` and are revealed by JS when data exists

4. **`public/style.css`** — Add styles for `.otel-inline`, `.otel-inline-header`, `.otel-inline-stats`, `.otel-inline-stat`, `.otel-live` (pulsing dot), `.otel-tool-item`, `.otel-tool-bar-track`, `.otel-tool-bar-fill`, `.otel-tool-count`

5. **`public/app.js`** — Add `loadOtelData()` function that fetches `/api/otel/summary` and pipes data into inline elements. Add `formatNumber()` and `escapeHtml()` helpers. Call `loadOtelData()` on init and `setInterval(loadOtelData, 30 * 1000)`.

6. **`.env.example`** — Add `OTEL_BEARER_TOKEN=changeme`

7. **`package.json`** — Bump version

### Key Lessons Learned

- **Do NOT change dashboard visibility logic.** The `#dashboard` div must remain controlled by scrape data only (`loadData()` shows/hides it). OTel data only enhances the dashboard when scrape data is also present — never show the dashboard based on OTel data alone, or Phase 1 sections render empty.
- **Do NOT create a standalone OTel section outside `#dashboard`.** All OTel data should be piped **inline** into existing Phase 1/Phase 2 sections. The only new section allowed is Tool Usage, and it goes inside `#dashboard`.
- **Phase 2 UI must be pixel-identical.** The status bar (auth dot, refresh time, expiry, Scrape Now button) and scrape history table must not change at all.
- **The auth link (`#auth-reauth-link`) stays hidden by default**, only shown when auth status is `expired`. Don't make it always visible.
- **Auth file info already works** from Phase 2 (`authFileLastRefreshed`, `authFileExpiresAt` in `/api/scrape/status`). The dummy auth file at `capture/.auth-state.json` enables this for testing.
- **OTLP payload structure is deeply nested** — metrics live at `resourceMetrics[].scopeMetrics[].metrics[]`, with data points under `.sum.dataPoints[]`, `.gauge.dataPoints[]`, or `.histogram.dataPoints[]`.
- **Session ID** can be at data-point level attributes OR resource-level attributes — check both.
- **`better-sqlite3` transactions** are needed for efficient batch inserts of OTel data.
