import { test, expect } from '@playwright/test';

const MOCK_TAGS = ['N5', 'N4', 'N3', 'N2', 'N1', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'A1', 'A2', 'B1', 'B2', 'C1', 'TOPIK1', 'TOPIK2', 'TOPIK3', 'TOPIK4', 'TOPIK5', 'common', 'uncommon', 'rare'];

function makeMockVocab(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const tagCount = 1 + (i % 4);
    const tags = [];
    for (let j = 0; j < tagCount; j++) {
      tags.push(MOCK_TAGS[(i + j * 7) % MOCK_TAGS.length]);
    }
    items.push({
      id: i,
      en: `word_${i}`,
      ja: `単語_${i}`,
      tags: tags,
    });
  }
  return items;
}

test.describe('Tag Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app shell to be ready
    await page.waitForFunction(() => {
      return typeof app !== 'undefined' && app.data && app.ui && typeof app.goHome === 'function';
    }, { timeout: 10000 });

    // Hide the overlay-init so clicks pass through
    await page.evaluate(() => {
      const overlay = document.getElementById('overlay-init');
      if (overlay) overlay.style.display = 'none';
    });

    // Inject mock vocab data
    await page.evaluate((mockVocab) => {
      app.data.list = mockVocab;
      app.data._reviewList = null;
    }, makeMockVocab(200));

    // Navigate home and render tag filter
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (app.ui) app.ui.renderTagFilter(); });
    await page.waitForSelector('#tag-filter-section', { timeout: 5000 });
  });

  test('tag filter section appears on home screen', async ({ page }) => {
    const section = page.locator('#tag-filter-section');
    await expect(section).toBeVisible();
    const text = await section.innerText();
    expect(text).toContain('words selected');
    // CSS text-transform uppercase makes "Tag Filter" appear as "TAG FILTER"
    expect(text.toUpperCase()).toContain('EXAM LEVEL');
  });

  test('clicking a tag filter button updates word count', async ({ page }) => {
    const initialText = await page.locator('#tag-filter-section').innerText();
    const initialMatch = initialText.match(/(\d+) of (\d+) words selected/);
    expect(initialMatch).not.toBeNull();
    const initialCount = parseInt(initialMatch[1]);

    const tagButtons = page.locator('#tag-filter-section .tag-filter-btn');
    const count = await tagButtons.count();
    expect(count).toBeGreaterThan(1);

    for (let i = 0; i < count; i++) {
      const text = await tagButtons.nth(i).innerText();
      if (text !== 'All') {
        await tagButtons.nth(i).click({ force: true });
        break;
      }
    }

    await page.waitForTimeout(300);

    const updatedText = await page.locator('#tag-filter-section').innerText();
    const updatedMatch = updatedText.match(/(\d+) of (\d+) words selected/);
    expect(updatedMatch).not.toBeNull();
    const updatedCount = parseInt(updatedMatch[1]);

    expect(updatedCount).not.toBe(initialCount);
  });

  test('tag filter persists in localStorage', async ({ page }) => {
    const tagButtons = page.locator('#tag-filter-section .tag-filter-btn');
    const count = await tagButtons.count();
    let clickedTag = '';
    for (let i = 0; i < count; i++) {
      const text = await tagButtons.nth(i).innerText();
      if (text !== 'All') {
        clickedTag = text;
        await tagButtons.nth(i).click({ force: true });
        break;
      }
    }
    expect(clickedTag).not.toBe('');

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('vm_prefs_v1195_STABLE');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored).not.toBeNull();
    expect(stored.tagFilter).toBeDefined();
    expect(stored.tagFilter).toContain(clickedTag);
  });

  test('"All" button resets tag filter', async ({ page }) => {
    const tagButtons = page.locator('#tag-filter-section .tag-filter-btn');
    const btnCount = await tagButtons.count();
    for (let i = 0; i < btnCount; i++) {
      const text = await tagButtons.nth(i).innerText();
      if (text !== 'All') {
        await tagButtons.nth(i).click({ force: true });
        break;
      }
    }
    await page.waitForTimeout(200);

    await page.locator('#tag-filter-section button[data-tag="all"]').click({ force: true });
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('vm_prefs_v1195_STABLE');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored.tagFilter).toEqual(['all']);
  });

  test('tag filter works with level filter together', async ({ page }) => {
    // Set level filter before navigating
    await page.evaluate(() => {
      const raw = localStorage.getItem('vm_prefs_v1195_STABLE');
      if (raw) {
        const p = JSON.parse(raw);
        p.levelFilter = ['N5'];
        localStorage.setItem('vm_prefs_v1195_STABLE', JSON.stringify(p));
      }
    });

    await page.reload();
    await page.waitForFunction(() => {
      return typeof app !== 'undefined' && app.data && app.ui && typeof app.goHome === 'function';
    }, { timeout: 10000 });
    await page.evaluate(() => {
      const overlay = document.getElementById('overlay-init');
      if (overlay) overlay.style.display = 'none';
    });
    await page.evaluate((mockVocab) => {
      app.data.list = mockVocab;
      app.data._reviewList = null;
    }, makeMockVocab(200));
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (app.ui) app.ui.renderTagFilter(); });
    await page.waitForSelector('#tag-filter-section', { timeout: 5000 });

    const tagButtons = page.locator('#tag-filter-section .tag-filter-btn');
    const count = await tagButtons.count();
    for (let i = 0; i < count; i++) {
      const text = await tagButtons.nth(i).innerText();
      if (text !== 'All') {
        await tagButtons.nth(i).click({ force: true });
        break;
      }
    }
    await page.waitForTimeout(300);

    const text = await page.locator('#tag-filter-section').innerText();
    const match = text.match(/(\d+) of (\d+) words selected/);
    expect(match).not.toBeNull();
    const filteredCount = parseInt(match[1]);
    expect(filteredCount).toBeLessThan(200);
  });
});
