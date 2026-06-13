import { test, _android as android } from '@playwright/test';

test('Grammar Gym AI generation validation on phone', async () => {
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

  // Check AI status
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

  // Call getGrammarExercise directly via LLM service (bypasses UI)
  console.log('Calling getGrammarExercise directly...');
  const startTime = Date.now();

  const result = await page.evaluate(async () => {
    const llm = window.app?.llm;
    if (!llm) return { error: 'No LLM service' };

    try {
      const data = await llm.getGrammarExercise('test', 'This is a test sentence.', 'en', 'A1');
      return { success: true, data };
    } catch(e) {
      return { error: e.message, stack: e.stack };
    }
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`Generation took ${elapsed.toFixed(1)}s`);

  if (result.error) {
    console.log('FAIL:', result.error);
    await device.close();
    return;
  }

  if (!result.data) {
    console.log('FAIL: null data returned');
    await device.close();
    return;
  }

  // Validate
  const d = result.data;
  const issues = [];
  if (!d.grammar || d.grammar.length < 1) issues.push('Missing grammar');
  if (!d.usage || d.usage.length < 1) issues.push('Missing usage');
  if (!d.example || d.example.length < 1) issues.push('Missing example');
  if (!d.exercises || !Array.isArray(d.exercises)) {
    issues.push('Missing exercises array');
  } else {
    if (d.exercises.length !== 12) issues.push(`Expected 12 exercises, got ${d.exercises.length}`);
    d.exercises.forEach((ex, i) => {
      if (!ex.type) issues.push(`Ex ${i}: missing type`);
      if (!ex.question || ex.question.length < 5) issues.push(`Ex ${i}: short question`);
      if (!ex.choices || ex.choices.length < 2) issues.push(`Ex ${i}: too few choices`);
      if (!ex.answer) issues.push(`Ex ${i}: missing answer`);
      if (!ex.explanation) issues.push(`Ex ${i}: missing explanation`);
      if (!ex.labelA || !ex.labelB) issues.push(`Ex ${i}: missing labels`);
    });
  }

  console.log('Exercises:', d.exercises?.length);
  console.log('Grammar:', d.grammar?.substring(0, 80));
  console.log('First Q:', d.exercises?.[0]?.question?.substring(0, 80));
  console.log('Issues:', issues.length > 0 ? issues : 'none');

  if (issues.length === 0) {
    console.log('✅ Grammar Gym AI generation validated successfully');
  } else {
    console.log('FAIL: Generated content has issues:', issues);
  }

  await device.close();
});
