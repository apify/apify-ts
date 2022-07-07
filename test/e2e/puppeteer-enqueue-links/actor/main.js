import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import deepEqual from 'deep-equal';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 30,
        async requestHandler({ page, enqueueLinks, request, log }) {
            const { url, loadedUrl } = request;

            const pageTitle = await page.title();
            log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

            const results = await enqueueLinks({ selector: '[class^=CustomRebass__Box] a' });

            if (loadedUrl.startsWith('https://drive')) {
                const isEqual = deepEqual(results, { processedRequests: [], unprocessedRequests: [] });
                await Actor.pushData({ isEqual });
            }
        },
    });

    await crawler.run(['https://apify.com/about']);
}, mainOptions);
