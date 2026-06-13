import { test, _android as android } from '@playwright/test';

test('Grammar Gym full flow: preset survives settings open/close', async () => {
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

  // Step 1: Apply English -> Chinese preset
  await page.evaluate(() => app.presets.apply('en', 'zh'));
  await new Promise(r => setTimeout(r, 3000));

  // Step 2: Click Grammar Gym button
  const ggResult = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button'));
    const target = allBtns.find(b => b.textContent?.trim().endsWith('Grammar Gym'));
    if (target) { target.click(); return { ok: true }; }
    return { ok: false, names: allBtns.map(b => b.textContent?.trim().substring(0, 40)) };
  });
  console.log('Grammar Gym click:', JSON.stringify(ggResult));
  await new Promise(r => setTimeout(r, 2000));

  // Verify we are in Grammar Gym
  const inGG = await page.evaluate(() => !!document.getElementById('gr-card'));
  console.log('In Grammar Gym:', inGG);

  // Wait for generation to complete (polls for start button)
  let genWaited = 0;
  let genDone = false;
  while (genWaited < 60000) {
    const state = await page.evaluate(() => ({
      hasStartBtn: !!document.getElementById('gr-start-btn'),
      hasError: document.getElementById('gr-content')?.textContent?.includes('Failed') || false,
      grammarQ: app.store.prefs.grammarQ,
    }));
    if (state.hasStartBtn) { genDone = true; break; }
    if (state.hasError) break;
    await new Promise(r => setTimeout(r, 3000));
    genWaited += 3000;
  }
  const initialState = await page.evaluate(() => ({
    grammarQ: app.store.prefs.grammarQ,
    grammarA: app.store.prefs.grammarA,
    hasStartBtn: !!document.getElementById('gr-start-btn'),
    wordText: document.getElementById('gr-word')?.textContent?.trim()?.substring(0, 30),
  }));
  console.log(`Generation ${genDone ? 'done' : 'timed out'} after ${genWaited/1000}s:`, JSON.stringify(initialState));

  // Step 3: Open settings
  await page.evaluate(() => app.modal(true));
  await new Promise(r => setTimeout(r, 3000));

  // Verify settings shows correct preset
  const settingsState = await page.evaluate(() => ({
    presetSource: document.getElementById('preset-source')?.value,
    presetTarget: document.getElementById('preset-target')?.value,
    grammarQ: document.getElementById('grammar-q')?.value,
    grammarA: document.getElementById('grammar-a')?.value,
    grammarQHasOptions: (document.getElementById('grammar-q')?.options?.length || 0) > 1,
  }));
  console.log('Settings state:', JSON.stringify(settingsState));

  // Step 4: Close settings (X button)
  await page.evaluate(() => app.modal(false));
  await new Promise(r => setTimeout(r, 5000));

  // Step 5: Check Grammar Gym state after close
  const afterState = await page.evaluate(() => ({
    grammarQ: app.store.prefs.grammarQ,
    grammarA: app.store.prefs.grammarA,
    presetSource: app.store.prefs.presetSource,
    presetTarget: app.store.prefs.presetTarget,
    inGrammarGym: !!document.getElementById('gr-card'),
    hasStartBtn: !!document.getElementById('gr-start-btn'),
    wordText: document.getElementById('gr-word')?.textContent?.trim()?.substring(0, 30),
    isGenerating: document.getElementById('gr-content')?.textContent?.includes('Generating'),
  }));
  console.log('After settings close:', JSON.stringify(afterState));

  if (afterState.grammarQ === 'zh' && afterState.grammarA === 'zh') {
    console.log('✅ PASS: Grammar Gym still set to Chinese after settings open/close');
  } else {
    console.log(`❌ FAIL: grammarQ=${afterState.grammarQ}, grammarA=${afterState.grammarA} (expected zh/zh)`);
  }

  await device.close();
});
