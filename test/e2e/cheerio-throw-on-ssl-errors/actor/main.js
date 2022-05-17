import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        ignoreSslErrors: false,
        async requestHandler({ $, enqueueLinks, request, log }) {
            const { userData: { label } } = request;

            if (label === 'START') {
                log.info('Bad ssl page opened!');
                await enqueueLinks({
                    globs: [{ glob: 'https://*.badssl.com/', userData: { label: 'DETAIL' } }],
                    selector: '.group a.bad',
                });
            } else if (label === 'DETAIL') {
                const { url } = request;
                log.info(`Scraping ${url}`);
                const title = $('title').text();
                await Actor.pushData({ url, title });
            }
        },
    });

    await crawler.addRequests([{ url: 'https://badssl.com', userData: { label: 'START' } }]);
    await crawler.run();
}, { exit: false });
