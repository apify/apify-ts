import { Actor } from 'apify';
import { CheerioCrawler, log, Request } from '@crawlee/cheerio';

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

const r3 = new Request({
    url: 'https://example.com/?q=3',
});

// Persisting internal settings of `Request`.
await Actor.main(async () => {
    let requestCounter = 0;
    let navigationCounter = 0;

    const crawler = new CheerioCrawler({
        preNavigationHooks: [() => { navigationCounter++; }],
        async requestHandler({ request }) {
            requestCounter++;
            if (request.skipNavigation) {
                log.info(`Skipping ${request.id}...`);
                return;
            }
            log.info(`Navigating on ${request.id}...`);
        },
    });

    await crawler.addRequests([r1, r2, r3]);
    await crawler.run();

    await Actor.pushData({ requestCounter, navigationCounter });
});
