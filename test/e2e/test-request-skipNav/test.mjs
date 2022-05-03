import { Actor } from 'apify';
import { purgeLocalStorage } from '@crawlee/utils';
import { CheerioCrawler, log, Request } from '@crawlee/cheerio';
import { initialize, expect } from '../tools.mjs';

await initialize(import.meta.url);

let requestCounter = 0;
let navigationCounter = 0;

// Persisting internal settings of `Request`.
await Actor.main(async () => {
    await purgeLocalStorage();
    log.setLevel(log.LEVELS.DEBUG);

    const requestQueue = await Actor.openRequestQueue();

    const r1 = await new Request({
        url: 'https://example.com/?q=1',
        skipNavigation: true,
        userData: { abc: { def: 'ghi' } },
    });

    const r2 = await new Request({
        url: 'https://example.com/?q=2',
        skipNavigation: true,
    });

    r2.userData = { xyz: { kjl: 'mno' } };

    const r3 = await new Request({ url: 'https://example.com/?q=3' });

    requestQueue.addRequest(r1);
    requestQueue.addRequest(r2);
    requestQueue.addRequest(r3);

    const crawler = new CheerioCrawler({
        requestQueue,
        requestHandler: async (ctx) => {
            requestCounter++;
            if (ctx.request.skipNavigation) {
                log.info(`Skipping ${ctx.request.id}...`);
                return;
            }
            log.info(`Navigating on ${ctx.request.id}...`);
        },
        preNavigationHooks: [
            () => { navigationCounter++; },
        ],
    });

    await crawler.run();
}, { exit: false, purge: true });

expect(requestCounter === 3, 'Processed 3 requests');
expect(navigationCounter === 1, 'Navigated on one request only.');
