import { ENV_VARS } from '@apify/consts';
import os from 'os';
import express from 'express';
import playwright from 'playwright';
import log from '@apify/log';
import {
    Configuration,
    PlaywrightCrawler,
    PlaywrightGotoOptions,
    PlaywrightRequestHandler,
    PlaywrightRequestHandlerParam,
    Request,
    RequestList,
} from '@crawlee/playwright';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { startExpressAppPromise } from '../../shared/_helper';
import { LocalStorageDirEmulator } from '../local_storage_dir_emulator';

if (os.platform() === 'win32') jest.setTimeout(2 * 60 * 1e3);

describe('PlaywrightCrawler', () => {
    let prevEnvHeadless: string;
    let logLevel: number;
    let localStorageEmulator: LocalStorageDirEmulator;
    let requestList: RequestList;

    const HOSTNAME = '127.0.0.1';
    let port: number;
    let server: Server;

    beforeAll(async () => {
        const app = express();
        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;
        app.get('/', (req, res) => {
            res.send(`<html><head><title>Example Domain</title></head></html>`);
            res.status(200);
        });
    });

    beforeAll(async () => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();
    });
    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Configuration.getGlobalConfig().set('storageClientOptions', { storageDir });
        const sources = [`http://${HOSTNAME}:${[port]}/`];
        requestList = await RequestList.open(`sources-${Math.random() * 10000}`, sources);
    });
    afterAll(async () => {
        log.setLevel(logLevel);
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
        await localStorageEmulator.destroy();
    });
    afterAll(async () => {
        server.close();
    });

    jest.setTimeout(2 * 60 * 1e3);
    describe('should work', () => {
        // @TODO: add webkit
        test.each(['chromium', 'firefox'] as const)('with %s', async (browser) => {
            const sourcesLarge = [
                { url: `http://${HOSTNAME}:${port}/?q=1` },
                { url: `http://${HOSTNAME}:${port}/?q=2` },
                { url: `http://${HOSTNAME}:${port}/?q=3` },
                { url: `http://${HOSTNAME}:${port}/?q=4` },
                { url: `http://${HOSTNAME}:${port}/?q=5` },
                { url: `http://${HOSTNAME}:${port}/?q=6` },
            ];
            const sourcesCopy = JSON.parse(JSON.stringify(sourcesLarge));
            const processed: Request[] = [];
            const failed: Request[] = [];
            const requestListLarge = new RequestList({ sources: sourcesLarge });
            const requestHandler = async ({ page, request, response }: Parameters<PlaywrightRequestHandler>[0]) => {
                expect(response.status()).toBe(200);
                request.userData.title = await page.title();
                processed.push(request);
            };

            const playwrightCrawler = new PlaywrightCrawler({
                launchContext: {
                    launcher: playwright[browser],
                },
                requestList: requestListLarge,
                minConcurrency: 1,
                maxConcurrency: 1,
                requestHandler,
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await requestListLarge.initialize();
            await playwrightCrawler.run();

            expect(playwrightCrawler.autoscaledPool.minConcurrency).toBe(1);
            expect(processed).toHaveLength(6);
            expect(failed).toHaveLength(0);

            processed.forEach((request, id) => {
                expect(request.url).toEqual(sourcesCopy[id].url);
                expect(request.userData.title).toBe('Example Domain');
            });
        });
    });

    test('should override goto timeout with gotoTimeoutSecs', async () => {
        const timeoutSecs = 10;
        let options: PlaywrightGotoOptions;
        const playwrightCrawler = new PlaywrightCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {
            },
            preNavigationHooks: [(_context, gotoOptions) => {
                options = gotoOptions;
            }],
            gotoTimeoutSecs: timeoutSecs,
        });

        // @ts-expect-error Accessing private prop
        expect(playwrightCrawler.defaultGotoOptions.timeout).toEqual(timeoutSecs * 1000);
        await playwrightCrawler.run();

        expect(options.timeout).toEqual(timeoutSecs * 1000);

        expect.hasAssertions();
    });
    test('should support custom gotoFunction', async () => {
        const functions = {
            requestHandler: () => { },
            gotoFunction: ({ page, request }: PlaywrightRequestHandlerParam, options: PlaywrightGotoOptions) => {
                return page.goto(request.url, options);
            },
        };
        jest.spyOn(functions, 'gotoFunction');
        jest.spyOn(functions, 'requestHandler');
        const playwrightCrawler = new PlaywrightCrawler({ //eslint-disable-line
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: functions.requestHandler,
            gotoFunction: functions.gotoFunction,
        });

        // @ts-expect-error Accessing private method
        expect(playwrightCrawler.gotoFunction).toEqual(functions.gotoFunction);
        await playwrightCrawler.run();

        expect(functions.gotoFunction).toBeCalled();
        expect(functions.requestHandler).toBeCalled();
    });

    test('should override goto timeout with navigationTimeoutSecs', async () => {
        const timeoutSecs = 10;
        let options: PlaywrightGotoOptions;
        const playwrightCrawler = new PlaywrightCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {
            },
            preNavigationHooks: [(_context, gotoOptions) => {
                options = gotoOptions;
            }],
            navigationTimeoutSecs: timeoutSecs,
        });

        // @ts-expect-error Accessing private prop
        expect(playwrightCrawler.defaultGotoOptions.timeout).toEqual(timeoutSecs * 1000);
        await playwrightCrawler.run();

        expect(options.timeout).toEqual(timeoutSecs * 1000);
    });
});
