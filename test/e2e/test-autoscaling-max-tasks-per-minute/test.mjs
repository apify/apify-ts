import { Actor } from 'apify';
import { BasicCrawler, log as defaultLog, LogLevel } from '@crawlee/basic';
import { expect, initialize } from '../tools.mjs';

await initialize(import.meta.url);

const crawlerLogger = defaultLog.child({
    prefix: 'AutoscalingTest',
    // Set this to false if you want to see verbose output from the autoscaled pool
    level: true ? defaultLog.getOptions().level : LogLevel.PERF,
});

let crawlCalledAt = Date.now();
const crawler = new BasicCrawler({
    log: crawlerLogger,
    autoscaledPoolOptions: {
        maxTasksPerMinute: 1,
    },
    requestHandler({ log }) {
        log.info(`Crawler requestHandler called after ${Date.now() - crawlCalledAt}ms`);
        crawlCalledAt = Date.now();
    },
});

await crawler.addRequests(['https://example.com/1', 'https://example.com/2']);

const start = Date.now();
await Actor.main(() => crawler.run(), { exit: false, purge: true });
const finish = Date.now();

const difference = finish - start;

expect(
    difference >= 60_000 && difference <= 61_000,
    `Ran one task per minute, took ~1 minutes to complete but no more than that (actual: ${difference}ms)`,
);

process.exit(0);
