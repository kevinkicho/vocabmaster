import { test, expect } from '@playwright/test';

test('Diagnose issue 1: fresh install dark mode — no setup modal after Start', async ({ page }) => {
  // Set dark mode preference before page loads
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vm_prefs_v1195_STABLE', JSON.stringify({ dark: true }));
      localStorage.removeItem('vm_first_run_done');
      localStorage.removeItem('vm_ai_welcomed');
    } catch(e) {}
  });
  
  await page.goto('/');
  
  // Wait for Start button to be visible and enabled
  await page.waitForSelector('#btn-init', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const btn = document.getElementById('btn-init');
    return btn && !btn.classList.contains('opacity-50');
  }, { timeout: 15000 });
  
  // Click Start to dismiss flash page
  await page.click('#btn-init');
  
  // Wait for overlay animation to complete
  await page.waitForTimeout(1500);
  
  // Take screenshot
  await page.screenshot({ path: 'screenshots/diag_fresh_install.png', fullPage: true });
  
  // CHECK 1: Settings modal should NOT be visible
  const settingsVisible = await page.evaluate(() => {
    const modal = document.getElementById('modal-settings');
    return modal && !modal.classList.contains('hidden');
  });
  console.log('Settings modal visible:', settingsVisible);
  expect(settingsVisible).toBe(false);
  
  // CHECK 2: AI welcome dialog should NOT be visible
  const aiWelcomeVisible = await page.evaluate(() => {
    const el = document.getElementById('ai-welcome');
    return el !== null && el.parentNode !== null;
  });
  console.log('AI welcome dialog visible:', aiWelcomeVisible);
  expect(aiWelcomeVisible).toBe(false);
  
  // CHECK 3: Splash overlay should be gone
  const overlayGone = await page.evaluate(() => {
    return document.getElementById('overlay-init') === null;
  });
  console.log('Splash overlay removed:', overlayGone);
  expect(overlayGone).toBe(true);
  
  // CHECK 4: Home page should be visible with collection picker or game buttons
  const hasHomeContent = await page.locator('#collection-picker').count() > 0 ||
    (await page.locator('#app-view').innerHTML()).length > 500;
  console.log('Home page content visible:', hasHomeContent);
  expect(hasHomeContent).toBe(true);
  
  console.log('All checks passed — issue 1 is fixed.');
});
