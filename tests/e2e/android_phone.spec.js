import { test, expect, _android as android } from '@playwright/test';

test('Run E2E on Phone', async () => {
  const [device] = await android.devices();
  console.log(`Model: ${device.model()}`);
  console.log(`Serial: ${device.serial()}`);

  await device.shell('am force-stop com.vocabmaster.app');
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 10000));

  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  // Wait for Start button — wait until opacity-50 loading class is removed
  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 40000 });
  await new Promise(r => setTimeout(r, 1000));

  // Click Start — use evaluate to bypass Samsung WebView actionability issues
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) {
      btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 5000));

  // Dump page HTML to see what's rendered after Start
  const html = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
  console.log('--- Body HTML after Start ---');
  console.log(html);
  console.log('--- End HTML ---');

  // Check key elements
  const els = await page.evaluate(() => ({
    overlayInit: !!document.getElementById('overlay-init'),
    collectionPicker: !!document.getElementById('collection-picker'),
    mainMenu: !!document.getElementById('main-menu'),
    homeView: !!document.getElementById('home-view'),
    settingsModal: !!document.getElementById('modal-settings'),
  }));
  console.log('Elements:', JSON.stringify(els));

  // Open settings and check AI status
  await page.evaluate(() => {
    const gear = document.querySelector('[onclick*="modal(true)"]');
    if (gear) gear.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  const aiStatus = await page.evaluate(() => {
    const el = document.getElementById('llm-status-text');
    return el ? el.textContent : 'not found';
  });
  const aiDot = await page.evaluate(() => {
    const el = document.getElementById('llm-status-dot');
    return el ? el.style.background : 'not found';
  });
  console.log(`AI status: "${aiStatus}" dot: ${aiDot}`);

  const modelDropdown = await page.evaluate(() => {
    const sel = document.getElementById('llm-model');
    if (!sel) return 'no dropdown';
    const cur = sel.options[sel.selectedIndex];
    return cur ? cur.value : 'no selection';
  });
  console.log(`Selected model: ${modelDropdown}`);

  await device.close();
  console.log('Phone E2E done');
});
