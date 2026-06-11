import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    args: ['--disable-web-security']
  });
  const page = await browser.newPage();
  
  // Listen to console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Bypass CORS by proxying all Ollama requests through Node.js natively
  await page.route('http://127.0.0.1:11434/**', async route => {
    try {
      const req = route.request();
      const method = req.method();
      const headers = req.headers();
      const postData = req.postData();
      
      const response = await fetch(req.url(), {
        method,
        headers: { 'Content-Type': headers['content-type'] || 'application/json' },
        body: postData
      });
      
      const buffer = await response.arrayBuffer();
      
      await route.fulfill({
        status: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': response.headers.get('content-type') || 'application/json'
        },
        body: Buffer.from(buffer)
      });
    } catch (e) {
      console.log('Proxy Error:', e.message);
      await route.continue();
    }
  });

  await page.goto('http://127.0.0.1:8081');

  // Inject fake local storage to bypass first-time settings modal
  await page.evaluate(() => {
    localStorage.setItem('vm_first_run_done', '1');
    localStorage.setItem('app_prefs', JSON.stringify({ 
      sourceLang: 'en', 
      targetLang: 'ja',
      levelFilter: 'all'
    }));
  });

  // Reload to apply prefs
  await page.reload();

  console.log('App loaded. Clicking Start...');
  await page.waitForSelector('#btn-init', { state: 'visible', timeout: 5000 });
  await page.click('#btn-init');

  // Dismiss AI Welcome overlay if it exists
  console.log('Dismissing AI welcome modal if present...');
  try {
    await page.waitForSelector('#ai-welcome', { state: 'visible', timeout: 3000 });
    await page.evaluate(() => {
      const welcome = document.getElementById('ai-welcome');
      if (welcome) welcome.remove();
    });
    console.log('Dismissed AI welcome modal.');
  } catch (e) {
    console.log('No AI welcome modal found.');
  }

  console.log('Clicking Story Mode...');
  await page.waitForSelector('button:has-text("Story Mode")', { state: 'visible', timeout: 5000 });
  await page.click('button:has-text("Story Mode")');

  console.log('Waiting for Story Mode to load and generate...');
  
  console.log('Waiting for Story Mode to load, generate, and save to RTDB...');
  
  await new Promise(resolve => {
    let saved = false;
    page.on('console', msg => {
      if (msg.text().includes('Saved story to RTDB')) {
        console.log('Detected successful RTDB save!');
        saved = true;
        resolve();
      }
    });
    // Fallback timeout
    setTimeout(() => {
      if (!saved) {
        console.log('Timeout reached without RTDB save log.');
        resolve();
      }
    }, 30000);
  });
  
  console.log('Taking screenshot...');
  const dir = 'C:/Users/kevin/Desktop/vocabmaster-master/screenshots';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  
  const now = new Date();
  const timestamp = now.getFullYear() + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
    String(now.getDate()).padStart(2, '0') + '_' + 
    String(now.getHours()).padStart(2, '0') + '-' + 
    String(now.getMinutes()).padStart(2, '0') + '-' + 
    String(now.getSeconds()).padStart(2, '0');
    
  const screenshotPath = `${dir}/story_mode_${timestamp}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
  console.log('Done!');
})();
