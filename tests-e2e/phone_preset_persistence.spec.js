import { test, _android as android } from '@playwright/test';

test('Preset survives settings open/close in Grammar Gym', async () => {
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

  // Step 1: Apply "English → Chinese" preset
  const beforeGrammar = await page.evaluate(() => {
    app.presets.apply('en', 'zh');
    return {
      presetSource: app.store.prefs.presetSource,
      presetTarget: app.store.prefs.presetTarget,
      grammarQ: app.store.prefs.grammarQ,
      grammarA: app.store.prefs.grammarA,
    };
  });
  console.log('After preset apply:', JSON.stringify(beforeGrammar));
  await new Promise(r => setTimeout(r, 2000));

  // Step 2: Click Grammar Gym
  const ggClicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    const target = Array.from(btns).find(b => b.textContent?.includes('Grammar Gym'));
    if (target) { target.click(); return true; }
    return false;
  });
  console.log(`Grammar Gym clicked: ${ggClicked}`);
  await new Promise(r => setTimeout(r, 2000));

  // Capture current grammar gym state
  const inGrammarBefore = await page.evaluate(() => ({
    grammarQ: app.store.prefs.grammarQ,
    grammarA: app.store.prefs.grammarA,
    presetSource: app.store.prefs.presetSource,
    presetTarget: app.store.prefs.presetTarget,
    wordText: document.getElementById('gr-word')?.textContent?.trim()?.substring(0, 50),
  }));
  console.log('In Grammar Gym before settings:', JSON.stringify(inGrammarBefore));

  // Step 3: Open settings (gear icon)
  await page.evaluate(() => app.modal(true));
  await new Promise(r => setTimeout(r, 3000));

  // Check settings shows correct values
  const settingsState = await page.evaluate(() => {
    const source = document.getElementById('preset-source');
    const target = document.getElementById('preset-target');
    const grammarQ = document.getElementById('grammar-q');
    const grammarA = document.getElementById('grammar-a');
    return {
      modalVisible: !document.getElementById('modal-settings')?.classList.contains('hidden'),
      presetSourceVal: source?.value,
      presetSourceOptions: source ? Array.from(source.options).map(o => o.value) : [],
      presetTargetVal: target?.value,
      grammarQVal: grammarQ?.value,
      grammarQOptions: grammarQ ? Array.from(grammarQ.options).map(o => o.value) : [],
      grammarAVal: grammarA?.value,
    };
  });
  console.log('Settings open state:', JSON.stringify(settingsState, null, 2));

  // Step 4: Close settings WITHOUT changes
  await page.evaluate(() => app.modal(false));
  await new Promise(r => setTimeout(r, 5000));

  // Step 5: Check grammar gym state after close
  const inGrammarAfter = await page.evaluate(() => ({
    grammarQ: app.store.prefs.grammarQ,
    grammarA: app.store.prefs.grammarA,
    presetSource: app.store.prefs.presetSource,
    presetTarget: app.store.prefs.presetTarget,
    wordText: document.getElementById('gr-word')?.textContent?.trim()?.substring(0, 50),
  }));
  console.log('In Grammar Gym AFTER settings close:', JSON.stringify(inGrammarAfter));

  // Verdict
  if (inGrammarAfter.grammarQ === 'zh' && inGrammarAfter.grammarA === 'zh') {
    console.log('✅ PASS: Preset survived settings open/close');
  } else {
    console.log(`❌ FAIL: Preset reverted. Expected zh/zh, got ${inGrammarAfter.grammarQ}/${inGrammarAfter.grammarA}`);
  }

  await device.close();
});
