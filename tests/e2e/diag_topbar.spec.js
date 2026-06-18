import { test, expect } from '@playwright/test';

test('Diagnose topbar dark mode', async ({ page }) => {
  // Force dark mode
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vm_prefs_v1195_STABLE', JSON.stringify({ dark: true }));
    } catch(e) {}
  });

  await page.goto('/');
  
  // Wait for Start button
  await page.waitForSelector('#btn-init', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const btn = document.getElementById('btn-init');
    return btn && !btn.classList.contains('opacity-50');
  }, { timeout: 15000 });
  
  // Click Start
  await page.click('#btn-init');
  await page.waitForTimeout(1000);
  
  // Dismiss any overlays
  await page.evaluate(() => {
    const aiWelcome = document.getElementById('ai-welcome');
    if (aiWelcome) aiWelcome.remove();
  });

  // Check computed styles
  const styles = await page.evaluate(() => {
    const header = document.querySelector('header');
    const title = document.querySelector('h1');
    const statusBar = document.getElementById('status-bar');
    const loginBtn = document.getElementById('btn-login');
    const html = document.documentElement;
    
    const headerStyle = header ? window.getComputedStyle(header) : null;
    const titleStyle = title ? window.getComputedStyle(title) : null;
    const statusStyle = statusBar ? window.getComputedStyle(statusBar) : null;
    const loginStyle = loginBtn ? window.getComputedStyle(loginBtn) : null;
    
    return {
      htmlHasDarkClass: html.classList.contains('dark'),
      header: {
        background: headerStyle?.backgroundColor,
        color: headerStyle?.color,
        borderBottom: headerStyle?.borderBottom
      },
      title: { color: titleStyle?.color },
      statusBar: { color: statusStyle?.color },
      loginBtn: {
        background: loginStyle?.backgroundColor,
        color: loginStyle?.color
      }
    };
  });
  
  console.log('HTML has dark class:', styles.htmlHasDarkClass);
  console.log('Header bg:', styles.header.background, 'color:', styles.header.color);
  console.log('Title color:', styles.title.color);
  console.log('Status bar color:', styles.statusBar.color);
  console.log('Login btn bg:', styles.loginBtn.background, 'color:', styles.loginBtn.color);
  
  // Take screenshot
  await page.screenshot({ path: 'screenshots/diag_topbar_dark.png', fullPage: false });
});
