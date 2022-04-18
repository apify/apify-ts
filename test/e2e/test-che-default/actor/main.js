const { Actor } = require('apify');
const { CheerioCrawler } = require('@crawlee/cheerio');

Actor.main(async () => {
    const crawler = new CheerioCrawler({
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

    await crawler.addRequests(['https://apify.com']);

    await crawler.run();
});
