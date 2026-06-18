import { test, expect } from '@playwright/test';

test.describe('Chat Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof app !== 'undefined' && app.data && app.ui && typeof app.goHome === 'function', { timeout: 10000 });
    // Hide overlay
    await page.evaluate(() => {
      const overlay = document.getElementById('overlay-init');
      if (overlay) overlay.style.display = 'none';
    });
    // Inject mock vocab
    await page.evaluate(() => {
      const items = [];
      for (let i = 0; i < 50; i++) {
        items.push({ id: i, en: `word_${i}`, ja: `単語_${i}`, tags: ['N5'] });
      }
      app.data.list = items;
      app.data._reviewList = null;
    });
    // Mock LLM to be available
    await page.evaluate(() => {
      if (app.llm) {
        app.llm.available = true;
        app.llm.hasModel = true;
        // Mock streamGenerate to return a greeting
        app.llm.streamGenerate = async function(opts, onToken) {
          const text = 'こんにちは！今日は何を勉強したいですか？';
          if (onToken) onToken(text);
          return text;
        };
        app.llm.generate = async function() { return 'こんにちは！今日は何を勉強したいですか？'; };
      }
    });
  });

  test('chat button appears on home screen', async ({ page }) => {
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    const chatBtn = page.locator('button:has-text("Chat Practice")');
    await expect(chatBtn).toBeVisible();
  });

  test('chat mode renders with scenario card and input', async ({ page }) => {
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    // Click Chat Practice button
    await page.locator('button:has-text("Chat Practice")').click({ force: true });
    await page.waitForTimeout(1000);

    // Check scenario card
    await expect(page.locator('#chat-header')).toBeVisible();
    // Check messages area
    await expect(page.locator('#chat-messages')).toBeVisible();
    // Check input
    await expect(page.locator('#chat-input')).toBeVisible();
    // Check send button
    await expect(page.locator('#chat-send')).toBeVisible();
  });

  test('AI generates opening message', async ({ page }) => {
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Chat Practice")').click({ force: true });
    await page.waitForTimeout(2000);

    // Should have an assistant message
    const messages = page.locator('#chat-messages > div');
    const count = await messages.count();
    expect(count).toBeGreaterThan(0);

    // The message should contain Japanese text from the mock
    const text = await messages.first().innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test('sending a message works', async ({ page }) => {
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Chat Practice")').click({ force: true });
    await page.waitForTimeout(2000);

    // Type a message
    await page.fill('#chat-input', 'テストメッセージ');
    await page.click('#chat-send');
    await page.waitForTimeout(1000);

    // Should have user message visible
    const messages = page.locator('#chat-messages > div');
    const count = await messages.count();
    expect(count).toBeGreaterThan(1);

    // Last user message should contain our text
    const allText = await page.locator('#chat-messages').innerText();
    expect(allText).toContain('テストメッセージ');
  });

  test('info icon tooltip works', async ({ page }) => {
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Chat Practice")').click({ force: true });
    await page.waitForTimeout(1000);

    // Click info icon
    const infoIcon = page.locator('#chat-info-icon');
    await expect(infoIcon).toBeVisible();
    await infoIcon.click({ force: true });
    await page.waitForTimeout(300);

    // Tooltip should be visible
    const tooltip = page.locator('#chat-info-tooltip');
    await expect(tooltip).toBeVisible();
    const tooltipText = await tooltip.innerText();
    expect(tooltipText).toContain('never full transcripts');
  });

  test('scenario and level badge shown', async ({ page }) => {
    await page.evaluate(() => app.goHome());
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Chat Practice")').click({ force: true });
    await page.waitForTimeout(1000);

    // Scenario label
    await expect(page.locator('text=Daily Life')).toBeVisible();
    // Level badge
    await expect(page.locator('#chat-level-badge')).toBeVisible();
    const badgeText = await page.locator('#chat-level-badge').textContent();
    expect(badgeText).toBe('B1');
  });
});
