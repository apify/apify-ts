import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 750,
        preNavigationHooks: [({ session, request }, goToOptions) => {
            session?.setPuppeteerCookies([{ name: 'OptanonAlertBoxClosed', value: new Date().toISOString() }], request.url);
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page, request, log, enqueueLinks, injectJQuery }) {
            const { url, userData: { label } } = request;

            if (label === 'START') {
                log.info('Store opened!');
                let pageNo = 2;
                const nextButtonSelector = '[data-test="pagination-button-next"]:not([disabled])';

                while (true) {
                    // Wait network events
                    await page.waitForNetworkIdle();
                    // Enqueue all loaded links
                    await enqueueLinks({
                        selector: 'a.ActorStoreItem',
                        globs: [{ glob: 'https://apify.com/*/*', userData: { label: 'DETAIL' } }],
                    });

                    log.info(`Enqueued actors for page ${pageNo++}`);

                    log.info('Going to the next page if possible');
                    try {
                        const isButtonClickable = (await page.$(nextButtonSelector)) !== null;

                        if (isButtonClickable) {
                            await page.evaluate((el) => document.querySelector(el)?.click(), nextButtonSelector);
                        } else {
                            log.info('No more pages to load');
                            break;
                        }
                    } catch {
                        break;
                    }
                }
            } else if (label === 'DETAIL') {
                await injectJQuery();

                log.info(`Scraping ${url}`);

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

    await crawler.addRequests([{ url: 'https://apify.com/store?page=1', userData: { label: 'START' } }]);
    await crawler.run();
}, mainOptions);
