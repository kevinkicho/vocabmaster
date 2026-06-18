import { chromium } from 'playwright';
import { spawn } from 'child_process';

const PORT = 8123;

function placeholderExercises() {
  const types = ['text_dm','you_decide','fix_sign','translation_fail','culture_check','declarative','interrogative','imperative','exclamative','operative','conditional','exhortation'];
  return JSON.stringify({
    grammar:'Le (article défini masculin)', usage:'Example usage', example:'Ceci est un exemple.',
    exercises: types.map((t,i) => ({
      type:t, question:`Question ${i+1}: choose the correct option?`,
      choices:[{letter:'A',text:'Option A'},{letter:'B',text:'Option B'}], answer:'A', explanation:'A is correct.'
    }))
  });
}

async function run() {
  console.log('Starting http-server...');
  const server = spawn('npx', ['-y', 'http-server', 'public', '-p', String(PORT), '-a', '127.0.0.1'], {
    stdio: 'ignore',
    cwd: '/mnt/c/Users/kevin/Desktop/vocabmaster-master',
  });
  await new Promise(r => setTimeout(r, 2000));

  const browser = await chromium.launch({ headless: true });
  const lang = { code:'fr', lang:'French', params:'lang=fr&source=en' };

  console.log(`\n=== ${lang.lang} (dark mode) ===`);
  const ctx = await browser.newContext({ viewport:{width:430,height:932}, colorScheme:'dark' });
  const page = await ctx.newPage();

  await page.addInitScript(() => { try { localStorage.setItem('vm_first_run_done','1'); } catch(e) {} });
  await page.route('**/api/tags', async r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({models:[{name:'gemma4:31b-cloud'}]})}));

  await page.route('**/api/generate', async r => {
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:'gemma4:31b-cloud',response:placeholderExercises(),done:true})});
  });

  await page.goto(`http://127.0.0.1:${PORT}/?${lang.params}`, {timeout:30000,waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => { const b=document.getElementById('btn-init'); return b&&!b.disabled; }, {timeout:45000});
  await page.click('#btn-init');
  await page.waitForTimeout(2000);
  await page.evaluate(() => app.launch(() => new Grammar('grammar')));
  await page.waitForSelector('#gr-start-btn', {timeout:30000,state:'visible'});

  await page.evaluate(() => {
    ['ai-welcome','modal-settings','modal-note','modal-edit','overlay-init'].forEach(id=>{const e=document.getElementById(id);if(e&&e.parentNode)e.remove()});
    document.querySelectorAll('.fixed.inset-0').forEach(e=>{if(e.id!=='app-view')e.style.display='none'});
  });
  await page.waitForTimeout(300);

  await page.screenshot({path:`/mnt/c/Users/kevin/Desktop/vocabmaster-master/screenshots/grammar_gym_fr_explanation.png`,fullPage:false});
  console.log('  Explanation saved');

  await page.click('#gr-start-btn');
  await page.waitForSelector('#gr-choices', {timeout:5000,state:'visible'});
  await page.waitForTimeout(500);

  const exLabels = ['text_dm','you_decide','fix_sign','translation_fail','culture_check','declarative','interrogative','imperative','exclamative','operative','conditional','exhortation'];
  for (let i = 0; i < 12; i++) {
    await page.screenshot({path:`/mnt/c/Users/kevin/Desktop/vocabmaster-master/screenshots/grammar_gym_fr_ex_${exLabels[i]}.png`,fullPage:false});
    console.log(`  Exercise ${i+1}/12 (${exLabels[i]}) saved`);
    await page.click('.gr-choice[data-letter="A"]');
    await page.waitForSelector('#gr-feedback', {timeout:3000,state:'visible'});
    await page.waitForTimeout(300);
    await page.click('#gr-next-btn');
    await page.waitForTimeout(400);
  }

  await page.waitForSelector('#gr-retry-btn', {timeout:5000,state:'visible'});
  await page.waitForTimeout(500);
  await page.screenshot({path:`/mnt/c/Users/kevin/Desktop/vocabmaster-master/screenshots/grammar_gym_fr_summary.png`,fullPage:false});
  console.log('  Summary saved');

  await ctx.close();
  await browser.close();
  server.kill('SIGTERM');
  console.log('\nDone');
}

run().catch(e => { console.error(e); process.exit(1); });
