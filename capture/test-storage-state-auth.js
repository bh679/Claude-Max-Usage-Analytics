/**
 * Approach 2: Save storageState (cookies + localStorage) from manual login
 *
 * Two-step process:
 *   Step 1 (setup): Run with --save to open a browser, log in manually, save auth state
 *     node "Claude Analytics/tests/test-storage-state-auth.js" --save
 *
 *   Step 2 (scrape): Run normally to scrape with saved auth (headless)
 *     node "Claude Analytics/tests/test-storage-state-auth.js"
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const AUTH_FILE = path.join(__dirname, '.auth-state.json');
const isSaveMode = process.argv.includes('--save');

async function saveAuthState() {
  console.log('Opening browser for manual login...');
  console.log('Please log into Claude.ai, then close the browser window when done.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://claude.ai/login');

  // Wait for the user to log in and reach the main page
  // We detect this by waiting for the URL to NOT be a login page
  console.log('Waiting for you to complete login...');
  try {
    await page.waitForURL(url => {
      const u = url.toString();
      return u.includes('claude.ai') && !u.includes('/login') && !u.includes('/oauth');
    }, { timeout: 300000 }); // 5 minute timeout for manual login

    console.log('Login detected! Saving auth state...');

    // Navigate to usage page to also capture any usage-specific cookies
    await page.goto('https://claude.ai/settings/usage', { waitUntil: 'networkidle' });

    // Save the storage state
    await context.storageState({ path: AUTH_FILE });
    console.log(`Auth state saved to: ${AUTH_FILE}`);
    console.log('You can now run this script without --save to scrape headlessly.');
  } catch (err) {
    console.error('Timed out waiting for login. Please try again.');
  }

  await browser.close();
}

async function scrapeWithSavedAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error(`No auth state file found at ${AUTH_FILE}`);
    console.error('Run with --save first: node "Claude Analytics/test-storage-state-auth.js" --save');
    process.exit(1);
  }

  const stats = fs.statSync(AUTH_FILE);
  const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
  console.log(`Auth state file age: ${ageHours.toFixed(1)} hours`);
  if (ageHours > 24) {
    console.warn('WARNING: Auth state is over 24 hours old. Tokens may have expired.');
    console.warn('If scraping fails, re-run with --save to refresh.');
  }

  console.log('Launching headless browser with saved auth state...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  console.log('Navigating to claude.ai/settings/usage...');
  const response = await page.goto('https://claude.ai/settings/usage', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  console.log(`Response status: ${response.status()}`);
  const url = page.url();
  console.log(`Final URL: ${url}`);

  if (url.includes('/login') || url.includes('/oauth')) {
    console.error('AUTH FAILED: Session expired. Re-run with --save to re-authenticate.');
    await browser.close();
    process.exit(1);
  }

  // Extract usage data (same extraction logic)
  const data = await page.evaluate(() => {
    const result = {};
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

    const bars = [...document.querySelectorAll('.h-full.rounded.bg-accent-secondary-200')];
    result.exactPercentages = bars.map(b => parseFloat(b.style.width));

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

    result.account = {
      plan: document.documentElement.dataset.orgPlan,
      country: document.documentElement.dataset.cfCountry,
    };
    result.timestamp = new Date().toISOString();
    return result;
  });

  console.log('\n=== USAGE DATA ===');
  console.log(JSON.stringify(data, null, 2));

  await browser.close();
}

if (isSaveMode) {
  saveAuthState().catch(console.error);
} else {
  scrapeWithSavedAuth().catch(console.error);
}
