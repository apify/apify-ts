import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';

await Actor.main(async () => {
    const requestHandler = async ({ $, enqueueLinks, request, log }) => {
        const { url, userData: { label } } = request;

        if (label === 'START') {
            log.info('Bad ssl page opened!');
            await enqueueLinks({
                globs: [{ glob: 'https://*.badssl.com/', userData: { label: 'DETAIL' } }],
                selector: '.group a.bad',
            });
        } else if (label === 'DETAIL') {
            log.info(`Scraping ${url}`);
            const title = $('title').text();
            await Actor.pushData({ url, title });
        }
    };

    const crawler = new CheerioCrawler({ requestHandler, ignoreSslErrors: true });
    await crawler.addRequests([{ url: 'https://badssl.com', userData: { label: 'START' } }]);
    await crawler.run();
});
