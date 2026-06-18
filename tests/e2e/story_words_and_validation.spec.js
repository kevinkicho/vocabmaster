// tests-e2e/story_words_and_validation.spec.js
// Verifies:
//  1) _pickWords produces DIFFERENT words across multiple calls (variety)
//  2) Story validation is more lenient for CJK (allows exact substring)
//  3) Story validation is lenient (allows 2 missing for 3+ sentence stories)

const { test, expect } = require('@playwright/test');

const HOST = 'http://127.0.0.1:8085';

test('Story: word picker produces variety + validation is lenient', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app && window.app.data && window.app.data.list && window.app.data.list.length > 0, { timeout: 15000 });

  // === Check #1: _pickWords variety ===
  const wordFingerprints = await page.evaluate(async () => {
    const game = new Story('story');
    game._wordPickSalt = 0; // reset salt
    const results = [];
    for (let i = 0; i < 8; i++) {
      const words = await game._pickWords(4);
      // Use word IDs to fingerprint
      results.push(words.map(w => w.id).sort().join(','));
    }
    return results;
  });
  console.log('Word ID fingerprints (8 runs):', wordFingerprints);
  const distinctFingerprints = new Set(wordFingerprints);
  console.log('Distinct word selections:', distinctFingerprints.size, '/ 8');
  // Expect at least 4 distinct word sets out of 8 runs (was 1-2 with the old biased picker)
  expect(distinctFingerprints.size).toBeGreaterThanOrEqual(4);

  // === Check #2: CJK validation works on a valid story ===
  const jaValid = await page.evaluate(() => {
    // Construct a Story instance just to use the validation method
    const game = { _validateStoryOnly: Story.prototype._validateStoryOnly };
    return game._validateStoryOnly(
      '学生が学校に行きました。そこで先生に会いました。みんなで楽しく勉強しました。',
      [
        { ja: '学校' },
        { ja: '学生' },
        { ja: '先生' }
      ],
      'ja'
    );
  });
  console.log('CJK valid story:', jaValid);
  expect(jaValid.valid).toBe(true);

  // === Check #3: CJK validation accepts missing-1 (lenient) ===
  const jaLenient = await page.evaluate(() => {
    const game = { _validateStoryOnly: Story.prototype._validateStoryOnly };
    return game._validateStoryOnly(
      '学校に誰かが行きました。',
      [
        { ja: '学校' },
        { ja: '学生' },
        { ja: '先生' }
      ],
      'ja'
    );
  });
  console.log('CJK missing-2 (1 sentence) — should still be too short:', jaLenient);
  expect(jaLenient.valid).toBe(false); // Too short (1 sentence)

  // === Check #4: CJK validation allows 1 missing for 3+ sentence story ===
  const jaAlmostValid = await page.evaluate(() => {
    const game = { _validateStoryOnly: Story.prototype._validateStoryOnly };
    return game._validateStoryOnly(
      '学校に誰かが行きました。新しい友達もできました。また明日も行きたいです。',
      [
        { ja: '学校' },
        { ja: '学生' },
        { ja: '先生' }
      ],
      'ja'
    );
  });
  console.log('CJK missing-2 with 3 sentences (lenient — should pass):', jaAlmostValid);
  expect(jaAlmostValid.valid).toBe(true);

  // === Check #5: Latin validation still requires words ===
  const enValid = await page.evaluate(() => {
    const game = { _validateStoryOnly: Story.prototype._validateStoryOnly };
    return game._validateStoryOnly(
      'The school was busy. Students arrived. The teacher greeted them.',
      [
        { en: 'school' },
        { en: 'student' },
        { en: 'teacher' }
      ],
      'en'
    );
  });
  console.log('EN valid story:', enValid);
  expect(enValid.valid).toBe(true);

  // === Check #6: Latin validation rejects when all words missing ===
  const enInvalid = await page.evaluate(() => {
    const game = { _validateStoryOnly: Story.prototype._validateStoryOnly };
    return game._validateStoryOnly(
      'The cat sat on the mat. The dog ran fast. Birds flew high.',
      [
        { en: 'school' },
        { en: 'student' },
        { en: 'teacher' }
      ],
      'en'
    );
  });
  console.log('EN all-missing (should fail):', enInvalid);
  expect(enInvalid.valid).toBe(false);

  if (errors.length > 0) {
    console.log('JS errors:', errors);
  }
  expect(errors.filter(e => !e.includes('Failed to load resource') && !e.includes('favicon')).length).toBe(0);
});
