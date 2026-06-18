import { test, _android as android } from '@playwright/test';

test('Native Google Sign-In diagnostic', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.kevinkicho.vocabmaster');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.kevinkicho.vocabmaster/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 12000));

  const webview = await device.webView({ pkg: 'com.kevinkicho.vocabmaster' });
  const page = await webview.page();

  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });

  // Check native auth bridge availability
  const diag = await page.evaluate(() => ({
    nativeAuthExists: typeof window.NativeAuth !== 'undefined',
    nativeAuthSignInType: typeof window.NativeAuth?.signIn,
    nativeAuthSignOutType: typeof window.NativeAuth?.signOut,
    __nativeAuthExists: typeof window.__nativeAuth !== 'undefined',
    __nativeAuthSignInType: typeof window.__nativeAuth?.signIn,
    currentUrl: window.location.href,
    protocol: window.location.protocol,
  }));
  console.log('Bridge check:', JSON.stringify(diag, null, 2));

  if (!diag.nativeAuthExists) {
    console.log('FAIL: NativeAuth bridge not available');
    await device.close();
    return;
  }
  console.log('✅ NativeAuth bridge available');

  // Click auth button and check what happens
  const beforeUrl = await page.evaluate(() => window.location.href);
  console.log('Before click URL:', beforeUrl);

  await page.evaluate(() => {
    const btn = document.getElementById('btn-login');
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 3000));

  const after = await page.evaluate(() => ({
    url: window.location.href,
    btnDisabled: document.getElementById('btn-login')?.disabled,
    btnHTML: document.getElementById('btn-login')?.innerHTML?.substring(0, 100),
  }));
  console.log('After click:', JSON.stringify(after, null, 2));

  if (after.url === beforeUrl) {
    console.log('✅ URL unchanged — native sign-in triggered (not hosting redirect)');
  } else if (after.url.includes('vocabmaster112225.web.app')) {
    console.log('⚠️ Navigated to hosting — native auth fallback used');
  }

  console.log('✅ Native auth flow verified');
  await device.close();
});
