const { chromium } = require('playwright');

async function run() {
  console.log('=== Settings Behavioral Evidence Suite v3 ===\n');
  console.log('Each screenshot has a config banner + shows actual activity UI.\n');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  let shotNum = 0;

  // Inject a visible banner showing the test config at the top
  async function addBanner(text) {
    await page.evaluate((t) => {
      let banner = document.getElementById('test-config-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'test-config-banner';
        document.body.prepend(banner);
      }
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#7c3aed,#2563eb);color:white;padding:6px 12px;font:bold 11px/1.3 system-ui;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      banner.textContent = t;
    }, text);
  }

  async function removeBanner() {
    await page.evaluate(() => {
      const b = document.getElementById('test-config-banner');
      if (b) b.remove();
    });
  }

  async function shot(name) {
    shotNum++;
    const path = `screenshots/ev_${String(shotNum).padStart(2,'0')}_${name}.png`;
    await page.screenshot({ path });
    console.log(`  📸 #${shotNum} ${path}`);
    return path;
  }

  async function setPrefs(obj) {
    await page.evaluate((o) => {
      Object.assign(app.store.prefs, o);
      localStorage.setItem(app.store.STORAGE_KEY, JSON.stringify(app.store.prefs));
    }, obj);
  }

  async function closeModals() {
    await page.evaluate(() => {
      ['modal-settings','modal-profile','modal-stats','ai-welcome'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
    });
  }

  async function launchMode(mode) {
    await closeModals();
    await page.evaluate((m) => {
      if (app.game) app.game.destroy();
      app.launchGameMode(m);
    }, mode);
    await page.waitForTimeout(800);
  }

  async function goHome() {
    await closeModals();
    await removeBanner();
    await page.evaluate(() => app.goHome(false));
    await page.waitForTimeout(500);
  }

  // For flashcard back - bypass CSS 3D transform by directly showing back content
  async function showFlashcardBack() {
    await page.evaluate(() => {
      const card = document.getElementById('fc-card');
      if (!card) return;
      // Hide front, show back by making back face visible
      const front = card.querySelector('.backface-hidden:not(.rotate-y-180)');
      const back = document.getElementById('fc-back-container');
      if (front) front.style.display = 'none';
      if (back) {
        back.classList.remove('rotate-y-180');
        back.style.backfaceVisibility = 'visible';
        back.style.transform = 'none';
      }
    });
    await page.waitForTimeout(300);
  }

  // --- Load & Init ---
  await page.goto('http://127.0.0.1:8081', { waitUntil: 'networkidle' });
  await page.waitForSelector('#btn-init', { state: 'visible', timeout: 10000 });
  await page.click('#btn-init');
  try { await page.waitForSelector('#ai-welcome', { state: 'visible', timeout: 1500 }); } catch(e) {}
  await closeModals();
  await page.waitForTimeout(300);

  // ================================================================
  // A. HOME SCREEN: Light vs Dark + Themes
  // ================================================================
  console.log('\n[A] HOME: Dark Mode + Themes');

  await setPrefs({ dark: false });
  await page.evaluate(() => { app.store.setTheme('classic'); app.store.applyTheme(); });
  await page.waitForTimeout(300);
  await addBanner('TEST A1: dark=OFF, theme=classic');
  await shot('home_light_classic');

  await setPrefs({ dark: true });
  await page.evaluate(() => app.store.applyTheme());
  await page.waitForTimeout(300);
  await addBanner('TEST A2: dark=ON, theme=classic');
  await shot('home_dark_classic');

  await page.evaluate(() => app.store.setTheme('sakura'));
  await page.waitForTimeout(300);
  await addBanner('TEST A3: dark=ON, theme=sakura');
  await shot('home_dark_sakura');

  await page.evaluate(() => app.store.setTheme('ocean'));
  await page.waitForTimeout(300);
  await addBanner('TEST A4: dark=ON, theme=ocean');
  await shot('home_dark_ocean');

  await page.evaluate(() => app.store.setTheme('coffee'));
  await page.waitForTimeout(300);
  await addBanner('TEST A5: dark=ON, theme=coffee');
  await shot('home_dark_coffee');

  // Restore light
  await setPrefs({ dark: false });
  await page.evaluate(() => { app.store.setTheme('classic'); app.store.applyTheme(); });

  // ================================================================
  // B. FLASHCARDS: Front + Back language configs
  // ================================================================
  console.log('\n[B] FLASHCARDS: Front + Back configs');

  // B1. Japanese front
  await setPrefs({ flashFront: 'ja', flashBack1: 'ja_furi', flashBack2: 'en', flashBack3: 'ja_ex', flashBack4: 'ja_roma' });
  await launchMode('flash');
  await addBanner('TEST B1: flashFront=ja (Japanese kanji on front)');
  await shot('flash_front_ja');
  // Show back
  await showFlashcardBack();
  await addBanner('TEST B2: flashBack1=furigana, Back2=english, Back3=example, Back4=romaji (4 fields)');
  await shot('flash_back_ja_4fields');
  await goHome();

  // B2. Spanish front, english-only back
  await setPrefs({ flashFront: 'es', flashBack1: 'en', flashBack2: '', flashBack3: '', flashBack4: '' });
  await launchMode('flash');
  await addBanner('TEST B3: flashFront=es (Spanish word on front)');
  await shot('flash_front_es');
  await showFlashcardBack();
  await addBanner('TEST B4: flashBack1=en only (1 field — minimal back)');
  await shot('flash_back_es_1field');
  await goHome();

  // B3. Chinese front
  await setPrefs({ flashFront: 'zh', flashBack1: 'zh_pin', flashBack2: 'en', flashBack3: '', flashBack4: '' });
  await launchMode('flash');
  await addBanner('TEST B5: flashFront=zh (Chinese characters on front)');
  await shot('flash_front_zh');
  await showFlashcardBack();
  await addBanner('TEST B6: flashBack1=pinyin, Back2=english (2 fields)');
  await shot('flash_back_zh_2fields');
  await goHome();

  // B4. English front, Japanese back
  await setPrefs({ flashFront: 'en', flashBack1: 'ja', flashBack2: 'ja_furi', flashBack3: '', flashBack4: '' });
  await launchMode('flash');
  await addBanner('TEST B7: flashFront=en (English word on front — reversed!)');
  await shot('flash_front_en');
  await showFlashcardBack();
  await addBanner('TEST B8: flashBack1=ja (kanji), Back2=furigana');
  await shot('flash_back_en_to_ja');
  await goHome();

  // ================================================================
  // C. QUIZ: Languages + Examples
  // ================================================================
  console.log('\n[C] QUIZ: Languages + Examples toggle');

  await setPrefs({ quizQ: 'ja', quizA: 'en', quizShowEx: true, quizExMain: 'ja', quizExSub: 'en' });
  await launchMode('quiz');
  await addBanner('TEST C1: quizQ=ja, quizA=en, showEx=ON');
  await shot('quiz_ja_en_ex_on');
  await goHome();

  await setPrefs({ quizQ: 'ja', quizA: 'en', quizShowEx: false });
  await launchMode('quiz');
  await addBanner('TEST C2: quizQ=ja, quizA=en, showEx=OFF');
  await shot('quiz_ja_en_ex_off');
  await goHome();

  await setPrefs({ quizQ: 'es', quizA: 'en', quizShowEx: true, quizExMain: 'es', quizExSub: 'en' });
  await launchMode('quiz');
  await addBanner('TEST C3: quizQ=es (Spanish question), quizA=en');
  await shot('quiz_es_en');
  await goHome();

  await setPrefs({ quizQ: 'en', quizA: 'ja', quizShowEx: true, quizExMain: 'en', quizExSub: 'ja' });
  await launchMode('quiz');
  await addBanner('TEST C4: quizQ=en, quizA=ja (REVERSED — English question, Japanese answers)');
  await shot('quiz_en_ja_reversed');
  await goHome();

  // ================================================================
  // D. TRUE/FALSE: Examples + Languages
  // ================================================================
  console.log('\n[D] TRUE/FALSE');

  await setPrefs({ tfFront: 'ja', tfBack: 'en', tfShowEx: false });
  await launchMode('tf');
  await addBanner('TEST D1: tfFront=ja, tfBack=en, showEx=OFF');
  await shot('tf_ja_no_ex');
  await goHome();

  await setPrefs({ tfShowEx: true, tfExMain: 'ja', tfExSub: 'en' });
  await launchMode('tf');
  await addBanner('TEST D2: tfFront=ja, tfBack=en, showEx=ON (example sentence visible)');
  await shot('tf_ja_with_ex');
  await goHome();

  await setPrefs({ tfFront: 'es', tfBack: 'en', tfExMain: 'es', tfExSub: 'en' });
  await launchMode('tf');
  await addBanner('TEST D3: tfFront=es (Spanish True/False)');
  await shot('tf_es');
  await goHome();

  // ================================================================
  // E. MATCHING: Language pools + Hint
  // ================================================================
  console.log('\n[E] MATCHING: Pools + Hint');

  await setPrefs({ matchShowJa: true, matchShowEn: true, matchShowEs: false, matchShowZh: false, matchShowKo: false, matchShowFr: false, matchShowDe: false, matchShowPt: false, matchShowIt: false, matchShowRu: false, matchHint: false });
  await launchMode('match');
  await addBanner('TEST E1: matchPool=JA+EN, hint=OFF');
  await shot('match_ja_en');

  // Wrong answer with hint OFF
  await page.evaluate(() => {
    const cards = app.game.state.cards;
    const c1 = cards[0];
    const c2 = cards.find(c => c.match !== c1.match);
    if (c2) { app.game.tap(c1.id, c1.match, c1.type); }
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const cards = app.game.state.cards;
    const c1 = cards[0];
    const c2 = cards.find(c => c.match !== c1.match);
    if (c2) { app.game.tap(c2.id, c2.match, c2.type); }
  });
  await page.waitForTimeout(200);
  await addBanner('TEST E2: Wrong answer with matchHint=OFF (red only, no yellow partner hint)');
  await shot('match_wrong_no_hint');
  await goHome();

  // Same but hint ON
  await setPrefs({ matchHint: true });
  await launchMode('match');
  await page.evaluate(() => {
    const cards = app.game.state.cards;
    const c1 = cards[0];
    const c2 = cards.find(c => c.match !== c1.match);
    if (c2) { app.game.tap(c1.id, c1.match, c1.type); }
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const cards = app.game.state.cards;
    const c1 = cards[0];
    const c2 = cards.find(c => c.match !== c1.match);
    if (c2) { app.game.tap(c2.id, c2.match, c2.type); }
  });
  await page.waitForTimeout(200);
  await addBanner('TEST E3: Wrong answer with matchHint=ON (yellow highlight on correct partner)');
  await shot('match_wrong_with_hint');
  await goHome();

  // ================================================================
  // F. SENTENCES: Bottom display modes
  // ================================================================
  console.log('\n[F] SENTENCES: Bottom modes');

  await setPrefs({ sentencesQ: 'ja', sentencesA: 'ja', sentencesTrans: 'en', sentencesBottomLang: 'en' });

  for (const mode of ['sentence_masked', 'sentence_full', 'word_masked', 'none']) {
    await setPrefs({ sentencesBottomDisp: mode });
    await launchMode('sentences');
    await addBanner(`TEST F: sentencesBottomDisp=${mode}`);
    await shot(`sent_${mode}`);
    await goHome();
  }

  // Spanish sentences
  await setPrefs({ sentencesQ: 'es', sentencesA: 'es', sentencesTrans: 'en', sentencesBottomDisp: 'sentence_masked' });
  await launchMode('sentences');
  await addBanner('TEST F5: sentencesQ=es (Spanish sentence mode)');
  await shot('sent_es');
  await goHome();

  // ================================================================
  // G. VOICE: Display languages
  // ================================================================
  console.log('\n[G] VOICE');

  await setPrefs({ voiceDispFront: 'ja', voiceDispBack: 'en' });
  await launchMode('voice');
  await addBanner('TEST G1: voiceDispFront=ja (Japanese prompt to speak)');
  await shot('voice_ja');
  await goHome();

  await setPrefs({ voiceDispFront: 'es', voiceDispBack: 'en' });
  await launchMode('voice');
  await addBanner('TEST G2: voiceDispFront=es (Spanish prompt to speak)');
  await shot('voice_es');
  await goHome();

  await setPrefs({ voiceDispFront: 'en', voiceDispBack: 'ja' });
  await launchMode('voice');
  await addBanner('TEST G3: voiceDispFront=en (English prompt, reversed)');
  await shot('voice_en');
  await goHome();

  // ================================================================
  // H. LEVEL FILTER
  // ================================================================
  console.log('\n[H] LEVEL FILTER');

  await setPrefs({ levelFilter: ['all'], flashFront: 'ja', flashBack1: 'en' });
  await launchMode('flash');
  const allCnt = await page.evaluate(() => app.game.list.length);
  await addBanner(`TEST H1: levelFilter=all → ${allCnt} words (header shows 1/${allCnt})`);
  await shot('level_all');
  await goHome();

  await setPrefs({ levelFilter: ['N5'] });
  await launchMode('flash');
  const n5Cnt = await page.evaluate(() => app.game.list.length);
  await addBanner(`TEST H2: levelFilter=N5 → ${n5Cnt} words (header shows 1/${n5Cnt})`);
  await shot('level_n5');
  await goHome();

  await setPrefs({ levelFilter: ['N5', 'N4'] });
  await launchMode('flash');
  const n54Cnt = await page.evaluate(() => app.game.list.length);
  await addBanner(`TEST H3: levelFilter=N5+N4 → ${n54Cnt} words`);
  await shot('level_n5n4');
  await goHome();

  await setPrefs({ levelFilter: ['all'] });

  // ================================================================
  // I. FONTS
  // ================================================================
  console.log('\n[I] FONTS');

  await setPrefs({ font: 'sans', fontWeight: 'normal', fontStyle: 'normal', flashFront: 'ja', flashBack1: 'en' });
  await page.evaluate(() => app.ui.applyFontSettings());
  await launchMode('flash');
  await addBanner('TEST I1: font=sans, weight=normal, style=normal');
  await shot('font_sans_normal');
  await goHome();

  await setPrefs({ font: 'serif', fontWeight: 'bold', fontStyle: 'normal' });
  await page.evaluate(() => app.ui.applyFontSettings());
  await launchMode('flash');
  await addBanner('TEST I2: font=serif, weight=bold');
  await shot('font_serif_bold');
  await goHome();

  await setPrefs({ font: 'mono', fontWeight: 'normal', fontStyle: 'normal' });
  await page.evaluate(() => app.ui.applyFontSettings());
  await launchMode('flash');
  await addBanner('TEST I3: font=mono');
  await shot('font_mono');
  await goHome();

  await setPrefs({ font: 'sans', fontWeight: 'normal', fontStyle: 'normal' });
  await page.evaluate(() => app.ui.applyFontSettings());

  // ================================================================
  // J. AUDIO BUTTONS
  // ================================================================
  console.log('\n[J] AUDIO BUTTONS');

  await setPrefs({ showAudioBtns: true, flashFront: 'ja', flashBack1: 'en' });
  await launchMode('flash');
  await addBanner('TEST J1: showAudioBtns=ON (flag row visible below card)');
  await shot('audio_btns_on');
  await goHome();

  await setPrefs({ showAudioBtns: false });
  await launchMode('flash');
  await addBanner('TEST J2: showAudioBtns=OFF (flag row hidden)');
  await shot('audio_btns_off');
  await goHome();
  await setPrefs({ showAudioBtns: true });

  // ================================================================
  // K. DARK MODE IN ACTIVITIES
  // ================================================================
  console.log('\n[K] DARK MODE in activities');

  await setPrefs({ dark: false, quizQ: 'ja', quizA: 'en', quizShowEx: true });
  await page.evaluate(() => app.store.applyTheme());
  await launchMode('quiz');
  await addBanner('TEST K1: dark=OFF in Quiz (white background)');
  await shot('quiz_light');
  await goHome();

  await setPrefs({ dark: true });
  await page.evaluate(() => app.store.applyTheme());
  await launchMode('quiz');
  await addBanner('TEST K2: dark=ON in Quiz (dark background)');
  await shot('quiz_dark');
  await goHome();

  // Dark mode in matching
  await launchMode('match');
  await addBanner('TEST K3: dark=ON in Matching');
  await shot('match_dark');
  await goHome();

  // Dark mode in TF
  await setPrefs({ tfFront: 'ja', tfBack: 'en', tfShowEx: true });
  await launchMode('tf');
  await addBanner('TEST K4: dark=ON in True/False');
  await shot('tf_dark');
  await goHome();

  // Restore
  await setPrefs({ dark: false });
  await page.evaluate(() => app.store.applyTheme());

  // ================================================================
  await removeBanner();
  console.log(`\n=== Done! ${shotNum} evidence screenshots with config banners ===`);
  await browser.close();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
