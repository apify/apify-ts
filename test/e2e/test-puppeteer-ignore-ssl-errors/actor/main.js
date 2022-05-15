import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';

await Actor.main(async () => {
    const preNavigationHooks = [(_ctx, goToOptions) => {
        goToOptions.waitUntil = ['networkidle2'];
    }];

    const launchContext = { launchOptions: { ignoreHTTPSErrors: true } };

    const requestHandler = async ({ page, enqueueLinks, request, log }) => {
        const { url, userData: { label } } = request;

        if (label === 'START') {
            log.info('Bad ssl page opened!');
            await enqueueLinks({
                globs: [{ glob: 'https://*.badssl.com/', userData: { label: 'DETAIL' } }],
                selector: '.group a.bad',
            });
        } else if (label === 'DETAIL') {
            log.info(`Scraping ${url}`);
            const title = await page.title();
            await Actor.pushData({ url, title });
        }
    };

    const crawler = new PuppeteerCrawler({ requestHandler, preNavigationHooks, launchContext });
    await crawler.addRequests([{ url: 'https://badssl.com', userData: { label: 'START' } }]);
    await crawler.run();
});
