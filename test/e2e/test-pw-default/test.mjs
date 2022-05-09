import { Actor } from 'apify';
import { PlaywrightCrawler } from '@crawlee/playwright';
import { getDatasetItems, initialize, expect, validateDataset } from '../tools.mjs';

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

await Actor.init();
await crawler.addRequests(['https://apify.com']);
const stats = await crawler.run();
expect(stats.requestsFinished > 50, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length > 50, 'Minimum number of dataset items');
expect(datasetItems.length < 150, 'Maximum number of dataset items');
expect(validateDataset(datasetItems, ['pageTitle']), 'Dataset items validation');

process.exit(0);