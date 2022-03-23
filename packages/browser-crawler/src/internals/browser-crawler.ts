import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import {
    EnqueueLinksOptions,
    CrawlerHandleFailedRequestInput,
    CrawlingContext,
    enqueueLinks,
    EVENT_SESSION_RETIRED,
    handleRequestTimeout,
    ProxyConfiguration,
    ProxyInfo,
    QueueOperationInfo,
    RequestQueue,
    Session,
    throwOnBlockedRequest,
    validators,
} from '@crawlers/core';
import {
    BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
    BasicCrawler,
    BasicCrawlerOptions,
} from '@crawlers/basic';
import { Awaitable, Dictionary } from '@crawlers/utils';
import {
    BROWSER_CONTROLLER_EVENTS,
    BrowserController,
    BrowserPlugin,
    BrowserPool,
    BrowserPoolHooks,
    BrowserPoolOptions,
    CommonPage,
    InferBrowserPluginArray,
    LaunchContext,
} from 'browser-pool';
import ow from 'ow';
import { BrowserLaunchContext } from './browser-launcher';

export interface BrowserCrawlingContext<
    Page extends CommonPage = CommonPage,
    Response = Dictionary<any>,
    ProvidedController = BrowserController,
> extends CrawlingContext {
    browserController: ProvidedController;
    page: Page;
    response?: Response;
    crawler: BrowserCrawler;
    enqueueLinks: (options?: BrowserCrawlerEnqueueLinksOptions) => Promise<QueueOperationInfo[]>;
}

export interface BrowserCrawlerHandleFailedRequestInput extends CrawlerHandleFailedRequestInput {
    crawler: BrowserCrawler;
}

export type BrowserCrawlerHandleFailedRequest = (inputs: BrowserCrawlerHandleFailedRequestInput) => Awaitable<void>;

export type BrowserCrawlerHandleRequest<Context extends BrowserCrawlingContext = BrowserCrawlingContext> = (inputs: Context) => Awaitable<void>;

export type BrowserCrawlerEnqueueLinksOptions = Omit<EnqueueLinksOptions, 'requestQueue' | 'urls'>

export type BrowserHook<
    Context = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> | undefined = Dictionary
> = (crawlingContext: Context, gotoOptions: GoToOptions) => Awaitable<void>;

export type GotoFunction<
    Context = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> | undefined = Dictionary
> = (context: Context, gotoOptions?: GoToOptions) => Awaitable<any>;

export interface BrowserCrawlerOptions<
    Context extends BrowserCrawlingContext = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> | undefined = Dictionary,
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    __BrowserPlugins extends BrowserPlugin[] = InferBrowserPluginArray<InternalBrowserPoolOptions['browserPlugins']>,
    __BrowserControllerReturn extends BrowserController = ReturnType<__BrowserPlugins[number]['createController']>,
    __LaunchContextReturn extends LaunchContext = ReturnType<__BrowserPlugins[number]['createLaunchContext']>
> extends Omit<
    BasicCrawlerOptions,
    // Overridden with browser context
    | 'requestHandler'
    | 'handleRequestFunction'
    // Overridden with browser context
    | 'failedRequestHandler'
    | 'handleFailedRequestFunction'
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
    requestHandler: BrowserCrawlerHandleRequest<Context>;

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
     *
     * @deprecated `handlePageFunction` has been renamed to `requestHandler` and will be removed in a future version.
     */
    handlePageFunction?: BrowserCrawlerHandleRequest<Context>;

    /**
     * Navigation function for corresponding library. `page.goto(url)` is supported by both `playwright` and `puppeteer`.
     */
    gotoFunction?: GotoFunction<Context, GoToOptions>;

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
     *
     */
    failedRequestHandler?: BrowserCrawlerHandleFailedRequest;

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
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     */
    handleFailedRequestFunction?: BrowserCrawlerHandleFailedRequest;

    /**
     * Custom options passed to the underlying [`BrowserPool`](https://github.com/apify/browser-pool#BrowserPool) constructor.
     * You can tweak those to fine-tune browser management.
     */
    browserPoolOptions?: Partial<BrowserPoolOptions> & Partial<BrowserPoolHooks<__BrowserControllerReturn, __LaunchContextReturn>>;

    /**
     * If set, the crawler will be configured for all connections to use
     * [Apify Proxy](https://console.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
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
    preNavigationHooks?: BrowserHook<Context>[];

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
    postNavigationHooks?: BrowserHook<Context>[];

    /**
     * Timeout in which page navigation needs to finish, in seconds.
     */
    navigationTimeoutSecs?: number;

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
export abstract class BrowserCrawler<
    InternalBrowserPoolOptions extends BrowserPoolOptions = BrowserPoolOptions,
    LaunchOptions = Dictionary,
    Context extends BrowserCrawlingContext = BrowserCrawlingContext,
    GoToOptions extends Record<PropertyKey, any> = Dictionary
> extends BasicCrawler<Context> {
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
    browserPool: BrowserPool<InternalBrowserPoolOptions>;

    launchContext?: BrowserLaunchContext<LaunchOptions, unknown>;

    protected userProvidedRequestHandler!: BrowserCrawlerHandleRequest<Context>;
    protected navigationTimeoutMillis: number;
    protected gotoFunction?: GotoFunction<Context, GoToOptions>;
    protected defaultGotoOptions: GoToOptions;
    protected preNavigationHooks: BrowserHook<Context>[];
    protected postNavigationHooks: BrowserHook<Context>[];
    protected persistCookiesPerSession: boolean;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,
        handlePageFunction: ow.optional.function,

        gotoFunction: ow.optional.function,

        gotoTimeoutSecs: ow.optional.number.greaterThan(0),
        navigationTimeoutSecs: ow.optional.number.greaterThan(0),
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
    protected constructor(options: BrowserCrawlerOptions<Context, GoToOptions>) {
        ow(options, 'BrowserCrawlerOptions', ow.object.exactShape(BrowserCrawler.optionsShape));
        const {
            navigationTimeoutSecs = 60,
            requestHandlerTimeoutSecs = 60,
            gotoFunction, // deprecated
            gotoTimeoutSecs, // deprecated
            persistCookiesPerSession,
            proxyConfiguration,
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            // Ignored
            handleRequestFunction,

            requestHandler: userProvidedRequestHandler,
            handlePageFunction,

            failedRequestHandler,
            handleFailedRequestFunction,
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            requestHandler: (...args) => this._runRequestHandler(...args),
            requestHandlerTimeoutSecs: navigationTimeoutSecs + requestHandlerTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        });

        this._handlePropertyNameChange({
            newName: 'requestHandler',
            oldName: 'handlePageFunction',
            propertyKey: 'userProvidedRequestHandler',
            newProperty: userProvidedRequestHandler,
            oldProperty: handlePageFunction,
        });

        this._handlePropertyNameChange({
            newName: 'failedRequestHandler',
            oldName: 'handleFailedRequestFunction',
            propertyKey: 'failedRequestHandler',
            newProperty: failedRequestHandler,
            oldProperty: handleFailedRequestFunction,
            allowUndefined: true,
        });

        // Cookies should be persisted per session only if session pool is used
        if (!this.useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        if (gotoTimeoutSecs) {
            this.log.deprecated('Option "gotoTimeoutSecs" is deprecated. Use "navigationTimeoutSecs" instead.');
        }

        this.navigationTimeoutMillis = (gotoTimeoutSecs || navigationTimeoutSecs) * 1000;

        this.gotoFunction = gotoFunction;
        this.defaultGotoOptions = {
            timeout: this.navigationTimeoutMillis,
        } as unknown as GoToOptions;

        this.proxyConfiguration = proxyConfiguration;

        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = postNavigationHooks;

        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession !== undefined ? persistCookiesPerSession : true;
        } else {
            this.persistCookiesPerSession = false;
        }

        const { preLaunchHooks = [], postLaunchHooks = [], ...rest } = browserPoolOptions;

        this.browserPool = new BrowserPool<InternalBrowserPoolOptions>({
            ...rest as any,
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
    protected override async _runRequestHandler(crawlingContext: Context) {
        const newPageOptions: Dictionary = {
            id: crawlingContext.id,
        };

        const useIncognitoPages = this.launchContext?.useIncognitoPages;

        if (this.proxyConfiguration && useIncognitoPages) {
            const { session } = crawlingContext;

            const proxyInfo = this.proxyConfiguration.newProxyInfo(session?.id);
            crawlingContext.proxyInfo = proxyInfo;

            newPageOptions.proxyUrl = proxyInfo.url;

            if (this.proxyConfiguration.isManInTheMiddle) {
                /**
                 * @see https://playwright.dev/docs/api/class-browser/#browser-new-context
                 * @see https://github.com/puppeteer/puppeteer/blob/main/docs/api.md
                 */
                newPageOptions.pageOptions = {
                    ignoreHTTPSErrors: true,
                };
            }
        }

        const page = await this.browserPool.newPage(newPageOptions) as CommonPage;
        tryCancel();
        this._enhanceCrawlingContextWithPageInfo(crawlingContext, page, useIncognitoPages);

        // DO NOT MOVE THIS LINE ABOVE!
        // `enhanceCrawlingContextWithPageInfo` gives us a valid session.
        // For example, `sessionPoolOptions.sessionOptions.maxUsageCount` can be `1`.
        // So we must not save the session prior to making sure it was used only once, otherwise we would use it twice.
        const { request, session } = crawlingContext;

        if (this.useSessionPool) {
            const sessionCookies = session!.getPuppeteerCookies(request.url);
            if (sessionCookies.length) {
                await crawlingContext.browserController.setCookies(page, sessionCookies);
                tryCancel();
            }
        }

        try {
            await this._handleNavigation(crawlingContext);
            tryCancel();

            await this._responseHandler(crawlingContext);
            tryCancel();

            // save cookies
            // TODO: Should we save the cookies also after/only the handle page?
            if (this.persistCookiesPerSession) {
                const cookies = await crawlingContext.browserController.getCookies(page);
                tryCancel();
                session?.setPuppeteerCookies(cookies, request.loadedUrl!);
            }

            await addTimeoutToPromise(
                () => Promise.resolve(this.userProvidedRequestHandler(crawlingContext)),
                this.requestHandlerTimeoutMillis,
                `requestHandler timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds.`,
            );
            tryCancel();

            if (session) session.markGood();
        } finally {
            page.close().catch((error: Error) => this.log.debug('Error while closing page', { error }));
        }
    }

    protected _enhanceCrawlingContextWithPageInfo(crawlingContext: Context, page: CommonPage, useIncognitoPages?: boolean): void {
        crawlingContext.page = page;

        // This switch is because the crawlingContexts are created on per request basis.
        // However, we need to add the proxy info and session from browser, which is created based on the browser-pool configuration.
        // We would not have to do this switch if the proxy and configuration worked as in CheerioCrawler,
        // which configures proxy and session for every new request
        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page as any) as Context['browserController'];
        crawlingContext.browserController = browserControllerInstance;

        if (!useIncognitoPages) {
            crawlingContext.session = browserControllerInstance.launchContext.session as Session;
        }

        if (!crawlingContext.proxyInfo) {
            crawlingContext.proxyInfo = browserControllerInstance.launchContext.proxyInfo as ProxyInfo;
        }

        crawlingContext.enqueueLinks = async (enqueueOptions) => {
            return browserCrawlerEnqueueLinks({
                options: enqueueOptions,
                page,
                requestQueue: await this.getRequestQueue(),
                defaultBaseUrl: new URL(crawlingContext.request.loadedUrl ?? crawlingContext.request.url).origin,
            });
        };
    }

    protected async _handleNavigation(crawlingContext: Context) {
        const gotoOptions = { ...this.defaultGotoOptions };
        await this._executeHooks(this.preNavigationHooks, crawlingContext, gotoOptions);
        tryCancel();

        try {
            crawlingContext.response = await this._navigationHandler(crawlingContext, gotoOptions);
        } catch (error) {
            this._handleNavigationTimeout(crawlingContext, error as Error);

            throw error;
        }

        tryCancel();
        await this._executeHooks(this.postNavigationHooks, crawlingContext, gotoOptions);
    }

    /**
     * Marks session bad in case of navigation timeout.
     */
    protected _handleNavigationTimeout(crawlingContext: Context, error: Error): void {
        const { session } = crawlingContext;

        if (error && error.constructor.name === 'TimeoutError') {
            handleRequestTimeout({ session, errorMessage: error.message });
        }
    }

    protected async _navigationHandler(crawlingContext: Context, gotoOptions: GoToOptions) {
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
    protected async _responseHandler(crawlingContext: Context): Promise<void> {
        const { response, session, request, page } = crawlingContext;

        if (this.sessionPool && response && session) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                throwOnBlockedRequest(session, response.status());
            } else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }

        request.loadedUrl = await page.url();
    }

    protected async _extendLaunchContext(_pageId: string, launchContext: LaunchContext): Promise<void> {
        const launchContextExtends: { session?: Session; proxyInfo?: ProxyInfo } = {};

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
                (launchContext.launchOptions as Dictionary).ignoreHTTPSErrors = true;
            }
        }

        launchContext.extend(launchContextExtends);
    }

    protected _maybeAddSessionRetiredListener(_pageId: string, browserController: Context['browserController']): void {
        if (this.sessionPool) {
            const listener = (session: Session) => {
                const { launchContext } = browserController;
                if (session.id === (launchContext.session as Session).id) {
                    this.browserPool.retireBrowserController(
                        browserController as Parameters<BrowserPool<InternalBrowserPoolOptions>['retireBrowserController']>[0],
                    );
                }
            };

            this.sessionPool.on(EVENT_SESSION_RETIRED, listener);
            browserController.on(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, () => {
                return this.sessionPool!.removeListener(EVENT_SESSION_RETIRED, listener);
            });
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

/** @internal */
interface EnqueueLinksInternalOptions {
    options?: BrowserCrawlerEnqueueLinksOptions;
    page: CommonPage;
    requestQueue?: RequestQueue;
    defaultBaseUrl?: string;
}

/** @internal */
export async function browserCrawlerEnqueueLinks({ options, page, requestQueue, defaultBaseUrl }: EnqueueLinksInternalOptions) {
    const baseUrl = options?.baseUrl ?? defaultBaseUrl;
    const transformRequestFunction = options?.transformRequestFunction;

    const urls = await extractUrlsFromPage(page as any, options?.selector ?? 'a', baseUrl);

    return enqueueLinks({
        // FIXME this does not make much sense, as the instance would be ignored by any crawler - the argument needs to be required
        requestQueue: requestQueue ?? await RequestQueue.open(),
        urls,
        baseUrl,
        transformRequestFunction,
        ...options,
    });
}

/**
 * Extracts URLs from a given page.
 * @ignore
 */
// eslint-disable-next-line @typescript-eslint/ban-types
async function extractUrlsFromPage(page: { $$eval: Function }, selector: string, baseUrl?: string): Promise<string[]> {
    const urls = await page.$$eval(selector, (linkEls: HTMLLinkElement[]) => linkEls.map((link) => link.getAttribute('href')).filter((href) => !!href));

    return urls.map((href: string) => {
        // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
        const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
        if (!isHrefAbsolute && !baseUrl) {
            throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                    + 'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
        }
        return baseUrl
            ? (new URL(href, baseUrl)).href
            : href;
    });
}
