import { test, expect, _android as android } from '@playwright/test';

// Connect to the local Android emulator over ADB
// We skip the default browser fixtures since we use the raw ADB device.
test('Run E2E on Android Emulator', async () => {
  // 1. Connect to the device. Playwright uses ANDROID_HOME or ADB in PATH.
  const [device] = await android.devices();
  console.log(`Model: ${device.model()}`);
  console.log(`Serial: ${device.serial()}`);

  // 2. Ensure app is clean-started
  await device.shell('am force-stop com.vocabmaster.app');
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  
  // Wait a few seconds for Capacitor to boot the WebView
  await new Promise(r => setTimeout(r, 5000));

  // 3. Connect to the Capacitor WebView inside the app
  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  // Dismiss AI welcome modal if it exists (like in standard E2E test)
  try {
    await page.evaluate(() => {
      const aiWelcome = document.getElementById('ai-welcome');
      if (aiWelcome) aiWelcome.remove();
    });
  } catch(e) {}

  // 4. Perform sanity E2E test interactions
  console.log('Testing interactions...');
  
  // Wait for and click the start button
  await page.waitForSelector('#btn-init', { state: 'visible', timeout: 10000 });
  await page.click('#btn-init');

  // Verify the collection picker renders
  await expect(page.locator('#collection-picker')).toBeVisible({ timeout: 10000 });

  // Open the settings modal
  await page.click("button[onclick=\"app.modal(true)\"]");
  await expect(page.locator('#modal-settings')).toBeVisible({ timeout: 5000 });

  // Close the settings modal
  await page.click("button[onclick=\"app.modal(false)\"]");
  await expect(page.locator('#modal-settings')).toBeHidden({ timeout: 5000 });

  // 5. Cleanup
  await device.close();
  console.log('Android Emulator E2E passed!');
});
