import log from '@apify/log';
import { CheerioRoot } from '@crawlers/utils';
import cheerio from 'cheerio';
import {
    browserCrawlerEnqueueLinks,
    cheerioCrawlerEnqueueLinks,
    Configuration,
    EnqueueStrategy,
    launchPlaywright,
    launchPuppeteer,
    PseudoUrl,
    Request,
    RequestOptions,
    RequestQueue,
} from 'crawlers';
import { Browser as PlaywrightBrowser, Page as PlaywrightPage } from 'playwright';
import { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer';

const apifyClient = Configuration.getStorageClient();

const HTML = `
<html>
    <head>
        <title>Example</title>
    </head>
    <body>
        <p>
            The ships hung in the sky, much the <a class="click" href="https://example.com/a/b/first">way that</a> bricks don't.
        </p>
        <ul>
            <li>These aren't the Droids you're looking for</li>
            <li><a href="https://example.com/a/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
            <li><a class="click" href="https://example.com/a/b/third">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
        <a class="click" href="https://another.com/a/fifth">The Greatest Science Fiction Quotes Of All Time</a>
        <p>
            Don't know, I don't know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design,
            just eyes. You Nexus, huh? I design your <a class="click" href="http://cool.com/">eyes</a>.
        </p>
        <a href="/x/absolutepath">This is a relative link.</a>
        <a href="y/relativepath">This is a relative link.</a>
        <a href="//example.absolute.com/hello">This is a link to a different subdomain</a>
    </body>
</html>
`;

describe('enqueueLinks()', () => {
    let ll: number;
    beforeAll(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterAll(() => {
        log.setLevel(ll);
    });

    describe.each([
        [launchPuppeteer],
        [launchPlaywright],
    ] as const)('using %s', (method) => {
        let browser: PuppeteerBrowser | PlaywrightBrowser;
        let page: PuppeteerPage | PlaywrightPage;

        beforeEach(async () => {
            browser = await method({ launchOptions: { headless: true } }) as PlaywrightBrowser | PuppeteerBrowser;
            page = await browser.newPage();
            await page.setContent(HTML);
        });

        afterEach(async () => {
            if (browser) await browser.close();
            page = null;
            browser = null;
        });

        test('works with item limit', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await browserCrawlerEnqueueLinks({
                options: { limit: 3, selector: '.click' },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3]).toBe(undefined);
        });

        test('works with PseudoUrl instances', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            const pseudoUrls = [
                new PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                new PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData.foo).toBe('bar');
        });

        test('works with Actor UI output object', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            const pseudoUrls = [
                { purl: 'https://example.com/[(\\w|-|/)*]', method: 'POST' as const },
                { purl: '[http|https]://cool.com/', userData: { foo: 'bar' } },
            ];

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData.foo).toBe('bar');
        });

        test('works with string pseudoUrls', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            const pseudoUrls = [
                'https://example.com/[(\\w|-|/)*]',
                '[http|https]://cool.com/',
            ];

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('works with RegExp pseudoUrls', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            const pseudoUrls = [
                /https:\/\/example\.com\/(\w|-|\/)*/,
                /(http|https):\/\/cool\.com\//,
            ];

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('works with undefined pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click' },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('works with null pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls: null },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('works with empty pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await browserCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls: [] },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('throws with sparse pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            const pseudoUrls = [
                new PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                null,
                new PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            try {
                await browserCrawlerEnqueueLinks({
                    options: { selector: '.click', pseudoUrls },
                    page,
                    requestQueue,
                });
                throw new Error('Wrong error.');
            } catch (err) {
                expect((err as Error).message).toMatch('(array `pseudoUrls`) Any predicate failed with the following errors');
                expect(enqueued).toHaveLength(0);
            }
        });

        test('correctly resolves relative URLs with default strategy of same-subdomain', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await browserCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/' },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(2);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the strategy of same-hostname', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await browserCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.SameHostname },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the strategy of all', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await browserCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.All },
                page,
                requestQueue,
            });

            expect(enqueued).toHaveLength(8);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/second');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://example.com/a/b/third');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('https://another.com/a/fifth');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});

            expect(enqueued[4].url).toBe('http://cool.com/');
            expect(enqueued[4].method).toBe('GET');
            expect(enqueued[4].userData).toEqual({});

            expect(enqueued[5].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[5].method).toBe('GET');
            expect(enqueued[5].userData).toEqual({});

            expect(enqueued[6].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[6].method).toBe('GET');
            expect(enqueued[6].userData).toEqual({});

            expect(enqueued[7].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[7].method).toBe('GET');
            expect(enqueued[7].userData).toEqual({});
        });
    });

    describe('using Cheerio', () => {
        let $: CheerioRoot;

        beforeEach(async () => {
            $ = cheerio.load(HTML);
        });

        afterEach(async () => {
            $ = null;
        });

        test('works from utils namespace', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            const pseudoUrls = [
                new PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                new PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData.foo).toBe('bar');
        });

        test('works with PseudoUrl instances', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            const pseudoUrls = [
                new PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                new PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData.foo).toBe('bar');
        });

        test('works with Actor UI output object', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            const pseudoUrls = [
                { purl: 'https://example.com/[(\\w|-|/)*]', method: 'POST' as const },
                { purl: '[http|https]://cool.com/', userData: { foo: 'bar' } },
            ];

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('POST');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('POST');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData.foo).toBe('bar');
        });

        test('works with string pseudoUrls', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            const pseudoUrls = [
                'https://example.com/[(\\w|-|/)*]',
                '[http|https]://cool.com/',
            ];

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('works with RegExp pseudoUrls', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            const pseudoUrls = [
                /https:\/\/example\.com\/(\w|-|\/)*/,
                /(http|https):\/\/cool\.com\//,
            ];

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://cool.com/');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('works with undefined pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click' },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('works with null pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls: null },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('works with empty pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await cheerioCrawlerEnqueueLinks({
                options: { selector: '.click', pseudoUrls: [] },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(4);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/b/third');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://another.com/a/fifth');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('http://cool.com/');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});
        });

        test('throws with sparse pseudoUrls[]', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            const pseudoUrls = [
                new PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                null,
                new PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            try {
                await cheerioCrawlerEnqueueLinks({
                    options: { selector: '.click', pseudoUrls },
                    $,
                    requestQueue,
                });
                throw new Error('Wrong error.');
            } catch (err) {
                expect((err as Error).message).toMatch('(array `pseudoUrls`) Any predicate failed with the following errors');
                expect(enqueued).toHaveLength(0);
            }
        });

        test('correctly resolves relative URLs with the strategy of all', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await cheerioCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.All },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(8);

            expect(enqueued[0].url).toBe('https://example.com/a/b/first');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('https://example.com/a/second');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('https://example.com/a/b/third');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});

            expect(enqueued[3].url).toBe('https://another.com/a/fifth');
            expect(enqueued[3].method).toBe('GET');
            expect(enqueued[3].userData).toEqual({});

            expect(enqueued[4].url).toBe('http://cool.com/');
            expect(enqueued[4].method).toBe('GET');
            expect(enqueued[4].userData).toEqual({});

            expect(enqueued[5].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[5].method).toBe('GET');
            expect(enqueued[5].userData).toEqual({});

            expect(enqueued[6].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[6].method).toBe('GET');
            expect(enqueued[6].userData).toEqual({});

            expect(enqueued[7].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[7].method).toBe('GET');
            expect(enqueued[7].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the default strategy of same-subdomain', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await cheerioCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/' },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(2);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});
        });

        test('correctly resolves relative URLs with the strategy of same-hostname', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };

            await cheerioCrawlerEnqueueLinks({
                options: { baseUrl: 'http://www.absolute.com/removethis/', strategy: EnqueueStrategy.SameHostname },
                $,
                requestQueue,
            });

            expect(enqueued).toHaveLength(3);

            expect(enqueued[0].url).toBe('http://www.absolute.com/x/absolutepath');
            expect(enqueued[0].method).toBe('GET');
            expect(enqueued[0].userData).toEqual({});

            expect(enqueued[1].url).toBe('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[1].method).toBe('GET');
            expect(enqueued[1].userData).toEqual({});

            expect(enqueued[2].url).toBe('http://example.absolute.com/hello');
            expect(enqueued[2].method).toBe('GET');
            expect(enqueued[2].userData).toEqual({});
        });

        test('throws on finding a relative link with no baseUrl set', async () => {
            const enqueued: (Request | RequestOptions)[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });
            // @ts-expect-error Override method for testing
            requestQueue.addRequests = async (request) => {
                enqueued.push(...request);
            };
            try {
                await cheerioCrawlerEnqueueLinks({
                    options: {},
                    $,
                    requestQueue,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('/x/absolutepath');
            }
            expect(enqueued).toHaveLength(0);
        });
    });
});
