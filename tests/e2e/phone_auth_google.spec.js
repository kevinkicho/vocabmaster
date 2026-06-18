import { test, _android as android } from '@playwright/test';

test('Auth button now tries Google sign-in', async () => {
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
  const before = await page.evaluate(() => {
    const btn = document.getElementById('btn-login');
    return {
      hasBtn: !!btn,
      onclickType: typeof btn?.onclick,
      btnHTML: btn?.innerHTML?.substring(0, 80),
      authUser: typeof auth !== 'undefined' && auth.currentUser ? 
        (auth.currentUser.isAnonymous ? 'anonymous' : auth.currentUser.email) : 'null',
    };
  });
  console.log('Before click:', JSON.stringify(before));

  if (before.onclickType === 'function') {
    console.log('✅ Login btn has onclick handler (will try Google sign-in)');
    
    // Click it
    const result = await page.evaluate(() => {
      const btn = document.getElementById('btn-login');
      const errors = [];
      
      // Monkey-patch auth.signInWithPopup to catch the call
      const origPopup = auth.signInWithPopup;
      let popupCalled = false;
      auth.signInWithPopup = function() {
        popupCalled = true;
        return Promise.reject({ code: 'auth/popup-blocked', message: 'Popup blocked in WebView' });
      };
      
      try {
        btn?.click();
      } catch (e) {
        errors.push(e.message);
      }
      
      return new Promise(resolve => {
        setTimeout(() => {
          auth.signInWithPopup = origPopup;
          const btnAfter = document.getElementById('btn-login');
          resolve({
            popupCalled,
            errors,
            btnHTML: btnAfter?.innerHTML?.substring(0, 80),
            btnDisabled: btnAfter?.disabled,
          });
        }, 3000);
      });
    });
    console.log('Click result:', JSON.stringify(result));
    
    if (result.popupCalled) {
      console.log('✅ Google sign-in was triggered!');
    } else {
      console.log('⚠️ Google sign-in was NOT triggered');
    }
  } else {
    console.log('❌ Login btn onclick is null — wont work');
  }

  await device.close();
});
