import { Actor } from 'apify';
import { PuppeteerCrawler, pushData } from '@crawlee/puppeteer';
import { getDatasetItems, initialize, expect, validateDataset } from '../tools.mjs';

await initialize(import.meta.url);

const crawler = new PuppeteerCrawler({
    async requestHandler({ page, enqueueLinks, request, log }) {
        const { userData: { label } } = request;

        switch (label) {
            case 'START': return handleStart();
            case 'DETAIL': return handleDetail();
            default: log.error(`Unknown label: ${label}`);
        }

        async function handleStart() {
            log.info('Store opened!');
            let pageNo = 1;
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

        async function handleDetail() {
            const { url } = request;
            log.info(`Scraping ${url}`);

            const uniqueIdentifier = url.split('/').slice(-2).join('/');

            const titleP = page.$eval('header h1', ((el) => el.textContent));
            const descriptionP = page.$eval('header span.actor-description', ((el) => el.textContent));
            const modifiedTimestampP = page.$eval('ul.ActorHeader-stats time', (el) => el.getAttribute('datetime'));
            const runCountTextP = page.$eval('ul.ActorHeader-stats li:nth-of-type(3)', ((el) => el.textContent));

            const [
                title,
                description,
                modifiedTimestamp,
                runCountText,
            ] = await Promise.all([
                titleP,
                descriptionP,
                modifiedTimestampP,
                runCountTextP,
            ]);

            const modifiedDate = new Date(Number(modifiedTimestamp));
            const runCount = Number(runCountText.match(/[\d,]+/)[0].replace(/,/g, ''));

            await pushData({ url, uniqueIdentifier, title, description, modifiedDate, runCount });
        }
    },
    preNavigationHooks: [
        ({ session, request }, goToOptions) => {
            session?.setPuppeteerCookies([{ name: 'OptanonAlertBoxClosed', value: new Date().toISOString() }], request.url);
            goToOptions.waitUntil = ['networkidle2'];
        },
    ],
    useSessionPool: true,
    maxRequestsPerCrawl: 750,
});

await crawler.addRequests([{ url: 'https://apify.com/store?page=1', userData: { label: 'START' } }]);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });
expect(stats.requestsFinished > 700, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length > 700, 'Minimum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(datasetItems.length < 1000, 'Maximum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(validateDataset(datasetItems, ['title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount']),
    'Dataset items validation');

process.exit(0);
