import { ENV_VARS } from '@apify/consts';
import sinon from 'sinon';
import log from 'apify/src/utils_log';
import Apify, {
    ProxyConfiguration,
    PuppeteerCookie,
    PuppeteerGoToOptions,
    PuppeteerHandlePage,
    PuppeteerHandlePageFunctionParam,
    Request,
} from 'apify';
import * as utils from 'apify/src/utils';
import { createServer, Server } from 'http';
import { Server as ProxyChainServer } from 'proxy-chain';
import { promisify } from 'util';
import { once } from 'events';
import { AddressInfo } from 'net';
import { createProxyServer } from '../create-proxy-server';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless: string;
    let logLevel: number;
    let localStorageEmulator: LocalStorageDirEmulator;
    let requestList: Apify.RequestList;
    let servers: ProxyChainServer[];
    let target: Server;

    beforeAll(async () => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();

        target = createServer((request, response) => {
            response.end(request.socket.remoteAddress);
        });

        target.listen(0, '127.0.0.1');
        await once(target, 'listening');

        servers = [
            createProxyServer('127.0.0.2', '', ''),
            createProxyServer('127.0.0.3', '', ''),
            createProxyServer('127.0.0.4', '', ''),
        ];

        await Promise.all(servers.map((server) => server.listen()));
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Apify.Configuration.getGlobalConfig().set('localStorageDir', storageDir);
        const sources = ['http://example.com/'];
        requestList = await Apify.openRequestList(`sources-${Math.random() * 10000}`, sources);
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
        await localStorageEmulator.destroy();

        await Promise.all(servers.map((server) => promisify(server.close.bind(server))(true)));
        await promisify(target.close.bind(target))();
    });

    test('should work', async () => {
        const sourcesLarge = [
            { url: 'http://example.com/?q=1' },
            { url: 'http://example.com/?q=2' },
            { url: 'http://example.com/?q=3' },
            { url: 'http://example.com/?q=4' },
            { url: 'http://example.com/?q=5' },
            { url: 'http://example.com/?q=6' },
        ];
        const sourcesCopy = JSON.parse(JSON.stringify(sourcesLarge));
        const processed: Request[] = [];
        const failed: Request[] = [];
        const requestListLarge = new Apify.RequestList({ sources: sourcesLarge });
        const handlePageFunction = async ({ page, request, response }: Parameters<PuppeteerHandlePage>[0]) => {
            await page.waitForSelector('title');
            expect(response.status()).toBe(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList: requestListLarge,
            minConcurrency: 1,
            maxConcurrency: 1,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => {
                failed.push(request);
            },
        });

        await requestListLarge.initialize();
        await puppeteerCrawler.run();

        expect(puppeteerCrawler.autoscaledPool.minConcurrency).toBe(1);
        expect(processed).toHaveLength(6);
        expect(failed).toHaveLength(0);

        processed.forEach((request, id) => {
            expect(request.url).toEqual(sourcesCopy[id].url);
            expect(request.userData.title).toBe('Example Domain');
        });
    });

    test('should override goto timeout with gotoTimeoutSecs ', async () => {
        const timeoutSecs = 10;
        let options: PuppeteerGoToOptions;
        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            handlePageFunction: () => {},
            preNavigationHooks: [(_context, gotoOptions) => {
                options = gotoOptions;
            }],
            gotoTimeoutSecs: timeoutSecs,
        });

        // @ts-expect-error Accessing private prop
        expect(puppeteerCrawler.defaultGotoOptions.timeout).toEqual(timeoutSecs * 1000);
        await puppeteerCrawler.run();

        expect(options.timeout).toEqual(timeoutSecs * 1000);
    });

    test('should support custom gotoFunction', async () => {
        const functions = {
            handlePageFunction: async () => {},
            gotoFunction: ({ page, request }: PuppeteerHandlePageFunctionParam, options: PuppeteerGoToOptions) => {
                return page.goto(request.url, options);
            },
        };
        jest.spyOn(functions, 'gotoFunction');
        jest.spyOn(functions, 'handlePageFunction');
        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            handlePageFunction: functions.handlePageFunction,
            gotoFunction: functions.gotoFunction,
        });

        // @ts-expect-error Accessing private method
        expect(puppeteerCrawler.gotoFunction).toEqual(functions.gotoFunction);
        await puppeteerCrawler.run();

        expect(functions.gotoFunction).toBeCalled();
        expect(functions.handlePageFunction).toBeCalled();
    });

    test('should override goto timeout with navigationTimeoutSecs ', async () => {
        const timeoutSecs = 10;
        let options: PuppeteerGoToOptions;
        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            handlePageFunction: () => {},
            preNavigationHooks: [(_context, gotoOptions) => {
                options = gotoOptions;
            }],
            navigationTimeoutSecs: timeoutSecs,
        });

        // @ts-expect-error Accessing private method
        expect(puppeteerCrawler.defaultGotoOptions.timeout).toEqual(timeoutSecs * 1000);
        await puppeteerCrawler.run();

        expect(options.timeout).toEqual(timeoutSecs * 1000);
    });

    test('should throw if launchOptions.proxyUrl is supplied', async () => {
        try {
            new Apify.PuppeteerCrawler({ //eslint-disable-line
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                launchContext: {
                    proxyUrl: 'http://localhost@1234',
                },
                handlePageFunction: () => {},
            });
        } catch (e) {
            expect((e as Error).message).toMatch('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.');
        }

        expect.hasAssertions();
    });

    // FIXME: I have no idea why but this test hangs
    test.skip('supports useChrome option', async () => {
        const spy = sinon.spy(utils, 'getTypicalChromeExecutablePath');
        // @ts-expect-error
        const puppeteerCrawler = new Apify.PuppeteerCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: {
                useChrome: true,
                launchOptions: {
                    headless: true,
                },
            },
            handlePageFunction: () => {},
        });

        expect(spy.calledOnce).toBe(true);
        spy.restore();
    });

    test('proxy per page', async () => {
        const proxyConfiguration = new ProxyConfiguration({
            proxyUrls: [
                `http://127.0.0.2:${servers[0].port}`,
                `http://127.0.0.3:${servers[1].port}`,
                `http://127.0.0.4:${servers[2].port}`,
            ],
        });

        const serverUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;

        const requestListLarge = new Apify.RequestList({
            sources: [
                { url: `${serverUrl}/?q=1` },
                { url: `${serverUrl}/?q=2` },
                { url: `${serverUrl}/?q=3` },
                { url: `${serverUrl}/?q=4` },
                { url: `${serverUrl}/?q=5` },
                { url: `${serverUrl}/?q=6` },
            ],
        });

        const count = {
            2: 0,
            3: 0,
            4: 0,
        };

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList: requestListLarge,
            useSessionPool: true,
            launchContext: {
                useIncognitoPages: true,
            },
            browserPoolOptions: {
                prePageCreateHooks: [
                    (_id, _controller, options) => {
                        options.proxyBypassList = ['<-loopback>'];
                    },
                ],
            },
            proxyConfiguration,
            handlePageFunction: async ({ page }) => {
                const content = await page.content();

                if (content.includes('127.0.0.2')) {
                    count[2]++;
                } else if (content.includes('127.0.0.3')) {
                    count[3]++;
                } else if (content.includes('127.0.0.4')) {
                    count[4]++;
                }
            },
        });

        await requestListLarge.initialize();
        await puppeteerCrawler.run();

        expect(count[2]).toBeGreaterThan(0);
        expect(count[3]).toBeGreaterThan(0);
        expect(count[4]).toBeGreaterThan(0);
        expect(count[2] + count[3] + count[4]).toBe(6);
    });

    test('supports userAgent option', async () => {
        const opts = {
            // Have space in user-agent to test passing of params
            userAgent: 'MyUserAgent/1234 AnotherString/456',
            launchOptions: {
                headless: true,
            },
        };
        let loadedUserAgent;

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: opts,
            handlePageFunction: async ({ page }) => {
                loadedUserAgent = await page.evaluate(() => window.navigator.userAgent);
            },
        });

        await puppeteerCrawler.run();

        expect(loadedUserAgent).toEqual(opts.userAgent);
    });

    test('timeout via preNavigationHooks will abort the page function as early as possible (gh #1216)', async () => {
        const requestQueue = await Apify.openRequestQueue();
        await requestQueue.addRequest({ url: 'http://www.example.com' });
        const handlePageFunction = jest.fn();

        const crawler = new Apify.PuppeteerCrawler({
            requestQueue,
            handlePageTimeoutSecs: 0.005,
            navigationTimeoutSecs: 0.005,
            preNavigationHooks: [
                async () => {
                    await Apify.utils.sleep(20);
                },
            ],
            handlePageFunction,
        });

        // @ts-expect-error Overriding protected method
        const logSpy = jest.spyOn(crawler.log, 'exception');
        logSpy.mockImplementation(() => {});

        await crawler.run();
        await crawler.teardown();
        await requestQueue.drop();

        expect(handlePageFunction).not.toBeCalled();
        const exceptions = logSpy.mock.calls.map((call) => [call[0].message, call[1], call[2].retryCount]);
        expect(exceptions).toEqual([
            [
                'Navigation timed out after 0.005 seconds.',
                'handleRequestFunction failed, reclaiming failed request back to the list or queue',
                1,
            ],
            [
                'Navigation timed out after 0.005 seconds.',
                'handleRequestFunction failed, reclaiming failed request back to the list or queue',
                2,
            ],
            [
                'Navigation timed out after 0.005 seconds.',
                'handleRequestFunction failed, reclaiming failed request back to the list or queue',
                3,
            ],
            [
                'Navigation timed out after 0.005 seconds.',
                'Request failed and reached maximum retries',
                undefined,
            ],
        ]);
        logSpy.mockRestore();
    });

    test('timeout in preLaunchHooks will abort the page function as early as possible (gh #1216)', async () => {
        const requestQueue = await Apify.openRequestQueue();
        await requestQueue.addRequest({ url: 'http://www.example.com' });
        const handlePageFunction = jest.fn();

        const crawler = new Apify.PuppeteerCrawler({
            requestQueue,
            navigationTimeoutSecs: 0.005,
            browserPoolOptions: {
                preLaunchHooks: [
                    async () => {
                        // Do some async work that's longer than navigationTimeoutSecs
                        await Apify.utils.sleep(20);
                    },
                ],
            },
            handlePageFunction,
        });

        // @ts-expect-error Overriding protected method
        const logSpy = jest.spyOn(crawler.log, 'exception');
        logSpy.mockImplementation(() => {});

        await crawler.run();
        await crawler.teardown();
        await requestQueue.drop();

        expect(handlePageFunction).not.toBeCalled();
        const exceptions = logSpy.mock.calls.map((call) => [call[0].message, call[1], call[2].retryCount]);
        expect(exceptions).toEqual([
            [
                'Navigation timed out after 0.005 seconds.',
                'handleRequestFunction failed, reclaiming failed request back to the list or queue',
                1,
            ],
            [
                'Navigation timed out after 0.005 seconds.',
                'handleRequestFunction failed, reclaiming failed request back to the list or queue',
                2,
            ],
            [
                'Navigation timed out after 0.005 seconds.',
                'handleRequestFunction failed, reclaiming failed request back to the list or queue',
                3,
            ],
            [
                'Navigation timed out after 0.005 seconds.',
                'Request failed and reached maximum retries',
                undefined,
            ],
        ]);
        logSpy.mockRestore();
    });

    test('should set cookies assigned to session to page', async () => {
        const cookies: PuppeteerCookie[] = [
            {
                name: 'example_cookie_name',
                domain: '.example.com',
                value: 'example_cookie_value',
                expires: -1,
            } as never,
        ];

        let pageCookies;
        let sessionCookies;

        const puppeteerCrawler = new Apify.PuppeteerCrawler({
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: true,
            sessionPoolOptions: {
                createSessionFunction: (sessionPool) => {
                    const session = new Apify.Session({ sessionPool });
                    session.setPuppeteerCookies(cookies, 'http://www.example.com');
                    return session;
                },
            },
            handlePageFunction: async ({ page, session }) => {
                pageCookies = await page.cookies().then((cks) => cks.map((c) => `${c.name}=${c.value}`).join('; '));
                sessionCookies = session.getCookieString('http://www.example.com');
            },
        });

        await puppeteerCrawler.run();

        expect(pageCookies).toEqual(sessionCookies);
    });
});
