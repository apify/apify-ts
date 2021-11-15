import ow from 'ow';
import { BrowserPoolOptions } from 'browser-pool';
import { LaunchOptions, Page } from 'puppeteer';
import { gotoExtended } from '../puppeteer_utils';
import { applyStealthToBrowser } from '../stealth/stealth';
import { PuppeteerLauncher, PuppeteerLaunchContext } from '../browser_launchers/puppeteer_launcher';
import { HandleFailedRequest } from './basic_crawler';
import { BrowserCrawler, BrowserCrawlerOptions, BrowserCrawlingContext, BrowserHandlePageFunction, BrowserHook } from './browser_crawler';
import { RequestList } from '../request_list';
import { RequestQueue } from '../storages/request_queue';
import { AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
import { Awaitable } from '../typedefs';

export interface PuppeteerCrawlContext extends BrowserCrawlingContext<Page> {
    crawler: PuppeteerCrawler;
}

export type PuppeteerHook = BrowserHook<PuppeteerCrawlContext>;

export interface PuppeteerHandlePageFunctionParam extends BrowserCrawlingContext<Page> {
    crawler: PuppeteerCrawler;
}

export type PuppeteerHandlePage = BrowserHandlePageFunction<PuppeteerHandlePageFunctionParam>;

export interface PuppeteerCrawlerOptions extends Omit<BrowserCrawlerOptions, 'handlePageFunction'> {
    /**
     * Function that is called to process each request.
     * It is passed an object with the following fields:
     *
     * ```
     * {
     *     request: Request,
     *     response: Response,
     *     page: Page,
     *     session: Session,
     *     browserController: BrowserController,
     *     proxyInfo: ProxyInfo,
     *     crawler: PuppeteerCrawler,
     * }
     * ```
     *
     * `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     * `page` is an instance of the `Puppeteer`
     * [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)
     * `browserPool` is an instance of the
     * [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool),
     * `browserController` is an instance of the
     * [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
     * `response` is an instance of the `Puppeteer`
     * [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response),
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
    handlePageFunction: PuppeteerHandlePage;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *     request: Request,
     *     response: Response,
     *     page: Page,
     *     session: Session,
     *     browserController: BrowserController,
     *     proxyInfo: ProxyInfo,
     *     crawler: PuppeteerCrawler,
     * }
     * ```
     * Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     */
    handleFailedRequestFunction?: HandleFailedRequest;

    /**
     * Options used by {@link launchPuppeteer} to start new Puppeteer instances.
     */
    launchContext?: PuppeteerLaunchContext;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `gotoOptions`,
     * which are passed to the `page.goto()` function the crawler calls to navigate.
     * Example:
     * ```
     * preNavigationHooks: [
     *     async (crawlingContext, gotoOptions) => {
     *         const { page } = crawlingContext;
     *         await page.evaluate((attr) => { window.foo = attr; }, 'bar');
     *     },
     * ]
     * ```
     */
    preNavigationHooks?: PuppeteerHook[];

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
    postNavigationHooks?: PuppeteerHook[];
}

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless Chrome with [Puppeteer](https://github.com/puppeteer/puppeteer).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link PuppeteerCrawlerOptions.requestList}
 * or {@link PuppeteerCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link PuppeteerCrawlerOptions.requestList} and {@link PuppeteerCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link PuppeteerCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link PuppeteerCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `PuppeteerCrawler` constructor.
 *
 * Note that the pool of Puppeteer instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const crawler = new Apify.PuppeteerCrawler({
 *     requestList,
 *     handlePageFunction: async ({ page, request }) => {
 *         // This function is called to extract data from a single web page
 *         // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
 *         // 'request' is an instance of Request class with information about the page to load
 *         await Apify.pushData({
 *             title: await page.title(),
 *             url: request.url,
 *             succeeded: true,
 *         })
 *     },
 *     handleFailedRequestFunction: async ({ request }) => {
 *         // This function is called when the crawling of a request failed too many times
 *         await Apify.pushData({
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
export class PuppeteerCrawler extends BrowserCrawler<LaunchOptions> {
    protected static override optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        launchContext: ow.optional.object,
    };

    /**
     * All `PuppeteerCrawler` parameters are passed via an options object.
     * @todo we need Partial here due to the emtpy object, probably not wanted
     */
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        ow(options, 'PuppeteerCrawlerOptions', ow.object.exactShape(PuppeteerCrawler.optionsShape));

        const {
            launchContext = {}, // @TODO: should not launcher be inside launchContext
            browserPoolOptions = {} as BrowserPoolOptions,
            proxyConfiguration,
            ...browserCrawlerOptions
        } = options;
        const { stealth = false } = launchContext;

        if (launchContext.proxyUrl) {
            throw new Error('PuppeteerCrawlerOptions.launchContext.proxyUrl is not allowed in PuppeteerCrawler.'
                + 'Use PuppeteerCrawlerOptions.proxyConfiguration');
        }
        const puppeteerLauncher = new PuppeteerLauncher(launchContext);

        browserPoolOptions.browserPlugins = [
            // @ts-ignore plugin types are not compatible?
            puppeteerLauncher.createBrowserPlugin(),
        ];

        super({ ...browserCrawlerOptions, proxyConfiguration, browserPoolOptions });

        if (stealth) {
            this.browserPool.postLaunchHooks.push(async (_pageId, browserController) => {
                // @TODO: We can do this better now. It is not necessary to override the page.
                //   we can modify the page in the postPageCreateHook
                const { hideWebDriver, ...newStealthOptions } = puppeteerLauncher.stealthOptions!;
                await applyStealthToBrowser(browserController.browser, newStealthOptions);
            });
        }

        this.launchContext = launchContext;
    }

    protected override async _navigationHandler(crawlingContext, gotoOptions) {
        if (this.gotoFunction) {
            this.log.deprecated('PuppeteerCrawlerOptions.gotoFunction is deprecated. Use "preNavigationHooks" and "postNavigationHooks" instead.');

            return this.gotoFunction(crawlingContext, gotoOptions);
        }
        return gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions);
    }
}
