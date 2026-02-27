# Phase 1: Scraping + Dashboard Replica

## Status: Ready for implementation

Steps 0 and 0b (bootstrap + initial commit) are complete. The project is set up at `~/Projects/Claude-Max-Usage-Analytics/` with a GitHub repo at https://github.com/bh679/Claude-Max-Usage-Analytics.

## Goal

Build a dashboard that replicates claude.ai/settings/usage as closely as possible, powered by Playwright scraping of the real usage page.

## Key Constraints

- **ALL headless modes are blocked** by Cloudflare — only non-headless real Chrome + storageState works
- Auth state saved via `save-auth.js` → `.auth-state.json` (gitignored)
- The usage page is SSR (Next.js) — no client-side API endpoints to call
- Only **percentages** are available (no raw token counts exist anywhere on the page)
- Session cookies are long-lived and auto-refresh during scraping

## Existing Code (already in repo)

| File | Purpose | Status |
|------|---------|--------|
| `playwright auth testing/save-auth.js` | Opens Chrome for manual login, saves cookies | Working |
| `playwright auth testing/scrape-usage.js` | Scrapes usage page (`--refresh`, `--output=json`, `--save`) | Working |
| `playwright auth testing/test-cdp-auth.js` | CDP connection approach | Working (untested for Cloudflare) |
| `playwright auth testing/test-storage-state-auth.js` | Headless variant | Blocked by Cloudflare |
| `playwright auth testing/test-persistent-context-auth.js` | Chrome profile approach | Untested |
| `playwright auth testing/USAGE-DATA-REFERENCE.md` | Complete data dictionary of scrapeable fields | Reference |
| `playwright auth testing/USAGE-SCRAPING-GUIDE.md` | Tested extraction script with exact selectors/regex | Reference |
| `playwright auth testing/AUTH-TESTING-RESULTS.md` | All auth approaches tested with results | Reference |
| `playwright auth testing/saved-page/` | Saved HTML of usage page (gitignored, local reference) | Reference |

## Architecture

```
scrape-usage.js ──extracts JSON──▶ POST /api/scrape ──▶ Express server ──▶ SQLite
                                                              │
                                                              ▼
                                                     Dashboard UI (port 8080)
                                                     (replicates claude.ai)
```

Everything runs locally. The scraper opens a non-headless Chrome window briefly.

---

## Step 1: Restructure project

Move `playwright auth testing/` contents into `capture/` directory. Keep reference docs accessible.

**Target structure:**
```
Claude-Max-Usage-Analytics/
├── capture/
│   ├── save-auth.js              # (from playwright auth testing/)
│   ├── scrape-usage.js           # (enhanced with --post flag)
│   ├── test-cdp-auth.js          # (from playwright auth testing/)
│   ├── test-storage-state-auth.js
│   ├── test-persistent-context-auth.js
│   ├── saved-page/               # (gitignored — saved HTML for reference)
│   └── .auth-state.json          # (gitignored)
├── server/
│   ├── index.js                  # Express entry point
│   ├── db.js                     # SQLite database layer
│   └── routes/
│       └── scrape.js             # Scrape API endpoints
├── public/
│   ├── index.html                # Dashboard HTML
│   ├── app.js                    # Dashboard logic (fetches API, renders)
│   └── style.css                 # Dark theme styling
├── docs/
│   ├── USAGE-DATA-REFERENCE.md   # (from playwright auth testing/)
│   ├── USAGE-SCRAPING-GUIDE.md   # (from playwright auth testing/)
│   └── AUTH-TESTING-RESULTS.md   # (from playwright auth testing/)
├── tests/                        # Playwright tests (Gate 2)
├── ports/                        # Session port management
├── package.json
├── .env.example
├── .gitignore
├── CLAUDE.md
├── PHASE-1-IMPLEMENTATION.md     # This file
├── PHASE-2-SCRAPE-MANAGEMENT.md
├── PHASE-3-OTEL-INTEGRATION.md
└── PHASE-4-CUSTOM-VISUALIZATIONS.md
```

**Actions:**
- `mkdir capture server server/routes public docs`
- Move scripts from `playwright auth testing/` → `capture/`
- Move reference docs from `playwright auth testing/` → `docs/`
- Remove empty `playwright auth testing/` directory
- Add dependencies to `package.json`: `express`, `better-sqlite3`, `cors`, `playwright`, `dotenv`
- Add to `.gitignore`: `*.db`
- Create `.env.example` with `PORT=8080`

---

## Step 2: Database layer

**File:** `server/db.js`

```sql
CREATE TABLE IF NOT EXISTS scrape_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  raw_json TEXT NOT NULL,

  -- Plan usage (percentages only — no raw token counts exist)
  session_percent REAL,
  session_exact_percent REAL,
  session_reset_in TEXT,
  all_models_percent REAL,
  all_models_exact_percent REAL,
  all_models_resets_at TEXT,
  sonnet_percent REAL,
  sonnet_exact_percent REAL,
  sonnet_resets_at TEXT,
  last_updated TEXT,

  -- Extra usage (dollar amounts in user's local currency)
  amount_spent TEXT,
  spend_limit TEXT,
  spend_percent REAL,
  current_balance TEXT,
  auto_reload BOOLEAN,
  extra_reset_date TEXT,

  -- Account metadata
  plan TEXT,
  country TEXT
);
```

**Exports:**
- `initDb()` — creates table if not exists, returns db instance
- `insertSnapshot(data)` — stores parsed scrape result + full raw JSON
- `getLatestSnapshot()` — returns most recent row
- `getSnapshots({ from, to, limit })` — date range query with pagination

---

## Step 3: Enhance scraper with --post flag

**File:** `capture/scrape-usage.js` (modify the existing working script)

Keep all existing flags working (`--refresh`, `--output=json`, `--save`). Add:
- `--post` — POSTs extracted JSON to `http://localhost:8080/api/scrape`
- `--post-url=URL` — custom endpoint (overrides default)

The extraction logic stays exactly as-is — it's tested and working. Only add the HTTP POST after extraction.

Auth state auto-refreshes after each run (already implemented in existing script).

---

## Step 4: Express server

**File:** `server/index.js`
- Start Express on `PORT` env var (default 8080)
- Initialize SQLite database via `db.js`
- Serve static files from `public/`
- Mount scrape API routes

**File:** `server/routes/scrape.js`
- `POST /api/scrape` — receives JSON from scraper, validates, stores in SQLite
- `GET /api/scrape/latest` — returns most recent snapshot
- `GET /api/scrape/history?from=&to=&limit=` — paginated history

Add `"start": "node server/index.js"` to package.json scripts.

---

## Step 5: Dashboard UI (claude.ai usage page replica)

The dashboard should visually replicate the claude.ai/settings/usage page layout and styling.

### What the usage page shows (from USAGE-DATA-REFERENCE.md)

**Plan Usage Limits — 3 progress bars:**

| Meter | Data | Reset format |
|-------|------|-------------|
| Current session | X% used | "Resets in 2 hr 7 min" (relative) |
| All models (weekly) | X% used | "Resets Sun 3:00 PM" (absolute) |
| Sonnet only (weekly) | X% used | "Resets Sun 3:59 PM" (absolute) |

Plus "Last updated: X minutes ago" below.

**Extra Usage Section:**
- Amount spent (e.g., "A$38.31 spent")
- Monthly spend limit (e.g., "A$78")
- Spend percentage (progress bar)
- Current balance (e.g., "A$39.18")
- Auto-reload status (on/off)
- Reset date (e.g., "Mar 1")

**Account metadata:**
- Plan (e.g., "claude_max")
- Country (e.g., "AU")

### Dashboard files

**`public/index.html`** — Layout (top to bottom):
1. Header: "Usage" title
2. Plan Usage section: 3 progress bars with labels, percentages, reset times
3. Extra Usage section: spending progress bar, balance, auto-reload, reset date
4. Account info: plan name, country
5. Data timestamp: when this snapshot was captured

**`public/style.css`** — Dark theme matching claude.ai:
- Dark gray/near-black background
- White text
- Teal/blue-green accent color for progress bar fills
- Rounded progress bars on gray tracks
- System sans-serif font stack
- Clean, minimal spacing

**`public/app.js`** — Client-side logic:
- On load: `fetch('/api/scrape/latest')` → populate DOM
- Auto-refresh every 5 minutes
- If no data yet: show "No usage data yet. Run the scraper to get started."
- Handle null/missing fields gracefully (e.g., extra usage may not exist)

---

## Step 6: Write future phase spec files

Create three placeholder spec files in the project root:

**`PHASE-2-SCRAPE-MANAGEMENT.md`** — Spec for:
- Display last scraped timestamp (absolute)
- Display next scheduled scrape time
- "Scrape Now" button in the dashboard UI that triggers an immediate scrape
- Auth status indicator (green = valid, red = needs re-auth)
- Scrape attempt log (success/fail/auth-needed per attempt)

**`PHASE-3-OTEL-INTEGRATION.md`** — Spec for:
- Add OTLP HTTP/JSON receiver endpoints to the Express server (`/v1/metrics`, `/v1/logs`)
- Store OTel metrics (tokens, costs, sessions, active time) in SQLite
- Store OTel events (tool usage, API calls) in SQLite
- Dashboard section showing real-time data between scrapes
- Claude Code env var configuration instructions

**`PHASE-4-CUSTOM-VISUALIZATIONS.md`** — Spec for:
- Historical usage trends (line charts over days/weeks)
- Cost accumulation over time
- Model usage comparison
- Session activity timeline
- Remote deployment instructions
- Mobile-responsive layout
- Further customizations to be specified by user

---

## Verification

1. **Start server:** `npm start` → Express running on port 8080
2. **Run scraper:** `node capture/scrape-usage.js --refresh --post` → Chrome opens, scrapes, POSTs to server
3. **View dashboard:** Open `http://localhost:8080` → see usage data matching claude.ai layout
4. **Compare:** Screenshot dashboard alongside claude.ai/settings/usage — verify visual match
5. **Persistence:** Run scraper again → second snapshot stored, latest displayed
6. **Playwright MCP:** Use browser tools to visually verify dashboard appearance

---

## Data Flow Summary

```
1. User runs:  node capture/save-auth.js          (one-time: log in, save cookies)
2. User runs:  npm start                          (starts Express on port 8080)
3. User runs:  node capture/scrape-usage.js --post (scrape → POST to server)
4. User opens: http://localhost:8080               (view dashboard)
```
