import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
import { getDatasetItems, initialize, expect, validateDataset, delay } from '../tools.mjs';

await initialize(import.meta.url);

const crawler = new CheerioCrawler({
    async requestHandler({ $, enqueueLinks, request, log }) {
        const { userData: { label } } = request;

        switch (label) {
            case 'START': return handleStart();
            case 'DETAIL': return handleDetail();
            default: log.error(`Unknown label: ${label}`);
        }

        async function handleStart() {
            log.info('Bad ssl page opened!');
            await enqueueLinks({
                globs: [{ glob: 'https://*.badssl.com/', userData: { label: 'DETAIL' } }],
                selector: '.group a.bad',
            });
        }

        async function handleDetail() {
            const { url } = request;
            log.info(`Scraping ${url}`);
            const title = $('title').text();
            await Actor.pushData({ url, title });
        }
    },
    ignoreSslErrors: true,
});

await crawler.addRequests([{ url: 'https://badssl.com', userData: { label: 'START' } }]);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });
expect(stats.requestsFinished > 20, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length > 5, 'Minimum number of dataset items');
await delay(1);
expect(validateDataset(datasetItems, ['title']), 'Dataset items validation');

process.exit(0);
