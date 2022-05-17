import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';

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
    const preNavigationHooks = [({ session, request }) => {
        session.setPuppeteerCookies(initialCookies, request.url);
    }];

    const requestHandler = async ({ json }) => {
        const initialCookiesLength = initialCookies.length;

        const cookieString = json.headers.cookie;
        const pageCookies = cookieString.split(';').map((cookie) => {
            const [name, value] = cookie.split('=').map((str) => str.trim());
            return { name, value };
        });

        let numberOfMatchingCookies = 0;
        for (const cookie of initialCookies) {
            if (pageCookies.some((pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value)) {
                numberOfMatchingCookies++;
            }
        }

        await Actor.pushData({ initialCookiesLength, numberOfMatchingCookies });
    };

    const crawler = new CheerioCrawler({
        preNavigationHooks,
        requestHandler,
        additionalMimeTypes: ['application/json'],
    });
    await crawler.addRequests(['https://api.apify.com/v2/browser-info']);
    await crawler.run();
});
