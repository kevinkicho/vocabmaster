const { chromium } = require('playwright');

async function runTest() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  const url = `http://127.0.0.1:8081?disable_cache=1&lang=es&coll=spanishA1`;
  console.log(`Navigating to: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Stub speechSynthesis.cancel so we can detect it
  await page.evaluate(() => {
    window.AUDIO_CANCELLED = false;
    const origCancel = window.speechSynthesis.cancel;
    window.speechSynthesis.cancel = function() {
      window.AUDIO_CANCELLED = true;
      console.log('--- AUDIO CANCELLED BY APP ---');
      origCancel.call(window.speechSynthesis);
    };
  });

  console.log('Waiting for app to load...');
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

  console.log('Starting Voice Challenge mode to trigger audio...');
  await page.waitForSelector('button:has-text("Voice Challenge")');
  await page.click('button:has-text("Voice Challenge")');
  
  // Wait for it to render
  await page.waitForTimeout(2000);

  console.log('Simulating navigating back home...');
  // Click home button (assuming there's a back/home button)
  await page.evaluate(() => {
    if (window.app && window.app.goHome) {
        window.app.goHome();
    }
  });

  await page.waitForTimeout(1000);

  const wasCancelled = await page.evaluate(() => window.AUDIO_CANCELLED);
  
  // Inject a visual proof into the DOM so we can screenshot it
  await page.evaluate((wasCancelled) => {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '50%';
    div.style.left = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.backgroundColor = wasCancelled ? '#10b981' : '#ef4444'; // Emerald or Rose
    div.style.color = 'white';
    div.style.padding = '2rem 4rem';
    div.style.borderRadius = '1rem';
    div.style.fontSize = '2rem';
    div.style.fontWeight = 'bold';
    div.style.zIndex = '9999';
    div.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    div.innerText = wasCancelled ? '✅ AUDIO SUCCESSFULLY CANCELLED ON EXIT' : '❌ AUDIO GHOSTING BUG PERSISTS';
    document.body.appendChild(div);
  }, wasCancelled);

  await page.waitForTimeout(500);

  const qShotPath = `screenshots/audio_ghosting_fix.png`;
  await page.screenshot({ path: qShotPath });
  console.log(`Screenshot saved to: ${qShotPath}`);

  await browser.close();
  console.log('Testing complete.');
}

runTest().catch(console.error);
