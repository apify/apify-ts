import { Actor } from 'apify';
import { PlaywrightCrawler } from '@crawlee/playwright';
import { getDatasetItems, initialize, expect, validateDataset, delay } from '../tools.mjs';

await initialize(import.meta.url);

const crawler = new PlaywrightCrawler({
    async requestHandler({ page, enqueueLinks, request, log }) {
        const { url } = request;

        await enqueueLinks({
            regexps: [/^https:\/\/apify\.com(\/[\w-]+)?$/i],
        });

        const pageTitle = await page.title();
        log.info(`URL: ${url} TITLE: ${pageTitle}`);

        await Actor.pushData({ url, pageTitle });
    },
    preNavigationHooks: [
        (_ctx, goToOptions) => {
            goToOptions.waitUntil = 'networkidle';
        },
    ],
});

await crawler.addRequests(['https://apify.com']);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });
expect(stats.requestsFinished > 50, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length > 50, 'Minimum number of dataset items');
await delay(1);
expect(datasetItems.length < 150, 'Maximum number of dataset items');
await delay(1);
expect(validateDataset(datasetItems, ['pageTitle']), 'Dataset items validation');

process.exit(0);
