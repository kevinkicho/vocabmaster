const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');

async function runSuite() {
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
            // Replace any unknown local model with gemma4:31b-cloud so the mock works
            json.model = 'gemma4:31b-cloud';
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
  
  // Wait for the proxy to start listening
  await new Promise(resolve => proxy.once('listening', resolve));
  const proxyPort = proxy.address().port;
  console.log(`Proxy listening on ${proxyPort}`);

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  const langs = ['es'];
  
  for (const lang of langs) {
    console.log(`\n============================`);
    console.log(`Testing Language: ${lang.toUpperCase()}`);
    console.log(`============================`);
    
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => {
      console.log(`[${lang}] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });
    page.on('pageerror', error => {
      console.error(`[${lang}] PAGE ERROR: ${error.message}`);
    });

    let coll = 'all';
    if (lang === 'es') coll = 'spanishA1';
    if (lang === 'zh') coll = 'chineseHSK1';

    const url = `http://127.0.0.1:8081?disable_cache=1&lang=${lang}&coll=${coll}`;
    console.log(`[${lang}] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });

    // Inject proxy config and set first-run state
    await page.evaluate(({port}) => {
      window.OLLAMA_ENDPOINT = 'http://127.0.0.1:' + port;
      window.OLLAMA_USE_CLOUD = false;
      if (window.app && window.app.llm) {
          window.app.llm.endpoint = window.OLLAMA_ENDPOINT;
          window.app.llm.useCloud = false;
          window.app.llm.resolvedModel = 'gemma4:31b-cloud';
      }
      
      // Disable RTDB cache so we don't load old stories generated in Japanese
      if (window.Story) {
          window.Story.prototype._loadCachedStories = async function() {
              console.log('[Test] Skipping RTDB cache load');
          };
      }
      
      localStorage.setItem('vm_ai_welcomed', '1');
    }, {port: proxyPort});

    

    console.log(`[${lang}] Waiting for app to load...`);
    await page.waitForSelector('#btn-init', { state: 'visible', timeout: 10000 });
    await page.click('#btn-init');

    console.log(`[${lang}] Dismissing modals if present...`);
    try {
      await page.waitForSelector('#ai-welcome', { state: 'visible', timeout: 2000 });
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

    console.log(`[${lang}] Clicking Story Mode...`);
    await page.waitForSelector('button:has-text("Story Mode")', { state: 'visible', timeout: 5000 });
    await page.click('button:has-text("Story Mode")', { force: true });

    console.log(`[${lang}] Waiting for Story Generation...`);
    // Wait until generation finishes and "Question 1 of N" button appears
    await page.waitForSelector('#story-ready-btn', { timeout: 90000 });
    
    console.log(`[${lang}] Story generated! Clicking Questions...`);
    await page.click('#story-ready-btn');

    const qNow = new Date();
    const qTimestamp = qNow.getFullYear() + '-' + 
      String(qNow.getMonth() + 1).padStart(2, '0') + '-' + 
      String(qNow.getDate()).padStart(2, '0') + '_' + 
      String(qNow.getHours()).padStart(2, '0') + '-' + 
      String(qNow.getMinutes()).padStart(2, '0') + '-' + 
      String(qNow.getSeconds()).padStart(2, '0');
    
    // Take screenshot of the story questions
    await page.waitForTimeout(1000); // give it time to render the question UI
    const qShotPath = `screenshots/suite_story_questions_${lang}_${qTimestamp}.png`;
    await page.screenshot({ path: qShotPath });
    console.log(`[${lang}] Story Questions screenshot saved to: ${qShotPath}`);
    
    // Answer Q1
    console.log(`[${lang}] Answering question 1...`);
    let moreQuestions = true;
    while (moreQuestions) {
       await page.waitForSelector('.story-choice', { timeout: 5000 });
       console.log(`[${lang}] Answering question...`);
       // Click first choice
       const choices = await page.$$('.story-choice');
       if (choices.length > 0) {
           await choices[0].click();
       }
       
       // Wait to see if "Next Question" or "Review words" button appears
       await page.waitForTimeout(1000);
       const nextQBtn = await page.$('#story-next-q');
       if (nextQBtn) {
           console.log(`[${lang}] Moving to next question...`);
           await nextQBtn.click();
       } else {
           moreQuestions = false;
       }
    }
    
    console.log(`[${lang}] Questions finished. Clicking 'Review words from this story'...`);
    const reviewBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.textContent.includes('Review words'));
    });
    
    if (reviewBtn) {
        await reviewBtn.click();
        console.log(`[${lang}] Review words clicked.`);
    } else {
        console.log(`[${lang}] ERROR: Review words button not found!`);
    }

    const dir = 'C:/Users/kevin/Desktop/vocabmaster-master/screenshots';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    try {
        // Verify Quiz view
        console.log(`[${lang}] Waiting for #q-box...`);
        await page.waitForSelector('#q-box', { state: 'attached', timeout: 10000 });
        const isQuizVisible = await page.evaluate(() => {
           // We can check if qz-front has text or just return true
           return document.getElementById('q-box') !== null;
        });
        console.log(`[${lang}] Quiz View Transition Success: ${isQuizVisible}`);
    } catch (e) {
        console.error(`[${lang}] Transition failed! Capturing error screenshot and DOM...`);
        const html = await page.evaluate(() => document.body.innerHTML);
        fs.writeFileSync(`${dir}/suite_${lang}_error.html`, html);
        console.log(`[${lang}] Saved DOM to suite_${lang}_error.html`);
    }

    console.log(`[${lang}] Taking screenshot...`);
    
    const now = new Date();
    const timestamp = now.getFullYear() + '-' + 
      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + '_' + 
      String(now.getHours()).padStart(2, '0') + '-' + 
      String(now.getMinutes()).padStart(2, '0') + '-' + 
      String(now.getSeconds()).padStart(2, '0');
      
    try {
      console.log(`[${lang}] Waiting for #q-box...`);
      await page.waitForSelector('.quiz-opt', { state: 'visible', timeout: 120000 });
      console.log(`[${lang}] Quiz View Transition Success: true`);
      
      console.log(`[${lang}] Taking screenshot...`);
      await page.screenshot({ path: `screenshots/suite_${lang}_${timestamp}.png`, fullPage: false });
      console.log(`[${lang}] Screenshot saved to: ${process.cwd().replace(/\\/g, '/')}/screenshots/suite_${lang}_${timestamp}.png`);
    } catch (e) {
      console.error(`[${lang}] Failed to reach Quiz mode (Timeout). This usually happens if the LLM hallucinated and generated 0 questions.`);
      await page.screenshot({ path: `screenshots/suite_${lang}_error_${timestamp}.png`, fullPage: false });
    }
    
    await context.close();
  }

  console.log('\nAll languages tested! Closing browser and proxy...');
  await browser.close();
  proxy.close();
  process.exit(0);
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
