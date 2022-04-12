// $ npm run build && ts-node test/apify/storages/request_queue_reset.ts

import { Actor } from 'apify';
import log from '@apify/log';
import { purgeLocalStorage } from 'crawlee';
import { CheerioCrawler } from '@crawlee/cheerio';

// RequestQueue auto-reset when stuck with requests in progress
Actor.main(async () => {
    process.env.APIFY_INTERNAL_TIMEOUT = '30000'; // 30s
    log.setLevel(log.LEVELS.DEBUG);
    await purgeLocalStorage();
    const requestQueue = await Actor.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://example.com/?q=1' });
    await requestQueue.addRequest({ url: 'https://example.com/?q=2' });
    const r3 = await requestQueue.addRequest({ url: 'https://example.com/?q=3' });

    // trigger 0 concurrency by marking one of the requests as already in progress
    requestQueue.inProgress.add(r3.requestId);

    const crawler = new CheerioCrawler({
        requestQueue,
        requestHandler: async (ctx) => {
            log.info(ctx.request.id);
        },
    });

    await crawler.run();
}).then(
    () => {},
    () => {},
);
