import { getStats, run, expect } from '../tools.mjs';

await run(import.meta.url, 'cheerio-scraper', {
    startUrls: [
        { url: 'https://apify.com' },
    ],
    keepUrlFragments: false,
    pseudoUrls: [
        {
            purl: 'https://apify.com[(/[\\w-]+)?]',
        },
    ],
    linkSelector: 'a',
    pageFunction: async function pageFunction(context) {
        const {
            $,
            request,
            log
        } = context;
        const pageTitle = $('title')
            .first()
            .text();
        log.info(`URL: ${request.url} TITLE: ${pageTitle}`);
        return {
            url: request.url,
            pageTitle,
        };
    },
    proxyConfiguration: {
        useApifyProxy: false,
    },
    proxyRotation: 'RECOMMENDED',
    forceResponseEncoding: false,
    ignoreSslErrors: false,
    debugLog: false,
});

const stats = await getStats(import.meta.url);
expect(stats.requestsFinished > 50, 'All requests finished');
process.exit(0);
