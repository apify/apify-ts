import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
import { getDatasetItems, expect, validateDataset, skipTest, initialize } from '../tools.mjs';

skipTest('Apify store lazy loads items now, which cannot be easily tested with Cheerio');

await initialize(import.meta.url);

const crawler = new CheerioCrawler({
    ignoreSslErrors: false,
    async requestHandler({ request, log, $, enqueueLinks }) {
        const { userData: { label } } = request;

        if (label === 'START') {
            log.info('Store opened!');
            await enqueueLinks({
                globs: [{ glob: 'https://apify.com/apify/web-scraper', userData: { label: 'DETAIL' } }],
            });
        }

        if (label === 'DETAIL') {
            const { url } = request;
            log.info(`Scraping ${url}`);

            const uniqueIdentifier = url.split('/').slice(-2).join('/');
            const title = $('header h1').text();
            const description = $('header span.actor-description').text();
            const modifiedDate = $('ul.ActorHeader-stats time').attr('datetime');
            const runCount = $('ul.ActorHeader-stats > li:nth-of-type(3)').text().match(/[\d,]+/)[0].replace(/,/g, '');

            await Actor.pushData({
                url,
                uniqueIdentifier,
                title,
                description,
                modifiedDate: new Date(Number(modifiedDate)),
                runCount: Number(runCount),
            });
        }
    },
});

await crawler.addRequests([{ url: 'https://apify.com/store', userData: { label: 'START' } }]);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });

expect(stats.requestsFinished === 2, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length === 1, 'Minimum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(datasetItems.length === 1, 'Maximum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(validateDataset(datasetItems, ['title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount']),
    'Dataset items validation');

process.exit(0);
