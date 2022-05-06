import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
import { initialize, expect } from '../tools.mjs';

await initialize(import.meta.url);

const crawler = new CheerioCrawler({
    async requestHandler({ $, request, log }) {
        const { url } = request;

        const pageTitle = $('title').first().text();

        log.info('Page scraped', { url, pageTitle });

        await Actor.pushData({ url, pageTitle });
    },
    additionalMimeTypes: ['text/xml'],
});

await crawler.addRequests(['https://apify.com/sitemap.xml']);

const stats = await Actor.main(() => crawler.run(), { exit: false });

expect(stats.requestsFinished === 1, 'All requests finished');

process.exit(0);
