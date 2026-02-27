# Phase 4: Custom Visualizations & Deployment

## Status: Not started (depends on Phases 1-3)

## Goal

Add historical charts, advanced analytics, remote deployment, and mobile support.

## Features

### 4.1 — Historical usage trends
- Line chart: usage percentages over time (from scrape snapshots)
- Show how close you get to limits each week
- Identify usage patterns (heavy days, peak hours)

### 4.2 — Cost tracking
- Cumulative cost chart (from OTel data)
- Daily/weekly/monthly cost breakdown
- Cost by model comparison

### 4.3 — Model usage comparison
- Bar chart: tokens used per model (Opus vs Sonnet vs Haiku)
- Percentage of usage per model over time

### 4.4 — Session activity timeline
- Timeline view of Claude Code sessions
- Duration, tool usage, token consumption per session
- Powered by OTel events

### 4.5 — Remote deployment
- Deploy Express server to Railway, Render, or VPS
- HTTPS required for OTel export
- SQLite persistence (volumes or disk)
- Access dashboard from phone/other devices

### 4.6 — Mobile-responsive layout
- Responsive CSS for mobile/tablet viewing
- Touch-friendly charts

### 4.7 — Further customizations
- To be specified by the user based on what data proves most useful
- Potential: alerts when approaching limits, weekly email summaries, etc.
