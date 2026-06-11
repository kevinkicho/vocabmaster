const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8081?disable_cache=1&lang=zh&coll=chineseHSK1');
    await page.evaluate(() => {
        app.llm.endpoint = 'http://127.0.0.1:57174';
        window.AI_MOCK = false;
        app.store.prefs.llmProvider = 'local';
        app.store.prefs.llmModel = 'gemma';
    });
    try {
        await page.waitForSelector('button', { timeout: 5000 });
        const btns = await page.$$('button');
        for (const btn of btns) {
            const text = await page.evaluate(el => el.innerText, btn);
            if (text.includes('AI Cloze')) {
                await btn.click();
                break;
            }
        }
        await page.waitForSelector('.main-blank', { timeout: 30000 });
        const text = await page.evaluate(() => document.body.innerText);
        console.log("PAGE TEXT:\n", text.substring(0, 500));
    } catch(e) {
        console.error(e);
    }
    await browser.close();
})();
