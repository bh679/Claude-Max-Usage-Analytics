/**
 * Scrape Claude.ai Usage Data
 *
 * Uses saved auth state + real Chrome (non-headless) to bypass Cloudflare.
 *
 * Setup (one-time):
 *   node "Claude Analytics/playwright auth testing/save-auth.js"
 *
 * Usage:
 *   node "Claude Analytics/playwright auth testing/scrape-usage.js"
 *
 * Options:
 *   --refresh     Click the refresh button before scraping
 *   --output=json Output JSON to stdout (for piping)
 *   --save        Save JSON to a timestamped file
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const AUTH_FILE = path.join(__dirname, '.auth-state.json');
const args = process.argv.slice(2);
const doRefresh = args.includes('--refresh');
const jsonOutput = args.includes('--output=json');
const saveToFile = args.includes('--save');

function log(...msg) {
  if (!jsonOutput) console.log(...msg);
}

async function main() {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('No auth state found. Run save-auth.js first:');
    console.error('  node "Claude Analytics/playwright auth testing/save-auth.js"');
    process.exit(1);
  }

  const stats = fs.statSync(AUTH_FILE);
  const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
  log(`Auth state age: ${ageHours.toFixed(1)} hours`);

  // Must use non-headless real Chrome to bypass Cloudflare
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  log('Navigating to claude.ai/settings/usage...');
  const response = await page.goto('https://claude.ai/settings/usage', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Wait for client-side hydration and data rendering
  await page.waitForTimeout(5000);

  const finalUrl = page.url();
  if (finalUrl.includes('/login') || finalUrl.includes('/oauth')) {
    console.error('Auth expired. Re-run save-auth.js to refresh.');
    await browser.close();
    process.exit(1);
  }

  if (doRefresh) {
    log('Clicking refresh button...');
    const refreshBtn = page.locator('[aria-label="Refresh usage limits"]');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(3000);
      log('Data refreshed.');
    } else {
      log('Refresh button not found.');
    }
  }

  // Extract all usage data
  const data = await page.evaluate(() => {
    const result = {};

    // Plan usage
    const sessionMatch = document.body.innerText.match(/Current session\s*Resets in ([^\n]+)\s*(\d+)% used/);
    const allModelsMatch = document.body.innerText.match(/All models\s*Resets ([^\n]+)\s*(\d+)% used/);
    const sonnetMatch = document.body.innerText.match(/Sonnet only\s*Resets ([^\n]+)\s*(\d+)% used/);
    const lastUpdated = document.body.innerText.match(/Last updated:\s*([^\n]+)/);

    result.planUsage = {
      currentSession: sessionMatch ? { resetIn: sessionMatch[1].trim(), percentUsed: parseInt(sessionMatch[2]) } : null,
      allModels: allModelsMatch ? { resetsAt: allModelsMatch[1].trim(), percentUsed: parseInt(allModelsMatch[2]) } : null,
      sonnetOnly: sonnetMatch ? { resetsAt: sonnetMatch[1].trim(), percentUsed: parseInt(sonnetMatch[2]) } : null,
      lastUpdated: lastUpdated ? lastUpdated[1].trim() : null,
    };

    // Exact percentages from progress bars
    const bars = [...document.querySelectorAll('.h-full.rounded.bg-accent-secondary-200')];
    result.exactPercentages = {
      currentSession: bars[0] ? parseFloat(bars[0].style.width) : null,
      allModels: bars[1] ? parseFloat(bars[1].style.width) : null,
      sonnetOnly: bars[2] ? parseFloat(bars[2].style.width) : null,
      extraUsageSpend: bars[3] ? parseFloat(bars[3].style.width) : null,
    };

    // Extra usage section
    const extraSection = document.querySelector('[data-testid="extra-usage-section"]');
    if (extraSection) {
      const text = extraSection.innerText;
      result.extraUsage = {
        amountSpent: (text.match(/([\w$\d,.]+)\s*spent/) || [])[1] || null,
        spendLimit: (text.match(/([\w$\d,.]+)\s*\n\s*Monthly spend limit/) || [])[1] || null,
        currentBalance: (text.match(/([\w$\d,.]+)\s*\n\s*Current balance/) || [])[1] || null,
        resetDate: (text.match(/Resets\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+)/) || [])[1] || null,
        autoReload: text.includes('Auto-reload off') ? false : text.includes('Auto-reload on') ? true : null,
      };
    }

    // Account metadata
    result.account = {
      plan: document.documentElement.dataset.orgPlan,
      country: document.documentElement.dataset.cfCountry,
    };

    result.timestamp = new Date().toISOString();
    return result;
  });

  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    log('\n=== Claude.ai Usage Data ===');
    log(`Timestamp: ${data.timestamp}`);
    log(`Plan: ${data.account.plan} (${data.account.country})`);
    log('');
    if (data.planUsage.currentSession) {
      log(`Current Session: ${data.planUsage.currentSession.percentUsed}% used (resets in ${data.planUsage.currentSession.resetIn})`);
    }
    if (data.planUsage.allModels) {
      log(`All Models:      ${data.planUsage.allModels.percentUsed}% used (resets ${data.planUsage.allModels.resetsAt})`);
    }
    if (data.planUsage.sonnetOnly) {
      log(`Sonnet Only:     ${data.planUsage.sonnetOnly.percentUsed}% used (resets ${data.planUsage.sonnetOnly.resetsAt})`);
    }
    if (data.planUsage.lastUpdated) {
      log(`Last Updated:    ${data.planUsage.lastUpdated}`);
    }
    if (data.extraUsage) {
      log('');
      log(`Extra Usage:     ${data.extraUsage.amountSpent} spent of ${data.extraUsage.spendLimit} limit`);
      log(`Balance:         ${data.extraUsage.currentBalance}`);
      log(`Resets:          ${data.extraUsage.resetDate}`);
      log(`Auto-reload:     ${data.extraUsage.autoReload ? 'on' : 'off'}`);
    }
  }

  if (saveToFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outFile = path.join(__dirname, `usage-${timestamp}.json`);
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    log(`\nSaved to: ${outFile}`);
  }

  // Update auth state in case cookies were refreshed during the session
  await context.storageState({ path: AUTH_FILE });

  await browser.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
