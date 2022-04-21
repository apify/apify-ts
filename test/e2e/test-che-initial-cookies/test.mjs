import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
import { expect } from '../tools.mjs';

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

const crawler = new CheerioCrawler({
    preNavigationHooks: [
        ({ session, request }) => {
            session.setPuppeteerCookies(initialCookies, request.url);
        },
    ],
    requestHandler({ log, json }) {
        const initialCookiesLength = initialCookies.length;

        const cookieString = json.headers.cookie;
        const pageCookies = cookieString.split(';').map((cookie) => {
            const [name, value] = cookie.split('=').map((str) => str.trim());
            return { name, value };
        });

        log.info('Checking cookies names and values...');
        let numberOfSameCookies = 0;

        for (const cookie of initialCookies) {
            if (pageCookies.some((pageCookie) => pageCookie.name === cookie.name && pageCookie.value === cookie.value)) {
                numberOfSameCookies++;
            }
        }

        expect(
            numberOfSameCookies === initialCookiesLength,
            // eslint-disable-next-line max-len
            `The number of the page cookies matches the defined initial cookies number. Number of wrong cookies is ${initialCookiesLength - numberOfSameCookies}`,
        );

        log.info('All cookies were successfully checked.');
    },
    additionalMimeTypes: ['application/json'],
    useSessionPool: true,
});

await crawler.addRequests(['https://api.apify.com/v2/browser-info']);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });

expect(stats.requestsFinished === 1, 'All requests finished');

process.exit(0);
