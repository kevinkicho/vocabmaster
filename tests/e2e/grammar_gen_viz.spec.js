const { test, expect } = require('@playwright/test');
const path = require('path');

const SCREENSHOT_DIR = path.resolve(__dirname, '../../screenshots');

async function launchAndForceGen(page, theme) {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app && window.app.llm && window.app.llm.available, null, { timeout: 30000 });
  await page.evaluate((t) => { window.__forceGenTheme = t; }, theme);
  await page.evaluate(() => window.app.launchGameMode('grammar'));
  // Always wait for explanation (cached) or generating screen to settle
  await page.waitForTimeout(2000);
  // If explanation is visible, force fresh generation
  const hasStartBtn = await page.$('#gr-start-btn');
  if (hasStartBtn) {
    await page.click('#gr-anew-btn');
    await page.waitForTimeout(500);
    await page.click('#gr-anew-btn');
  }
}

test.describe('Grammar Gym generation visualizations', () => {
  test.setTimeout(360000);

  test('capture score ticker (#2)', async ({ page }) => {
    await launchAndForceGen(page, 'score');
    // Wait for score badges or generation to finish
    try {
      await page.waitForFunction(() => {
        const tracker = document.getElementById('gr-score-tracker');
        return tracker && tracker.children.length > 0 && !tracker.textContent.includes('Waiting');
      }, null, { timeout: 240000 });
    } catch (e) {}
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'grammar_gen_score_ticker.png'), fullPage: false });
  });

  test('capture type grid summary (#3)', async ({ page }) => {
    await launchAndForceGen(page, 'summary');
    try {
      await page.waitForFunction(() => {
        const content = document.getElementById('gr-content');
        return content && content.textContent.includes('12 Exercise Types Generated');
      }, null, { timeout: 240000 });
    } catch (e) {}
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'grammar_gen_type_grid.png'), fullPage: false });
  });

  test('capture dual-column log (#4)', async ({ page }) => {
    await launchAndForceGen(page, 'log');
    try {
      await page.waitForFunction(() => {
        const log = document.getElementById('gr-log');
        return log && log.children.length >= 2;
      }, null, { timeout: 240000 });
    } catch (e) {}
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'grammar_gen_log.png'), fullPage: false });
  });
});
