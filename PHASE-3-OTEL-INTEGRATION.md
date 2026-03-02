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
