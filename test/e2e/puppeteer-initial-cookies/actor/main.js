import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';

const initialCookies = [{
    name: 'test',
    value: 'testing cookies',
}, {
    name: 'store',
    value: 'value store',
}, {
    name: 'market_place',
    value: 'value market place',
}];

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        preNavigationHooks: [({ session, request }, goToOptions) => {
            session.setPuppeteerCookies(initialCookies, request.url);
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page }) {
            const initialCookiesLength = initialCookies.length;

            const pageCookies = await page.cookies();

            let numberOfMatchingCookies = 0;
            for (const cookie of initialCookies) {
                if (pageCookies.some((pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value)) {
                    numberOfMatchingCookies++;
                }
            }

            await Actor.pushData({ initialCookiesLength, numberOfMatchingCookies });
        },
    });

    await crawler.addRequests(['https://api.apify.com/v2/browser-info']);
    await crawler.run();
}, { exit: false });
