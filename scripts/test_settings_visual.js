const { chromium } = require('playwright');

async function runVisualSettingsTests() {
  console.log('=== Settings Visual Feature Tests ===\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  // --- Load & Init ---
  await page.goto('http://127.0.0.1:8081', { waitUntil: 'networkidle' });
  await page.waitForSelector('#btn-init', { state: 'visible', timeout: 10000 });
  await page.click('#btn-init');
  try {
    await page.waitForSelector('#ai-welcome', { state: 'visible', timeout: 1500 });
    await page.evaluate(() => { const w = document.getElementById('ai-welcome'); if (w) w.remove(); });
  } catch (e) {}
  await page.evaluate(() => {
    const s = document.getElementById('modal-settings');
    if (s && !s.classList.contains('hidden')) s.classList.add('hidden');
  });

  // Helper: open settings fresh
  async function openSettings() {
    await page.evaluate(() => app.modal(true));
    await page.waitForTimeout(400);
  }

  // Helper: scroll settings-list to a target element
  async function scrollToElement(selector) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    }, selector);
    await page.waitForTimeout(200);
  }

  // ================================================================
  // TEST 1: DARK MODE — Light vs Dark
  // ================================================================
  console.log('[1] Dark Mode: Light vs Dark');
  await openSettings();

  // Force light mode
  await page.evaluate(() => {
    document.getElementById('toggle-dark').checked = false;
    app.store.saveSettings();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/feat_1a_light_mode.png' });
  console.log('  📸 feat_1a_light_mode.png');

  // Switch to dark mode
  await page.evaluate(() => {
    document.getElementById('toggle-dark').checked = true;
    app.store.saveSettings();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/feat_1b_dark_mode.png' });
  console.log('  📸 feat_1b_dark_mode.png');

  // Restore light for remaining tests
  await page.evaluate(() => {
    document.getElementById('toggle-dark').checked = false;
    app.store.saveSettings();
  });

  // ================================================================
  // TEST 2: THEME SWITCHING — Classic vs Sakura vs Ocean
  // ================================================================
  console.log('[2] Theme Switching');
  await page.evaluate(() => app.modal(false));
  await page.waitForTimeout(200);

  // Classic theme - show home screen
  await page.evaluate(() => app.store.setTheme('classic'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/feat_2a_theme_classic.png' });
  console.log('  📸 feat_2a_theme_classic.png');

  // Sakura theme
  await page.evaluate(() => app.store.setTheme('sakura'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/feat_2b_theme_sakura.png' });
  console.log('  📸 feat_2b_theme_sakura.png');

  // Ocean theme
  await page.evaluate(() => app.store.setTheme('ocean'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/feat_2c_theme_ocean.png' });
  console.log('  📸 feat_2c_theme_ocean.png');

  // Restore
  await page.evaluate(() => app.store.setTheme('classic'));

  // ================================================================
  // TEST 3: FONT SETTINGS — Sans vs Serif, Normal vs Bold
  // ================================================================
  console.log('[3] Font Settings');
  await openSettings();
  // Expand fonts accordion
  await page.evaluate(() => {
    const fontsContent = document.querySelector('#accordion-fonts .content');
    if (fontsContent) fontsContent.classList.remove('hidden');
  });
  await scrollToElement('#accordion-fonts');

  // Sans + Normal
  await page.evaluate(() => {
    document.getElementById('app-font').value = 'sans';
    document.getElementById('app-font-weight').value = 'normal';
    app.store.prefs.font = 'sans'; app.store.prefs.fontWeight = 'normal';
    app.ui.applyFontSettings();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_3a_font_sans_normal.png' });
  console.log('  📸 feat_3a_font_sans_normal.png');

  // Serif + Bold
  await page.evaluate(() => {
    document.getElementById('app-font').value = 'serif';
    document.getElementById('app-font-weight').value = 'bold';
    app.store.prefs.font = 'serif'; app.store.prefs.fontWeight = 'bold';
    app.ui.applyFontSettings();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_3b_font_serif_bold.png' });
  console.log('  📸 feat_3b_font_serif_bold.png');

  // Restore
  await page.evaluate(() => {
    app.store.prefs.font = 'sans'; app.store.prefs.fontWeight = 'normal';
    app.ui.applyFontSettings();
  });

  // ================================================================
  // TEST 4: LANGUAGE PRESET — Japanese vs Spanish vs Chinese
  // ================================================================
  console.log('[4] Language Presets');
  await page.evaluate(() => app.modal(false));
  await page.waitForTimeout(200);

  // Apply Japanese preset
  await page.evaluate(() => app.presets.apply('en', 'ja'));
  await page.waitForTimeout(200);
  await openSettings();
  // Expand flashcard section and scroll to it
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    details.forEach(d => d.removeAttribute('open'));
    const flash = Array.from(details).find(d => d.textContent.includes('Flashcards'));
    if (flash) flash.setAttribute('open', '');
  });
  await scrollToElement('details:has(#flash-front)');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_4a_preset_japanese.png' });
  console.log('  📸 feat_4a_preset_japanese.png (Flashcards → Front=Japanese)');

  // Apply Spanish preset
  await page.evaluate(() => { app.modal(false); });
  await page.waitForTimeout(200);
  await page.evaluate(() => app.presets.apply('en', 'es'));
  await page.waitForTimeout(200);
  await openSettings();
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    details.forEach(d => d.removeAttribute('open'));
    const flash = Array.from(details).find(d => d.textContent.includes('Flashcards'));
    if (flash) flash.setAttribute('open', '');
  });
  await scrollToElement('details:has(#flash-front)');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_4b_preset_spanish.png' });
  console.log('  📸 feat_4b_preset_spanish.png (Flashcards → Front=Spanish)');

  // Apply Chinese preset
  await page.evaluate(() => { app.modal(false); });
  await page.waitForTimeout(200);
  await page.evaluate(() => app.presets.apply('en', 'zh'));
  await page.waitForTimeout(200);
  await openSettings();
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    details.forEach(d => d.removeAttribute('open'));
    const flash = Array.from(details).find(d => d.textContent.includes('Flashcards'));
    if (flash) flash.setAttribute('open', '');
  });
  await scrollToElement('details:has(#flash-front)');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_4c_preset_chinese.png' });
  console.log('  📸 feat_4c_preset_chinese.png (Flashcards → Front=Chinese)');

  // Restore
  await page.evaluate(() => { app.modal(false); });
  await page.evaluate(() => app.presets.apply('en', 'ja'));

  // ================================================================
  // TEST 5: QUIZ SETTINGS — Show Examples ON vs OFF
  // ================================================================
  console.log('[5] Quiz Settings: Show Examples toggle');
  await openSettings();
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    details.forEach(d => d.removeAttribute('open'));
    const quiz = Array.from(details).find(d => d.textContent.includes('Quiz'));
    if (quiz) quiz.setAttribute('open', '');
  });
  await scrollToElement('details:has(#quiz-q-type)');

  // Show Examples ON
  await page.evaluate(() => {
    const el = document.getElementById('quiz-show-ex');
    if (el) el.checked = true;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_5a_quiz_examples_on.png' });
  console.log('  📸 feat_5a_quiz_examples_on.png');

  // Show Examples OFF
  await page.evaluate(() => {
    const el = document.getElementById('quiz-show-ex');
    if (el) el.checked = false;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_5b_quiz_examples_off.png' });
  console.log('  📸 feat_5b_quiz_examples_off.png');

  // ================================================================
  // TEST 6: SENTENCES SETTINGS — Bottom Display modes
  // ================================================================
  console.log('[6] Sentences Settings: Bottom Display modes');
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    details.forEach(d => d.removeAttribute('open'));
    const sent = Array.from(details).find(d => d.textContent.includes('Sentences'));
    if (sent) sent.setAttribute('open', '');
  });
  await scrollToElement('details:has(#sentences-q)');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_6_sentences_settings.png' });
  console.log('  📸 feat_6_sentences_settings.png');

  // ================================================================
  // TEST 7: LEVEL FILTER — All vs N5 selected vs multiple
  // ================================================================
  console.log('[7] Level Filter');
  await scrollToElement('#level-filter-container');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_7a_level_all.png' });
  console.log('  📸 feat_7a_level_all.png (All selected)');

  // Click N5
  await page.evaluate(() => app.ui.toggleLevel('N5'));
  await page.waitForTimeout(300);
  await scrollToElement('#level-filter-container');
  await page.screenshot({ path: 'screenshots/feat_7b_level_n5.png' });
  console.log('  📸 feat_7b_level_n5.png (N5 selected)');

  // Add N4 too
  await page.evaluate(() => app.ui.toggleLevel('N4'));
  await page.waitForTimeout(300);
  await scrollToElement('#level-filter-container');
  await page.screenshot({ path: 'screenshots/feat_7c_level_n5_n4.png' });
  console.log('  📸 feat_7c_level_n5_n4.png (N5+N4 selected)');

  // Restore
  await page.evaluate(() => app.ui.toggleLevel('all'));

  // ================================================================
  // TEST 8: CELEBRATION GRID
  // ================================================================
  console.log('[8] Celebration Grid');
  await scrollToElement('#celeb-grid');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_8_celebrations.png' });
  console.log('  📸 feat_8_celebrations.png');

  // ================================================================
  // TEST 9: HANZI TOOLTIP SETTINGS
  // ================================================================
  console.log('[9] Hanzi Tooltip Settings');
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    const hanzi = Array.from(details).find(d => d.textContent.includes('Hanzi') || d.textContent.includes('漢字'));
    if (hanzi) hanzi.setAttribute('open', '');
  });
  await scrollToElement('#hanzi-enable-tooltip');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_9_hanzi_settings.png' });
  console.log('  📸 feat_9_hanzi_settings.png');

  // ================================================================
  // TEST 10: AI / LLM SETTINGS
  // ================================================================
  console.log('[10] AI / LLM Settings');
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    const ai = Array.from(details).find(d => d.textContent.includes('AI') && d.textContent.includes('CLOZE'));
    if (ai) ai.setAttribute('open', '');
  });
  await scrollToElement('#llm-model');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_10_ai_settings.png' });
  console.log('  📸 feat_10_ai_settings.png');

  // ================================================================
  // TEST 11: MATCHING SETTINGS — Card Content Pool grid
  // ================================================================
  console.log('[11] Matching Settings');
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    const match = Array.from(details).find(d => d.textContent.includes('Matching'));
    if (match) match.setAttribute('open', '');
  });
  await scrollToElement('#container-match-filters');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_11_matching_settings.png' });
  console.log('  📸 feat_11_matching_settings.png');

  // ================================================================
  // TEST 12: VOICE SETTINGS
  // ================================================================
  console.log('[12] Voice Settings');
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    const voice = Array.from(details).find(d => d.textContent.includes('Voice'));
    if (voice) voice.setAttribute('open', '');
  });
  await scrollToElement('#voice-disp-front');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_12_voice_settings.png' });
  console.log('  📸 feat_12_voice_settings.png');

  // ================================================================
  // TEST 13: HOME SCREEN — Verify preset changes reflect on buttons
  // ================================================================
  console.log('[13] Home Screen with different language presets');
  await page.evaluate(() => app.modal(false));
  await page.waitForTimeout(300);

  // Japanese home
  await page.evaluate(() => app.presets.apply('en', 'ja'));
  await page.waitForTimeout(300);
  await page.evaluate(() => app.goHome(false));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/feat_13a_home_japanese.png' });
  console.log('  📸 feat_13a_home_japanese.png');

  // Spanish home
  await page.evaluate(() => app.presets.apply('en', 'es'));
  await page.waitForTimeout(300);
  await page.evaluate(() => app.goHome(false));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/feat_13b_home_spanish.png' });
  console.log('  📸 feat_13b_home_spanish.png');

  // ================================================================
  // TEST 14: TRUE/FALSE SETTINGS
  // ================================================================
  console.log('[14] True/False Settings');
  await openSettings();
  await page.evaluate(() => {
    const details = document.querySelectorAll('#settings-list details');
    details.forEach(d => d.removeAttribute('open'));
    const tf = Array.from(details).find(d => d.textContent.includes('True'));
    if (tf) tf.setAttribute('open', '');
  });
  await scrollToElement('#tf-front');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/feat_14_tf_settings.png' });
  console.log('  📸 feat_14_tf_settings.png');

  // ================================================================
  // DONE
  // ================================================================
  console.log('\n=== All visual feature tests complete! ===');
  console.log('Total screenshots: 22');

  await browser.close();
  process.exit(0);
}

runVisualSettingsTests().catch(e => { console.error(e); process.exit(1); });
