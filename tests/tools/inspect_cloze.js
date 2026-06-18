const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8081?disable_cache=1&lang=zh&coll=chineseHSK1');
    await page.evaluate(() => {
        app.llm.endpoint = 'http://127.0.0.1:57174';
        window.AI_MOCK = false;
        app.store.prefs.llmProvider = 'local';
        app.store.prefs.llmModel = 'gemma';
    });
    try {
        await page.waitForSelector('button:has-text("AI Cloze")', { timeout: 5000 });
        await page.click('button:has-text("AI Cloze")');
        await page.waitForSelector('.main-blank', { timeout: 30000 });
        const text = await page.evaluate(() => document.body.innerText);
        console.log("PAGE TEXT:\n", text.substring(0, 500));
    } catch(e) {
        console.error(e);
        const text = await page.evaluate(() => document.body.innerText);
        console.log("PAGE TEXT AT ERROR:\n", text.substring(0, 500));
    }
    await browser.close();
})();
