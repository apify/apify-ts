import { ENV_VARS } from '@apify/consts';
import log from '@apify/log';
import {
    Configuration,
    ProxyConfiguration,
    PuppeteerCookie,
    PuppeteerCrawler,
    PuppeteerGoToOptions,
    PuppeteerRequestHandler,
    PuppeteerRequestHandlerParam,
    Request,
    RequestList,
    RequestQueue,
    Session,
} from '@crawlers/puppeteer';
import { sleep } from '@crawlers/utils';
import { once } from 'events';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import { Server as ProxyChainServer } from 'proxy-chain';
import { promisify } from 'util';
import { createProxyServer } from '../create-proxy-server';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless: string;
    let logLevel: number;
    let localStorageEmulator: LocalStorageDirEmulator;
    let requestList: RequestList;
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
        Configuration.getGlobalConfig().set('localStorageDir', storageDir);
        const sources = ['http://example.com/'];
        requestList = await RequestList.open(`sources-${Math.random() * 10000}`, sources);
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
        const requestListLarge = new RequestList({ sources: sourcesLarge });
        const requestHandler = async ({ page, request, response }: Parameters<PuppeteerRequestHandler>[0]) => {
            await page.waitForSelector('title');
            expect(response.status()).toBe(200);
            request.userData.title = await page.title();
            processed.push(request);
        };

        const puppeteerCrawler = new PuppeteerCrawler({
            requestList: requestListLarge,
            minConcurrency: 1,
            maxConcurrency: 1,
            requestHandler,
            failedRequestHandler: ({ request }) => {
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
        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {},
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
            requestHandler: async () => {},
            gotoFunction: ({ page, request }: PuppeteerRequestHandlerParam, options: PuppeteerGoToOptions) => {
                return page.goto(request.url, options);
            },
        };
        jest.spyOn(functions, 'gotoFunction');
        jest.spyOn(functions, 'requestHandler');
        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: functions.requestHandler,
            gotoFunction: functions.gotoFunction,
        });

        // @ts-expect-error Accessing private method
        expect(puppeteerCrawler.gotoFunction).toEqual(functions.gotoFunction);
        await puppeteerCrawler.run();

        expect(functions.gotoFunction).toBeCalled();
        expect(functions.requestHandler).toBeCalled();
    });

    test('should override goto timeout with navigationTimeoutSecs ', async () => {
        const timeoutSecs = 10;
        let options: PuppeteerGoToOptions;
        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {},
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
            new PuppeteerCrawler({ //eslint-disable-line
                requestList,
                maxRequestRetries: 0,
                maxConcurrency: 1,
                launchContext: {
                    proxyUrl: 'http://localhost@1234',
                },
                requestHandler: () => {},
            });
        } catch (e) {
            expect((e as Error).message).toMatch('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.');
        }

        expect.hasAssertions();
    });

    // FIXME: ~I have no idea why but this test hangs~
    //  -> it hangs because we need to teardown the crawler
    test.skip('supports useChrome option', async () => {
        // const spy = sinon.spy(utils, 'getTypicalChromeExecutablePath');
        const puppeteerCrawler = new PuppeteerCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: {
                useChrome: true,
                launchOptions: {
                    headless: true,
                },
            },
            requestHandler: () => {},
        });

        // expect(spy.calledOnce).toBe(true);
        // spy.restore();
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

        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            launchContext: opts,
            requestHandler: async ({ page }) => {
                loadedUserAgent = await page.evaluate(() => window.navigator.userAgent);
            },
        });

        await puppeteerCrawler.run();

        expect(loadedUserAgent).toEqual(opts.userAgent);
    });

    test('timeout via preNavigationHooks will abort the page function as early as possible (gh #1216)', async () => {
        const requestQueue = await RequestQueue.open();
        await requestQueue.addRequest({ url: 'http://www.example.com' });
        const requestHandler = jest.fn();

        const crawler = new PuppeteerCrawler({
            requestQueue,
            requestHandlerTimeoutSecs: 0.005,
            navigationTimeoutSecs: 0.005,
            preNavigationHooks: [
                async () => {
                    await sleep(20);
                },
            ],
            requestHandler,
        });

        // @ts-expect-error Overriding protected method
        const logSpy = jest.spyOn(crawler.log, 'exception');
        logSpy.mockImplementation(() => {});

        await crawler.run();
        await crawler.teardown();
        await requestQueue.drop();

        expect(requestHandler).not.toBeCalled();
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
        const requestQueue = await RequestQueue.open();
        await requestQueue.addRequest({ url: 'http://www.example.com' });
        const requestHandler = jest.fn();

        const crawler = new PuppeteerCrawler({
            requestQueue,
            navigationTimeoutSecs: 0.005,
            browserPoolOptions: {
                preLaunchHooks: [
                    async () => {
                        // Do some async work that's longer than navigationTimeoutSecs
                        await sleep(20);
                    },
                ],
            },
            requestHandler,
        });

        // @ts-expect-error Overriding protected method
        const logSpy = jest.spyOn(crawler.log, 'exception');
        logSpy.mockImplementation(() => {});

        await crawler.run();
        await crawler.teardown();
        await requestQueue.drop();

        expect(requestHandler).not.toBeCalled();
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

        const puppeteerCrawler = new PuppeteerCrawler({
            requestList,
            useSessionPool: true,
            persistCookiesPerSession: true,
            sessionPoolOptions: {
                createSessionFunction: (sessionPool) => {
                    const session = new Session({ sessionPool });
                    session.setPuppeteerCookies(cookies, 'http://www.example.com');
                    return session;
                },
            },
            requestHandler: async ({ page, session }) => {
                pageCookies = await page.cookies().then((cks) => cks.map((c) => `${c.name}=${c.value}`).join('; '));
                sessionCookies = session.getCookieString('http://www.example.com');
            },
        });

        await puppeteerCrawler.run();

        expect(pageCookies).toEqual(sessionCookies);
    });

    test('proxy rotation', async () => {
        const proxies = new Set();
        const sessions = new Set();
        // @ts-expect-error Property 'port' does not exist on type 'string | AddressInfo'.
        const serverUrl = `http://127.0.0.1:${target.address().port}`;
        const proxyConfiguration = new ProxyConfiguration({
            proxyUrls: [
                `http://127.0.0.2:${servers[0].port}`,
                `http://127.0.0.3:${servers[1].port}`,
                `http://127.0.0.4:${servers[2].port}`,
            ],
        });
        const puppeteerCrawler = new PuppeteerCrawler({
            requestList: await RequestList.open(null, [
                { url: `${serverUrl}/?q=1` },
                { url: `${serverUrl}/?q=2` },
                { url: `${serverUrl}/?q=3` },
            ]),
            launchContext: {
                launchOptions: {
                    headless: true,
                },
            },
            maxConcurrency: 1,
            sessionPoolOptions: {
                sessionOptions: {
                    maxUsageCount: 1,
                },
            },
            proxyConfiguration,
            requestHandler: async ({ proxyInfo, session }) => {
                proxies.add(proxyInfo.url);
                sessions.add(session.id);
            },
        });

        await puppeteerCrawler.run();
        expect(proxies.size).toBe(3); // 3 different proxies used
        expect(sessions.size).toBe(3); // 3 different sessions used
    });

    if (os.platform() !== 'darwin') {
        test('proxy per page', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: [
                    `http://127.0.0.2:${servers[0].port}`,
                    `http://127.0.0.3:${servers[1].port}`,
                    `http://127.0.0.4:${servers[2].port}`,
                ],
            });

            const serverUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;

            const requestListLarge = new RequestList({
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

            const puppeteerCrawler = new PuppeteerCrawler({
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
                requestHandler: async ({ page }) => {
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
    }
});
