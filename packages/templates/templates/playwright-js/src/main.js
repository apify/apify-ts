// For more information, see https://crawlee.dev/
import { KeyValueStore, PlaywrightCrawler, ProxyConfiguration, log } from 'crawlee';
import { router } from './routes.js';

const { startUrls = [], debug } = await KeyValueStore.getInput() ?? {};

if (debug) {
    log.setLevel(log.LEVELS.DEBUG);
}

const crawler = new PlaywrightCrawler({
    // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
    // Be nice to the websites. Remove to unleash full power.
    maxConcurrency: 50,
    requestHandler: router,
});

await crawler.addRequests(startUrls);

log.info('Starting the crawl.');
await crawler.run();
log.info('Crawl finished.');
