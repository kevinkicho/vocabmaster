import { test, _android as android } from '@playwright/test';

test('Verify grammar settings selects persist on settings close', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.kevinkicho.vocabmaster');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.kevinkicho.vocabmaster/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 12000));

  const webview = await device.webView({ pkg: 'com.kevinkicho.vocabmaster' });
  const page = await webview.page();

  // Click Start
  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) btn.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  // Apply English -> Chinese preset
  await page.evaluate(() => app.presets.apply('en', 'zh'));
  await new Promise(r => setTimeout(r, 2000));

  // Verify the fix: grammar-q select should now have populated options
  const beforeSettings = await page.evaluate(() => {
    const grammarQ = document.getElementById('grammar-q');
    const grammarA = document.getElementById('grammar-a');
    return {
      grammarQExists: !!grammarQ,
      grammarQOptionCount: grammarQ ? grammarQ.options.length : 0,
      grammarQOptions: grammarQ ? Array.from(grammarQ.options).map(o => o.value) : [],
      grammarAExists: !!grammarA,
      grammarAOptionCount: grammarA ? grammarA.options.length : 0,
      grammarQValue: grammarQ?.value,
      grammarAValue: grammarA?.value,
      presetQ: app.store.prefs.grammarQ,
      presetA: app.store.prefs.grammarA,
    };
  });
  console.log('Before opening settings:', JSON.stringify(beforeSettings, null, 2));

  if (beforeSettings.grammarQOptionCount <= 1) {
    console.log('❌ FIX NOT APPLIED: grammar-q has no/few options');
  } else {
    console.log('✅ FIX VERIFIED: grammar-q has', beforeSettings.grammarQOptionCount, 'options');
  }

  // Now open settings, close, and check if prefs are preserved
  await page.evaluate(() => app.modal(true));
  await new Promise(r => setTimeout(r, 3000));

  const inSettings = await page.evaluate(() => ({
    grammarQVal: document.getElementById('grammar-q')?.value,
    grammarAVal: document.getElementById('grammar-a')?.value,
  }));
  console.log('Settings open - DOM values:', JSON.stringify(inSettings));

  // Close settings
  await page.evaluate(() => app.modal(false));
  await new Promise(r => setTimeout(r, 3000));

  // Check final state
  const after = await page.evaluate(() => ({
    grammarQ: app.store.prefs.grammarQ,
    grammarA: app.store.prefs.grammarA,
    presetSource: app.store.prefs.presetSource,
    presetTarget: app.store.prefs.presetTarget,
  }));
  console.log('After settings close:', JSON.stringify(after));

  if (after.grammarQ === 'zh' && after.grammarA === 'zh') {
    console.log('✅ PASS: grammarQ and grammarA preserved as zh after settings open/close');
  } else {
    console.log(`❌ FAIL: Expected zh/zh, got ${after.grammarQ}/${after.grammarA}`);
  }

  await device.close();
});
