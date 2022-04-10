import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlers/cheerio';
import { getDatasetItems, expect, validateDataset } from '../tools.mjs';

const crawler = new CheerioCrawler({
    async requestHandler({ $, enqueueLinks, request, log }) {
        const { url } = request;

        await enqueueLinks({
            pseudoUrls: ['https://apify.com[(/[\\w-]+)?]'],
        });

        const pageTitle = $('title').first().text();
        log.info(`URL: ${url} TITLE: ${pageTitle}`);

        await Actor.pushData({ url, pageTitle });
    }
});

await crawler.addRequests(['https://apify.com']);
const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });
expect(stats.requestsFinished > 50, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length > 50, 'Minimum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(datasetItems.length < 150, 'Maximum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(validateDataset(datasetItems, ['pageTitle']), 'Dataset items validation');

process.exit(0);
