const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  await page.goto('http://127.0.0.1:8123');
  await page.waitForTimeout(2000);
  await browser.close();
})();
