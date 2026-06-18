import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';

const configContent = readFileSync('public/js/ollama_config.js', 'utf-8');
const apiKeyMatch = configContent.match(/OLLAMA_API_KEY\s*=\s*"([^"]+)"/);
const OLLAMA_API_KEY = apiKeyMatch ? apiKeyMatch[1] : '';
const OLLAMA_CLOUD = 'https://api.ollama.com';

const LANGUAGES = [
  { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' }, { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' }, { code: 'ko', name: 'Korean' },
  { code: 'ru', name: 'Russian' },
];

test.describe('Grammar Gym Comprehensive', () => {
  let capturedPrompts = [];
  let capturedResponses = [];
  let lang;

  test.beforeEach(async ({ page }) => {
    capturedPrompts = [];
    capturedResponses = [];
    lang = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];

    await page.route('**/127.0.0.1:11434/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      const postData = route.request().postData();

      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
        return;
      }
      if (url.includes('/api/tags')) {
        await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ models: [{ name: 'gemma4:31b-cloud' }] }) });
        return;
      }
      if (url.includes('/api/generate')) {
        const body = JSON.parse(postData || '{}');
        capturedPrompts.push(body.prompt || '');
        const resp = await fetch(`${OLLAMA_CLOUD}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OLLAMA_API_KEY}` },
          body: JSON.stringify({ ...body, model: 'gemma4:31b-cloud' }),
        });
        const respBody = await resp.text();
        capturedResponses.push(respBody);
        await route.fulfill({ status: resp.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: respBody });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
  });

  test('generates Grammar Gym with random language/word, screenshots all 12 exercises', async ({ page }) => {
    console.log(`\n=== Language: ${lang.name} (${lang.code}) ===`);

    await page.waitForSelector('#btn-init', { state: 'visible', timeout: 15000 });
    await page.click('#btn-init');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const w = document.getElementById('ai-welcome'); if (w) w.remove();
      const m = document.getElementById('modal-settings'); if (m) m.classList.add('hidden');
      const o = document.getElementById('overlay-init'); if (o) o.remove();
    }).catch(() => {});
    await page.waitForTimeout(500);

    const selection = await page.evaluate((langCode) => {
      const prefs = app.store ? app.store.prefs : null;
      if (prefs) { prefs.grammarQ = langCode; prefs.grammarA = 'en'; prefs.currentCollection = 'all'; prefs.levelFilter = 'all'; }
      const list = app.data ? app.data.list : [];
      const valid = list.filter(w => w && w[langCode] && w[langCode + '_ex']);
      if (valid.length === 0) return { error: 'No valid words', count: list.length };
      const idx = Math.floor(Math.random() * valid.length);
      const chosen = valid[idx];
      const fullIdx = list.indexOf(chosen);
      if (app.store && typeof app.store.setLoc === 'function') app.store.setLoc('grammar', fullIdx);
      return { word: (chosen[langCode] || '').slice(0, 60), sentence: (chosen[langCode + '_ex'] || '').slice(0, 80), id: chosen.id, fullIdx, validCount: valid.length };
    }, lang.code);

    console.log(`Word: "${selection.word}" | Sentence: "${selection.sentence}"`);
    if (selection.error) { console.log(`SKIP: ${selection.error}`); test.skip(); return; }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('button', { hasText: 'Grammar Gym' }).click();
    await page.waitForSelector('#gr-content', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('#gr-start-btn', { state: 'visible', timeout: 120000 });

    await page.screenshot({ path: `screenshots/${lang.code}_00_explanation.png`, fullPage: true });
    await page.click('#gr-start-btn');
    await page.waitForTimeout(500);

    for (let i = 0; i < 12; i++) {
      await page.waitForSelector('.gr-choice', { state: 'visible', timeout: 10000 });
      await page.screenshot({ path: `screenshots/${lang.code}_${String(i+1).padStart(2,'0')}_q.png`, fullPage: true });
      await page.locator('.gr-choice').first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/${lang.code}_${String(i+1).padStart(2,'0')}_a.png`, fullPage: true });
      try { await page.click('#gr-next-btn'); await page.waitForTimeout(300); } catch(e) {}
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/${lang.code}_13_summary.png`, fullPage: true });

    // Save prompts and responses to files
    for (let i = 0; i < capturedPrompts.length; i++) {
      const isCritic = capturedPrompts[i].includes('content critic');
      const role = isCritic ? 'critique' : 'generate';
      let respContent = '';
      try { const p = JSON.parse(capturedResponses[i]); respContent = p.response || capturedResponses[i]; } catch(e) { respContent = capturedResponses[i]; }
      writeFileSync(`screenshots/${lang.code}_ai_${role}_${i+1}_prompt.txt`, capturedPrompts[i]);
      writeFileSync(`screenshots/${lang.code}_ai_${role}_${i+1}_response.txt`, respContent);
    }

    // Print AI accountability table
    console.log('\n\n========================================');
    console.log('AI ACCOUNTABILITY REPORT');
    console.log('========================================\n');
    console.log(`Language: ${lang.name} (${lang.code})`);
    console.log(`Word: "${selection.word}"`);
    console.log(`Sentence: "${selection.sentence}"`);
    console.log(`Word ID: ${selection.id}, Index: ${selection.fullIdx}`);
    console.log(`AI calls: ${capturedPrompts.length}\n`);

    for (let i = 0; i < capturedPrompts.length; i++) {
      const isCritic = capturedPrompts[i].includes('content critic');
      const role = isCritic ? 'critique' : 'generate';
      let respContent = '';
      try { const p = JSON.parse(capturedResponses[i]); respContent = p.response || capturedResponses[i]; } catch(e) { respContent = capturedResponses[i]; }

      const promptFile = `screenshots/${lang.code}_ai_${role}_${i+1}_prompt.txt`;
      const respFile = `screenshots/${lang.code}_ai_${role}_${i+1}_response.txt`;
      console.log(`| ${i+1} | ${role} | ${promptFile} | ${respFile} |`);
      console.log(`Prompt preview: ${capturedPrompts[i].slice(0, 300)}...`);
      console.log(`Response preview: ${respContent.slice(0, 300)}...\n`);
    }

    console.log(`Screenshots: 25 PNG files in screenshots/${lang.code}_*.png`);
    console.log(`AI transcripts: ${capturedPrompts.length * 2} TXT files in screenshots/`);

    expect(capturedPrompts.length).toBeGreaterThanOrEqual(1);
  });
});
