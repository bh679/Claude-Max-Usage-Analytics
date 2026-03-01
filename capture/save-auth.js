/**
 * Save auth state from a manual Claude.ai login session.
 *
 * Usage:
 *   node "Claude Analytics/playwright auth testing/save-auth.js"
 *
 * This will:
 * 1. Open a real Chrome browser window to claude.ai/login
 * 2. Wait for you to log in (up to 5 minutes)
 * 3. Save all cookies + localStorage to .auth-state.json
 * 4. Close the browser
 *
 * After this, run test-storage-state-auth.js to test scraping with saved auth.
 */
const { chromium } = require('playwright');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '.auth-state.json');

async function main() {
  console.log('Opening Chrome for manual login...');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // Use real Chrome to avoid Cloudflare issues
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://claude.ai/login');
  console.log('Please log into Claude.ai in the browser window.');
  console.log('Waiting up to 5 minutes...');

  // Wait until we're on a non-login page
  await page.waitForURL(url => {
    const u = url.toString();
    return u.includes('claude.ai') && !u.includes('/login') && !u.includes('/oauth');
  }, { timeout: 300000 });

  console.log('Login detected! Navigating to usage page to capture all relevant cookies...');
  await page.goto('https://claude.ai/settings/usage', { waitUntil: 'networkidle' });

  // Save storage state
  await context.storageState({ path: AUTH_FILE });
  console.log(`Auth state saved to: ${AUTH_FILE}`);

  await browser.close();
  console.log('Done! Now run test-storage-state-auth.js to test scraping.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
