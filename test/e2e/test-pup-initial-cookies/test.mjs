import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { expect, initialize } from '../tools.mjs';

await initialize(import.meta.url);

const initialCookies = [
    {
        name: 'test',
        value: 'testing cookies',
    },
    {
        name: 'store',
        value: 'value store',
    },
    {
        name: 'market_place',
        value: 'value market place',
    },
];

const crawler = new PuppeteerCrawler({
    preNavigationHooks: [
        ({ session, request }, goToOptions) => {
            session.setPuppeteerCookies(initialCookies, request.url);
            goToOptions.waitUntil = ['networkidle2'];
        },
    ],
    async requestHandler({ log, page }) {
        const initialCookiesLength = initialCookies.length;

        const pageCookies = await page.cookies();

        log.info('Checking cookies names and values...');
        let numberOfSameCookies = 0;

        for (const cookie of initialCookies) {
            if (pageCookies.some((pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value)) {
                numberOfSameCookies++;
            }
        }

        expect(
            numberOfSameCookies === initialCookiesLength,
            `The number of the page cookies matches the defined initial cookies number. Number of wrong cookies is ${initialCookiesLength - numberOfSameCookies}`,
        );

        log.info('All cookies were successfully checked.');
    },
});

await crawler.addRequests(['https://api.apify.com/v2/browser-info']);

const stats = await Actor.main(() => crawler.run(), { exit: false });

expect(stats.requestsFinished === 1, 'All requests finished');

process.exit(0);
