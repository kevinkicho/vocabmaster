import { test } from '@playwright/test';
test('check dictation vocab data', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof app !== 'undefined' && app.data && app.data.list && app.data.list.length > 0, { timeout: 15000 });
  const item = await page.evaluate(() => {
    const list = app.data.list;
    for (const item of list) {
      if (item.ja === '発生') {
        return { id: item.id, ja: item.ja, en: item.en, keys: Object.keys(item) };
      }
    }
    const first = list[0];
    return { id: first.id, ja: first.ja, en: first.en, keys: Object.keys(first) };
  });
  console.log('Item:', JSON.stringify(item, null, 2));
  const prefs = await page.evaluate(() => ({
    sentencesA: app.store.prefs.sentencesA,
    presetSource: app.store.prefs.presetSource,
    sentencesQ: app.store.prefs.sentencesQ,
    presetTarget: app.store.prefs.presetTarget,
  }));
  console.log('Prefs:', JSON.stringify(prefs, null, 2));
});
