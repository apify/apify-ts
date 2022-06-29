// For more information, see https://crawlee.dev/
import { CheerioCrawler, KeyValueStore, log, ProxyConfiguration } from 'crawlee';
import { router } from './routes.js';

interface InputSchema {
    startUrls: string[];
    debug?: boolean;
}

const { startUrls = [], debug } = await KeyValueStore.getInput<InputSchema>() ?? {};

log.setLevel(log.LEVELS.DEBUG);
if (debug) {
    log.setLevel(log.LEVELS.DEBUG);
}

const crawler = new CheerioCrawler({
    // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
    // Be nice to the websites. Remove to unleash full power.
    maxConcurrency: 50,
    requestHandler: router,
});

await crawler.addRequests(startUrls);

log.info('Starting the crawl.');
await crawler.run();
log.info('Crawl finished.');
