import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 10,
        preNavigationHooks: [({ session, request }, goToOptions) => {
            session?.setCookies([{ name: 'OptanonAlertBoxClosed', value: new Date().toISOString() }], request.url);
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page, request, log, enqueueLinks, injectJQuery }) {
            const { url, userData: { label } } = request;

            if (label === 'START') {
                log.info('Store opened');
                const nextButtonSelector = '[data-test="pagination-button-next"]:not([disabled])';
                // enqueue actor details from the first three pages of the store
                for (let pageNo = 1; pageNo <= 3; pageNo++) {
                    // Wait for network events to finish
                    await page.waitForNetworkIdle();
                    // Enqueue all loaded links
                    await enqueueLinks({
                        selector: 'a.ActorStoreItem',
                        globs: [{ glob: 'https://apify.com/*/*', userData: { label: 'DETAIL' } }],
                    });
                    log.info(`Enqueued actors for page ${pageNo}`);
                    log.info('Loading the next page');
                    await page.evaluate((el) => document.querySelector(el)?.click(), nextButtonSelector);
                }
            } else if (label === 'DETAIL') {
                log.info(`Scraping ${url}`);
                await injectJQuery();
                const uniqueIdentifier = url.split('/').slice(-2).join('/');
                const results = await page.evaluate(() => ({
                    title: $('header h1').text(), // eslint-disable-line
                    description: $('header span.actor-description').text(), // eslint-disable-line
                    modifiedDate: new Date(Number($('ul.ActorHeader-stats time').attr('datetime'))).toISOString(), // eslint-disable-line
                    runCount: Number($('ul.ActorHeader-stats > li:nth-of-type(3)').text().match(/[\d,]+/)[0].replace(/,/g, '')), // eslint-disable-line
                }));

                await Actor.pushData({ url, uniqueIdentifier, ...results });
            }
        },
    });

    await crawler.run([{ url: 'https://apify.com/store', userData: { label: 'START' } }]);
}, mainOptions);
