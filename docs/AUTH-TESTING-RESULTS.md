# Playwright Authentication Testing Results

**Date:** 2026-02-26
**Goal:** Find a working method to scrape claude.ai/settings/usage via Playwright

---

## Approaches Tested

### 1. Headless Chromium (no auth)
- **Result:** BLOCKED - Cloudflare 403 "Just a moment..."
- Cloudflare detects headless Chromium and blocks it entirely

### 2. Real Chrome headless (`channel: 'chrome'`, `headless: true`)
- **Result:** BLOCKED - Cloudflare 403 even with valid cookies
- Cloudflare detects headless mode regardless of browser binary

### 3. Real Chrome new-headless (`--headless=new`)
- **Result:** BLOCKED - Cloudflare 403
- Chrome's newer headless mode is still detected by Cloudflare

### 4. Real Chrome non-headless + storageState (WINNER)
- **Result:** SUCCESS
- `channel: 'chrome'`, `headless: false`, with `.auth-state.json`
- Data extracted correctly including all usage metrics

### 5. Connect via CDP (`--remote-debugging-port=9222`)
- **Result:** NOT TESTED (requires Chrome restart)
- Would likely work since it uses the user's existing browser session

### 6. Persistent Context (`launchPersistentContext`)
- **Result:** NOT TESTED (requires Chrome to be closed)
- Would use Chrome's Profile 1 (Brennan@brennanhatton.com)
- Conflict: can't use Chrome profile while Chrome is open

### 7. Cookie extraction via Chrome MCP extension
- **Result:** BLOCKED - Extension blocks `document.cookie` access
- localStorage is accessible but cookies are the critical auth component

---

## Key Findings

### Cloudflare Protection
- Claude.ai uses Cloudflare's bot protection
- **ALL headless modes are blocked** (Chromium headless, Chrome headless, Chrome new-headless)
- Only non-headless real Chrome passes Cloudflare
- This means automated/scheduled headless scraping is NOT possible without bypassing Cloudflare

### Authentication
- Claude.ai uses session cookies for auth (Next.js SSR)
- Cookies can be captured via Playwright's `storageState` API
- Session tokens appear to be long-lived (hours, possibly days)
- The `save-auth.js` script captures all cookies + localStorage

### Data Extraction
- All usage data is server-side rendered into the HTML
- No API endpoints available for individual accounts
- Regex on `document.body.innerText` is the most reliable extraction method
- Progress bar `style.width` gives exact decimal percentages

---

## Recommended Approach

### For Interactive/On-Demand Scraping
**Use: `storageState` + real Chrome non-headless**

```bash
# One-time setup (save auth)
node "Claude Analytics/playwright auth testing/save-auth.js"

# Scrape usage data
node "Claude Analytics/playwright auth testing/scrape-usage.js"

# With refresh + JSON output
node "Claude Analytics/playwright auth testing/scrape-usage.js" --refresh --output=json

# Save to file
node "Claude Analytics/playwright auth testing/scrape-usage.js" --save
```

### For Automated/Scheduled Scraping
Since headless is blocked by Cloudflare, options are:
1. **Xvfb (Linux):** Run non-headless Chrome in a virtual framebuffer — appears as a real display
2. **Chrome Extension:** Build a Chrome extension that runs in the background and scrapes on a timer
3. **CDP approach:** Launch Chrome with `--remote-debugging-port` at boot, connect Playwright when needed

### Auth Token Maintenance
- Auth state auto-refreshes: the scraper saves updated cookies after each run
- If auth expires, re-run `save-auth.js` to log in again
- Monitor the age of `.auth-state.json` — if scraping fails, token likely expired

---

## File Index

| File | Purpose |
|------|---------|
| `save-auth.js` | One-time: open browser, log in, save auth cookies |
| `scrape-usage.js` | Main scraper: extract all usage data |
| `test-cdp-auth.js` | Test: CDP connection approach |
| `test-storage-state-auth.js` | Test: storageState save/load |
| `test-persistent-context-auth.js` | Test: Chrome profile approach |
| `.auth-state.json` | Saved auth cookies (gitignored, sensitive) |
| `USAGE-DATA-REFERENCE.md` | Data schema reference |
| `USAGE-SCRAPING-GUIDE.md` | Extraction method documentation |
