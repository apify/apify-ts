/**
 * A namespace that contains various utilities for
 * [Puppeteer](https://github.com/puppeteer/puppeteer) - the headless Chrome Node API.
 *
 * **Example usage:**
 *
 * ```javascript
 * import { launchPuppeteer, puppeteerUtils } from 'crawlee';
 *
 * // Open https://www.example.com in Puppeteer
 * const browser = await launchPuppeteer();
 * const page = await browser.newPage();
 * await page.goto('https://www.example.com');
 *
 * // Inject jQuery into a page
 * await puppeteerUtils.injectJQuery(page);
 * ```
 * @module puppeteerUtils
 */

import { readFile } from 'fs/promises';
import ow from 'ow';
import vm from 'vm';
import { LruCache } from '@apify/datastructures';
import type { Page, HTTPResponse, ResponseForRequest, HTTPRequest as PuppeteerRequest } from 'puppeteer';
import log_ from '@apify/log';
import type { Request } from '@crawlee/core';
import { KeyValueStore, validators } from '@crawlee/core';
import type { Dictionary, BatchAddRequestsResult } from '@crawlee/types';
import type { EnqueueLinksByClickingElementsOptions } from '../enqueue-links/click-elements';
import { enqueueLinksByClickingElements } from '../enqueue-links/click-elements';
import type { InterceptHandler } from './puppeteer_request_interception';
import { addInterceptRequestHandler, removeInterceptRequestHandler } from './puppeteer_request_interception';
import type { PuppeteerCrawlingContext } from '../puppeteer-crawler';

const jqueryPath = require.resolve('jquery');

const MAX_INJECT_FILE_CACHE_SIZE = 10;
const DEFAULT_BLOCK_REQUEST_URL_PATTERNS = ['.css', '.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip'];

const log = log_.child({ prefix: 'Puppeteer Utils' });

export interface DirectNavigationOptions {
    /**
     * Maximum operation time in milliseconds, defaults to 30 seconds, pass `0` to disable timeout. The
     * default value can be changed by using the browserContext.setDefaultNavigationTimeout(timeout),
     * browserContext.setDefaultTimeout(timeout), page.setDefaultNavigationTimeout(timeout) or
     * page.setDefaultTimeout(timeout) methods.
     */
    timeout?: number;

    /**
     * When to consider operation succeeded, defaults to `load`. Events can be either:
     * - `'domcontentloaded'` - consider operation to be finished when the `DOMContentLoaded` event is fired.
     * - `'load'` - consider operation to be finished when the `load` event is fired.
     * - `'networkidle'` - consider operation to be finished when there are no network connections for at least `500` ms.
     */
    waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';

    /**
     * Referer header value. If provided it will take preference over the referer header value set by page.setExtraHTTPHeaders(headers).
     */
    referer?: string;
}

export interface InjectFileOptions {
    /**
     * Enables the injected script to survive page navigations and reloads without need to be re-injected manually.
     * This does not mean, however, that internal state will be preserved. Just that it will be automatically
     * re-injected on each navigation before any other scripts get the chance to execute.
     */
    surviveNavigations?: boolean;
}

export interface BlockRequestsOptions {
    /**
     * The patterns of URLs to block from being loaded by the browser.
     * Only `*` can be used as a wildcard. It is also automatically added to the beginning
     * and end of the pattern. This limitation is enforced by the DevTools protocol.
     * `.png` is the same as `*.png*`.
     */
    urlPatterns?: string[];

    /**
     * If you just want to append to the default blocked patterns, use this property.
     */
    extraUrlPatterns?: string[];
}

export interface CompiledScriptParams {
    page: Page;
    request: Request;
}

export type CompiledScriptFunction = (params: CompiledScriptParams) => Promise<unknown>;

/**
 * Cache contents of previously injected files to limit file system access.
 */
const injectedFilesCache = new LruCache({ maxLength: MAX_INJECT_FILE_CACHE_SIZE });

/**
 * Injects a JavaScript file into a Puppeteer page.
 * Unlike Puppeteer's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * File contents are cached for up to 10 files to limit file system access.
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param filePath File path
 * @param [options]
 */
export async function injectFile(page: Page, filePath: string, options: InjectFileOptions = {}): Promise<unknown> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(filePath, ow.string);
    ow(options, ow.object.exactShape({
        surviveNavigations: ow.optional.boolean,
    }));

    let contents = injectedFilesCache.get(filePath);
    if (!contents) {
        contents = await readFile(filePath, 'utf8');
        injectedFilesCache.add(filePath, contents);
    }
    const evalP = page.evaluate(contents);
    if (options.surviveNavigations) {
        page.on('framenavigated',
            () => page.evaluate(contents)
                .catch((error) => log.warning('An error occurred during the script injection!', { error })));
    }

    return evalP;
}

/**
 * Injects the [jQuery](https://jquery.com/) library into a Puppeteer page.
 * jQuery is often useful for various web scraping and crawling tasks.
 * For example, it can help extract text from HTML elements using CSS selectors.
 *
 * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
 * other libraries included by the page that use the same variable name (e.g. another version of jQuery).
 * This can affect functionality of page's scripts.
 *
 * The injected jQuery will survive page navigations and reloads.
 *
 * **Example usage:**
 * ```javascript
 * await puppeteerUtils.injectJQuery(page);
 * const title = await page.evaluate(() => {
 *   return $('head title').text();
 * });
 * ```
 *
 * Note that `injectJQuery()` does not affect the Puppeteer's
 * [`page.$()`](https://pptr.dev/#?product=Puppeteer&show=api-pageselector)
 * function in any way.
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 */
export function injectJQuery(page: Page): Promise<unknown> {
    ow(page, ow.object.validate(validators.browserPage));
    return injectFile(page, jqueryPath, { surviveNavigations: true });
}

/**
 * Forces the Puppeteer browser tab to block loading URLs that match a provided pattern.
 * This is useful to speed up crawling of websites, since it reduces the amount
 * of data that needs to be downloaded from the web, but it may break some websites
 * or unexpectedly prevent loading of resources.
 *
 * By default, the function will block all URLs including the following patterns:
 *
 * ```json
 * [".css", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".woff", ".pdf", ".zip"]
 * ```
 *
 * If you want to extend this list further, use the `extraUrlPatterns` option,
 * which will keep blocking the default patterns, as well as add your custom ones.
 * If you would like to block only specific patterns, use the `urlPatterns` option,
 * which will override the defaults and block only URLs with your custom patterns.
 *
 * This function does not use Puppeteer's request interception and therefore does not interfere
 * with browser cache. It's also faster than blocking requests using interception,
 * because the blocking happens directly in the browser without the round-trip to Node.js,
 * but it does not provide the extra benefits of request interception.
 *
 * The function will never block main document loads and their respective redirects.
 *
 * **Example usage**
 * ```javascript
 * import { launchPuppeteer, puppeteerUtils } from 'crawlee';
 *
 * const browser = await launchPuppeteer();
 * const page = await browser.newPage();
 *
 * // Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
 * await puppeteerUtils.blockRequests(page, {
 *     extraUrlPatterns: ['adsbygoogle.js'],
 * });
 *
 * await page.goto('https://cnn.com');
 * ```
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param [options]
 */
export async function blockRequests(page: Page, options: BlockRequestsOptions = {}): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(options, ow.object.exactShape({
        urlPatterns: ow.optional.array.ofType(ow.string),
        extraUrlPatterns: ow.optional.array.ofType(ow.string),
    }));

    const {
        urlPatterns = DEFAULT_BLOCK_REQUEST_URL_PATTERNS,
        extraUrlPatterns = [],
    } = options;

    const patternsToBlock = [...urlPatterns, ...extraUrlPatterns];

    if (page._client instanceof Function) {
        await page._client().send('Network.setBlockedURLs', { urls: patternsToBlock });
    } else {
        // @ts-expect-error for older puppeteer (<14.4)
        await page._client.send('Network.setBlockedURLs', { urls: patternsToBlock });
    }
}

/**
 * `blockResources()` has a high impact on performance in recent versions of Puppeteer.
 * Until this resolves, please use `utils.puppeteer.blockRequests()`.
 * @deprecated
 */
export const blockResources = async (page: Page, resourceTypes = ['stylesheet', 'font', 'image', 'media']) => {
    log.deprecated('utils.puppeteer.blockResources() has a high impact on performance in recent versions of Puppeteer. '
        + 'Until this resolves, please use utils.puppeteer.blockRequests()');
    await addInterceptRequestHandler(page, async (request) => {
        const type = request.resourceType();
        if (resourceTypes.includes(type)) await request.abort();
        else await request.continue();
    });
};

/**
 * *NOTE:* In recent versions of Puppeteer using this function entirely disables browser cache which resolves in sub-optimal
 * performance. Until this resolves, we suggest just relying on the in-browser cache unless absolutely necessary.
 *
 * Enables caching of intercepted responses into a provided object. Automatically enables request interception in Puppeteer.
 * *IMPORTANT*: Caching responses stores them to memory, so too loose rules could cause memory leaks for longer running crawlers.
 *   This issue should be resolved or atleast mitigated in future iterations of this feature.
 * @param page
 *   Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param cache
 *   Object in which responses are stored
 * @param responseUrlRules
 *   List of rules that are used to check if the response should be cached.
 *   String rules are compared as page.url().includes(rule) while RegExp rules are evaluated as rule.test(page.url()).
 * @deprecated
 */
export async function cacheResponses(page: Page, cache: Dictionary<Partial<ResponseForRequest>>, responseUrlRules: (string | RegExp)[]): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(cache, ow.object);
    ow(responseUrlRules, ow.array.ofType(ow.any(ow.string, ow.regExp)));

    log.deprecated('utils.puppeteer.cacheResponses() has a high impact on performance '
        + 'in recent versions of Puppeteer so it\'s use is discouraged until this issue resolves.');

    await addInterceptRequestHandler(page, async (request) => {
        const url = request.url();

        if (cache[url]) {
            await request.respond(cache[url]);
            return;
        }

        await request.continue();
    });

    page.on('response', async (response) => {
        const url = response.url();

        // Response is already cached, do nothing
        if (cache[url]) return;

        const shouldCache = responseUrlRules.some((rule) => {
            if (typeof rule === 'string') return url.includes(rule);
            if (rule instanceof RegExp) return rule.test(url);
            return false;
        });

        try {
            if (shouldCache) {
                const buffer = await response.buffer();
                cache[url] = {
                    status: response.status(),
                    headers: response.headers(),
                    body: buffer,
                };
            }
        } catch (e) {
            // ignore errors, usualy means that buffer is empty or broken connection
        }
    });
}

/**
 * Compiles a Puppeteer script into an async function that may be executed at any time
 * by providing it with the following object:
 * ```
 * {
 *    page: Page,
 *    request: Request,
 * }
 * ```
 * Where `page` is a Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
 * and `request` is a {@link Request}.
 *
 * The function is compiled by using the `scriptString` parameter as the function's body,
 * so any limitations to function bodies apply. Return value of the compiled function
 * is the return value of the function body = the `scriptString` parameter.
 *
 * As a security measure, no globals such as `process` or `require` are accessible
 * from within the function body. Note that the function does not provide a safe
 * sandbox and even though globals are not easily accessible, malicious code may
 * still execute in the main process via prototype manipulation. Therefore you
 * should only use this function to execute sanitized or safe code.
 *
 * Custom context may also be provided using the `context` parameter. To improve security,
 * make sure to only pass the really necessary objects to the context. Preferably making
 * secured copies beforehand.
 *
 */
export function compileScript(scriptString: string, context: Dictionary = Object.create(null)): CompiledScriptFunction {
    const funcString = `async ({ page, request }) => {${scriptString}}`;

    let func;
    try {
        func = vm.runInNewContext(funcString, context); // "Secure" the context by removing prototypes, unless custom context is provided.
    } catch (err) {
        log.exception(err as Error, 'Cannot compile script!');
        throw err;
    }

    if (typeof func !== 'function') throw new Error('Compilation result is not a function!'); // This should not happen...

    return func;
}

/**
 * Extended version of Puppeteer's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Request class.
 *
 * *NOTE:* In recent versions of Puppeteer using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param request
 * @param [gotoOptions] Custom options for `page.goto()`.
 */
export async function gotoExtended(page: Page, request: Request, gotoOptions: DirectNavigationOptions = {}): Promise<HTTPResponse | null> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(request, ow.object.partialShape({
        url: ow.string.url,
        method: ow.optional.string,
        headers: ow.optional.object,
        payload: ow.optional.any(ow.string, ow.buffer),
    }));
    ow(gotoOptions, ow.object);

    const { url, method, headers, payload } = request;
    const isEmpty = (o?: object) => !o || Object.keys(o).length === 0;

    if (method !== 'GET' || payload || !isEmpty(headers)) {
        // This is not deprecated, we use it to log only once.
        log.deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance '
            + 'in recent versions of Puppeteer. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = async (interceptedRequest: PuppeteerRequest) => {
            // We want to ensure that this won't get executed again in a case that there is a subsequent request
            // for example for some asset file link from main HTML.
            if (wasCalled) {
                return interceptedRequest.continue();
            }

            wasCalled = true;
            const overrides: Dictionary = {};

            if (method !== 'GET') overrides.method = method;
            if (payload) overrides.postData = payload;
            if (!isEmpty(headers)) overrides.headers = headers;
            await removeInterceptRequestHandler(page, interceptRequestHandler);
            await interceptedRequest.continue(overrides);
        };

        await addInterceptRequestHandler(page, interceptRequestHandler);
    }

    return page.goto(url, gotoOptions as Dictionary);
}

export interface InfiniteScrollOptions {
    /**
     * How many seconds to scroll for. If 0, will scroll until bottom of page.
     * @default 1
     */
    timeoutSecs?: number;

    /**
     * How many seconds to wait for no new content to load before exit.
     * @default 4
     */
    waitForSecs?: number;

    /**
     * If true, it will scroll up a bit after each scroll down. This is required on some websites for the scroll to work.
     * @default false
     */
    scrollDownAndUp?: boolean;

    /**
     * Optionally checks and clicks a button if it appears while scrolling. This is required on some websites for the scroll to work.
     */
    buttonSelector?: string;

    /**
     * This function is called after every scroll and stops the scrolling process if it returns `true`. The function can be `async`.
     */
    stopScrollCallback?: () => unknown | Promise<unknown>;
}

/**
 * Scrolls to the bottom of a page, or until it times out.
 * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param [options]
 */
export async function infiniteScroll(page: Page, options: InfiniteScrollOptions = {}): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(options, ow.object.exactShape({
        timeoutSecs: ow.optional.number,
        waitForSecs: ow.optional.number,
        scrollDownAndUp: ow.optional.boolean,
        buttonSelector: ow.optional.string,
        stopScrollCallback: ow.optional.function,
    }));

    const { timeoutSecs = 0, waitForSecs = 4, scrollDownAndUp = false, buttonSelector, stopScrollCallback } = options;

    let finished;
    const startTime = Date.now();
    const CHECK_INTERVAL_MILLIS = 1000;
    const SCROLL_HEIGHT_IF_ZERO = 10000;
    const maybeResourceTypesInfiniteScroll = ['xhr', 'fetch', 'websocket', 'other'];
    const resourcesStats = {
        newRequested: 0,
        oldRequested: 0,
        matchNumber: 0,
    };

    page.on('request', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType())) {
            resourcesStats.newRequested++;
        }
    });

    // Move mouse to the center of the page, so we can scroll up-down
    let body = await page.$('body');
    let retry = 0;

    while (!body && retry < 10) {
        await page.waitForTimeout(100);
        body = await page.$('body');
        retry++;
    }

    if (!body) {
        return;
    }

    const boundingBox = await body!.boundingBox();
    await page.mouse.move(
        boundingBox!.x + boundingBox!.width / 2, // x
        boundingBox!.y + boundingBox!.height / 2, // y
    );

    const checkFinished = setInterval(() => {
        if (resourcesStats.oldRequested === resourcesStats.newRequested) {
            resourcesStats.matchNumber++;
            if (resourcesStats.matchNumber >= waitForSecs) {
                clearInterval(checkFinished);
                finished = true;
                return;
            }
        } else {
            resourcesStats.matchNumber = 0;
            resourcesStats.oldRequested = resourcesStats.newRequested;
        }
        // check if timeout has been reached
        if (timeoutSecs !== 0 && (Date.now() - startTime) / 1000 > timeoutSecs) {
            clearInterval(checkFinished);
            finished = true;
        }
    }, CHECK_INTERVAL_MILLIS);

    const doScroll = async () => {
        /* istanbul ignore next */
        const bodyScrollHeight = await page.evaluate(() => document.body.scrollHeight);

        const delta = bodyScrollHeight === 0 ? SCROLL_HEIGHT_IF_ZERO : bodyScrollHeight;

        await page.mouse.wheel({ deltaY: delta });
    };

    const maybeClickButton = async () => {
        const button = await page.$(buttonSelector!);
        // Box model returns null if the button is not visible
        if (button && await button.boxModel()) {
            await button.click({ delay: 10 });
        }
    };

    while (!finished) {
        await doScroll();
        await page.waitForTimeout(250);
        if (scrollDownAndUp) {
            await page.mouse.wheel({ deltaY: -1000 });
        }
        if (buttonSelector) {
            await maybeClickButton();
        }
        if (stopScrollCallback) {
            if (await stopScrollCallback()) {
                clearInterval(checkFinished);
                break;
            }
        }
    }
}

export interface SaveSnapshotOptions {
    /**
     * Key under which the screenshot and HTML will be saved. `.jpg` will be appended for screenshot and `.html` for HTML.
     * @default 'SNAPSHOT'
     */
    key?: string;

    /**
     * The quality of the image, between 0-100. Higher quality images have bigger size and require more storage.
     * @default 50
     */
    screenshotQuality?: number;

    /**
     * If true, it will save a full screenshot of the current page as a record with `key` appended by `.jpg`.
     * @default true
     */
    saveScreenshot?: boolean;

    /**
     * If true, it will save a full HTML of the current page as a record with `key` appended by `.html`.
     * @default true
     */
    saveHtml?: boolean;

    /**
     * Name or id of the Key-Value store where snapshot is saved. By default it is saved to default Key-Value store.
     * @default null
     */
    keyValueStoreName?: string | null;
}

/**
 * Saves a full screenshot and HTML of the current page into a Key-Value store.
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param [options]
 */
export async function saveSnapshot(page: Page, options: SaveSnapshotOptions = {}): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(options, ow.object.exactShape({
        key: ow.optional.string.nonEmpty,
        screenshotQuality: ow.optional.number,
        saveScreenshot: ow.optional.boolean,
        saveHtml: ow.optional.boolean,
        keyValueStoreName: ow.optional.string,
    }));

    const {
        key = 'SNAPSHOT',
        screenshotQuality = 50,
        saveScreenshot = true,
        saveHtml = true,
        keyValueStoreName,
    } = options;

    try {
        const store = await KeyValueStore.open(keyValueStoreName);

        if (saveScreenshot) {
            const screenshotName = `${key}.jpg`;
            const screenshotBuffer = await page.screenshot({ fullPage: true, quality: screenshotQuality, type: 'jpeg' });
            await store.setValue(screenshotName, screenshotBuffer, { contentType: 'image/jpeg' });
        }

        if (saveHtml) {
            const htmlName = `${key}.html`;
            const html = await page.content();
            await store.setValue(htmlName, html, { contentType: 'text/html' });
        }
    } catch (err) {
        throw new Error(`saveSnapshot with key ${key} failed.\nCause:${(err as Error).message}`);
    }
}

export interface PuppeteerContextUtils {
    injectFile(filePath: string, options?: InjectFileOptions): Promise<unknown>;
    injectJQuery(): Promise<unknown>;
    enqueueLinksByClickingElements(options: Omit<EnqueueLinksByClickingElementsOptions, 'page' | 'requestQueue'>): Promise<BatchAddRequestsResult>;
    blockRequests(options?: BlockRequestsOptions): Promise<void>;
    blockResources(resourceTypes?: string[]): Promise<void>;
    cacheResponses(cache: Dictionary<Partial<ResponseForRequest>>, responseUrlRules: (string | RegExp)[]): Promise<void>;
    compileScript(scriptString: string, ctx?: Dictionary): CompiledScriptFunction;
    addInterceptRequestHandler(handler: InterceptHandler): Promise<void>;
    removeInterceptRequestHandler(handler: InterceptHandler): Promise<void>;
    infiniteScroll(options?: InfiniteScrollOptions): Promise<void>;
    saveSnapshot(options?: SaveSnapshotOptions): Promise<void>;
}

/** @internal */
export function registerUtilsToContext(context: PuppeteerCrawlingContext): void {
    context.injectFile = (filePath: string, options?: InjectFileOptions) => injectFile(context.page, filePath, options);
    context.injectJQuery = () => injectJQuery(context.page);
    context.enqueueLinksByClickingElements = (options: Omit<EnqueueLinksByClickingElementsOptions, 'page' | 'requestQueue'>) => enqueueLinksByClickingElements({
        page: context.page,
        requestQueue: context.crawler.requestQueue!,
        ...options,
    });
    context.blockRequests = (options?: BlockRequestsOptions) => blockRequests(context.page, options);
    context.blockResources = (resourceTypes?: string[]) => blockResources(context.page, resourceTypes);
    context.cacheResponses = (cache: Dictionary<Partial<ResponseForRequest>>, responseUrlRules: (string | RegExp)[]) => {
        return cacheResponses(context.page, cache, responseUrlRules);
    };
    context.compileScript = (scriptString: string, ctx?: Dictionary) => compileScript(scriptString, ctx);
    context.addInterceptRequestHandler = (handler: InterceptHandler) => addInterceptRequestHandler(context.page, handler);
    context.removeInterceptRequestHandler = (handler: InterceptHandler) => removeInterceptRequestHandler(context.page, handler);
    context.infiniteScroll = (options?: InfiniteScrollOptions) => infiniteScroll(context.page, options);
    context.saveSnapshot = (options?: SaveSnapshotOptions) => saveSnapshot(context.page, options);
}

export {
    enqueueLinksByClickingElements,
    addInterceptRequestHandler,
    removeInterceptRequestHandler,
};

/** @internal */
export const puppeteerUtils = {
    injectFile,
    injectJQuery,
    enqueueLinksByClickingElements,
    blockRequests,
    blockResources,
    cacheResponses,
    compileScript,
    gotoExtended,
    addInterceptRequestHandler,
    removeInterceptRequestHandler,
    infiniteScroll,
    saveSnapshot,
};
