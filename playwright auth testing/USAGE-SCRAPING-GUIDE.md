# How to Scrape Claude.ai Usage Data

## Key Facts Learned from Scraping

- The usage page at `claude.ai/settings/usage` is **server-side rendered (Next.js SSR)** — all usage data is baked into the HTML on page load
- There are **no client-side API calls** for usage data. We monitored network requests during page load and after clicking refresh — only saw Firebase, Statsig analytics, Honeycomb tracing, and event logging. Zero usage data endpoints.
- The usage page JS chunk (`page-7fbf3d6338faf97c.js`) was not saved locally when we downloaded the page, so we could not inspect the client-side refresh logic
- **No raw token counts exist anywhere** — only pre-computed percentages. The backend calculates percentages server-side before sending to the client
- An API endpoint exists but is **restricted to corporate/enterprise accounts only** — not available for individual Pro/Max subscribers

## What Worked vs What Didn't

### What DID NOT work:
- `grep` for "usage", "token", "limit", "quota" etc. in the HTML file — the HTML is minified into very long single lines, so grep returns `[Omitted long matching line]` for every match. Useless for analysis.
- Reading the HTML file directly — at 1.7MB with minified lines, it's impractical to scan manually
- Network request monitoring for API endpoints — the page makes no usage-data API calls. All data comes in the initial SSR HTML.
- Searching the main JS bundle (`main-app-d8f7a00b7e8af8d9.js`) for usage endpoints — the usage page logic lives in a separate chunk that wasn't captured

### What DID work:
- **`document.body.innerText` with regex** — the most reliable extraction method. The rendered text is clean and predictable.
- **`document.querySelectorAll('[style*="width:"]')`** — finds all progress bars with exact percentage values
- **`document.querySelector('[data-testid="extra-usage-section"]')`** — reliably targets the extra usage section
- **`document.documentElement.dataset`** — for account metadata

## Exact Data Available and How to Extract Each Field

### 1. Current Session Usage

**What it shows:** Percentage of current session limit used, with countdown to reset.

**In the DOM text:** `"Current session\nResets in 2 hr 7 min\n10% used"`

**Extract with:**
```javascript
const sessionMatch = document.body.innerText.match(/Current session\s*Resets in ([^\n]+)\s*(\d+)% used/);
// sessionMatch[1] = "2 hr 7 min"  (reset countdown, relative time)
// sessionMatch[2] = "10"          (integer percentage)
```

**For exact decimal percentage:** It's the 1st progress bar element:
```javascript
const bars = [...document.querySelectorAll('.h-full.rounded.bg-accent-secondary-200')];
parseFloat(bars[0].style.width); // e.g. 10
```

### 2. All Models Weekly Usage

**What it shows:** Percentage of weekly limit across all models combined.

**In the DOM text:** `"All models\nResets Sun 3:00 PM\n46% used"`

**Extract with:**
```javascript
const allModelsMatch = document.body.innerText.match(/All models\s*Resets ([^\n]+)\s*(\d+)% used/);
// allModelsMatch[1] = "Sun 3:00 PM"  (day + time, absolute)
// allModelsMatch[2] = "46"           (integer percentage)
```

**Exact decimal:** 2nd progress bar: `parseFloat(bars[1].style.width)`

### 3. Sonnet-Only Weekly Usage

**What it shows:** Percentage of weekly limit for Sonnet model specifically.

**In the DOM text:** `"Sonnet only\nResets Sun 3:59 PM\n8% used"`

**Extract with:**
```javascript
const sonnetMatch = document.body.innerText.match(/Sonnet only\s*Resets ([^\n]+)\s*(\d+)% used/);
// sonnetMatch[1] = "Sun 3:59 PM"  (day + time, absolute)
// sonnetMatch[2] = "8"            (integer percentage)
```

**Exact decimal:** 3rd progress bar: `parseFloat(bars[2].style.width)`

### 4. Last Updated Timestamp

**In the DOM text:** `"Last updated: 1 minute ago"`

**Extract with:**
```javascript
const lastUpdated = document.body.innerText.match(/Last updated:\s*([^\n]+)/);
// lastUpdated[1] = "1 minute ago"  (always relative, never absolute)
```

### 5. Extra Usage — Amount Spent

**In the DOM text (inside `[data-testid="extra-usage-section"]`):** `"A$38.31 spent"`

**Extract with:**
```javascript
const extraText = document.querySelector('[data-testid="extra-usage-section"]').innerText;
const spent = extraText.match(/([\w$\d,.]+)\s*spent/);
// spent[1] = "A$38.31"
```

### 6. Extra Usage — Monthly Spend Limit

**In the DOM text:** `"A$78\nMonthly spend limit"`

**Extract with:**
```javascript
const limitMatch = extraText.match(/([\w$\d,.]+)\s*\n\s*Monthly spend limit/);
// limitMatch[1] = "A$78"
```

### 7. Extra Usage — Percentage of Spend Used

**In the DOM text:** `"49% used"` (appears in the extra usage section)

**Exact decimal from 4th progress bar:**
```javascript
parseFloat(bars[3].style.width); // 49.4323
```

### 8. Extra Usage — Reset Date

**In the DOM text:** `"Resets Mar 1"`

**Extract with:**
```javascript
const resetMatch = extraText.match(/Resets\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+)/);
// resetMatch[1] = "Mar 1"
```

### 9. Extra Usage — Current Balance

**In the DOM text:** `"A$39.18\nCurrent balance"`

**Extract with:**
```javascript
const balanceMatch = extraText.match(/([\w$\d,.]+)\s*\n\s*Current balance/);
// balanceMatch[1] = "A$39.18"
```

### 10. Extra Usage — Auto-Reload Status

**In the DOM text:** `"Auto-reload off"` (or `"Auto-reload on"`)

**Extract with:**
```javascript
const autoReload = extraText.includes('Auto-reload off') ? false : extraText.includes('Auto-reload on') ? true : null;
```

### 11. Extra Usage — Toggle State (Enabled/Disabled)

The extra usage section contains a toggle switch. Its state is visible in the DOM but the simplest check is whether the section shows spending data or a "Turn on" prompt.

### 12. Account Plan

**From HTML root element:**
```javascript
document.documentElement.dataset.orgPlan   // "claude_max"
```

### 13. Country

```javascript
document.documentElement.dataset.cfCountry // "AU"
```

## Refreshing the Data

There is a button with `aria-label="Refresh usage limits"`. Clicking it triggers a server-side re-render. After clicking, wait ~2 seconds then re-scrape.

**Find it with:**
```javascript
document.querySelector('[aria-label="Refresh usage limits"]').click();
```

## Complete Extraction Script (Tested & Working)

This is the exact script that successfully extracted all data during our session:

```javascript
const result = {};

// Plan usage — regex on innerText
const sessionMatch = document.body.innerText.match(/Current session\s*Resets in ([^\n]+)\s*(\d+)% used/);
const allModelsMatch = document.body.innerText.match(/All models\s*Resets ([^\n]+)\s*(\d+)% used/);
const sonnetMatch = document.body.innerText.match(/Sonnet only\s*Resets ([^\n]+)\s*(\d+)% used/);
const lastUpdated = document.body.innerText.match(/Last updated:\s*([^\n]+)/);

result.planUsage = {
  currentSession: sessionMatch ? { resetIn: sessionMatch[1].trim(), percentUsed: parseInt(sessionMatch[2]) } : null,
  allModels: allModelsMatch ? { resetsAt: allModelsMatch[1].trim(), percentUsed: parseInt(allModelsMatch[2]) } : null,
  sonnetOnly: sonnetMatch ? { resetsAt: sonnetMatch[1].trim(), percentUsed: parseInt(sonnetMatch[2]) } : null,
  lastUpdated: lastUpdated ? lastUpdated[1].trim() : null
};

// Exact percentages from progress bars
const bars = [...document.querySelectorAll('.h-full.rounded.bg-accent-secondary-200')];
result.exactPercentages = bars.map(b => parseFloat(b.style.width));
// Order: [session, allModels, sonnetOnly, extraUsageSpend]

// Extra usage section
const extraSection = document.querySelector('[data-testid="extra-usage-section"]');
if (extraSection) {
  const text = extraSection.innerText;
  result.extraUsage = {
    fullText: text,
    amountSpent: (text.match(/([\w$\d,.]+)\s*spent/) || [])[1] || null,
    spendLimit: (text.match(/([\w$\d,.]+)\s*\n\s*Monthly spend limit/) || [])[1] || null,
    currentBalance: (text.match(/([\w$\d,.]+)\s*\n\s*Current balance/) || [])[1] || null,
    resetDate: (text.match(/Resets\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+)/) || [])[1] || null,
    autoReload: text.includes('Auto-reload off') ? false : text.includes('Auto-reload on') ? true : null
  };
}

// Account metadata
result.account = {
  plan: document.documentElement.dataset.orgPlan,
  country: document.documentElement.dataset.cfCountry
};

result.timestamp = new Date().toISOString();

JSON.stringify(result, null, 2);
```

## What Does NOT Exist (Don't Waste Time Looking)

- **Raw token counts** — not in DOM, not in API calls, not in JS bundles, nowhere
- **Absolute usage limits** (e.g., "500k tokens/week") — the backend only sends percentages
- **Message counts** — not exposed
- **Per-model token breakdown** — only "All models" and "Sonnet only" percentages
- **Historical usage** — only current snapshot, no trends
- **Usage API endpoint** — exists but restricted to enterprise/corporate accounts

## Currency Note

Dollar amounts are in the user's local currency. The prefix varies (e.g., "A$" for AUD, "$" for USD, etc.). Parse the currency symbol along with the number.
