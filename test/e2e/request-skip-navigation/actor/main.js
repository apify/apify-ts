import { Actor } from 'apify';
import { CheerioCrawler, log, Request } from '@crawlee/cheerio';

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

    const requestHandler = async (context) => {
        requestCounter++;
        if (context.request.skipNavigation) {
            log.info(`Skipping ${context.request.id}...`);
            return;
        }
        log.info(`Navigating on ${context.request.id}...`);
    };

    const preNavigationHooks = [() => { navigationCounter++; }];

    const crawler = new CheerioCrawler({ requestHandler, preNavigationHooks });
    await crawler.addRequests([r1, r2, r3]);
    await crawler.run();

    await Actor.pushData({ requestCounter, navigationCounter });
});
