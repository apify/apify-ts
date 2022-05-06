import { Actor } from 'apify';
import { CheerioCrawler, log, Request } from '@crawlee/cheerio';
import { initialize, expect } from '../tools.mjs';

await initialize(import.meta.url);

let requestCounter = 0;
let navigationCounter = 0;

// Persisting internal settings of `Request`.
await Actor.main(async () => {
    log.setLevel(log.LEVELS.DEBUG);

    const r1 = new Request({
        url: 'https://example.com/?q=1',
        skipNavigation: true,
        userData: { abc: { def: 'ghi' } },
    });

    const r2 = new Request({
        url: 'https://example.com/?q=2',
        skipNavigation: true,
    });

    r2.userData = { xyz: { kjl: 'mno' } };

    const r3 = new Request({ url: 'https://example.com/?q=3' });

    const crawler = new CheerioCrawler({
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

    await crawler.addRequests([r1, r2, r3]);

    await crawler.run();
}, { exit: false });

expect(requestCounter === 3, 'Processed 3 requests');
expect(navigationCounter === 1, 'Navigated on one request only.');
