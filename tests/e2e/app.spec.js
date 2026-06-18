import { test, expect } from '@playwright/test';

test.describe('VocabMaster App Basic Sanity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('app loads without unhandled console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('response', response => {
      if (response.status() === 404) {
        errors.push(`404: ${response.url()}`);
      }
    });

    await page.goto('/');
    try {
      await page.waitForSelector('#btn-init', { state: 'visible', timeout: 15000 });
    } catch(e) {
      console.log('PAGE CONTENT:', await page.content());
      console.log('ERRORS:', errors);
      throw e;
    }
    
    expect(errors.length, `Expected no console errors, but got: ${errors.join(', ')}`).toBe(0);
  });

  test('can enter the app and see the home screen', async ({ page }) => {
    // Wait for Start button to be enabled (auth + data + LLM init)
    await page.waitForSelector('#btn-init:not([disabled])', { timeout: 30000 });
    await page.click('#btn-init');
    
    // App should show the home screen with game buttons (overlay fades over 500ms + rAF render)
    // Use #app-view to scope to the home screen (settings modal is separate)
    await expect(page.locator('#app-view')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#app-view').getByText('Story Mode')).toBeVisible();
  });
  
  test('can open settings modal', async ({ page }) => {
    await page.waitForSelector('#btn-init:not([disabled])', { timeout: 30000 });
    await page.click('#btn-init');
    
    // Wait for home screen
    await expect(page.locator('#app-view')).toBeVisible({ timeout: 10000 });
    
    // Open settings via the gear button (has onclick="app.modal(true)")
    await page.click('button[onclick="app.modal(true)"]');
    await expect(page.locator('#modal-settings')).toBeVisible({ timeout: 5000 });
    
    // Close settings modal by clicking the overlay area
    await page.locator('#modal-settings').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#modal-settings')).toBeHidden({ timeout: 5000 });
  });
});