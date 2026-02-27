# Claude.ai Usage Page Data Reference

## Context

This document describes what data is available from the Claude.ai/settings/usage page, how to extract it, and what limitations exist. Use this when planning features that need Claude usage data.

---

## Data Available (Scrapeable via Browser DOM)

The usage page is **server-side rendered** — all data is baked into the HTML. There are no client-side API endpoints to call. Data must be scraped from the DOM using JavaScript in a browser context (e.g., Playwright, Chrome extension, or userscript).

### 1. Plan Usage Limits

Three progress meters showing usage as **percentages only**:

| Meter | Selector Pattern | Example Value |
|-------|-----------------|---------------|
| **Current session** | Text: "Current session", progress bar `style="width: X%"` | 10% used |
| **All models (weekly)** | Text: "All models", progress bar `style="width: X%"` | 46% used |
| **Sonnet only (weekly)** | Text: "Sonnet only", progress bar `style="width: X%"` | 8% used |

Each meter has:
- A percentage (integer in the text, but the progress bar `style="width"` can have decimals)
- A reset time (relative for session like "2 hr 7 min", or absolute for weekly like "Sun 3:00 PM")
- A "Last updated" relative timestamp (e.g., "1 minute ago")
- A "Refresh usage limits" button (aria-label) that triggers a server-side re-render

**Extraction approach (regex on `document.body.innerText`):**
```javascript
const sessionMatch = document.body.innerText.match(/Current session\s*Resets in ([^\n]+)\s*(\d+)% used/);
const allModelsMatch = document.body.innerText.match(/All models\s*Resets ([^\n]+)\s*(\d+)% used/);
const sonnetMatch = document.body.innerText.match(/Sonnet only\s*Resets ([^\n]+)\s*(\d+)% used/);
const lastUpdated = document.body.innerText.match(/Last updated:\s*([^\n]+)/);
```

**Extraction approach (progress bar widths for exact values):**
```javascript
const bars = document.querySelectorAll('[style*="width:"]');
// Returns 4 bars in order: session, all-models, sonnet-only, extra-usage-spend
// Parse with: bar.style.width.match(/([\d.]+)%/)
```

### 2. Extra Usage (Dollar Amounts)

Located in `[data-testid="extra-usage-section"]`. This is the **only section with absolute numbers** (monetary values in local currency).

| Field | Example Value | Notes |
|-------|---------------|-------|
| Amount spent | A$38.31 | In user's local currency |
| Monthly spend limit | A$78 | Configurable by user |
| % of spend used | 49% (49.4323% exact from bar width) | |
| Current balance | A$39.18 | Pre-paid credits remaining |
| Auto-reload status | "Auto-reload off" | On or off |
| Reset date | "Mar 1" | Monthly reset |
| Extra usage toggle | On/Off | Whether extra usage is enabled |

**Extraction approach:**
```javascript
const extraSection = document.querySelector('[data-testid="extra-usage-section"]');
const text = extraSection.innerText;
// Parse: "A$38.31 spent", "A$78\nMonthly spend limit", "A$39.18\nCurrent balance"
```

### 3. Account/Plan Metadata

Available from HTML attributes on the root `<html>` element:

| Attribute | Example Value | Description |
|-----------|---------------|-------------|
| `data-org-plan` | `claude_max` | Subscription tier |
| `data-cf-country` | `AU` | User's country |
| `data-mode` | `dark` | Theme mode |
| `data-build-id` | `eef4bdef21` | Next.js build ID |

Additional metadata embedded in the page's React Server Component payload (in script tags):
- Organization UUID and ID
- Rate limit tier (e.g., `default_claude_max_5x`)
- Billing type (`stripe_subscription`)
- Available models list with active/inactive status
- Statsig feature flags (`isPro`, `isMax`, `maxTier`)

---

## Data NOT Available

The following data **does not exist anywhere on the page**:

| Data | Status |
|------|--------|
| **Raw token counts** (tokens used / tokens remaining) | NOT available |
| **Absolute usage limits** (e.g., "500,000 tokens per week") | NOT available |
| **Message counts** (messages sent / messages remaining) | NOT available |
| **Per-model token breakdown** (how many tokens used on Opus vs Sonnet) | NOT available |
| **Historical usage over time** (daily/weekly trends) | NOT available |
| **Per-conversation usage** | NOT available |
| **API-accessible usage endpoint** | NOT available (API endpoint exists but is restricted to corporate/enterprise accounts only) |

The backend computes usage as a percentage and sends only that to the client. There is no way to derive absolute token counts from the available data.

---

## How to Scrape This Data

### Method 1: Chrome Extension (Recommended)
A Chrome extension with content script permissions for `claude.ai` can:
- Read the DOM directly via `document.querySelector` / `innerText`
- Run on page load and on the refresh button click
- Store historical snapshots in `chrome.storage` or send to an external endpoint
- Use `MutationObserver` to detect when data refreshes

### Method 2: Playwright / Puppeteer
Automated browser that:
1. Navigates to `https://claude.ai/settings/usage` (requires authentication cookies)
2. Waits for page render
3. Extracts data via `page.evaluate()`
4. Optionally clicks "Refresh usage limits" button and re-scrapes
5. Can run on a schedule (e.g., every 15 minutes)

**Authentication note:** Requires valid session cookies. The page uses Next.js SSR, so the data is available immediately in the initial HTML — no need to wait for client-side hydration.

### Method 3: Claude in Chrome MCP (for Claude Code sessions)
If running from Claude Code with Chrome MCP tools:
```
1. mcp__Claude_in_Chrome__navigate → https://claude.ai/settings/usage
2. mcp__Claude_in_Chrome__javascript_tool → extract DOM data
3. mcp__Claude_in_Chrome__find → "Refresh usage limits button"
4. mcp__Claude_in_Chrome__computer → click to refresh
```

---

## Data Freshness

- The page shows a "Last updated: X minutes ago" relative timestamp
- Clicking "Refresh usage limits" triggers a server re-render with fresh data
- The session reset timer counts down in real-time (client-side)
- Weekly resets happen on a fixed schedule (shown as day + time)
- Extra usage spend resets monthly on a fixed date

---

## Scraping Output Schema (Suggested)

```json
{
  "timestamp": "2026-02-26T08:30:00Z",
  "planUsage": {
    "currentSession": {
      "percentUsed": 10,
      "resetIn": "2 hr 7 min"
    },
    "allModelsWeekly": {
      "percentUsed": 46,
      "resetsAt": "Sun 3:00 PM"
    },
    "sonnetOnlyWeekly": {
      "percentUsed": 8,
      "resetsAt": "Sun 3:59 PM"
    },
    "lastUpdated": "1 minute ago"
  },
  "extraUsage": {
    "enabled": false,
    "amountSpent": 38.31,
    "spendLimit": 78.00,
    "percentUsed": 49.43,
    "currentBalance": 39.18,
    "currency": "AUD",
    "autoReload": false,
    "resetDate": "Mar 1"
  },
  "account": {
    "plan": "claude_max",
    "country": "AU",
    "rateLimitTier": "default_claude_max_5x"
  }
}
```
