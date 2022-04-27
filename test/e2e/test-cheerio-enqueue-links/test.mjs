import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
import deepEqual from 'deep-equal';
import { expect, initialize } from '../tools.mjs';

await initialize(import.meta.url);

const crawler = new CheerioCrawler({
    async requestHandler({ $, enqueueLinks, request, log }) {
        const { url, loadedUrl } = request;

        const pageTitle = $('title').first().text();
        log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);

        const results = await enqueueLinks();

        if (loadedUrl.startsWith('https://drive')) {
            const isEqual = deepEqual(results, { processedRequests: [], unprocessedRequests: [] });

            expect(isEqual, 'enqueueing on same subdomain but different loaded url doesn\'t enqueue');
            process.exit(0);
        }
    },
});

await crawler.addRequests(['https://apify.com/about']);
const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });
expect(stats.requestsFinished > 50, 'All requests finished');

process.exit(0);
