import { ENV_VARS } from '@apify/consts';
import { BROWSER_POOL_EVENTS, BrowserPool, OperatingSystemsName, PuppeteerPlugin } from '@crawlee/browser-pool';
import type { HTTPResponse } from 'puppeteer';
import puppeteer from 'puppeteer';
import log from '@apify/log';
import type {
    BrowserCrawler,
    BrowserCrawlingContext,
    ProxyInfo,
    PuppeteerCrawlingContext,
    PuppeteerGoToOptions,
    PuppeteerRequestHandler,
} from '@crawlee/puppeteer';
import {
    AutoscaledPool,
    ProxyConfiguration,
    Request,
    RequestList,
    Session,
    STATUS_CODES_BLOCKED,
} from '@crawlee/puppeteer';
import { gotScraping } from 'got-scraping';
import { sleep } from '@crawlee/utils';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';
import { BrowserCrawlerTest } from './basic_browser_crawler';

jest.mock('got-scraping', () => {
    const original: typeof import('got-scraping') = jest.requireActual('got-scraping');
    return {
        ...original,
        gotScraping: jest.fn(),
    };
});

const gotScrapingSpy = gotScraping as jest.MockedFunction<typeof gotScraping>;

afterAll(() => {
    jest.unmock('got-scraping');
});

describe('BrowserCrawler', () => {
    let prevEnvHeadless: string;
    let logLevel: number;
    const localStorageEmulator = new MemoryStorageEmulator();
    let puppeteerPlugin: PuppeteerPlugin;

    beforeAll(async () => {
        prevEnvHeadless = process.env.CRAWLEE_HEADLESS;
        process.env.CRAWLEE_HEADLESS = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
        puppeteerPlugin = new PuppeteerPlugin(puppeteer);
    });

    afterEach(() => {
        puppeteerPlugin = null;
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        process.env.CRAWLEE_HEADLESS = prevEnvHeadless;
        await localStorageEmulator.destroy();
    });

    test('should work', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
            { url: 'http://example.com/?q=2' },
            { url: 'http://example.com/?q=3' },
            { url: 'http://example.com/?q=4' },
            { url: 'http://example.com/?q=5' },
            { url: 'http://example.com/?q=6' },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sources));
        const processed: Request[] = [];
        const failed: Request[] = [];
        const requestList = await RequestList.open(null, sources);
        const requestHandler: PuppeteerRequestHandler = async ({ page, request, response }) => {
            await page.waitForSelector('title');

            expect(response.status()).toBe(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            minConcurrency: 1,
            maxConcurrency: 1,
            requestHandler,
            failedRequestHandler: async ({ request }) => {
                failed.push(request);
            },
        });

        await browserCrawler.run();

        expect(browserCrawler.autoscaledPool.minConcurrency).toBe(1);
        expect(processed).toHaveLength(6);
        expect(failed).toHaveLength(0);

        processed.forEach((request, id) => {
            expect(request.url).toEqual(sourcesCopy[id].url);
            expect(request.userData.title).toBe('Example Domain');
        });
    });
    test('should teardown browser pool', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            requestHandler: async () => {},
            maxRequestRetries: 1,
        });
        jest.spyOn(browserCrawler.browserPool, 'destroy');

        await browserCrawler.run();
        expect(browserCrawler.browserPool.destroy).toBeCalled();
    });

    test('should retire session after TimeoutError', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        class TimeoutError extends Error {}
        let sessionGoto: Session;
        const browserCrawler = new class extends BrowserCrawlerTest {
            protected override _navigationHandler(ctx: PuppeteerCrawlingContext): Promise<HTTPResponse | null | undefined> {
                jest.spyOn(ctx.session, 'markBad');
                sessionGoto = ctx.session;
                throw new TimeoutError();
            }
        }({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            requestHandler: async () => {},
            maxRequestRetries: 1,
        });

        await browserCrawler.run();
        expect(sessionGoto.markBad).toBeCalled();
    });

    test('should evaluate preNavigationHooks', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let isEvaluated = false;

        const browserCrawler = new class extends BrowserCrawlerTest {
            protected override _navigationHandler(ctx: PuppeteerCrawlingContext, gotoOptions: PuppeteerGoToOptions): Promise<HTTPResponse | null | undefined> {
                isEvaluated = ctx.hookFinished as boolean;
                return ctx.page.goto(ctx.request.url, gotoOptions);
            }
        }({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            requestHandler: async () => {},
            maxRequestRetries: 0,
            preNavigationHooks: [
                async (crawlingContext) => {
                    await sleep(10);
                    crawlingContext.hookFinished = true;
                },
            ],
        });

        await browserCrawler.run();

        expect(isEvaluated).toBeTruthy();
    });

    test('should evaluate postNavigationHooks', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let isEvaluated = false;

        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            requestHandler: async ({ hookFinished }) => {
                isEvaluated = hookFinished as boolean;
            },
            maxRequestRetries: 0,
            postNavigationHooks: [
                async (crawlingContext) => {
                    await sleep(10);
                    crawlingContext.hookFinished = true;
                },
            ],
        });

        await browserCrawler.run();

        expect(isEvaluated).toBeTruthy();
    });

    test('should allow modifying gotoOptions by pre navigation hooks', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let optionsGoto: PuppeteerGoToOptions;
        const browserCrawler = new class extends BrowserCrawlerTest {
            protected override _navigationHandler(ctx: PuppeteerCrawlingContext, gotoOptions: PuppeteerGoToOptions): Promise<HTTPResponse | null | undefined> {
                optionsGoto = gotoOptions;
                return ctx.page.goto(ctx.request.url, gotoOptions);
            }
        }({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            requestHandler: async () => {},
            maxRequestRetries: 0,
            preNavigationHooks: [
                async (_crawlingContext, gotoOptions) => {
                    gotoOptions.timeout = 60000;
                },
            ],
        });

        await browserCrawler.run();

        expect(optionsGoto.timeout).toEqual(60000);
    });

    test('should ignore errors in Page.close()', async () => {
        for (let i = 0; i < 2; i++) {
            const requestList = await RequestList.open({
                sources: [
                    { url: 'http://example.com/?q=1' },
                ],
            });
            let failedCalled = false;

            const browserCrawler = new BrowserCrawlerTest({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                requestHandler: ({ page }) => {
                    page.close = async () => {
                        if (i === 0) {
                            throw new Error();
                        } else {
                            return Promise.reject(new Error());
                        }
                    };
                    return Promise.resolve();
                },
                failedRequestHandler: async () => {
                    failedCalled = true;
                },
            });
            await browserCrawler.run();
            expect(failedCalled).toBe(false);
        }
    });

    test('should not throw without SessionPool', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: false,
            requestHandler: async () => {},

        });

        expect(browserCrawler).toBeDefined();
    });

    test('should correctly set session pool options', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });

        const crawler = new BrowserCrawlerTest({
            requestList,
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            useSessionPool: true,
            persistCookiesPerSession: false,
            sessionPoolOptions: {
                sessionOptions: {
                    maxUsageCount: 1,
                },
                persistStateKeyValueStoreId: 'abc',
            },
            requestHandler: async () => {},
        });

        // @ts-expect-error Accessing private prop
        expect(crawler.sessionPoolOptions.sessionOptions.maxUsageCount).toBe(1);
        // @ts-expect-error Accessing private prop
        expect(crawler.sessionPoolOptions.persistStateKeyValueStoreId).toBe('abc');
    });

    test.skip('should persist cookies per session', async () => {
        const name = `list-${Math.random()}`;
        const requestList = await RequestList.open({
            persistStateKey: name,
            persistRequestsKey: name,
            sources: [
                { url: 'http://example.com/?q=1' },
                { url: 'http://example.com/?q=2' },
                { url: 'http://example.com/?q=3' },
                { url: 'http://example.com/?q=4' },
            ],
        });
        const goToPageSessions = [];
        const loadedCookies: string[] = [];
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: true,
            requestHandler: async ({ session, request }) => {
                loadedCookies.push(session.getCookieString(request.url));
                return Promise.resolve();
            },
            preNavigationHooks: [
                async ({ session, page }) => {
                    await page.setCookie({ name: 'TEST', value: '12321312312', domain: 'example.com', expires: Date.now() + 100000 });
                    goToPageSessions.push(session);
                },
            ],
        });

        await browserCrawler.run();
        expect(loadedCookies).toHaveLength(4);

        loadedCookies.forEach((cookie) => {
            // TODO this test is flaky in CI and we need some more info to debug why.
            if (cookie !== 'TEST=12321312312') {
                // for some reason, the CI failures report the first cookie to be just empty string
                // eslint-disable-next-line no-console
                console.log('loadedCookies:');
                // eslint-disable-next-line no-console
                console.dir(loadedCookies);
            }

            expect(cookie).toEqual('TEST=12321312312');
        });
    });

    test('should throw on "blocked" status codes', async () => {
        const baseUrl = 'https://example.com/';
        const sources = STATUS_CODES_BLOCKED.map((statusCode) => {
            return {
                url: baseUrl + statusCode,
                userData: { statusCode },
            };
        });
        const requestList = await RequestList.open(null, sources);

        let called = false;
        const failedRequests: Request[] = [];
        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: false,
            maxRequestRetries: 0,
            requestHandler: async () => {
                called = true;
            },
            failedRequestHandler: async ({ request }) => {
                failedRequests.push(request);
            },
        });

        // @ts-expect-error Overriding protected method
        crawler._navigationHandler = async ({ request }) => {
            return { status: () => request.userData.statusCode };
        };

        await crawler.run();

        expect(failedRequests.length).toBe(STATUS_CODES_BLOCKED.length);
        failedRequests.forEach((fr) => {
            const [msg] = fr.errorMessages;
            expect(msg).toContain(`Request blocked - received ${fr.userData.statusCode} status code.`);
        });
        expect(called).toBe(false);
    });

    test('should throw on "blocked" status codes (retire session)', async () => {
        const baseUrl = 'https://example.com/';
        const sources = STATUS_CODES_BLOCKED.map((statusCode) => {
            return {
                url: baseUrl + statusCode,
                userData: { statusCode },
            };
        });
        const requestList = await RequestList.open(null, sources);

        let called = false;
        const failedRequests: Request[] = [];
        const crawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: false,
            maxRequestRetries: 0,
            requestHandler: async () => {
                called = true;
            },
            failedRequestHandler: async ({ request }) => {
                failedRequests.push(request);
            },
        });

        // @ts-expect-error Overriding protected method
        crawler._navigationHandler = async ({ request }) => {
            return { status: () => request.userData.statusCode };
        };

        await crawler.run();

        expect(failedRequests.length).toBe(STATUS_CODES_BLOCKED.length);
        failedRequests.forEach((fr) => {
            const [msg] = fr.errorMessages;
            expect(msg).toContain(`Request blocked - received ${fr.userData.statusCode} status code.`);
        });
        expect(called).toBe(false);
    });

    test('should retire browser with session', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        let resolve: (value?: unknown) => void;

        const retirementPromise = new Promise((r) => {
            resolve = r;
        });
        let called = false;
        const browserCrawler = new class extends BrowserCrawlerTest {
            protected override _navigationHandler(ctx: PuppeteerCrawlingContext): Promise<HTTPResponse | null | undefined> {
                ctx.crawler.browserPool.on(BROWSER_POOL_EVENTS.BROWSER_RETIRED, () => {
                    resolve();
                    called = true;
                });
                ctx.session.retire();
                return ctx.page.goto(ctx.request.url);
            }
        }({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
            },
            requestList,
            useSessionPool: true,
            requestHandler: async () => {
                await retirementPromise;
            },
            maxRequestRetries: 1,
        });

        await browserCrawler.run();

        expect(called).toBeTruthy();
    });

    test('should allow using fingerprints from browser pool', async () => {
        const requestList = await RequestList.open({
            sources: [
                { url: 'http://example.com/?q=1' },
            ],
        });
        const browserCrawler = new BrowserCrawlerTest({
            browserPoolOptions: {
                browserPlugins: [puppeteerPlugin],
                useFingerprints: true,
                fingerprintOptions: {
                    fingerprintGeneratorOptions: {
                        operatingSystems: [OperatingSystemsName.windows],
                    },
                },
            },
            requestList,
            useSessionPool: false,
            requestHandler: async ({ browserController }) => {
                expect(browserController.launchContext.fingerprint).toBeDefined();
            },
        });

        await browserCrawler.run();
        expect.hasAssertions();
    });

    describe('proxy', () => {
        let requestList: RequestList;
        beforeEach(async () => {
            requestList = await RequestList.open({
                sources: [
                    { url: 'http://example.com/?q=1' },
                    { url: 'http://example.com/?q=2' },
                    { url: 'http://example.com/?q=3' },
                    { url: 'http://example.com/?q=4' },
                ],
            });
        });

        afterEach(() => {
            requestList = null;
        });

        // TODO move to actor sdk tests before splitting the repos
        // test('browser should launch with correct proxyUrl', async () => {
        //     process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        //     const status = { connected: true };
        //     const fakeCall = async () => {
        //         return { body: status } as never;
        //     };
        //
        //     // @ts-expect-error FIXME
        //     const stub = gotScrapingSpy.mockImplementation(fakeCall);
        //     const proxyConfiguration = await Actor.createProxyConfiguration();
        //     const generatedProxyUrl = new URL(await proxyConfiguration.newUrl()).href.slice(0, -1);
        //     let browserProxy;
        //
        //     const browserCrawler = new BrowserCrawlerTest({
        //         browserPoolOptions: {
        //             browserPlugins: [puppeteerPlugin],
        //             postLaunchHooks: [(pageId, browserController) => {
        //                 browserProxy = browserController.launchContext.proxyUrl;
        //             }],
        //         },
        //         useSessionPool: false,
        //         persistCookiesPerSession: false,
        //         navigationTimeoutSecs: 1,
        //         requestList,
        //         maxRequestsPerCrawl: 1,
        //         maxRequestRetries: 0,
        //         requestHandler: async () => {},
        //         proxyConfiguration,
        //     });
        //     await browserCrawler.run();
        //     delete process.env[ENV_VARS.PROXY_PASSWORD];
        //
        //     expect(browserProxy).toEqual(generatedProxyUrl);
        //
        //     stub.mockClear();
        // });

        // TODO move to actor sdk tests before splitting the repos
        // test('requestHandler should expose the proxyInfo object with sessions correctly', async () => {
        //     process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        //     const status = { connected: true };
        //     const fakeCall = async () => {
        //         return { body: status } as never;
        //     };
        //
        //     // @ts-expect-error FIXME
        //     const stub = gotScrapingSpy.mockImplementation(fakeCall);
        //
        //     const proxyConfiguration = await Actor.createProxyConfiguration();
        //     const proxies: ProxyInfo[] = [];
        //     const sessions: Session[] = [];
        //     const requestHandler = async ({ session, proxyInfo }: BrowserCrawlingContext) => {
        //         proxies.push(proxyInfo);
        //         sessions.push(session);
        //     };
        //
        //     const browserCrawler = new BrowserCrawlerTest({
        //         browserPoolOptions: {
        //             browserPlugins: [puppeteerPlugin],
        //         },
        //         requestList,
        //         requestHandler,
        //
        //         proxyConfiguration,
        //         useSessionPool: true,
        //         sessionPoolOptions: {
        //             maxPoolSize: 1,
        //         },
        //     });
        //
        //     await browserCrawler.run();
        //
        //     expect(proxies[0].sessionId).toEqual(sessions[0].id);
        //     expect(proxies[1].sessionId).toEqual(sessions[1].id);
        //     expect(proxies[2].sessionId).toEqual(sessions[2].id);
        //     expect(proxies[3].sessionId).toEqual(sessions[3].id);
        //
        //     delete process.env[ENV_VARS.PROXY_PASSWORD];
        //     stub.mockClear();
        // });

        test('browser should launch with rotated custom proxy', async () => {
            process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';

            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const browserProxies: string[] = [];

            const browserCrawler = new BrowserCrawlerTest({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                    maxOpenPagesPerBrowser: 1,
                    retireBrowserAfterPageCount: 1,
                },
                requestList,
                requestHandler: async () => {
                },
                proxyConfiguration,
                maxRequestRetries: 0,
                maxConcurrency: 1,
            });

            browserCrawler.browserPool.postLaunchHooks.push((_pageId, browserController) => {
                browserProxies.push(browserController.launchContext.proxyUrl);
            });

            await browserCrawler.run();

            // @ts-expect-error Accessing private property
            const proxiesToUse = proxyConfiguration.proxyUrls;
            for (const proxyUrl of proxiesToUse) {
                expect(browserProxies.includes(new URL(proxyUrl).href.slice(0, -1))).toBeTruthy();
            }

            delete process.env[ENV_VARS.PROXY_PASSWORD];
        });
    });
    describe('Crawling context', () => {
        const sources = ['http://example.com/'];
        let requestList: RequestList;
        let actualLogLevel: number;
        beforeEach(async () => {
            actualLogLevel = log.getLevel();
            log.setLevel(log.LEVELS.OFF);
            requestList = await RequestList.open(null, sources.slice());
        });

        afterAll(() => {
            log.setLevel(actualLogLevel);
        });

        test('uses correct crawling context', async () => {
            let prepareCrawlingContext: BrowserCrawlingContext;

            const gotoFunction = async (crawlingContext: BrowserCrawlingContext) => {
                prepareCrawlingContext = crawlingContext;
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.page).toBe('object');
            };

            const requestHandler = async (crawlingContext: BrowserCrawlingContext) => {
                expect(crawlingContext === prepareCrawlingContext).toEqual(true);
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.page).toBe('object');
                expect(crawlingContext.crawler).toBeInstanceOf(BrowserCrawlerTest);
                expect(crawlingContext.hasOwnProperty('response')).toBe(true);

                throw new Error('some error');
            };

            const failedRequestHandler = async (crawlingContext: BrowserCrawlingContext, error: Error) => {
                expect(crawlingContext).toBe(prepareCrawlingContext);
                expect(crawlingContext.request).toBeInstanceOf(Request);
                expect(crawlingContext.crawler.autoscaledPool).toBeInstanceOf(AutoscaledPool);
                expect(crawlingContext.session).toBeInstanceOf(Session);
                expect(typeof crawlingContext.page).toBe('object');
                expect(crawlingContext.crawler).toBeInstanceOf(BrowserCrawlerTest);
                expect((crawlingContext.crawler as BrowserCrawler).browserPool).toBeInstanceOf(BrowserPool);
                expect(crawlingContext.hasOwnProperty('response')).toBe(true);

                expect(crawlingContext.error).toBeUndefined();
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toEqual('some error');
            };

            const browserCrawler = new BrowserCrawlerTest({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                useSessionPool: true,
                requestHandler,
                failedRequestHandler,
            });
            // @ts-expect-error Overriding protected method
            browserCrawler._navigationHandler = gotoFunction;

            await browserCrawler.run();
        });

        test('failedRequestHandler contains proxyInfo', async () => {
            const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://localhost'] });

            const browserCrawler = new BrowserCrawlerTest({
                browserPoolOptions: {
                    browserPlugins: [puppeteerPlugin],
                },
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                useSessionPool: true,
                proxyConfiguration,
                requestHandler: async () => {
                    throw new Error('some error');
                },
                failedRequestHandler: async (crawlingContext) => {
                    expect(typeof crawlingContext.proxyInfo).toEqual('object');
                    expect(crawlingContext.proxyInfo.hasOwnProperty('url')).toEqual(true);
                },
            });

            await browserCrawler.run();
        });
    });
});
