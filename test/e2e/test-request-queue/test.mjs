import { Actor } from 'apify';
import log from '@apify/log';
import { purgeLocalStorage } from '@crawlee/utils';
import { CheerioCrawler } from '@crawlee/cheerio';
import { initialize } from '../tools.mjs';

await initialize(import.meta.url);

// RequestQueue auto-reset when stuck with requests in progress
Actor.main(async () => {
    process.env.CRAWLEE_INTERNAL_TIMEOUT = '30000'; // 30s
    await purgeLocalStorage();
    log.default.setLevel(log.default.LEVELS.DEBUG);
    const requestQueue = await Actor.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://example.com/?q=1' });
    await requestQueue.addRequest({ url: 'https://example.com/?q=2' });
    const r3 = await requestQueue.addRequest({ url: 'https://example.com/?q=3' });

    // trigger 0 concurrency by marking one of the requests as already in progress
    requestQueue.inProgress.add(r3.requestId);

    const crawler = new CheerioCrawler({
        requestQueue,
        requestHandler: async (ctx) => {
            log.default.info(ctx.request.id);
        },
    });

    await crawler.run();
});
