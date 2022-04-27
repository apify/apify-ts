import { Actor } from 'apify';
import { PuppeteerCrawler, KeyValueStore, pushData } from '@crawlee/puppeteer';
import { getDatasetItems, initialize, expect, validateDataset } from '../tools.mjs';

await initialize(import.meta.url);

const store = await KeyValueStore.open();

const crawler = new PuppeteerCrawler({
    async requestHandler({ page }) {
        const pageContent = await page.evaluate(() => document.body.children[0].innerText);
        const parsed = JSON.parse(pageContent);

        const { clientIp } = parsed;

        const presentAlready = await store.getValue(clientIp);

        if (presentAlready) {
            throw new Error(`The ip address ${clientIp} was already used. Proxy rotation does not work properly.`);
        }

        await store.setValue(clientIp, true);
        await pushData({ clientIp });
    },
    proxyConfiguration: await Actor.createProxyConfiguration(),
    maxConcurrency: 1,
    sessionPoolOptions: {
        sessionOptions: {
            maxUsageCount: 1,
        },
    },
});

await crawler.addRequests(
    Array.from(
        { length: 5 },
        (_, i) => ({ url: 'https://api.apify.com/v2/browser-info', uniqueKey: `${i}` }),
    ),
);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });

expect(stats.requestsFinished === 5, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length >= 5, 'Minimum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(validateDataset(datasetItems, ['clientIp']), 'Dataset items validation');

process.exit(0);
