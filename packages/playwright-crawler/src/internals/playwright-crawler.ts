import ow from 'ow';
import { LaunchOptions, Page, Response } from 'playwright';
import { BrowserPoolOptions, PlaywrightPlugin } from '@crawlee/browser-pool';
import { Dictionary } from '@crawlee/utils';
import {
    BrowserCrawler,
    BrowserCrawlerOptions,
    BrowserCrawlingContext,
    BrowserCrawlerHandleRequest,
    BrowserHook,
} from '@crawlee/browser';
import { PlaywrightLauncher, PlaywrightLaunchContext } from './playwright-launcher';
import { DirectNavigationOptions, gotoExtended } from './utils/playwright-utils';

export type PlaywrightController = ReturnType<PlaywrightPlugin['_createController']>;

export type PlaywrightCrawlContext = BrowserCrawlingContext<Page, Response, PlaywrightController>

export type PlaywrightHook = BrowserHook<PlaywrightCrawlContext, PlaywrightGotoOptions>;

export type PlaywrightRequestHandlerParam = BrowserCrawlingContext<Page, Response, PlaywrightController>

export type PlaywrightRequestHandler = BrowserCrawlerHandleRequest<PlaywrightRequestHandlerParam>;

export type PlaywrightGotoOptions = Parameters<Page['goto']>[1];

export interface PlaywrightCrawlerOptions extends BrowserCrawlerOptions<
    PlaywrightCrawlContext,
    PlaywrightGotoOptions,
    { browserPlugins: [PlaywrightPlugin] }
> {
    /**
     * Function that is called to process each request.
     * It is passed an object with the following fields:
     *
     * ```
     * {
     *   request: Request,
     *   response: Response,
     *   page: Page,
     *   session: Session,
     *   browserController: BrowserController,
     *   proxyInfo: ProxyInfo,
     *   crawler: PlaywrightCrawler,
     * }
     * ```
     *
     * `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     * `page` is an instance of the `Playwright`
     * [`Page`](https://playwright.dev/docs/api/class-page)
     * `browserController` is an instance of the
     * [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
     * `response` is an instance of the `Playwright`
     * [`Response`](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by `page.goto(request.url)`.
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `handleFailedRequestFunction` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage} function.
     */
    requestHandler: PlaywrightRequestHandler;

    /**
     * Function that is called to process each request.
     * It is passed an object with the following fields:
     *
     * ```
     * {
     *   request: Request,
     *   response: Response,
     *   page: Page,
     *   session: Session,
     *   browserController: BrowserController,
     *   proxyInfo: ProxyInfo,
     *   crawler: PlaywrightCrawler,
     * }
     * ```
     *
     * `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     * `page` is an instance of the `Playwright`
     * [`Page`](https://playwright.dev/docs/api/class-page)
     * `browserController` is an instance of the
     * [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
     * `response` is an instance of the `Playwright`
     * [`Response`](https://playwright.dev/docs/api/class-response),
     * which is the main resource response as returned by `page.goto(request.url)`.
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `handleFailedRequestFunction` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request.pushErrorMessage} function.
     *
     * @deprecated `handlePageFunction` has been renamed to `requestHandler` and will be removed in a future version.
     */
    handlePageFunction?: PlaywrightRequestHandler;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotoOptions`,
     * which are passed to the `page.goto()` function the crawler calls to navigate.
     * Example:
     * ```
     * preNavigationHooks: [
     *     async (crawlingContext, gotoOptions) => {
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *     },
     * ]
     * ```
     */
    preNavigationHooks?: PlaywrightHook[];

    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     * Example:
     * ```
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         const { page } = crawlingContext;
     *         if (hasCaptcha(page)) {
     *             await solveCaptcha (page);
     *         }
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: PlaywrightHook[];

    /**
     * The same options as used by {@link launchPlaywright}.
     */
    launchContext?: PlaywrightLaunchContext;

    // /**
    //  * Indicates how many times the request is retried if {@link handlePageFunction} fails.
    //  */
    // maxRequestRetries?: number;
}

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chromium, Firefox and Webkit browsers with [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `Playwright` uses headless browser to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link PlaywrightCrawlerOptions.requestList}
 * or {@link PlaywrightCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link PlaywrightCrawlerOptions.requestList} and {@link PlaywrightCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `PlaywrightCrawler` opens a new Chrome page (i.e. tab) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link PlaywrightCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link PlaywrightCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PlaywrightCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `PlaywrightCrawler` constructor.
 *
 * Note that the pool of Playwright instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new PlaywrightCrawler({
 *     requestList,
 *     handlePageFunction: async ({ page, request }) => {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Playwright.Page with page.goto(request.url) already called
 *         // 'request' is an instance of Request class with information about the page to load
 *         await Actor.pushData({
 *             title: await page.title(),
 *             url: request.url,
 *             succeeded: true,
 *         })
 *     },
 *     handleFailedRequestFunction: async ({ request }) => {
 *         // This function is called when the crawling of a request failed too many times
 *         await Actor.pushData({
 *             url: request.url,
 *             succeeded: false,
 *             errors: request.errorMessages,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 * @category Crawlers
 */
export class PlaywrightCrawler extends BrowserCrawler<{ browserPlugins: [PlaywrightPlugin] }, LaunchOptions, PlaywrightCrawlContext> {
    protected static override optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        launcher: ow.optional.object,
        launchContext: ow.optional.object,
    };

    /**
     * All `PlaywrightCrawler` parameters are passed via an options object.
     */
    constructor(options: PlaywrightCrawlerOptions) {
        ow(options, 'PlaywrightCrawlerOptions', ow.object.exactShape(PlaywrightCrawler.optionsShape));

        const {
            launchContext = {},
            browserPoolOptions = {} as BrowserPoolOptions<PlaywrightPlugin>,
            ...browserCrawlerOptions
        } = options;

        if (launchContext.proxyUrl) {
            throw new Error('PlaywrightCrawlerOptions.launchContext.proxyUrl is not allowed in PlaywrightCrawler.'
                + 'Use PlaywrightCrawlerOptions.proxyConfiguration');
        }
        const playwrightLauncher = new PlaywrightLauncher(launchContext);

        browserPoolOptions.browserPlugins = [
            playwrightLauncher.createBrowserPlugin(),
        ];

        super({ ...browserCrawlerOptions, browserPoolOptions });
        this.launchContext = launchContext;
    }

    protected override async _navigationHandler(crawlingContext: PlaywrightCrawlContext, gotoOptions: DirectNavigationOptions) {
        if (this.gotoFunction) {
            this.log.deprecated('PlaywrightCrawler.gotoFunction is deprecated. Use "preNavigationHooks" and "postNavigationHooks" instead.');
            return this.gotoFunction(crawlingContext, gotoOptions as Dictionary);
        }

        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}
