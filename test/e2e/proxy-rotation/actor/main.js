import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(),
        maxConcurrency: 1,
        sessionPoolOptions: { sessionOptions: { maxUsageCount: 1 } },
        async requestHandler({ page }) {
            const pageContent = await page.evaluate(() => document.body.children[0].innerText);
            const { clientIp } = JSON.parse(pageContent);

            const presentAlready = await Actor.getValue(clientIp);
            if (presentAlready) {
                throw new Error(`The ip address ${clientIp} was already used. Proxy rotation does not work properly.`);
            }

            await Actor.setValue(clientIp, true);
            await Actor.pushData({ clientIp });
        },
    });

    await crawler.addRequests(Array.from(
        { length: 5 },
        (_, i) => ({ url: 'https://api.apify.com/v2/browser-info', uniqueKey: `${i}` }),
    ));
    await crawler.run();
});
