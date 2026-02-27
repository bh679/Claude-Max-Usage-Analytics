# Phase 2: Scrape Management

## Status: Not started (depends on Phase 1)

## Goal

Add scrape lifecycle management to the dashboard: status display, scheduling, manual trigger, and auth monitoring.

## Features

### 2.1 — Last scraped timestamp
- Show absolute timestamp of most recent scrape in the dashboard header
- Show relative time ("5 minutes ago", "2 hours ago")

### 2.2 — Next scheduled scrape
- Display when the next cron-triggered scrape will run
- Countdown timer

### 2.3 — "Scrape Now" button
- Button in dashboard UI that triggers an immediate scrape
- Server endpoint: `POST /api/scrape/trigger`
- Server spawns `capture/scrape-usage.js --post` as a child process
- Shows spinner/loading state while scraping
- Auto-refreshes dashboard when scrape completes

### 2.4 — Auth status indicator
- Green indicator: auth state is valid (last scrape succeeded)
- Yellow indicator: auth state is aging (>12 hours old)
- Red indicator: auth expired (last scrape returned AUTH_REQUIRED)
- Link to re-auth instructions when red

### 2.5 — Scrape history log
- Table showing recent scrape attempts
- Columns: timestamp, status (success/fail/auth-needed), duration
- Stored in a new `scrape_log` SQLite table

### 2.6 — Cron scheduling
- macOS launchd plist or cron job setup script
- Configurable interval (default: every 4 hours)
- Setup instructions in README
