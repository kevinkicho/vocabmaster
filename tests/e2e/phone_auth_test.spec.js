import { test, _android as android } from '@playwright/test';

test('Auth button behavior on phone', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  await device.shell('am force-stop com.vocabmaster.app');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 10000));

  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  // Wait for and click Start
  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) btn.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  // Check auth state and login button before clicking
  const before = await page.evaluate(() => {
    const btn = document.getElementById('btn-login');
    return {
      hasLoginBtn: !!btn,
      btnHTML: btn?.innerHTML?.substring(0, 100),
      btnOnclick: btn?.onclick ? 'defined' : 'null',
      hasNativeTTS: !!window.NativeTTS,
      hasCapacitor: !!window.Capacitor,
      userAgent: navigator.userAgent?.substring(0, 150),
      authExists: typeof auth !== 'undefined',
      authUser: auth?.currentUser ? auth.currentUser.isAnonymous ? 'anonymous' : auth.currentUser.email : 'null',
    };
  });
  console.log('Before click:', JSON.stringify(before, null, 2));

  // Click the login button and see what happens
  console.log('Clicking login button...');
  
  const clickResult = await page.evaluate(async () => {
    const errors = [];
    const origHandler = window.app?.handleAuthClick;
    
    // Wrap to catch errors
    if (origHandler) {
      window.app.handleAuthClick = function() {
        try {
          return origHandler.apply(this, arguments);
        } catch (e) {
          errors.push({ type: 'sync', msg: e.message, stack: e.stack?.substring(0, 200) });
          const btn = document.getElementById('btn-login');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-user text-xl"></i>'; }
        }
      };
    }
    
    // Click the button
    const btn = document.getElementById('btn-login');
    if (!btn) return { clicked: false, errors };
    if (!btn.onclick) return { clicked: false, reason: 'onclick is null', errors };
    btn.click();
    
    // Wait for async handler
    await new Promise(r => setTimeout(r, 4000));
    
    const btnAfter = document.getElementById('btn-login');
    return {
      clicked: true,
      onclickPresent: !!btn.onclick,
      onclickType: typeof btn.onclick,
      btnHTML: btnAfter?.innerHTML?.substring(0, 100),
      btnDisabled: btnAfter?.disabled,
      hasSpinner: !!btnAfter?.querySelector('.ph-spinner, .animate-spin'),
      errors,
      authUser: typeof auth !== 'undefined' && auth.currentUser ? 
        (auth.currentUser.isAnonymous ? 'anonymous' : auth.currentUser.email) : 'null',
      handleAuthClickExists: typeof window.app?.handleAuthClick === 'function',
    };
  });
  console.log('Click result:', JSON.stringify(clickResult, null, 2));

  // Also test clicking the header gear button to trigger settings
  // to make sure it doesn't crash either (was mentioned earlier)
  const gearClicked = await page.evaluate(() => {
    const gear = document.querySelector('button[onclick*="modal(true)"]');
    if (gear) { gear.click(); return true; }
    return false;
  });
  console.log(`Gear clicked: ${gearClicked}`);
  await new Promise(r => setTimeout(r, 2000));

  const settingsOk = await page.evaluate(() => ({
    modalVisible: !!document.getElementById('modal-settings') && 
      !document.getElementById('modal-settings')?.classList.contains('hidden'),
  }));
  console.log(`Settings modal: ${settingsOk.modalVisible}`);

  await device.close();
});
