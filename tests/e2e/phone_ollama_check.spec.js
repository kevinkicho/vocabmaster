import { test, _android as android } from '@playwright/test';

test('Check ollama models on phone', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.vocabmaster.app');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 10000));

  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  // Wait for and click Start button
  const hasStartBtn = await page.evaluate(() => !!document.getElementById('btn-init'));
  if (hasStartBtn) {
    await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
    await page.evaluate(() => {
      const btn = document.getElementById('btn-init');
      if (btn && !btn.disabled) btn.click();
    });
    await new Promise(r => setTimeout(r, 5000));
  }

  // Open settings to see AI panel
  await page.evaluate(() => {
    const gearBtn = document.querySelector('button[onclick*="modal(true)"]');
    if (gearBtn) gearBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Fetch ollama /api/tags directly from WebView context
  console.log('Fetching /api/tags from phone ollama4android...');
  const tags = await page.evaluate(async () => {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags');
      const data = await res.json();
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return 'FETCH_ERROR: ' + e.message;
    }
  });
  console.log('--- /api/tags ---');
  console.log(tags);
  console.log('--- end ---');

  // Which model is selected in the dropdown?
  const modelSelected = await page.evaluate(() => {
    const sel = document.getElementById('llm-model');
    if (!sel) return 'NO_DROPDOWN';
    const cur = sel.options[sel.selectedIndex];
    return cur ? cur.value : 'NO_SELECTION';
  });
  console.log(`Dropdown selected: "${modelSelected}"`);

  // What does the AI status say?
  const aiStatus = await page.evaluate(() => {
    const el = document.getElementById('llm-status-text');
    return el ? el.textContent : 'NOT_FOUND';
  });
  console.log(`AI status: "${aiStatus}"`);

  // Check resolved vs stored model
  const modelInfo = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('vocabmaster-prefs');
      const prefs = raw ? JSON.parse(raw) : {};
      const resolved = window.app?.llm?.resolvedModel || 'NO_RESOLVED';
      const stored = prefs.llmModel || 'NO_STORED';
      const avail = window.app?.llm?.availableModels || [];
      return { resolved, stored, available: avail };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('Model info:', JSON.stringify(modelInfo, null, 2));

  await device.close();
});
