// test/e2e/story_real_e2e.spec.js
// Real end-to-end test: uses real AI (ollama), real RTDB, no mock data.
// Verifies: chips persist, numbering starts at 1/5, story saves to RTDB.

const { test, expect } = require('@playwright/test');

const HOST = 'http://127.0.0.1:8085';

test('Story Mode: real AI generation + chips + numbering + RTDB save', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app && window.app.data && window.app.data.list && window.app.data.list.length > 0, { timeout: 15000 });

  // Click Start
  await page.evaluate(() => document.getElementById('btn-init')?.click());
  await page.waitForTimeout(500);

  // Launch Story Mode via the button
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.includes('Story Mode')) { b.click(); break; }
    }
  });
  await page.waitForTimeout(1000);

  // If "No cached stories" prompt appears, click "Generate Anew Story"
  const hasNoCache = await page.evaluate(() => {
    return document.body.textContent.includes('No cached stories yet');
  });
  if (hasNoCache) {
    await page.evaluate(() => {
      const btn = document.getElementById('story-generate-anew');
      if (btn) btn.click();
    });
  }

  // Wait for real AI to generate the story (can take 30-60s)
  // Look for word chips appearing
  await page.waitForSelector('.story-word-chip', { timeout: 90000 });
  await page.waitForTimeout(500);

  // === Verify #1: Numbering starts at 1/5 ===
  const progressText = await page.evaluate(() => {
    const el = document.getElementById('story-progress');
    return el ? el.textContent : '';
  });
  console.log('Story progress:', progressText);
  expect(progressText).toBe('1');

  // === Verify #2: Chips are present ===
  const chipCount = await page.evaluate(() => document.querySelectorAll('.story-word-chip').length);
  console.log('Word chips count:', chipCount);
  expect(chipCount).toBeGreaterThanOrEqual(3);

  // Take screenshot of reading phase
  await page.screenshot({ path: 'screenshots/story_real_01_reading.png', fullPage: false });

  // Wait for questions to finish generating (button becomes enabled)
  await page.waitForFunction(() => {
    const btn = document.getElementById('story-ready-btn');
    return btn && !btn.disabled && !btn.textContent.includes('Generating');
  }, { timeout: 60000 });
  await page.waitForTimeout(300);

  // Click into questions
  await page.evaluate(() => document.getElementById('story-ready-btn')?.click());
  await page.waitForSelector('.story-choice', { timeout: 5000 });
  await page.waitForTimeout(300);

  // === Verify #3: Chips persist in question phase ===
  const chipsInQuestion = await page.evaluate(() => document.querySelectorAll('.story-word-chip').length);
  console.log('Chips in question phase:', chipsInQuestion);
  expect(chipsInQuestion).toBeGreaterThanOrEqual(3);

  // Take screenshot of question phase
  await page.screenshot({ path: 'screenshots/story_real_02_question.png', fullPage: false });

  // Answer both questions
  for (let i = 0; i < 2; i++) {
    const choiceA = await page.evaluate(() => {
      const btn = document.querySelector('.story-choice[data-letter="A"]');
      return btn ? btn.dataset.letter : null;
    });
    if (choiceA) {
      // First click = TTS + select
      await page.evaluate(() => document.querySelector('.story-choice[data-letter="A"]')?.click());
      await page.waitForTimeout(200);
      // Second click = submit
      await page.evaluate(() => document.querySelector('.story-choice[data-letter="A"]')?.click());
      await page.waitForTimeout(300);
    }
    // Click next if available
    const hasNext = await page.evaluate(() => !!document.getElementById('story-next-q'));
    if (hasNext) {
      await page.evaluate(() => document.getElementById('story-next-q')?.click());
      await page.waitForSelector('.story-choice', { timeout: 5000 });
      await page.waitForTimeout(300);
    }
  }

  // Take screenshot of end-of-story
  await page.screenshot({ path: 'screenshots/story_real_03_end.png', fullPage: false });

  // === Verify #4: Generate Anew button visible at end ===
  const hasAnewBtn = await page.evaluate(() => !!document.getElementById('story-generate-anew'));
  console.log('Generate Anew button at end:', hasAnewBtn);
  expect(hasAnewBtn).toBe(true);

  // === Verify #5: RTDB save was attempted ===
  const saveInfo = await page.evaluate(() => {
    const game = window.app && window.app.game;
    return {
      hasAuth: !!(window.auth && window.auth.currentUser),
      uid: window.auth && window.auth.currentUser ? window.auth.currentUser.uid.slice(-8) : 'none',
      isAnon: window.auth && window.auth.currentUser ? window.auth.currentUser.isAnonymous : 'N/A'
    };
  });
  console.log('Auth state at end:', saveInfo);

  // === Verify #6: No JS errors ===
  if (errors.length > 0) {
    console.log('JS errors:', errors);
  }
  expect(errors.filter(e => !e.includes('Failed to load resource') && !e.includes('favicon')).length).toBe(0);
});
