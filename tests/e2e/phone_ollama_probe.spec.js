import { test, _android as android } from '@playwright/test';

test('Probe ollama4android on phone', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.vocabmaster.app');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 10000));

  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  // Click Start
  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) btn.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  // Probe ollama4android
  const results = await page.evaluate(async () => {
    const out = {};
    const ep = 'http://127.0.0.1:11434';

    // 1. /api/tags
    try {
      const res = await fetch(ep + '/api/tags', { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      out.tags = (data.models || []).map(m => m.name);
    } catch (e) { out.tags = 'ERROR: ' + e.message; }

    // 2. Try generating with gemma4:31b-cloud (even if not listed)
    try {
      const res = await fetch(ep + '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:31b-cloud',
          prompt: 'Say exactly: HELLO_FROM_GEMMA4',
          stream: false
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const data = await res.json();
        out.generate_gemma4 = 'OK: ' + (data.response || '').slice(0, 200);
      } else {
        const err = await res.text().catch(() => '');
        out.generate_gemma4 = 'HTTP ' + res.status + ': ' + err.slice(0, 200);
      }
    } catch (e) { out.generate_gemma4 = 'ERROR: ' + e.message; }

    // 3. Try pull gemma4:31b-cloud
    try {
      const res = await fetch(ep + '/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'gemma4:31b-cloud', stream: false }),
        signal: AbortSignal.timeout(60000)
      });
      const text = await res.text();
      out.pull = 'Status ' + res.status + ': ' + text.slice(0, 500);
    } catch (e) { out.pull = 'ERROR: ' + e.message; }

    // 4. List running models
    try {
      const res = await fetch(ep + '/api/ps', { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      out.ps = (data.models || []).map(m => m.name || m.model);
    } catch (e) { out.ps = 'ERROR: ' + e.message; }

    return out;
  });

  console.log('--- Probe Results ---');
  for (const [key, val] of Object.entries(results)) {
    console.log(`${key}:`, JSON.stringify(val, null, 2));
  }
  console.log('--- end ---');

  await device.close();
});
