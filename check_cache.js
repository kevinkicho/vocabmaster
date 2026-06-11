const { chromium } = require('playwright');
const http = require('http');

async function checkCache() {
  console.log('Starting proxy...');
  const proxy = http.createServer((req, res) => {
    const options = { hostname: '127.0.0.1', port: 11434, path: req.url, method: req.method, headers: req.headers };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, 'Access-Control-Allow-Origin': '*' });
      proxyRes.pipe(res, { end: true });
    });
    req.pipe(proxyReq, { end: true });
  });
  proxy.listen(0);
  await new Promise(resolve => proxy.once('listening', resolve));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://127.0.0.1:8081', { waitUntil: 'networkidle' });
  
  // Set prefs and click init
  await page.evaluate(() => {
    localStorage.setItem('vm_prefs', JSON.stringify({ vocabLang: 'es', llmModel: 'gemma3:1b' }));
    localStorage.setItem('vm_ai_welcomed', '1');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#btn-init');
  await page.click('#btn-init');
  
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Story Mode")', { force: true });
  
  await page.waitForTimeout(2000);
  const cached = await page.evaluate(() => {
      return app.game._cachedStories || [];
  });
  
  console.log('--- CACHED STORIES ---');
  console.log(JSON.stringify(cached, null, 2));

  await browser.close();
  proxy.close();
  process.exit(0);
}

checkCache().catch(console.error);
