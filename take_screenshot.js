import { _android as android } from 'playwright';
import fs from 'fs';

(async () => {
  console.log('Connecting to device...');
  const [device] = await android.devices();
  console.log(`Connected to: ${device.model()} (${device.serial()})`);

  console.log('Force stopping and starting app...');
  await device.shell('am force-stop com.vocabmaster.app');
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  
  // Wait for Capacitor to initialize
  await new Promise(r => setTimeout(r, 6000));

  console.log('Attaching to WebView...');
  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  // Dismiss welcome modal
  try {
    await page.evaluate(() => {
      const aiWelcome = document.getElementById('ai-welcome');
      if (aiWelcome) aiWelcome.remove();
    });
  } catch(e) {}

  console.log('Clicking start...');
  await page.waitForSelector('#btn-init', { timeout: 10000 });
  await page.click('#btn-init');

  // Wait for collection picker to render
  await page.waitForSelector('#collection-picker', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking Story Mode...');
  // It's a button containing 'Story Mode' text
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const storyBtn = buttons.find(b => b.textContent.includes('Story Mode'));
    if (storyBtn) storyBtn.click();
  });

  // Wait for story mode to load and possibly generate
  console.log('Waiting for Story Mode to initialize...');
  await new Promise(r => setTimeout(r, 8000));

  console.log('Taking screenshot...');
  await page.screenshot({ path: 'C:\\Users\\kevin\\.gemini\\antigravity\\brain\\df96fef0-6d29-49df-b8b0-bbf3c04c5c61\\artifacts\\story_mode.png' });
  
  await device.close();
  console.log('Done!');
})();
