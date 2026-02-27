/**
 * Approach 3: launchPersistentContext with Chrome user data directory
 *
 * Uses your actual Chrome profile directory so Playwright inherits all cookies/sessions.
 *
 * IMPORTANT: Chrome must be fully closed before running this script!
 * Two Chrome instances can't share the same profile directory simultaneously.
 *
 * Usage:
 *   node "Claude Analytics/playwright auth testing/test-persistent-context-auth.js"
 *
 * To find your Chrome profile path on macOS:
 *   Open chrome://version in Chrome and look for "Profile Path"
 */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

// Default Chrome user data directory on macOS
// Adjust if your profile is in a different location
const CHROME_USER_DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');

// Which profile to use (Default, Profile 1, Profile 2, etc.)
// Brennan's Claude.ai profile (Brennan@brennanhatton.com)
const PROFILE = process.argv[2] || 'Profile 1';

async function scrapeWithPersistentContext() {
  console.log(`Using Chrome user data dir: ${CHROME_USER_DATA_DIR}`);
  console.log(`Profile: ${PROFILE}`);
  console.log('NOTE: Chrome must be fully closed before running this!');
  console.log('');

  let context;
  try {
    context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
      headless: false,  // Must be non-headless to use Chrome profile properly
      channel: 'chrome', // Use installed Chrome instead of Playwright's Chromium
      args: [`--profile-directory=${PROFILE}`],
    });
  } catch (err) {
    if (err.message.includes('lock') || err.message.includes('already running')) {
      console.error('ERROR: Chrome is still running. Close Chrome completely and try again.');
    } else {
      console.error('Failed to launch:', err.message);
    }
    process.exit(1);
  }

  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to claude.ai/settings/usage...');
  const response = await page.goto('https://claude.ai/settings/usage', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  console.log(`Response status: ${response.status()}`);
  const url = page.url();
  console.log(`Final URL: ${url}`);

  if (url.includes('/login') || url.includes('/oauth')) {
    console.error('AUTH FAILED: Not logged into Claude.ai in this Chrome profile.');
    await context.close();
    process.exit(1);
  }

  // Extract usage data
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

  await context.close();
  console.log('Done.');
}

scrapeWithPersistentContext().catch(console.error);
