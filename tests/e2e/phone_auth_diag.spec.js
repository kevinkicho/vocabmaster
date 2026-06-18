import { test, _android as android } from '@playwright/test';

test('Diagnose auth button on phone', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.vocabmaster.app');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 12000));

  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });

  // Diagnostic 1: Check button state
  const diag1 = await page.evaluate(() => {
    const btn = document.getElementById('btn-login');
    const errors = [];
    try { window._diagErrors = []; } catch(e) {}
    window.onerror = (msg, url, line) => {
      if (window._diagErrors) window._diagErrors.push(`${msg} @ ${url}:${line}`);
    };
    return {
      btnExists: !!btn,
      btnDisabled: btn ? btn.disabled : 'N/A',
      btnInnerHTML: btn ? btn.innerHTML.substring(0, 100) : 'N/A',
      btnOnclickType: btn ? typeof btn.onclick : 'N/A',
      btnOnclickStr: btn ? String(btn.onclick).substring(0, 200) : 'N/A',
      appDefined: typeof window.app !== 'undefined',
      firebaseDefined: typeof firebase !== 'undefined',
      firebaseAuthDefined: typeof firebase !== 'undefined' && typeof firebase.auth !== 'undefined',
      nativeTTS: typeof window.NativeTTS !== 'undefined',
      userAgent: navigator.userAgent.substring(0, 200),
      currentUrl: window.location.href,
    };
  });
  console.log('DIAG 1:', JSON.stringify(diag1, null, 2));

  // Diagnostic 2: Click the button and see what happens
  const diag2 = await page.evaluate(() => {
    window._diagErrors = [];
    const btn = document.getElementById('btn-login');
    if (!btn) return { error: 'btn-login not found' };
    
    try {
      btn.click();
    } catch(e) {
      return { clickError: e.message, stack: e.stack };
    }
    
    // Return state immediately after click
    return {
      btnDisabled: btn.disabled,
      btnInnerHTML: btn.innerHTML.substring(0, 100),
      errors: window._diagErrors || [],
    };
  });
  console.log('DIAG 2 (after click):', JSON.stringify(diag2, null, 2));

  // Wait a bit and check if navigation happened
  await new Promise(r => setTimeout(r, 3000));
  const diag3 = await page.evaluate(() => ({
    currentUrl: window.location.href,
    errors: window._diagErrors || [],
  }));
  console.log('DIAG 3 (after 3s):', JSON.stringify(diag3, null, 2));

  await device.close();
});
