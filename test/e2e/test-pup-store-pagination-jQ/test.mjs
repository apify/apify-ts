import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { getDatasetItems, initialize, expect, validateDataset, delay } from '../tools.mjs';

await initialize(import.meta.url);

const crawler = new PuppeteerCrawler({
    async requestHandler(ctx) {
        const { page, enqueueLinks, request, log } = ctx;
        const { userData: { label } } = request;

        switch (label) {
            case 'START': return handleStart();
            case 'DETAIL': return handleDetail(ctx);
            default: log.error(`Unknown label: ${label}`);
        }

        async function handleStart() {
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
        }

        /** @param {import('@crawlee/puppeteer').PuppeteerCrawlingContext} ctx */
        async function handleDetail(ctx) {
            await ctx.injectJQuery();

            const { url } = request;
            log.info(`Scraping ${url}`);

            const uniqueIdentifier = url.split('/').slice(-2).join('/');

            /** @type any */
            let $ = {};
            const results = await page.evaluate(() => ({
                // eslint-disable-next-line no-undef
                title: $('header h1').text(),
                // eslint-disable-next-line no-undef
                description: $('header span.actor-description').text(),
                // eslint-disable-next-line no-undef
                modifiedDate: new Date(Number($('ul.ActorHeader-stats time').attr('datetime'))).toISOString(),
                // eslint-disable-next-line no-undef
                runCount: Number($('ul.ActorHeader-stats > li:nth-of-type(3)').text().match(/[\d,]+/)[0].replace(/,/g, '')),
            }));

            await Actor.pushData({ url, uniqueIdentifier, ...results });
        }
    },
    preNavigationHooks: [
        ({ session, request }, goToOptions) => {
            session?.setPuppeteerCookies([{ name: 'OptanonAlertBoxClosed', value: new Date().toISOString() }], request.url);
            goToOptions.waitUntil = ['networkidle2'];
        },
    ],
    maxRequestsPerCrawl: 750,
});

await crawler.addRequests([{ url: 'https://apify.com/store?page=1', userData: { label: 'START' } }]);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });
expect(stats.requestsFinished > 700, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length > 700, 'Minimum number of dataset items');
await delay(1);
expect(datasetItems.length < 1000, 'Maximum number of dataset items');
await delay(1);
expect(validateDataset(datasetItems, ['title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount']),
    'Dataset items validation');

process.exit(0);
