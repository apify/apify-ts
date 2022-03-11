/* eslint-disable no-console */

import scanner from 'fpscanner';
import path from 'path';
import { Configuration, launchPuppeteer, PuppeteerCrawler, puppeteerUtils, RequestList } from '@crawlers/puppeteer';
import { Browser, Page } from 'puppeteer';
import { LocalStorageDirEmulator } from '../local_storage_dir_emulator';

const fingerPrintPath = require.resolve('fpcollect/dist/fpCollect.min.js');
const pathToHTML = path.join(__dirname, 'test_html.html');
const testUrl = `file://${pathToHTML}`;

const getFingerPrint = async (page: Page) => {
    await puppeteerUtils.injectFile(page, fingerPrintPath);

    // @ts-expect-error Evaluated method
    return page.evaluate(() => fpCollect.generateFingerprint());
};

// we can speed up the test to make the requests to the local static html
describe('Stealth - testing headless chrome hiding tricks', () => {
    let localStorageEmulator: LocalStorageDirEmulator;

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Configuration.getGlobalConfig().set('localStorageDir', storageDir);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    test('it works in PuppeteerCrawler', async () => {
        expect.assertions(1);
        const requestList = await RequestList.open(null, [testUrl]);
        const crawler = new PuppeteerCrawler({
            requestList,
            launchContext: {
                stealth: true,
                useChrome: true,
                launchOptions: {
                    headless: true,
                },
            },
            async requestHandler({ page }) {
                const webDriver = await page.evaluate(() => navigator.webdriver);

                expect(webDriver).toBe(false);
            },
        });
        await crawler.run();
    }, 60e3);

    describe('work in launchPuppeteer', () => {
        let browser: Browser;
        let page: Page;
        jest.setTimeout(60_000);

        beforeEach(async () => {
            browser = await launchPuppeteer({
                stealth: true,
                useChrome: true,
                launchOptions: {
                    headless: true,
                },
            });
            page = await browser.newPage();
        });

        afterEach(async () => {
            await browser.close();
        });

        test('it adds plugins, mimeTypes and passes', async () => {
            await page.goto(testUrl);
            const { plugins, mimeTypes } = await getFingerPrint(page);

            expect(plugins.length).toBe(3);
            expect(mimeTypes.length).toBe(4);
        });

        test('it sets webdriver to false', async () => {
            await page.goto(testUrl);
            const webDriver = await page.evaluate(() => navigator.webdriver);

            expect(webDriver).toBe(false);
        });

        test('it hacks permissions', async () => {
            await page.goto(testUrl);
            const { permissions } = await getFingerPrint(page);

            expect(permissions.state).toBe('denied');
        });

        test('it adds language to navigator', async () => {
            await page.goto(testUrl);
            const { languages } = await getFingerPrint(page);

            expect(Array.isArray(languages)).toBe(true);
            expect(languages[0]).toBe('en-US');
        });

        test('it emulates WebGL', async () => {
            await page.goto(testUrl);
            const { videoCard } = await getFingerPrint(page);

            expect(videoCard[0]).toBe('Intel Inc.');
            expect(videoCard[1]).toBe('Intel(R) Iris(TM) Plus Graphics 640');
        });

        test('it emulates windowFrame', async () => {
            await page.goto(testUrl);
            const { screen } = await getFingerPrint(page);

            expect(screen.wOuterHeight > 0).toBe(true);
            expect(screen.wOuterWidth > 0).toBe(true);
        });

        test('it emulates console.debug', async () => {
            await page.goto(testUrl);
            const returnValue = await page.evaluate(() => console.debug('TEST'));

            expect(returnValue).toBe(null);
        });
        test('it should mock window.chrome to plain object', async () => {
            await page.goto(testUrl);
            const { hasChrome } = await getFingerPrint(page);
            // @ts-expect-error Exported property
            const chrome = await page.evaluate(() => window.chrome);
            expect(chrome).toBeInstanceOf(Object);
            expect(chrome.runtime).toEqual({}); // eslint-disable-line
            expect(hasChrome).toBe(true);
        });

        test('it should mock chrome when iframe is created', async () => {
            await page.goto(testUrl);
            const { iframeChrome } = await getFingerPrint(page);

            expect(iframeChrome).toBe('object');

            return browser.close();
        });

        test('it should not break iframe ', async () => {
            const testFuncReturnValue = 'TESTSTRING';
            await page.goto(testUrl);
            await page.evaluate((returnValue) => {
                const { document } = window; //eslint-disable-line
                const body = document.querySelector('body');
                const iframe = document.createElement('iframe');

                // @ts-expect-error Custom function
                iframe.contentWindow.mySuperFunction = () => returnValue;
                body.appendChild(iframe);
            }, testFuncReturnValue);
            const realReturn = await page.evaluate(
                // @ts-expect-error Calling custom function
                () => document.querySelector('iframe').contentWindow.mySuperFunction(),
            );
            expect(realReturn).toEqual(testFuncReturnValue);
        });

        test('it should mock device memory', async () => {
            await page.goto(testUrl);
            const { deviceMemory } = await getFingerPrint(page);

            expect(deviceMemory).not.toBe(0);
        });

        test('it should bypass all of the known tests for browser fingerprinting', async () => {
            await page.goto(testUrl);
            const fingerPrint = await getFingerPrint(page);
            const testedFingerprint = scanner.analyseFingerprint(fingerPrint);
            const failedChecks = Object.values(testedFingerprint).filter((val) => val.consistent < 3);

            // webdriver check is failing due to the outdated fp analyzer
            expect(failedChecks.length).toBe(1);
        });

        test('logs the evaluation warning in "page" when limit is exceeded', async () => {
            const numberOfIframes = 14;
            let message = '';
            const oldConsoleWarn = console.warn;
            console.warn = (msg) => {
                message = msg;
                return oldConsoleWarn.bind(console);
            };

            await page.goto(testUrl);

            await page.evaluate((iframesCount) => {
                for (let i = 0; i < iframesCount; i++) {
                    const iframe = document.createElement('iframe');
                    document.body.appendChild(iframe);
                }
            }, numberOfIframes);

            expect(message.includes('Evaluating hiding tricks in too many iframes')).toBeTruthy();
        });

        test('does not log the message when the iframes are under the limit', async () => {
            const numberOfIframes = 9;
            let message;
            const oldConsoleWarn = console.warn;
            console.warn = (msg) => {
                message = msg;
                return oldConsoleWarn.bind(console);
            };

            await page.goto(testUrl);

            await page.evaluate((iframesCount) => {
                for (let i = 0; i < iframesCount; i++) {
                    const iframe = document.createElement('iframe');
                    document.body.appendChild(iframe);
                }
            }, numberOfIframes);

            expect(message).toBeUndefined();
        });
    });
});
