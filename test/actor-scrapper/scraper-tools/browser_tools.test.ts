import { browserTools } from '@apify/scraper-tools';
import { launchPuppeteer, KeyValueStore, logUtils } from '@crawlers/puppeteer';
import fs from 'fs-extra';
import path from 'path';
import sinon from 'sinon';

const LOCAL_STORAGE_DIR = path.join(__dirname, 'tmp');

describe('browserTools.', () => {
    let browser: Awaited<ReturnType<typeof launchPuppeteer>>;

    beforeEach(async () => {
        fs.ensureDirSync(LOCAL_STORAGE_DIR);
        process.env.APIFY_LOCAL_STORAGE_DIR = LOCAL_STORAGE_DIR;
        browser = await launchPuppeteer({ launchOptions: { headless: true } });
    });

    afterEach(async () => {
        fs.removeSync(LOCAL_STORAGE_DIR);
        delete process.env.APIFY_LOCAL_STORAGE_DIR;
        await browser.close();
    });

    describe('createBrowserHandle()', () => {
        it('should work', async () => {
            const page = await browser.newPage();
            const handle = await browserTools.createBrowserHandle(page, () => 42);
            const result = await page.evaluate((browserHandle: string) => {
                // @ts-expect-error We are not extending the window interface but we are extending the object
                return window[browserHandle]();
            }, handle);
            expect(result).toBe(42);
        });
    });

    describe('createBrowserHandlesForObject', () => {
        it('should work', async () => {
            const page = await browser.newPage();

            const instance = await KeyValueStore.open();
            const methods = ['getValue', 'setValue'] as const;

            const handlesMap = await browserTools.createBrowserHandlesForObject(page, instance, methods);

            expect(typeof handlesMap.getValue).toBe('object');
            expect(typeof handlesMap.getValue.value).toBe('string');
            expect(handlesMap.getValue.type).toBe('METHOD');
            expect(typeof handlesMap.setValue).toBe('object');
            expect(typeof handlesMap.setValue.value).toBe('string');
            expect(handlesMap.setValue.type).toBe('METHOD');
            expect(handlesMap.setValue.value).not.toStrictEqual(handlesMap.getValue.value);

            await page.evaluate(async (setValueHandle: string) => {
                // @ts-expect-error We are not extending the window interface but we are extending the object
                await window[setValueHandle]('123', 'hello', { contentType: 'text/plain' });
            }, handlesMap.setValue.value);
            const value = await instance.getValue('123');
            expect(value).toBe('hello');

            await instance.setValue('321', 'bye', { contentType: 'text/plain' });
            const valueFromBrowser = await page.evaluate(async (getValueHandle: string) => {
                // @ts-expect-error We are not extending the window interface but we are extending the object
                return window[getValueHandle]('321');
            }, handlesMap.getValue.value);
            expect(valueFromBrowser).toBe('bye');

            const nodeContext = {
                one: await instance.getValue('123'),
                three: await instance.getValue('321'),
            };

            const browserContext = await page.evaluate(async (gvh: string) => {
                return {
                    // @ts-expect-error We are not extending the window interface but we are extending the object
                    one: await window[gvh]('123'),
                    // @ts-expect-error We are not extending the window interface but we are extending the object
                    three: await window[gvh]('321'),
                };
            }, handlesMap.getValue.value);

            expect(nodeContext).toStrictEqual(browserContext);
        });
    });

    describe('dumpConsole()', () => {
        afterEach(() => {
            sinon.restore();
        });

        it('should work', async () => {
            let page = await browser.newPage();

            const debug = sinon.spy(logUtils, 'debug');
            const info = sinon.spy(logUtils, 'info');
            const warning = sinon.spy(logUtils, 'warning');
            const error = sinon.spy(logUtils, 'error');

            browserTools.dumpConsole(page);
            await page.evaluate(async () => {
                /* eslint-disable no-console */
                console.log('info');
                console.warn('warning');
                console.info('info');
                console.dir('info');
                console.error('error');
                console.debug('debug');

                await new Promise((r) => setTimeout(r, 10));
            });

            expect(debug.withArgs('debug').calledOnce).toBe(true);
            expect(info.withArgs('info').calledThrice).toBe(true);
            expect(warning.withArgs('warning').calledOnce).toBe(true);
            expect(error.withArgs('error').called).toBe(false);

            page = await browser.newPage();
            browserTools.dumpConsole(page, { logErrors: true });
            await page.evaluate(async () => {
                /* eslint-disable no-console */
                console.error('error');
                await new Promise((r) => setTimeout(r, 10));
            });

            expect(error.withArgs('error').calledOnce).toBe(true);

            await browser.close();
        });
    });
});
