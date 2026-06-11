const { chromium } = require('playwright');
const http = require('http');

async function runClozeSuite() {
  console.log('Starting HTTP Proxy for Ollama...');
  
  // Proxy to forward requests to local Ollama and inject CORS headers
  const proxy = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      res.end();
      return;
    }

    let bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
      let body = Buffer.concat(bodyChunks).toString();
      if (req.method === 'POST') {
          try {
            let json = JSON.parse(body);
            // DO NOT override model; use whatever the app requested (gemma)
            body = JSON.stringify(json);
          } catch(e) {}
      }
      
      const newHeaders = { ...req.headers };
      if (req.method === 'POST') {
          newHeaders['content-length'] = Buffer.byteLength(body);
      }

      const options = {
        hostname: '127.0.0.1',
        port: 11434,
        path: req.url,
        method: req.method,
        headers: newHeaders
      };

      const proxyReq = http.request(options, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        delete headers['access-control-allow-origin'];
        delete headers['access-control-allow-methods'];
        delete headers['access-control-allow-headers'];

        res.writeHead(proxyRes.statusCode, {
          ...headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        proxyRes.pipe(res, { end: true });
      });

      if (req.method === 'POST' || req.method === 'PUT') {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  });

  proxy.listen(0);
  
  await new Promise(resolve => proxy.once('listening', resolve));
  const proxyPort = proxy.address().port;
  console.log(`Proxy listening on ${proxyPort}`);

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  const langs = ['es', 'ja', 'zh'];
  
  for (const lang of langs) {
    console.log(`\n============================`);
    console.log(`Testing Cloze Language: ${lang.toUpperCase()}`);
    console.log(`============================`);
    
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => {
      console.log(`[${lang}] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    let coll = 'all';
    if (lang === 'es') coll = 'spanishA1';
    if (lang === 'zh') coll = 'chineseHSK1';

    const url = `http://127.0.0.1:8081?disable_cache=1&lang=${lang}&coll=${coll}`;
    console.log(`[${lang}] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });

    await page.evaluate(({port}) => {
      window.OLLAMA_ENDPOINT = 'http://127.0.0.1:' + port;
      window.OLLAMA_USE_CLOUD = false;
      if (window.app && window.app.llm) {
          window.app.llm.endpoint = window.OLLAMA_ENDPOINT;
          window.AI_MOCK = false;
          window.app.store.prefs.llmProvider = 'local';
          window.app.store.prefs.llmModel = 'gemma4:31b-cloud';
          window.app.llm._getSafeLocalModel = () => 'gemma4:31b-cloud';
      }
      localStorage.setItem('vm_ai_welcomed', '1');
    }, {port: proxyPort});

    console.log(`[${lang}] Waiting for app to load...`);
    await page.waitForSelector('#btn-init', { state: 'visible', timeout: 10000 });
    await page.click('#btn-init');

    // Dismiss modals
    try {
      await page.waitForSelector('#ai-welcome', { state: 'visible', timeout: 1000 });
      await page.evaluate(() => {
        const welcome = document.getElementById('ai-welcome');
        if (welcome) welcome.remove();
      });
    } catch (e) {}
    await page.evaluate(() => {
      const settings = document.getElementById('modal-settings');
      if (settings && !settings.classList.contains('hidden')) {
          settings.classList.add('hidden');
      }
    });

    console.log(`[${lang}] Clicking AI Cloze Mode...`);
    await page.waitForSelector('button:has-text("AI Cloze")', { state: 'visible', timeout: 5000 });
    await page.click('button:has-text("AI Cloze")', { force: true });

    console.log(`[${lang}] Waiting for AI Cloze to render (checking for '.main-blank')...`);
    // AI Cloze mode renders a '.main-blank' span when LLM returns match
    try {
      await page.waitForSelector('.main-blank', { timeout: 30000 });
      console.log(`[${lang}] Cloze rendered!`);
    } catch (e) {
      console.log(`[${lang}] Timeout waiting for Cloze generation. Might have failed.`);
    }

    const qNow = new Date();
    const qTimestamp = qNow.getFullYear() + '-' + 
      String(qNow.getMonth() + 1).padStart(2, '0') + '-' + 
      String(qNow.getDate()).padStart(2, '0') + '_' + 
      String(qNow.getHours()).padStart(2, '0') + '-' + 
      String(qNow.getMinutes()).padStart(2, '0') + '-' + 
      String(qNow.getSeconds()).padStart(2, '0');
    
    // Take screenshot
    await page.waitForTimeout(2000); 
    const qShotPath = `screenshots/cloze_suite_${lang}_${qTimestamp}.png`;
    await page.screenshot({ path: qShotPath });
    console.log(`[${lang}] Cloze screenshot saved to: ${qShotPath}`);

    // Click an answer button
    console.log(`[${lang}] Answering cloze...`);
    const choices = await page.$$('.fit-target');
    if (choices.length > 0) {
        // Find one inside the grid, there are 4 buttons, just click the first one
        await page.evaluate(() => {
            document.querySelector('#sn-btn-0').click();
        });
    }

    // Wait and take another screenshot to show feedback
    await page.waitForTimeout(2000);
    const aShotPath = `screenshots/cloze_suite_${lang}_answered_${qTimestamp}.png`;
    await page.screenshot({ path: aShotPath });
    console.log(`[${lang}] Cloze answered screenshot saved to: ${aShotPath}`);

    await context.close();
  }
  
  await browser.close();
  console.log('Testing complete.');
  process.exit(0);
}

runClozeSuite().catch(console.error);
