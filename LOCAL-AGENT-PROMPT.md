# Task: Implement Local Agent for Remote Scraping

## Context

CMUA (Claude Max Usage Analytics) is deployed on a headless Bitnami Lightsail server (512MB RAM, no Chrome, no GUI). The scraper (`capture/scrape-usage.js`) uses Playwright with non-headless real Chrome to bypass Cloudflare on claude.ai. It cannot run on the server.

The solution: a **local polling agent** that runs on the user's macOS machine (which has Chrome), polls the server for scrape requests, runs the scraper locally, and POSTs results back to the remote API.

## Current Architecture

```
Browser → Apache (443) → ClaudeMD-api (port 3003) → CMUA API (port 3004)
```

- **CMUA API** runs at `/home/bitnami/server/CMUA/` via PM2 (`claude-usage` process, port 3004)
- **Frontend** served as static files at `/opt/bitnami/apache/htdocs/CMUA/` (also at `/home/bitnami/server/CMUA/public/`)
- Apache proxies `/api/scrape` → port 3003 (ClaudeMD-api), which proxies → port 3004 (CMUA)
- `POST /api/scrape/trigger` currently tries to spawn `scrape-usage.js` as a child process on the server — **this always fails** because there's no Chrome
- The scraper already supports `--post-url=URL` and `--api-key=KEY` flags for remote posting

## What to Build

### 1. Server-side: Add pending scrape flag (`server/db.js`)

Add an `app_state` key/value table to the existing SQLite database:

```sql
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Add two helper functions:
- `setPendingScrape(bool)` — sets/clears the `pending_scrape` key with current timestamp
- `getPendingScrape()` — returns `{ pending: true/false, requestedAt: <ISO string> | null }`

Export both from `db.js`.

### 2. Server-side: Modify scrape routes (`server/routes/scrape.js`)

Three changes:

**a) `POST /trigger`** — Replace the `spawn(child)` logic with:
- Call `setPendingScrape(true)`
- Return `{ status: 'queued', message: 'Scrape queued for local agent pickup' }`
- Keep the `isScraping` guard to prevent duplicate queuing (check both `isScraping` and existing pending flag)

**b) `GET /status`** — Add to the response:
- `pendingScrape: true/false` (from `getPendingScrape()`)
- `pendingScrapeRequestedAt: <ISO string> | null`

**c) `POST /` (snapshot receipt, the `requireApiKey`-protected route)** — After the existing `insertSnapshot()` call:
- Call `setPendingScrape(false)` to clear the flag (scrape was fulfilled)

### 3. Frontend: Handle pending state (`public/app.js`)

In `scrapeNow()`:
- After successful trigger response with `status === 'queued'`, update the button to show "Queued…" with spinner
- Keep spinner visible; the next `loadStatus()` poll (every 30s) will detect when scrape completes

In `loadStatus()`:
- When `status.pendingScrape === true`, show a "Scrape queued" indicator in the status bar
- If `pendingScrapeRequestedAt` is more than 5 minutes old, show "Queued (agent may be offline)"

### 4. New file: Local agent (`capture/local-agent.js`)

A Node.js polling daemon that runs on the user's macOS machine. No Playwright dependency — it spawns `scrape-usage.js` as a child process.

**Config** (reads from `capture/.local-agent.env`):
```
REMOTE_URL=https://brennan.games
SCRAPE_API_KEY=5cdf54443c5423a661e6088fdfe40d5ff5c9169f700d4f711521cd52d29f4143
POLL_INTERVAL_SECONDS=30
```

**Behaviour:**
1. On startup, log "CMUA Local Agent started — polling <REMOTE_URL> every <N>s"
2. Every `POLL_INTERVAL_SECONDS`, fetch `GET <REMOTE_URL>/api/scrape/status`
3. Run the scraper when EITHER condition is true:
   - `status.pendingScrape === true` (dashboard triggered)
   - `status.nextScheduledAt` has passed and agent hasn't already scraped since that time
4. To run the scraper: `spawn('node', ['capture/scrape-usage.js', '--refresh', '--post-url=<REMOTE_URL>/api/scrape', '--api-key=<KEY>'])` from the project root
5. Prevent concurrent runs with a local `isRunning` flag
6. Log each action with timestamps: `[2026-03-06 10:30:00] Scrape triggered (reason: dashboard request)`
7. If scraper exits with code 2 (AUTH_REQUIRED), log: `Auth expired. Run: node capture/save-auth.js`
8. On fetch errors (server unreachable), log warning and continue polling

**Dependencies:** Only `dotenv` (already in package.json). Uses Node built-in `fetch` and `child_process.spawn`.

### 5. New file: Config template (`capture/.local-agent.env.example`)

```
# Remote CMUA server URL (no trailing slash)
REMOTE_URL=https://brennan.games

# API key (must match SCRAPE_API_KEY in server .env)
SCRAPE_API_KEY=

# How often to check for pending scrapes (seconds)
POLL_INTERVAL_SECONDS=30
```

Add `capture/.local-agent.env` to `.gitignore`.

### 6. New file: macOS LaunchAgent (`capture/com.brennan.cmua-local-agent.plist`)

A launchd plist that auto-starts the agent on login:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.brennan.cmua-local-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>node</string>
        <string>capture/local-agent.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/CMUA</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cmua-local-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cmua-local-agent.err</string>
</dict>
</plist>
```

Include a comment at the top explaining the user must update `WorkingDirectory` and ensure `node` is in PATH.

## Files Summary

| File | Action | Location |
|---|---|---|
| `server/db.js` | Modify | Server |
| `server/routes/scrape.js` | Modify | Server |
| `public/app.js` | Modify | Server + copy to `/opt/bitnami/apache/htdocs/CMUA/` |
| `capture/local-agent.js` | Create | Repo (runs locally) |
| `capture/.local-agent.env.example` | Create | Repo |
| `capture/com.brennan.cmua-local-agent.plist` | Create | Repo (installed locally) |
| `.gitignore` | Modify | Add `capture/.local-agent.env` |

## Do NOT change

- `capture/scrape-usage.js` — no changes needed (already has --post-url and --api-key flags)
- `capture/save-auth.js` — no changes needed
- Apache config — no changes needed
- PM2 ecosystem — no changes needed
- `.env` — no changes needed

## Workflow

Follow the CLAUDE.md gates:
1. **Gate 1 (Plan):** This prompt IS the plan — proceed to implement
2. **Gate 2 (Test):** After implementation, test with `curl` against the API endpoints, verify the frontend shows pending state
3. **Gate 3 (Merge):** Create PR, present diff summary

## Version

Bump version in `package.json` per the `V.MM.PPPP` convention.

## Related

- GitHub Issue #5: Server upgrade to $12/month (future alternative that eliminates local agent)
- Phase 2.6 spec: Cron scheduling — this implementation fulfills it via local agent polling
