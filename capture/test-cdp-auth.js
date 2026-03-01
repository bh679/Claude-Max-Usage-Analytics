/**
 * Approach 1: Connect to existing Chrome via CDP
 *
 * Prerequisites:
 *   1. Close Chrome completely
 *   2. Relaunch Chrome with remote debugging enabled:
 *      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *   3. Log into claude.ai in that Chrome instance
 *   4. Run this script: node "Claude Analytics/test-cdp-auth.js"
 */
const { chromium } = require('playwright');

async function scrapeViaCDP() {
  console.log('Connecting to Chrome via CDP on port 9222...');

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('Connected to Chrome!');
  } catch (err) {
    console.error('Failed to connect. Is Chrome running with --remote-debugging-port=9222?');
    console.error('Launch Chrome with:');
    console.error('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    process.exit(1);
  }

  // Get the default browser context (your logged-in session)
  const context = browser.contexts()[0];
  console.log(`Found ${context.pages().length} open tabs`);

  // Open a new page and navigate to the usage page
  const page = await context.newPage();

  console.log('Navigating to claude.ai/settings/usage...');
  const response = await page.goto('https://claude.ai/settings/usage', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  console.log(`Response status: ${response.status()}`);

  // Check if we got redirected to login (means auth failed)
  const url = page.url();
  console.log(`Final URL: ${url}`);

  if (url.includes('/login') || url.includes('/oauth')) {
    console.error('AUTH FAILED: Redirected to login page. You need to log into Claude.ai in Chrome first.');
    await page.close();
    await browser.close();
    process.exit(1);
  }

  // Extract usage data
  console.log('Extracting usage data...');
  const data = await page.evaluate(() => {
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
      lastUpdated: lastUpdated ? lastUpdated[1].trim() : null,
    };

    // Exact percentages from progress bars
    const bars = [...document.querySelectorAll('.h-full.rounded.bg-accent-secondary-200')];
    result.exactPercentages = bars.map(b => parseFloat(b.style.width));

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

  console.log('\n=== USAGE DATA ===');
  console.log(JSON.stringify(data, null, 2));

  await page.close();
  // Don't close the browser - it's the user's Chrome!
  await browser.disconnect();
  console.log('\nDisconnected from Chrome (Chrome stays open).');
}

scrapeViaCDP().catch(console.error);
