import { Actor } from 'apify';
import { CheerioCrawler, RequestList } from '@crawlee/cheerio'; // TODO: Remove RequestList

Actor.main(async () => {
    const requestList = new RequestList({ sources: ['https://apify.com'] }); // TODO: Remove
    await requestList.initialize(); // TODO: Remove

    const crawler = new CheerioCrawler({
        requestList, // TODO: Remove
        async requestHandler({ $, enqueueLinks, request, log }) {
            const { url } = request;

            await enqueueLinks({
                pseudoUrls: ['https://apify.com[(/[\\w-]+)?]'],
            });

            const pageTitle = $('title').first().text();
            log.info(`URL: ${url} TITLE: ${pageTitle}`);

            await Actor.pushData({ url, pageTitle });
        },
    });

    // await crawler.addRequests(['https://apify.com']); TODO: Uncomment

    await crawler.run();
});
