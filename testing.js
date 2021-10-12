const { launchPuppeteer, utils } = require('.');

(async () => {
    const browser = await launchPuppeteer({ launchOptions: { headless: true } });

    const page = await browser.newPage();

    let count = 0;
    const content = Array(1_000_000).fill(null).map(() => {
        return `<div style="border: 1px solid black">Div number: ${count++}</div>`;
    });
    const contentHTML = `<html><body>${content}</body></html>`;
    await page.setContent(contentHTML);

    function isAtBottom() {
        return (window.innerHeight + window.scrollY) >= document.body.offsetHeight;
    }

    const before = await page.evaluate(isAtBottom);
    console.log(before);

    await utils.puppeteer.infiniteScroll(page, { waitForSecs: Infinity, stopScrollCallback: () => true });
    // await utils.puppeteer.infiniteScroll(page, { waitForSecs: 0 });

    const after = await page.evaluate(isAtBottom);
    console.log(after);

    console.log(await page.evaluate(() => ({
        innerHeight: window.innerHeight,
        scrollY: window.scrollY,
        innerHeightPlusYOffset: window.innerHeight + window.scrollY,
        offsetHeight: document.body.offsetHeight,
    })));

    await page.close();
    await browser.close();
})();
