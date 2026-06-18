import { test, _android as android } from '@playwright/test';

test('Direct handleAuthClick on phone', async () => {
  const devices = await android.devices();
  if (devices.length === 0) {
    console.log('No Android devices found - skipping test');
    return;
  }
  const [device] = devices;
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  // Kill and restart
  await device.shell('am force-stop com.vocabmaster.app');
  await new Promise(r => setTimeout(r, 3000));
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 12000));

  // Find webview with longer timeout
  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) btn.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  // Direct call to handleAuthClick
  const result = await page.evaluate(() => {
    const btn = document.getElementById('btn-login');
    const before = {
      btnHTML: btn?.innerHTML?.substring(0, 80),
      btnDisabled: btn?.disabled,
    };
    
    try {
      window.app.handleAuthClick();
    } catch (e) {
      return { before, error: 'SYNC_CRASH: ' + e.message, stack: e.stack?.substring(0, 200) };
    }
    
    return new Promise(resolve => {
      setTimeout(() => {
        const after = {
          btnHTML: document.getElementById('btn-login')?.innerHTML?.substring(0, 80),
          btnDisabled: document.getElementById('btn-login')?.disabled,
        };
        resolve({ before, after, error: null });
      }, 5000);
    });
  });
  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.error) {
    console.log(`❌ Auth button CRASHES: ${result.error}`);
  } else {
    console.log('✅ Auth button does NOT crash');
  }

  await device.close();
});
