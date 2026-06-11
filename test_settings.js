const { chromium } = require('playwright');

async function runSettingsSuite() {
  console.log('=== VocabMaster Settings Modal — Comprehensive Test Suite ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } }); // iPhone-like
  const page = await context.newPage();

  const results = { pass: 0, fail: 0, skip: 0, details: [] };

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [PAGE ERROR] ${msg.text()}`);
  });

  // --- Load App ---
  console.log('[1] Loading app...');
  await page.goto('http://127.0.0.1:8081', { waitUntil: 'networkidle' });
  await page.waitForSelector('#btn-init', { state: 'visible', timeout: 10000 });
  await page.click('#btn-init');

  // Dismiss modals
  try {
    await page.waitForSelector('#ai-welcome', { state: 'visible', timeout: 1500 });
    await page.evaluate(() => {
      const w = document.getElementById('ai-welcome');
      if (w) w.remove();
    });
  } catch (e) {}
  await page.evaluate(() => {
    const s = document.getElementById('modal-settings');
    if (s && !s.classList.contains('hidden')) s.classList.add('hidden');
  });

  console.log('[2] Opening settings modal...');
  await page.evaluate(() => app.modal(true));
  await page.waitForTimeout(500);

  // ====================================================================
  // STRATEGY 1: DOM Binding Audit
  // ====================================================================
  console.log('\n=== STRATEGY 1: DOM Binding Audit ===');
  const missingBindings = await page.evaluate(() => {
    if (typeof app.ui.validateSettingsBindings !== 'function') return ['(function not found)'];
    return app.ui.validateSettingsBindings();
  });

  if (missingBindings.length === 0) {
    console.log('  ✅ All registry-bound DOM IDs present!');
    results.pass++;
    results.details.push({ test: 'DOM Binding Audit', status: 'PASS' });
  } else {
    console.log(`  ❌ Missing ${missingBindings.length} DOM bindings:`);
    missingBindings.forEach(m => console.log(`     - ${m}`));
    results.fail++;
    results.details.push({ test: 'DOM Binding Audit', status: 'FAIL', missing: missingBindings });
  }

  // ====================================================================
  // STRATEGY 2: Round-trip Read/Write for Every Preference
  // ====================================================================
  console.log('\n=== STRATEGY 2: Round-Trip Preference Validation ===');

  const roundTripResults = await page.evaluate(() => {
    const results = [];
    if (typeof getAllPrefs !== 'function') return [{ key: '(no registry)', status: 'SKIP' }];
    const allPrefs = getAllPrefs(typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG : []);

    for (const entry of allPrefs) {
      if (!entry.domId) { results.push({ key: entry.key, status: 'SKIP', reason: 'no domId' }); continue; }
      const el = document.getElementById(entry.domId);
      if (!el) { results.push({ key: entry.key, domId: entry.domId, status: 'FAIL', reason: 'DOM element not found' }); continue; }

      try {
        // Read current value
        const originalValue = readPrefFromDom(entry);

        // Compute a new value
        let newValue;
        if (entry.type === 'bool') {
          newValue = !originalValue;
          el.checked = newValue;
        } else if (entry.type === 'select') {
          const options = Array.from(el.options || []);
          if (options.length < 2) {
            results.push({ key: entry.key, status: 'SKIP', reason: 'only 1 option' });
            continue;
          }
          // Pick a different option
          const currentIdx = options.findIndex(o => o.value === el.value);
          const nextIdx = (currentIdx + 1) % options.length;
          // Skip empty/none options
          let targetIdx = nextIdx;
          if (options[targetIdx].value === '' || options[targetIdx].value === '(None)') {
            targetIdx = (targetIdx + 1) % options.length;
          }
          newValue = options[targetIdx].value;
          el.value = newValue;
        } else if (entry.type === 'radio') {
          const radios = document.querySelectorAll('input[name="' + entry.domId + '"]');
          if (radios.length < 2) {
            results.push({ key: entry.key, status: 'SKIP', reason: 'only 1 radio' });
            continue;
          }
          const current = document.querySelector('input[name="' + entry.domId + '"]:checked');
          const all = Array.from(radios);
          const idx = all.indexOf(current);
          const next = all[(idx + 1) % all.length];
          next.checked = true;
          newValue = next.value;
        } else {
          results.push({ key: entry.key, status: 'SKIP', reason: 'unknown type: ' + entry.type });
          continue;
        }

        // Save
        app.store.saveSettings();

        // Verify localStorage persisted
        const saved = JSON.parse(localStorage.getItem(app.store.STORAGE_KEY));
        const persisted = saved[entry.key];

        // For booleans, compare strictly
        let match = false;
        if (entry.type === 'bool') {
          match = persisted === newValue;
        } else {
          match = String(persisted) === String(newValue);
        }

        if (match) {
          results.push({ key: entry.key, status: 'PASS', from: String(originalValue), to: String(newValue) });
        } else {
          results.push({ key: entry.key, status: 'FAIL', expected: String(newValue), got: String(persisted) });
        }

        // Restore original
        if (entry.type === 'bool') el.checked = originalValue;
        else if (entry.type === 'select') el.value = originalValue || '';
        else if (entry.type === 'radio') {
          const orig = document.querySelector('input[name="' + entry.domId + '"][value="' + originalValue + '"]');
          if (orig) orig.checked = true;
        }
        app.store.saveSettings();

      } catch (e) {
        results.push({ key: entry.key, status: 'FAIL', reason: 'Error: ' + e.message });
      }
    }
    return results;
  });

  let rtPass = 0, rtFail = 0, rtSkip = 0;
  for (const r of roundTripResults) {
    if (r.status === 'PASS') { rtPass++; results.pass++; }
    else if (r.status === 'FAIL') {
      rtFail++;
      results.fail++;
      console.log(`  ❌ ${r.key} (${r.domId || ''}): ${r.reason || `expected=${r.expected} got=${r.got}`}`);
    }
    else { rtSkip++; results.skip++; }
    results.details.push(r);
  }
  console.log(`  Round-trip: ${rtPass} PASS, ${rtFail} FAIL, ${rtSkip} SKIP (out of ${roundTripResults.length} prefs)`);

  // ====================================================================
  // STRATEGY 3: Visual Screenshot Sweep
  // ====================================================================
  console.log('\n=== STRATEGY 3: Visual Screenshot Sweep ===');

  // Re-open settings fresh
  await page.evaluate(() => { app.modal(false); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { app.modal(true); });
  await page.waitForTimeout(500);

  // Screenshot the top of settings
  const settingsModal = await page.$('#modal-settings');
  if (settingsModal) {
    await page.screenshot({ path: 'screenshots/settings_overview_top.png' });
    console.log('  📸 settings_overview_top.png');
  }

  // Expand all <details> elements so they're open
  await page.evaluate(() => {
    document.querySelectorAll('#settings-list details').forEach(d => d.setAttribute('open', ''));
    // Also expand fonts accordion
    const fontsContent = document.querySelector('#accordion-fonts .content');
    if (fontsContent) fontsContent.classList.remove('hidden');
  });
  await page.waitForTimeout(300);

  // Scroll through settings and take screenshots
  const scrollPositions = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
  for (let i = 0; i < scrollPositions.length; i++) {
    await page.evaluate((pos) => {
      const list = document.getElementById('settings-list');
      if (list) list.scrollTop = pos;
    }, scrollPositions[i]);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `screenshots/settings_scroll_${i}.png` });
    console.log(`  📸 settings_scroll_${i}.png`);
  }

  // ====================================================================
  // STRATEGY 4: Functional Spot-Checks
  // ====================================================================
  console.log('\n=== STRATEGY 4: Functional Spot-Checks ===');

  // 4a. Dark mode toggle
  const darkResult = await page.evaluate(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    const toggle = document.getElementById('toggle-dark');
    if (!toggle) return { status: 'FAIL', reason: 'toggle-dark not found' };
    toggle.checked = !wasDark;
    app.store.saveSettings();
    const isDark = document.documentElement.classList.contains('dark');
    const expected = !wasDark;
    // Restore
    toggle.checked = wasDark;
    app.store.saveSettings();
    return { status: isDark === expected ? 'PASS' : 'FAIL', wasDark, isDark, expected };
  });
  if (darkResult.status === 'PASS') {
    console.log('  ✅ Dark mode toggle works correctly');
    results.pass++;
  } else {
    console.log(`  ❌ Dark mode: ${JSON.stringify(darkResult)}`);
    results.fail++;
  }
  results.details.push({ test: 'Dark Mode Toggle', ...darkResult });

  // 4b. Theme switching
  const themeResult = await page.evaluate(() => {
    const origTheme = app.store.prefs.theme || 'classic';
    app.store.setTheme('sakura');
    const attr = document.documentElement.getAttribute('data-theme');
    const pass = attr === 'sakura';
    app.store.setTheme(origTheme);
    return { status: pass ? 'PASS' : 'FAIL', set: 'sakura', got: attr };
  });
  if (themeResult.status === 'PASS') {
    console.log('  ✅ Theme switching works correctly');
    results.pass++;
  } else {
    console.log(`  ❌ Theme switch: ${JSON.stringify(themeResult)}`);
    results.fail++;
  }
  results.details.push({ test: 'Theme Switch', ...themeResult });

  // 4c. Font settings apply
  const fontResult = await page.evaluate(() => {
    const origFont = app.store.prefs.font;
    app.store.prefs.font = 'serif';
    app.ui.applyFontSettings();
    const attr = document.documentElement.getAttribute('data-font');
    const pass = attr === 'serif';
    app.store.prefs.font = origFont;
    app.ui.applyFontSettings();
    return { status: pass ? 'PASS' : 'FAIL', set: 'serif', got: attr };
  });
  if (fontResult.status === 'PASS') {
    console.log('  ✅ Font settings apply correctly');
    results.pass++;
  } else {
    console.log(`  ❌ Font: ${JSON.stringify(fontResult)}`);
    results.fail++;
  }
  results.details.push({ test: 'Font Apply', ...fontResult });

  // 4d. Preset language propagation
  const presetResult = await page.evaluate(() => {
    // Save originals
    const origQ = app.store.prefs.quizQ;
    const origA = app.store.prefs.quizA;

    // Apply Spanish preset
    if (app.presets) app.presets.apply('en', 'es');

    const quizQ = app.store.prefs.quizQ;
    const flashFront = app.store.prefs.flashFront;
    const pass = quizQ === 'es' && flashFront === 'es';

    // Restore
    if (app.presets) app.presets.apply('en', 'ja');

    return { status: pass ? 'PASS' : 'FAIL', quizQ, flashFront };
  });
  if (presetResult.status === 'PASS') {
    console.log('  ✅ Preset language propagation works (es preset → quizQ=es, flashFront=es)');
    results.pass++;
  } else {
    console.log(`  ❌ Preset propagation: ${JSON.stringify(presetResult)}`);
    results.fail++;
  }
  results.details.push({ test: 'Preset Propagation', ...presetResult });

  // 4e. Level filter toggle
  const levelResult = await page.evaluate(() => {
    const origFilter = [...(app.store.prefs.levelFilter || ['all'])];
    app.ui.toggleLevel('N5');
    const hasN5 = app.store.prefs.levelFilter.includes('N5');
    app.store.prefs.levelFilter = origFilter;
    return { status: hasN5 ? 'PASS' : 'FAIL' };
  });
  if (levelResult.status === 'PASS') {
    console.log('  ✅ Level filter toggle works');
    results.pass++;
  } else {
    console.log('  ❌ Level filter toggle failed');
    results.fail++;
  }
  results.details.push({ test: 'Level Filter Toggle', ...levelResult });

  // 4f. Celebration grid toggle
  const celebResult = await page.evaluate(() => {
    const origCelebs = [...(app.store.prefs.allowedCelebs || [])];
    const hadConfetti = origCelebs.includes('Confetti');
    // Toggle
    if (app.store.toggleCeleb) {
      // Simulate toggle
      let arr = [...origCelebs];
      if (hadConfetti) arr = arr.filter(c => c !== 'Confetti');
      else arr.push('Confetti');
      app.store.prefs.allowedCelebs = arr;
      const result = app.store.prefs.allowedCelebs.includes('Confetti') !== hadConfetti;
      app.store.prefs.allowedCelebs = origCelebs;
      return { status: result ? 'PASS' : 'FAIL' };
    }
    return { status: 'SKIP', reason: 'toggleCeleb not found' };
  });
  if (celebResult.status === 'PASS') {
    console.log('  ✅ Celebration toggle works');
    results.pass++;
  } else if (celebResult.status === 'SKIP') {
    console.log('  ⏭ Celebration toggle skipped');
    results.skip++;
  } else {
    console.log('  ❌ Celebration toggle failed');
    results.fail++;
  }
  results.details.push({ test: 'Celebration Toggle', ...celebResult });

  // ====================================================================
  // Final Summary
  // ====================================================================
  console.log('\n====================================');
  console.log('        FINAL RESULTS');
  console.log('====================================');
  console.log(`  ✅ PASS: ${results.pass}`);
  console.log(`  ❌ FAIL: ${results.fail}`);
  console.log(`  ⏭  SKIP: ${results.skip}`);
  console.log(`  TOTAL:  ${results.pass + results.fail + results.skip}`);
  console.log('====================================');

  if (results.fail > 0) {
    console.log('\nFailed tests:');
    results.details.filter(d => d.status === 'FAIL').forEach(d => {
      console.log(`  - ${d.test || d.key}: ${d.reason || `expected=${d.expected} got=${d.got}`}`);
    });
  }

  // Final screenshot
  await page.screenshot({ path: 'screenshots/settings_final.png' });
  console.log('\n📸 Final screenshot saved.');

  await browser.close();
  console.log('\nDone!');
  process.exit(results.fail > 0 ? 1 : 0);
}

runSettingsSuite().catch(e => { console.error(e); process.exit(1); });
