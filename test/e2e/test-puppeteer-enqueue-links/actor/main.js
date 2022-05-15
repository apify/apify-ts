import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import deepEqual from 'deep-equal';

await Actor.main(async () => {
    const requestHandler = async ({ page, enqueueLinks, request, log }) => {
        const { url, loadedUrl } = request;

        const pageTitle = await page.title();
        log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

        const results = await enqueueLinks();

        if (loadedUrl.startsWith('https://drive')) {
            const isEqual = deepEqual(results, { processedRequests: [], unprocessedRequests: [] });
            await Actor.pushData({ isEqual });
        }
    };

    const crawler = new PuppeteerCrawler({ requestHandler, maxRequestsPerCrawl: 40 });
    await crawler.addRequests(['https://apify.com/about']);
    await crawler.run();
});
