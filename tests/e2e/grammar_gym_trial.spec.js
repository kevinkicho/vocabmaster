import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

// Read API key from generated config
const configContent = readFileSync('public/js/ollama_config.js', 'utf-8');
const apiKeyMatch = configContent.match(/OLLAMA_API_KEY\s*=\s*"([^"]+)"/);
const OLLAMA_API_KEY = apiKeyMatch ? apiKeyMatch[1] : '';
const OLLAMA_CLOUD = 'https://api.ollama.com';

// Model name mapping: what the app sends (local-safe name) → what cloud expects
// _getSafeLocalModel() returns 'gemma4:31b-cloud' as local-safe name
// We remap to the same name for cloud and change the endpoint

test.describe('Grammar Gym — Real AI Trial', () => {

  let capturedPrompts = [];
  let capturedResponses = [];

  test.beforeEach(async ({ page }) => {
    capturedPrompts = [];
    capturedResponses = [];

    // Intercept all requests to local Ollama endpoint (the app is configured to use local)
    // and proxy them to the real Ollama Cloud API
    await page.route('**/127.0.0.1:11434/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      const postData = route.request().postData();

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
        return;
      }

      // Handle /api/tags (model listing probe)
      if (url.includes('/api/tags')) {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            models: [
              { name: 'gemma4:31b-cloud', modified_at: '2025-01-01T00:00:00Z', size: 10000000000 }
            ]
          }),
        });
        return;
      }

        // Handle /api/generate (actual generation)
      if (url.includes('/api/generate')) {
        const body = JSON.parse(postData || '{}');
        capturedPrompts.push(body.prompt || '');

        // Forward to real Ollama Cloud API from Node.js (bypasses CORS)
        const resp = await fetch(`${OLLAMA_CLOUD}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OLLAMA_API_KEY}`,
          },
          body: JSON.stringify({
            ...body,
            model: 'gemma4:31b-cloud',
          }),
        });
        const respBody = await resp.text();
        capturedResponses.push(respBody);

        await route.fulfill({
          status: resp.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
          body: respBody,
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/');
  });

  test('generates real Grammar Gym exercises from AI, captures prompt + response', async ({ page }) => {
    // Wait for app to initialize (auth + data loading)
    await page.waitForSelector('#btn-init', { state: 'visible', timeout: 15000 });

    // Click Start to dismiss initial overlay
    await page.click('#btn-init');

    // Wait for home screen to fully render
    await page.waitForTimeout(2000);

    // Remove AI welcome modal and settings modal if present
    await page.evaluate(() => {
      const aiWelcome = document.getElementById('ai-welcome');
      if (aiWelcome) aiWelcome.remove();
      const modal = document.getElementById('modal-settings');
      if (modal) modal.classList.add('hidden');
      const overlay = document.getElementById('overlay-init');
      if (overlay) overlay.remove();
    }).catch(() => {});

    await page.waitForTimeout(500);

    // Scroll down to find Grammar Gym button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Click Grammar Gym button
    const grammarBtn = page.locator('button', { hasText: 'Grammar Gym' });
    await expect(grammarBtn).toBeVisible({ timeout: 5000 });
    await grammarBtn.click();

    // Wait for #gr-content to appear
    await page.waitForSelector('#gr-content', { state: 'attached', timeout: 10000 });

    // Wait for AI generation — the grammar explanation appears with #gr-start-btn
    console.log('Waiting for AI to generate exercises (up to 120s)...');
    await page.waitForSelector('#gr-start-btn', { state: 'visible', timeout: 120000 });

    // Take screenshot showing the AI-generated grammar explanation
    await page.screenshot({ path: 'grammar_gym_ai_output.png', fullPage: true });

    // Log all captured prompts and responses
    console.log('\n=== ALL AI CALLS (' + capturedPrompts.length + ' total) ===');
    for (let i = 0; i < capturedPrompts.length; i++) {
      const isCritic = capturedPrompts[i].includes('content critic');
      console.log(`\n========== Call ${i + 1} (${isCritic ? 'CRITIC' : 'EXERCISE GENERATION'}) ==========`);
      console.log('FULL PROMPT:\n' + capturedPrompts[i]);
      console.log('\n--- END OF PROMPT ---');
      // Parse and pretty-print the response
      try {
        const parsed = JSON.parse(capturedResponses[i]);
        const content = parsed.response || '';
        console.log('\nFULL RESPONSE:\n' + content);
      } catch(e) {
        console.log('\nRAW RESPONSE:\n' + capturedResponses[i]);
      }
      console.log('\n========== END CALL ' + (i + 1) + ' ==========');
    }

    // Read the page content to verify real AI output
    const pageText = await page.textContent('#gr-content');
    console.log('\n=== PAGE CONTENT ===\n' + pageText);

    // Assertions
    expect(capturedPrompts.length).toBeGreaterThanOrEqual(1);
    expect(capturedResponses.length).toBeGreaterThanOrEqual(1);
    expect(pageText).not.toContain('requires a working AI connection');
    expect(pageText).not.toContain('Could not generate');
  });
});
