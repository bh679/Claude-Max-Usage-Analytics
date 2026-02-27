// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    headless: true,
    screenshot: 'on',
    trace: 'on-first-retry',
  },
  outputDir: './test-results',
  reporter: [['html', { outputFolder: './playwright-report' }]],
});
