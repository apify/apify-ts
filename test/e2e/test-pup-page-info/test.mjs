import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { getDatasetItems, initialize, expect, validateDataset } from '../tools.mjs';

await initialize(import.meta.url);

const crawler = new PuppeteerCrawler({
    async requestHandler({ page, enqueueLinks, request, log }) {
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

            const titleP = page.$eval('header h1', ((el) => el.textContent));
            const descriptionP = page.$eval('header span.actor-description', ((el) => el.textContent));
            const modifiedTimestampP = page.$eval('ul.ActorHeader-stats time', (el) => el.getAttribute('datetime'));
            const runCountTextP = page.$eval('ul.ActorHeader-stats > li:nth-of-type(3)', ((el) => el.textContent));
            const [
                title,
                description,
                modifiedTimestamp,
                runCountText,
            ] = await Promise.all([
                titleP,
                descriptionP,
                modifiedTimestampP,
                runCountTextP,
            ]);

            const modifiedDate = new Date(Number(modifiedTimestamp));
            const runCount = Number(runCountText.match(/[\d,]+/)[0].replace(/,/g, ''));

            await Actor.pushData({ url, uniqueIdentifier, title, description, modifiedDate, runCount });
        }
    },
    preNavigationHooks: [
        (_ctx, goToOptions) => {
            goToOptions.waitUntil = ['networkidle2'];
        },
    ],
});

await crawler.addRequests([{ url: 'https://apify.com/store', userData: { label: 'START' } }]);

const stats = await Actor.main(() => crawler.run(), { exit: false });
expect(stats.requestsFinished === 2, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length === 1, 'Minimum number of dataset items');
expect(datasetItems.length === 1, 'Maximum number of dataset items');
expect(validateDataset(datasetItems, ['title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount']),
    'Dataset items validation');

process.exit(0);
