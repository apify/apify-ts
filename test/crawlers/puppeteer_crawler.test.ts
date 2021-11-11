import { ENV_VARS } from '@apify/consts';
import sinon from 'sinon';
import log from 'apify/src/utils_log';
import Apify, { BrowserCrawlingContext, PuppeteerCookie, PuppeteerHandlePage, PuppeteerHandlePageFunctionParam } from 'apify';
import * as utils from 'apify/src/utils';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

describe('PuppeteerCrawler', () => {
    let prevEnvHeadless;
    let logLevel;
    let localStorageEmulator;
    let requestList;

    beforeAll(async () => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();
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
        const processed = [];
        const failed = [];
        const requestListLarge = new Apify.RequestList({ sources: sourcesLarge });
        const handlePageFunction = async ({ page, request, response }: Parameters<PuppeteerHandlePage>[0]) => {
            await page.waitForSelector('title');

            // TODO: response is typed as IncomingMessage
            // @ts-expect-error
            expect(await response.status()).toBe(200);
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
        let options;
        const puppeteerCrawler = new Apify.PuppeteerCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            handlePageFunction: () => {},
            preNavigationHooks: [(_context, gotoOptions) => {
                options = gotoOptions;
            }],
            // TODO: gotoTimeoutSecs does not exist in PuppeteerCrawlerOptions
            // @ts-expect-error
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
            gotoFunction: ({ page, request }: PuppeteerHandlePageFunctionParam, options) => {
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
        let options;
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
            expect(e.message).toMatch('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.');
        }

        expect.hasAssertions();
    });

    test('supports useChrome option', async () => {
        const spy = sinon.spy(utils, 'getTypicalChromeExecutablePath');
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
            // TODO: persistCookiesPerSession is missing
            // @ts-expect-error
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
