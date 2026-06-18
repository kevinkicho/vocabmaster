import { test, _android as android } from '@playwright/test';

test('Auth button navigates to web version', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.vocabmaster.app');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 12000));

  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) btn.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  // Check login button state
  const before = await page.evaluate(() => ({
    onclickType: typeof document.getElementById('btn-login')?.onclick,
    currentUrl: window.location.href,
  }));
  console.log('Before:', JSON.stringify(before));

  // Click the auth button
  await page.evaluate(() => {
    const btn = document.getElementById('btn-login');
    if (btn) btn.click();
  });

  // Wait for navigation
  await new Promise(r => setTimeout(r, 5000));

  const after = await page.evaluate(() => ({
    currentUrl: window.location.href,
  }));
  console.log('After:', JSON.stringify(after));

  if (after.currentUrl.includes('vocabmaster112225.web.app')) {
    console.log('✅ Navigated to Firebase Hosting for Google sign-in');
  } else if (after.currentUrl === before.currentUrl) {
    console.log('⚠️ URL unchanged — navigation may have been blocked');
  } else {
    console.log(`⚠️ Navigated to: ${after.currentUrl}`);
  }

  await device.close();
});
