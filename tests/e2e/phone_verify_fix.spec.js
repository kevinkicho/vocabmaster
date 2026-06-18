import { test, _android as android } from '@playwright/test';

test('Verify gemma4:31b-cloud is resolved', async () => {
  const [device] = await android.devices();
  console.log(`Phone: ${device.model()} ${device.serial()}`);

  // Force stop, reinstall, fresh start
  await device.shell('am force-stop com.vocabmaster.app');
  await new Promise(r => setTimeout(r, 2000));
  await device.shell('am start -n com.vocabmaster.app/com.vocabmaster.app.MainActivity');
  await new Promise(r => setTimeout(r, 10000));

  const webview = await device.webView({ pkg: 'com.vocabmaster.app' });
  const page = await webview.page();

  // Click Start button once ready
  await page.waitForSelector('#btn-init:not(.opacity-50)', { state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    const btn = document.getElementById('btn-init');
    if (btn && !btn.disabled) btn.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  // Open settings modal
  await page.evaluate(() => {
    const gearBtn = document.querySelector('button[onclick*="modal(true)"]');
    if (gearBtn) gearBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Read AI info
  const info = await page.evaluate(() => {
    const text = document.getElementById('llm-status-text');
    const dot = document.getElementById('llm-status-dot');
    const sel = document.getElementById('llm-model');
    const cur = sel ? sel.options[sel.selectedIndex] : null;
    return {
      statusText: text ? text.textContent : 'NOT_FOUND',
      dotColor: dot ? dot.style.background : 'NOT_FOUND',
      dropdownOptions: sel ? Array.from(sel.options).map(o => `${o.value}${o.selected ? ' (selected)' : ''}`) : 'NO_DROPDOWN',
      resolved: window.app?.llm?.resolvedModel || 'NO_RESOLVED',
      hasModel: window.app?.llm?.hasModel,
      available: window.app?.llm?.availableModels || [],
    };
  });

  console.log('--- AI Status ---');
  console.log(`Status text: "${info.statusText}"`);
  console.log(`Dot color: ${info.dotColor}`);
  console.log(`Resolved model: ${info.resolved}`);
  console.log(`hasModel: ${info.hasModel}`);
  console.log(`Dropdown options:`);
  info.dropdownOptions.forEach(o => console.log(`  ${o}`));
  console.log(`Available models:`, info.available);
  console.log('--- end ---');

  // Verify gemma4:31b-cloud is resolved
  if (info.resolved === 'gemma4:31b-cloud') {
    console.log('✅ gemma4:31b-cloud resolved correctly!');
  } else {
    console.log(`❌ Wrong model: ${info.resolved}`);
  }

  // Verify status shows the model
  if (info.statusText.includes('gemma4:31b-cloud')) {
    console.log('✅ Status text shows gemma4');
  } else {
    console.log(`❌ Status text: "${info.statusText}"`);
  }

  await device.close();
});
