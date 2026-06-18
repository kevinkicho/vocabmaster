const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('settings modal screenshot', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080');
    await page.waitForLoadState('networkidle');

    // Click settings button
    await page.click('#btn-settings');
    await page.waitForTimeout(500); // wait for modal to open and populate

    // Take full page screenshot of the settings modal
    if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');
    await page.screenshot({ path: 'screenshots/settings_order_reordered.png', fullPage: true });
});
