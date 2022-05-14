import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';

await Actor.main(async () => {
    const requestHandler = async ({ $, enqueueLinks, request, log }) => {
        const { url } = request;
        await enqueueLinks({ pseudoUrls: ['https://apify.com[(/[\\w-]+)?]'] });

        const pageTitle = $('title').first().text();
        log.info(`URL: ${url} TITLE: ${pageTitle}`);

        await Actor.pushData({ url, pageTitle });
    };

    const crawler = new CheerioCrawler({ requestHandler });
    await crawler.addRequests(['https://apify.com']);
    await crawler.run();
});
