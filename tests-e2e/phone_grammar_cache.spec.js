import { test, _android as android } from '@playwright/test';

test('Grammar Gym RTDB cache save and load on phone', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.kevinkicho.vocabmaster');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.kevinkicho.vocabmaster/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 12000));

  const webview = await device.webView({ pkg: 'com.kevinkicho.vocabmaster' });
  const page = await webview.page();

  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) btn.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  const aiOk = await page.evaluate(() => ({
    available: window.app?.llm?.available,
    hasModel: window.app?.llm?.hasModel,
    resolved: window.app?.llm?.resolvedModel,
  }));
  console.log('AI status:', JSON.stringify(aiOk));

  if (!aiOk.available || !aiOk.hasModel) {
    console.log('FAIL: AI not ready');
    await device.close();
    return;
  }

  // Step 1: Generate fresh and save to RTDB
  const vocabId = 9999;
  const lang = 'en';
  console.log(`Step 1: Generate fresh for vocabId=${vocabId}, lang=${lang}`);
  const startTime = Date.now();

  const genResult = await page.evaluate(async ({ vocabId, lang }) => {
    const llm = window.app?.llm;
    if (!llm) return { error: 'No LLM' };
    try {
      const data = await llm.getGrammarExercise('test', 'Test sentence.', lang, 'A1', null, vocabId);
      return { success: true, hasData: !!data, exerciseCount: data?.exercises?.length };
    } catch(e) {
      return { error: e.message };
    }
  }, { vocabId, lang });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`Generation took ${elapsed.toFixed(1)}s:`, JSON.stringify(genResult));

  if (!genResult.success) {
    console.log('FAIL: Generation failed');
    await device.close();
    return;
  }

  // Step 2: Verify it was saved to RTDB
  const saved = await page.evaluate(async ({ vocabId, lang }) => {
    if (!db) return { error: 'No db' };
    try {
      const snap = await db.ref(`grammar_exercises/${vocabId}/${lang}`).limitToLast(1).once('value');
      if (!snap.exists()) return { saved: false, reason: 'No data at path' };
      let entry = null;
      snap.forEach(child => { entry = child.val(); });
      return {
        saved: true,
        hasGrammar: !!entry?.grammar,
        hasExercises: !!entry?.exercises,
        exerciseCount: entry?.exercises?.length,
        hasModel: !!entry?.model,
        hasTs: !!entry?.ts,
      };
    } catch(e) {
      return { error: e.message };
    }
  }, { vocabId, lang });
  console.log('RTDB save check:', JSON.stringify(saved));

  if (!saved.saved) {
    console.log('FAIL: Not saved to RTDB');
    await device.close();
    return;
  }
  console.log('✅ Saved to RTDB');

  // Step 3: Load from cache (should be instant)
  console.log('Step 3: Load from cache...');
  const cacheStart = Date.now();
  const cached = await page.evaluate(async ({ vocabId, lang }) => {
    const llm = window.app?.llm;
    if (!llm) return { error: 'No LLM' };
    try {
      const data = await llm.loadCachedGrammarExercise(vocabId, lang);
      return {
        success: true,
        hasData: !!data,
        fromCache: data?.fromCache,
        exerciseCount: data?.exercises?.length,
        grammar: data?.grammar?.substring(0, 60),
      };
    } catch(e) {
      return { error: e.message };
    }
  }, { vocabId, lang });
  const cacheElapsed = (Date.now() - cacheStart) / 1000;
  console.log(`Cache load took ${cacheElapsed.toFixed(1)}s:`, JSON.stringify(cached));

  if (cached.success && cached.fromCache) {
    console.log('✅ RTDB cache save/load cycle verified');
  } else {
    console.log('FAIL: Cache load failed');
  }

  await device.close();
});
