// tests-e2e/grammar_nav_crash.spec.js
// Reproduces: clicking left/right nav buttons in Grammar Gym makes screen blank then crashes

const { test, expect } = require('@playwright/test');

const HOST = 'http://127.0.0.1:8085';

test('Grammar Gym: nav buttons do not crash', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + (e.stack ? '\n' + e.stack : '')));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app && window.app.data && window.app.data.list && window.app.data.list.length > 0, { timeout: 15000 });

  // Click Start
  await page.evaluate(() => document.getElementById('btn-init')?.click());
  await page.waitForTimeout(500);

  // Make LLM "ready" by stubbing it
  await page.evaluate(() => {
    window.app.llm = {
      available: true,
      hasModel: true,
      resolvedModel: 'gemma4:31b-cloud',
      _getLangName: (k) => k === 'ja' ? 'Japanese' : k,
      loadCachedGrammarExercise: async (vocabId, lang) => null, // force fresh generation
      getGrammarExercise: async (word, sentence, lang, level, onProgress, vocabId) => {
        // Simulate ~2s generation
        await new Promise(r => setTimeout(r, 2000));
        return {
          grammar: 'Test grammar for ' + word,
          usage: 'Test usage',
          example: 'Test example ' + word,
          exercises: [
            { type: 'text_dm', question: 'q1', choices: [{ letter: 'A', text: 'a1' }, { letter: 'B', text: 'b1' }], answer: 'A', explanation: 'exp1', labelA: 'send this', labelB: 'sounds wrong' },
            { type: 'text_dm', question: 'q2', choices: [{ letter: 'A', text: 'a2' }, { letter: 'B', text: 'b2' }], answer: 'A', explanation: 'exp2', labelA: 'send this', labelB: 'sounds wrong' }
          ]
        };
      }
    };
  });

  // Launch Grammar Gym directly
  await page.evaluate(() => window.app.launchGameMode('grammar'));
  await page.waitForSelector('#gr-card', { timeout: 5000 });

  // Wait for first vocab to load (explanation shown)
  await page.waitForSelector('#gr-start-btn', { timeout: 8000 });
  console.log('First vocab loaded');

  // Get the current vocab index
  const initialIndex = await page.evaluate(() => window.app.game.i);
  console.log('Initial i:', initialIndex);

  // Take a screenshot of the initial state
  await page.screenshot({ path: 'screenshots/grammar_nav_01_initial.png', fullPage: false });

  // Now click the RIGHT nav button (next vocab)
  await page.evaluate(() => {
    const rightBtn = document.querySelector('button[onclick="app.game.nav(1)"]');
    if (rightBtn) rightBtn.click();
  });
  console.log('Clicked right (1)');

  // Wait a moment, take screenshot
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/grammar_nav_02_after_right_1.png', fullPage: false });

  // Click RIGHT again IMMEDIATELY (before first nav completes)
  await page.evaluate(() => {
    const rightBtn = document.querySelector('button[onclick="app.game.nav(1)"]');
    if (rightBtn) rightBtn.click();
  });
  console.log('Clicked right (2)');

  // Wait a moment, take screenshot
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/grammar_nav_03_after_right_2.png', fullPage: false });

  // Click LEFT to go back
  await page.evaluate(() => {
    const leftBtn = document.querySelector('button[onclick="app.game.nav(-1)"]');
    if (leftBtn) leftBtn.click();
  });
  console.log('Clicked left');

  // Wait for things to settle
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/grammar_nav_04_settled.png', fullPage: false });

  // Check the state
  const state = await page.evaluate(() => {
    const game = window.app.game;
    return {
      i: game.i,
      exerciseData: game.exerciseData ? 'present' : 'null',
      domContentExists: !!document.getElementById('gr-content'),
      domContentText: document.getElementById('gr-content')?.textContent?.slice(0, 100) || 'none',
      bodyText: document.body.textContent.slice(0, 200)
    };
  });
  console.log('State:', state);

  // Detailed DOM inspection
  const domDetails = await page.evaluate(() => {
    const game = window.app.game;
    const card = document.getElementById('gr-card');
    const word = document.getElementById('gr-word');
    const sentence = document.getElementById('gr-sentence');
    const content = document.getElementById('gr-content');
    const audio = document.getElementById('gr-audio');
    const nav = document.getElementById('gr-nav');
    const header = document.getElementById('gr-header');
    return {
      cardVisible: card ? getComputedStyle(card).display : 'no card',
      cardChildren: card?.children?.length || 0,
      wordExists: !!word,
      wordText: word?.textContent || 'none',
      sentenceExists: !!sentence,
      sentenceText: sentence?.textContent || 'none',
      contentExists: !!content,
      contentHTML: content?.innerHTML?.slice(0, 200) || 'none',
      audioExists: !!audio,
      audioHTML: audio?.innerHTML?.slice(0, 200) || 'none',
      navExists: !!nav,
      navHTML: nav?.innerHTML?.slice(0, 200) || 'none',
      headerExists: !!header,
      headerHTML: header?.innerHTML?.slice(0, 200) || 'none',
      rootClass: game.root?.className,
      rootVisible: game.root ? getComputedStyle(game.root).opacity : 'no root',
      domKeys: Object.keys(game.dom || {}),
      domWordIsElement: game.dom.word instanceof Element,
      domContentIsElement: game.dom.content instanceof Element
    };
  });
  console.log('DOM details:', JSON.stringify(domDetails, null, 2));

  // Check for errors
  console.log('Errors during test:', errors);
  // Filter out network errors and favicon errors
  const realErrors = errors.filter(e =>
    !e.includes('Failed to load resource') &&
    !e.includes('favicon') &&
    !e.includes('fcmtoken') &&
    !e.includes('fonts.googleapis.com')
  );
  expect(realErrors.length).toBe(0);
});
