import ow from 'ow';
import { BrowserController, BrowserPool, BrowserPoolOptions, BROWSER_CONTROLLER_EVENTS, LaunchContext } from 'browser-pool';
import { BASIC_CRAWLER_TIMEOUT_BUFFER_SECS } from '../constants';
import { EVENT_SESSION_RETIRED } from '../session_pool/events';
import { addTimeoutToPromise } from '../utils';
import { validators } from '../validators';
import {
    throwOnBlockedRequest,
    handleRequestTimeout,
} from './crawler_utils';
import { BasicCrawler, BasicCrawlerOptions, CrawlingContext, HandleFailedRequest } from './basic_crawler';
import { ProxyConfiguration } from '../proxy_configuration';
import { RequestList } from '../request_list';
import { RequestQueue } from '../storages/request_queue';
import { Request } from '../request';
import { BrowserLaunchContext } from '../browser_launchers/browser_launcher';
import { Session } from '../session_pool/session';
import { Awaitable, Dictionary } from '../typedefs';

export interface BrowserCrawlingContext<Page = unknown, Response = unknown> extends CrawlingContext<Response> {
    browserController: BrowserController;
    page: Page;
}

export type BrowserHook<
    Context = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> = Dictionary
> = (crawlingContext: Context, gotoOptions: GoToOptions) => Awaitable<void>;
export type BrowserHandlePageFunction<Context = BrowserCrawlingContext> = (context: Context) => Awaitable<void>;
export type GotoFunction<
    Context = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> = Dictionary
> = (context: Context, gotoOptions: GoToOptions) => Awaitable<any>;

export interface BrowserCrawlerOptions extends Omit<BasicCrawlerOptions, 'handleRequestFunction'> {
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
     *   crawler: BrowserCrawler,
     * }
     * ```
     *
     * `request` is an instance of the {@link Request} object with details about the URL to open, HTTP method etc.
     * `page` is an instance of the `Puppeteer`
     * [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) or `Playwright`
     * [`Page`](https://playwright.dev/docs/api/class-page)
     * `browserPool` is an instance of the
     * [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool),
     * `browserController` is an instance of the
     * [`BrowserController`](https://github.com/apify/browser-pool#browsercontroller),
     * `response` is an instance of the `Puppeteer`
     * [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response) or `Playwright`
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
    handlePageFunction: BrowserHandlePageFunction;

    /**
     * Timeout in which the function passed as `handlePageFunction` needs to finish, in seconds.
     */
    handlePageTimeoutSecs?: number;

    /**
     * Navigation function for corresponding library. `page.goto(url)` is supported by both `playwright` and `puppeteer`.
     */
    gotoFunction?: GotoFunction;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *     request: Request,
     *     response: Response,
     *     page: Page,
     *     browserPool: BrowserPool,
     *     autoscaledPool: AutoscaledPool,
     *     session: Session,
     *     browserController: BrowserController,
     *     proxyInfo: ProxyInfo,
     * }
     * ```
     * Where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     */
    handleFailedRequestFunction?: HandleFailedRequest;

    /**
     * Custom options passed to the underlying [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool) constructor.
     * You can tweak those to fine-tune browser management.
     */
    // TODO: this interface doesn't include the hooks
    browserPoolOptions?: BrowserPoolOptions;

    /**
     * If set, the crawler will be configured for all connections to use
     * [Apify Proxy](https://my.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
     * For more information, see the [documentation](https://docs.apify.com/proxy).
     */
    proxyConfiguration?: ProxyConfiguration;

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
    preNavigationHooks?: BrowserHook[];

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
    postNavigationHooks?: BrowserHook[];

    /**
     * Timeout in which page navigation needs to finish, in seconds.
     */
    navigationTimeoutSecs?: number;

    /**
     * Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.
     */
    handleRequestTimeoutSecs?: number;

    /**
     * @deprecated Use `navigationTimeoutSecs` instead
     */
    gotoTimeoutSecs?: number;

    /**
     * If cookies should be persisted between sessions.
     * This can only be used when `useSessionPool` is set to `true`.
     */
    persistCookiesPerSession?: boolean;
}

/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless browsers with [Puppeteer](https://github.com/puppeteer/puppeteer)
 * and [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `BrowserCrawler` uses headless or even headfull browsers to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, consider using {@link CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link BrowserCrawlerOptions.requestList}
 * or {@link BrowserCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link BrowserCrawlerOptions.requestList} and {@link BrowserCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@link Request} object to crawl
 * and then calls the function provided by user as the {@link BrowserCrawlerOptions.handlePageFunction} option.
 *
 * New pages are only opened when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the {@link BrowserCrawlerOptions.autoscaledPoolOptions}
 * parameter of the `BrowserCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPoolOptions} are available directly in the `BrowserCrawler` constructor.
 *
 * Note that the pool of browser instances is internally managed by the [BrowserPool](https://github.com/apify/browser-pool) class.
 * ```js
 * await crawler.run();
 * ```
 * @category Crawlers
 */
export abstract class BrowserCrawler<TOptions> extends BasicCrawler {
    /**
     * A reference to the underlying {@link ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * A reference to the underlying `BrowserPool` class that manages the crawler's browsers.
     * For more information about it, see the [`browser-pool` module](https://github.com/apify/browser-pool).
     * @todo the type is almost unusable with so many generic arguments, what should go there? we need inference
     */
    browserPool: BrowserPool<any, any, any, any, any, any>;

    launchContext: BrowserLaunchContext<TOptions>;

    protected handlePageFunction: BrowserHandlePageFunction;
    protected handlePageTimeoutSecs: number;
    protected handlePageTimeoutMillis: number;
    protected navigationTimeoutMillis: number;
    protected gotoFunction?: GotoFunction;
    protected defaultGotoOptions: { timeout: number };
    protected preNavigationHooks: BrowserHook[];
    protected postNavigationHooks: BrowserHook[];
    protected persistCookiesPerSession: boolean;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,
        // TODO temporary until the API is unified in V2
        handleRequestFunction: ow.undefined as never,

        handlePageFunction: ow.function,
        gotoFunction: ow.optional.function,

        gotoTimeoutSecs: ow.optional.number.greaterThan(0),
        navigationTimeoutSecs: ow.optional.number.greaterThan(0),
        handlePageTimeoutSecs: ow.optional.number.greaterThan(0),
        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,

        browserPoolOptions: ow.object,
        sessionPoolOptions: ow.optional.object,
        persistCookiesPerSession: ow.optional.boolean,
        useSessionPool: ow.optional.boolean,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
    };

    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    protected constructor(options: BrowserCrawlerOptions) {
        ow(options, 'BrowserCrawlerOptions', ow.object.exactShape(BrowserCrawler.optionsShape));
        const {
            handlePageFunction,
            handlePageTimeoutSecs = 60,
            navigationTimeoutSecs = 60,
            gotoFunction, // deprecated
            gotoTimeoutSecs, // deprecated
            persistCookiesPerSession,
            proxyConfiguration,
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args as [BrowserCrawlingContext]),
            handleRequestTimeoutSecs: navigationTimeoutSecs + handlePageTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        });

        // Cookies should be persisted per session only if session pool is used
        if (!this.useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        if (gotoTimeoutSecs) {
            this.log.deprecated('Option "gotoTimeoutSecs" is deprecated. Use "navigationTimeoutSecs" instead.');
        }

        this.handlePageFunction = handlePageFunction;
        this.handlePageTimeoutSecs = handlePageTimeoutSecs;
        this.handlePageTimeoutMillis = this.handlePageTimeoutSecs * 1000;
        this.navigationTimeoutMillis = (gotoTimeoutSecs || navigationTimeoutSecs) * 1000;

        this.gotoFunction = gotoFunction;
        this.defaultGotoOptions = {
            timeout: this.navigationTimeoutMillis,
        };

        this.proxyConfiguration = proxyConfiguration;

        /** @type {Array<Hook>} */
        this.preNavigationHooks = preNavigationHooks;
        /** @type {Array<Hook>} */
        this.postNavigationHooks = postNavigationHooks;

        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession !== undefined ? persistCookiesPerSession : true;
        } else {
            this.persistCookiesPerSession = false;
        }

        const { preLaunchHooks = [], postLaunchHooks = [], ...rest } = browserPoolOptions as any; // TODO hooks from browser pool options?
        this.browserPool = new BrowserPool({
            ...rest,
            preLaunchHooks: [
                this._extendLaunchContext.bind(this),
                ...preLaunchHooks,
            ],
            postLaunchHooks: [
                this._maybeAddSessionRetiredListener.bind(this),
                ...postLaunchHooks,
            ],
        });
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     */
    protected override async _handleRequestFunction(crawlingContext: BrowserCrawlingContext) {
        const { id } = crawlingContext;
        const page = await this.browserPool.newPage({ id });
        this._enhanceCrawlingContextWithPageInfo(crawlingContext, page);

        const { request, session } = crawlingContext;

        if (this.useSessionPool) {
            const sessionCookies = session.getPuppeteerCookies(request.url);
            if (sessionCookies.length) {
                await crawlingContext.browserController.setCookies(page, sessionCookies);
            }
        }

        try {
            await this._handleNavigation(crawlingContext);

            await this._responseHandler(crawlingContext);

            // save cookies
            // @TODO: Should we save the cookies also after/only the handle page?
            if (this.persistCookiesPerSession) {
                const cookies = await crawlingContext.browserController.getCookies(page);
                session.setPuppeteerCookies(cookies, request.loadedUrl);
            }

            await addTimeoutToPromise(
                Promise.resolve(this.handlePageFunction(crawlingContext)),
                this.handlePageTimeoutMillis,
                `handlePageFunction timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`,
            );

            if (session) session.markGood();
        } finally {
            page.close().catch((error) => this.log.debug('Error while closing page', { error }));
        }
    }

    protected _enhanceCrawlingContextWithPageInfo(crawlingContext: BrowserCrawlingContext, page: unknown): void {
        crawlingContext.page = page;

        // This switch is because the crawlingContexts are created on per request basis.
        // However, we need to add the proxy info and session from browser, which is created based on the browser-pool configuration.
        // We would not have to do this switch if the proxy and configuration worked as in CheerioCrawler,
        // which configures proxy and session for every new request
        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page);
        crawlingContext.browserController = browserControllerInstance;

        crawlingContext.session = browserControllerInstance.launchContext.session;
        crawlingContext.proxyInfo = browserControllerInstance.launchContext.proxyInfo;
    }

    protected async _handleNavigation(crawlingContext: BrowserCrawlingContext) {
        /** @type {*} */
        const gotoOptions = { ...this.defaultGotoOptions };
        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotoOptions);
        try {
            crawlingContext.response = await this._navigationHandler(crawlingContext, gotoOptions);
        } catch (error) {
            this._handleNavigationTimeout(crawlingContext, error);

            throw error;
        }

        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotoOptions);
    }

    /**
     * Marks session bad in case of navigation timeout.
     */
    protected _handleNavigationTimeout(crawlingContext: BrowserCrawlingContext, error: Error): void {
        const { session } = crawlingContext;

        if (error && error.constructor.name === 'TimeoutError') {
            handleRequestTimeout(session, error.message);
        }
    }

    protected async _navigationHandler(crawlingContext: BrowserCrawlingContext, gotoOptions: Dictionary) {
        if (!this.gotoFunction) {
            // @TODO: although it is optional in the validation,
            //   because when you make automation library specific you can override this handler.
            throw new Error('BrowserCrawler: You must specify a gotoFunction!');
        }
        return this.gotoFunction(crawlingContext, gotoOptions);
    }

    /**
     * Should be overridden in case of different automation library that does not support this response API.
     * @todo: This can be also done as a postNavigation hook except the loadedUrl marking.
     */
    protected async _responseHandler(crawlingContext: BrowserCrawlingContext): Promise<void> {
        const { response, session, request, page } = crawlingContext as any; // FIXME page is not there yet?

        if (this.sessionPool && response) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                throwOnBlockedRequest(session, response.status());
            } else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }

        request.loadedUrl = await page.url();
    }

    protected async _extendLaunchContext(_pageId: string, launchContext: LaunchContext): Promise<void> {
        const launchContextExtends: Record<string, any> = {}; // TODO can we improve this somehow?

        if (this.sessionPool) {
            launchContextExtends.session = await this.sessionPool.getSession();
        }

        if (this.proxyConfiguration) {
            const proxyInfo = this.proxyConfiguration.newProxyInfo(launchContextExtends.session && launchContextExtends.session.id);
            launchContext.proxyUrl = proxyInfo.url;
            launchContextExtends.proxyInfo = proxyInfo;

            // Disable SSL verification for MITM proxies
            if (this.proxyConfiguration.isManInTheMiddle) {
                /**
                 * @see https://playwright.dev/docs/api/class-browser/#browser-new-context
                 * @see https://github.com/puppeteer/puppeteer/blob/main/docs/api.md
                 */
                // @ts-ignore
                launchContext.launchOptions.ignoreHTTPSErrors = true;
            }
        }

        launchContext.extend(launchContextExtends);
    }

    protected _maybeAddSessionRetiredListener(_pageId: string, browserController: BrowserController): void {
        if (this.sessionPool) {
            const listener = (session: Session) => {
                const { launchContext } = browserController;
                if (session.id === (launchContext.session as Session).id) {
                    this.browserPool.retireBrowserController(browserController);
                }
            };

            this.sessionPool.on(EVENT_SESSION_RETIRED, listener);
            browserController.on(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, () => this.sessionPool!.removeListener(EVENT_SESSION_RETIRED, listener));
        }
    }

    /**
     * Function for cleaning up after all request are processed.
     * @ignore
     */
    override async teardown(): Promise<void> {
        await this.browserPool.destroy();
        await super.teardown();
    }
}
