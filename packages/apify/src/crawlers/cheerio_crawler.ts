import { readStreamToString, concatStreamToBuffer } from '@apify/utilities';
import cheerio, { CheerioOptions, load } from 'cheerio';
import contentTypeParser, { RequestLike, ResponseLike } from 'content-type';
import { DomHandler } from 'htmlparser2';
import { WritableStream } from 'htmlparser2/lib/WritableStream';
import iconv from 'iconv-lite';
import ow from 'ow';
import util from 'util';
import { TimeoutError } from 'got-scraping';
import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import { BASIC_CRAWLER_TIMEOUT_BUFFER_SECS } from '../constants';
import { addTimeoutToPromise, parseContentTypeFromResponse } from '../utils';
import { requestAsBrowser, RequestAsBrowserOptions } from '../utils_request';
import { diffCookies, mergeCookies } from './crawler_utils';
import { BasicCrawler, HandleFailedRequest, CrawlingContext, BasicCrawlerOptions } from './basic_crawler';
import { CrawlerExtension } from './crawler_extension';
import { AutoscaledPool } from '../autoscaling/autoscaled_pool';
import { Request, RequestOptions } from '../request';
import { RequestList } from '../request_list';
import { ProxyConfiguration, ProxyInfo } from '../proxy_configuration';
import { RequestQueue } from '../storages/request_queue';
import { Session } from '../session_pool/session';
import { validators } from '../validators';
import { BrowserHandlePageFunction, GotoFunction, Hook } from './browser_crawler';
import { Awaitable } from '../typedefs';

/**
 * Default mime types, which CheerioScraper supports.
 */
const HTML_AND_XML_MIME_TYPES = ['text/html', 'text/xml', 'application/xhtml+xml', 'application/xml'];
const APPLICATION_JSON_MIME_TYPE = 'application/json';
const CHEERIO_OPTIMIZED_AUTOSCALED_POOL_OPTIONS = {
    snapshotterOptions: {
        eventLoopSnapshotIntervalSecs: 2,
        maxBlockedMillis: 100,
    },
    systemStatusOptions: {
        maxEventLoopOverloadedRatio: 0.7,
    },
};

export interface CheerioCrawlerOptions extends Omit<BasicCrawlerOptions, 'handleRequestFunction'> {
    /**
     * User-provided function that performs the logic of the crawler. It is called for each page
     * loaded and parsed by the crawler.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *   // The Cheerio object's function with the parsed HTML.
     *   $: Cheerio,
     *
     *   // The request body of the web page, whose type depends on the content type.
     *   body: String|Buffer,
     *
     *   // The parsed object from JSON for responses with the "application/json" content types.
     *   // For other content types it's null.
     *   json: Object,
     *
     *   // Apify.Request object with details of the requested web page
     *   request: Request,
     *
     *   // Parsed Content-Type HTTP header: { type, encoding }
     *   contentType: Object,
     *
     *   // An instance of Node's http.IncomingMessage object,
     *   response: Object,
     *
     *   // Session object, useful to work around anti-scraping protections
     *   session: Session
     *
     *   // ProxyInfo object with information about currently used proxy
     *   proxyInfo: ProxyInfo
     *
     *   // The running cheerio crawler instance.
     *   crawler: CheerioCrawler
     * }
     * ```
     *
     * Type of `body` depends on the `Content-Type` header of the web page:
     * - String for `text/html`, `application/xhtml+xml`, `application/xml` MIME content types
     * - Buffer for others MIME content types
     *
     * Parsed `Content-Type` header using
     * [content-type package](https://www.npmjs.com/package/content-type)
     * is stored in `contentType`.
     *
     * Cheerio is available only for HTML and XML content types.
     *
     * With the {@link Request} object representing the URL to crawl.
     *
     * If the function returns, the returned promise is awaited by the crawler.
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
    handlePageFunction: CheerioHandlePage;

    /**
     * > This option is deprecated, use `preNavigationHooks` instead.
     *
     * A function that executes before the HTTP request is made to the target resource.
     * This function is suitable for setting dynamic properties such as cookies to the {@link Request}.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *     request: Request,
     *     session: Session,
     *     proxyInfo: ProxyInfo,
     *     crawler: CheerioCrawler,
     * }
     * ```
     * where the {@link Request} instance corresponds to the initialized request
     * and the {@link Session} instance corresponds to used session.
     *
     * The function should modify the properties of the passed {@link Request} instance
     * in place because there are already earlier references to it. Making a copy and returning it from
     * this function is therefore not supported, because it would create inconsistencies where
     * different parts of SDK would have access to a different {@link Request} instance.
     */
    prepareRequestFunction?: PrepareRequest;

    /**
     * > This option is deprecated, use `postNavigationHooks` instead.
     *
     * A function that executes right after the HTTP request is made to the target resource and response is returned.
     * This function is suitable for overriding custom properties of response e.g. setting headers because of response parsing.
     *
     * **Example usage:**
     *
     * ```javascript
     * const cheerioCrawlerOptions = {
     *     // ...
     *     postResponseFunction: ({ request, response }) => {
     *         if (request.userData.parseAsJSON) {
     *             response.headers['content-type'] = 'application/json; charset=utf-8';
     *         }
     *     }
     * }
     * ```
     * The function receives the following object as an argument:
     * ```
     * {
     *     response: Object,
     *     request: Request,
     *     session: Session,
     *     proxyInfo: ProxyInfo,
     *     crawler: CheerioCrawler,
     * }
     * ```
     * The response is an instance of Node's http.IncomingMessage object.
     */
    postResponseFunction?: PostResponse;

    /**
     * Timeout in which the function passed as `handlePageFunction` needs to finish, given in seconds.
     */
    handlePageTimeoutSecs?: number;

    /**
     * Timeout in which the HTTP request to the resource needs to finish, given in seconds.
     */
    requestTimeoutSecs?: number;

    /**
     * If set to true, SSL certificate errors will be ignored.
     */
    ignoreSslErrors?: boolean;

    /**
     * If set, `CheerioCrawler` will be configured for all connections to use
     * [Apify Proxy](https://my.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
     * For more information, see the [documentation](https://docs.apify.com/proxy).
     */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     * The function receives the following object as an argument:
     * ```
     * {
     *     error: Error,
     *     request: Request,
     *     session: Session,
     *     $: Cheerio,
     *     body: String|Buffer,
     *     json: Object,
     *     contentType: Object,
     *     response: Object,
     *     proxyInfo: ProxyInfo,
     *     crawler: CheerioCrawler,
     * }
     * ```
     * where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     *
     * See [source code](https://github.com/apify/apify-js/blob/master/src/crawlers/cheerio_crawler.js#L13)
     * for the default implementation of this function.
     */
    handleFailedRequestFunction?: HandleFailedRequest;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `requestAsBrowserOptions`,
     * which are passed to the `requestAsBrowser()` function the crawler calls to navigate.
     * Example:
     * ```
     * preNavigationHooks: [
     *     async (crawlingContext, requestAsBrowserOptions) => {
     *         requestAsBrowserOptions.forceUrlEncoding = true;
     *     },
     * ]
     * ```
     */
    preNavigationHooks?: Hook[];

    /**
     * Async functions that are sequentially evaluated after the navigation. Good for checking if the navigation was successful.
     * The function accepts `crawlingContext` as the only parameter.
     * Example:
     * ```
     * postNavigationHooks: [
     *     async (crawlingContext) => {
     *         // ...
     *     },
     * ]
     * ```
     */
    postNavigationHooks?: Hook[];

    /**
     * An array of [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types)
     * you want the crawler to load and process. By default, only `text/html` and `application/xhtml+xml` MIME types are supported.
     */
    additionalMimeTypes?: string[];

    /**
     * By default `CheerioCrawler` will extract correct encoding from the HTTP response headers.
     * Sadly, there are some websites which use invalid headers. Those are encoded using the UTF-8 encoding.
     * If those sites actually use a different encoding, the response will be corrupted. You can use
     * `suggestResponseEncoding` to fall back to a certain encoding, if you know that your target website uses it.
     * To force a certain encoding, disregarding the response headers, use {@link CheerioCrawlerOptions.forceResponseEncoding}
     * ```
     * // Will fall back to windows-1250 encoding if none found
     * suggestResponseEncoding: 'windows-1250'
     * ```
     */
    suggestResponseEncoding?: string;

    /**
     * By default `CheerioCrawler` will extract correct encoding from the HTTP response headers. Use `forceResponseEncoding`
     * to force a certain encoding, disregarding the response headers.
     * To only provide a default for missing encodings, use {@link CheerioCrawlerOptions.suggestResponseEncoding}
     * ```
     * // Will force windows-1250 encoding even if headers say otherwise
     * forceResponseEncoding: 'windows-1250'
     * ```
     */
    forceResponseEncoding?: string;

    /**
     * Automatically saves cookies to Session. Works only if Session Pool is used.
     *
     * It parses cookie from response "set-cookie" header saves or updates cookies for session and once the session is used for next request.
     * It passes the "Cookie" header to the request with the session cookies.
     */
    persistCookiesPerSession?: boolean;
}

export interface PrepareRequestInputs {
    /**
     *  Original instance of the {@link Request} object. Must be modified in-place.
     */
    request: Request;

    /**
     * The current session
     */
    session?: Session;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@link ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;
    crawler?: CheerioCrawler;
}

export type PrepareRequest = (inputs: PrepareRequestInputs) => (void | Promise<void>);
export type CheerioHook = Hook<CheerioCrawlingContext>;

export interface PostResponseInputs {
    /**
     * stream
     */
    response?: IncomingMessage;

    /**
     * Original instance fo the {Request} object. Must be modified in-place.
     */
    request: Request;

    /**
     * The current session
     */
    session?: Session;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@link ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;
    crawler: CheerioCrawler;
}

export type PostResponse = (inputs: PostResponseInputs) => (void | Promise<void>);
export type CheerioRoot = ReturnType<typeof load>;

export interface CheerioHandlePageInputs extends CrawlingContext {
    /**
     *  The [Cheerio](https://cheerio.js.org/) object with parsed HTML.
     */
    $: CheerioRoot;

    /**
     *  The request body of the web page.
     */
    body: (string | Buffer);

    /**
     *  The parsed object from JSON string if the response contains the content type application/json.
     */
    json: any;

    /**
     *  Parsed `Content-Type header: { type, encoding }`.
     */
    contentType: { type: string; encoding: string };
    crawler: CheerioCrawler;
}

export type CheerioCrawlingContext = CheerioHandlePageInputs; // alias for better discoverability
export type CheerioHandlePage = (inputs: CheerioHandlePageInputs) => Awaitable<void>;

/**
 * Provides a framework for the parallel crawling of web pages using plain HTTP requests and
 * [cheerio](https://www.npmjs.com/package/cheerio) HTML parser.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `CheerioCrawler` uses raw HTTP requests to download web pages,
 * it is very fast and efficient on data bandwidth. However, if the target website requires JavaScript
 * to display the content, you might need to use {@link PuppeteerCrawler} or {@link PlaywrightCrawler} instead,
 * because it loads the pages using full-featured headless Chrome browser.
 *
 * `CheerioCrawler` downloads each URL using a plain HTTP request,
 * parses the HTML content using [Cheerio](https://www.npmjs.com/package/cheerio)
 * and then invokes the user-provided {@link CheerioCrawlerOptions.handlePageFunction} to extract page data
 * using a [jQuery](https://jquery.com/)-like interface to the parsed HTML DOM.
 *
 * The source URLs are represented using {@link Request} objects that are fed from
 * {@link RequestList} or {@link RequestQueue} instances provided by the {@link CheerioCrawlerOptions.requestList}
 * or {@link CheerioCrawlerOptions.requestQueue} constructor options, respectively.
 *
 * If both {@link CheerioCrawlerOptions.requestList} and {@link CheerioCrawlerOptions.requestQueue} are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@link Request} objects to crawl.
 *
 * `CheerioCrawler` downloads the web pages using the {@link utils.requestAsBrowser} utility function.
 * As opposed to the browser based crawlers that are automatically encoding the URLs, the
 * {@link utils.requestAsBrowser} function will not do so. We either need to manually encode the URLs
 * via `encodeURI()` function, or set `forceUrlEncoding: true` in the `requestAsBrowserOptions`,
 * which will automatically encode all the URLs before accessing them.
 *
 * > We can either use `forceUrlEncoding` or encode manually, but not both - it would
 * > result in double encoding and therefore lead to invalid URLs.
 *
 * We can use the `preNavigationHooks` to adjust `requestAsBrowserOptions`:
 *
 * ```
 * preNavigationHooks: [
 *     (crawlingContext, requestAsBrowserOptions) => {
 *         requestAsBrowserOptions.forceUrlEncoding = true;
 *     },
 * ]
 * ```
 *
 * By default, `CheerioCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@link CheerioCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For details, see {@link CheerioCrawlerOptions.handlePageFunction}.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPool} options are available directly in the `CheerioCrawler` constructor.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Prepare a list of URLs to crawl
 * const requestList = new Apify.RequestList({
 *   sources: [
 *       { url: 'http://www.example.com/page-1' },
 *       { url: 'http://www.example.com/page-2' },
 *   ],
 * });
 * await requestList.initialize();
 *
 * // Crawl the URLs
 * const crawler = new Apify.CheerioCrawler({
 *     requestList,
 *     handlePageFunction: async ({ request, response, body, contentType, $ }) => {
 *         const data = [];
 *
 *         // Do some data extraction from the page with Cheerio.
 *         $('.some-collection').each((index, el) => {
 *             data.push({ title: $(el).find('.some-title').text() });
 *         });
 *
 *         // Save the data to dataset.
 *         await Apify.pushData({
 *             url: request.url,
 *             html: body,
 *             data,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 * @category Crawlers
 */
export class CheerioCrawler extends BasicCrawler {
    /**
     * A reference to the underlying {@link ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    public proxyConfiguration?: ProxyConfiguration;

    protected handlePageFunction: BrowserHandlePageFunction;
    protected handlePageTimeoutSecs: number;
    protected handlePageTimeoutMillis: number;
    protected navigationTimeoutMillis: number;
    protected gotoFunction: GotoFunction;
    protected defaultGotoOptions: { timeout: number };
    protected preNavigationHooks: Hook[];
    protected postNavigationHooks: Hook[];
    protected persistCookiesPerSession: boolean;
    protected requestTimeoutMillis: number;
    protected ignoreSslErrors: boolean;
    protected suggestResponseEncoding?: string;
    protected forceResponseEncoding?: string;
    protected prepareRequestFunction?: PrepareRequest;
    protected postResponseFunction?: PostResponse;
    protected readonly supportedMimeTypes: Set<string>;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,
        // TODO temporary until the API is unified in V2
        handleRequestFunction: ow.undefined as never,

        handlePageFunction: ow.function,
        requestTimeoutSecs: ow.optional.number,
        handlePageTimeoutSecs: ow.optional.number,
        ignoreSslErrors: ow.optional.boolean,
        additionalMimeTypes: ow.optional.array.ofType(ow.string),
        suggestResponseEncoding: ow.optional.string,
        forceResponseEncoding: ow.optional.string,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
        prepareRequestFunction: ow.optional.function,
        postResponseFunction: ow.optional.function,
        persistCookiesPerSession: ow.optional.boolean,

        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,
    };

    /**
     * All `CheerioCrawler` parameters are passed via an options object.
     */
    constructor(options: CheerioCrawlerOptions) {
        ow(options, 'CheerioCrawlerOptions', ow.object.exactShape(CheerioCrawler.optionsShape));

        const {
            handlePageFunction,
            requestTimeoutSecs = 30,
            handlePageTimeoutSecs = 60,
            ignoreSslErrors = true,
            additionalMimeTypes = [],
            suggestResponseEncoding,
            forceResponseEncoding,
            proxyConfiguration,
            prepareRequestFunction,
            postResponseFunction,
            persistCookiesPerSession,
            preNavigationHooks = [],
            postNavigationHooks = [],

            // BasicCrawler
            autoscaledPoolOptions = CHEERIO_OPTIMIZED_AUTOSCALED_POOL_OPTIONS,
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            // TODO temporary until the API is unified in V2
            handleRequestFunction: handlePageFunction,
            autoscaledPoolOptions,
            // We need to add some time for internal functions to finish,
            // but not too much so that we would stall the crawler.
            handleRequestTimeoutSecs: requestTimeoutSecs + handlePageTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        });

        // Cookies should be persisted per session only if session pool is used
        if (!this.useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        this.supportedMimeTypes = new Set([...HTML_AND_XML_MIME_TYPES, APPLICATION_JSON_MIME_TYPE]);
        if (additionalMimeTypes.length) this._extendSupportedMimeTypes(additionalMimeTypes);

        if (suggestResponseEncoding && forceResponseEncoding) {
            this.log.warning('Both forceResponseEncoding and suggestResponseEncoding options are set. Using forceResponseEncoding.');
        }

        this.handlePageTimeoutMillis = handlePageTimeoutSecs * 1000;
        this.requestTimeoutMillis = requestTimeoutSecs * 1000;
        this.ignoreSslErrors = ignoreSslErrors;
        this.suggestResponseEncoding = suggestResponseEncoding;
        this.forceResponseEncoding = forceResponseEncoding;
        this.prepareRequestFunction = prepareRequestFunction;
        this.postResponseFunction = postResponseFunction;
        this.proxyConfiguration = proxyConfiguration;
        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = [
            ({ request, response }) => this._abortDownloadOfBody(request, response!),
            ...postNavigationHooks,
        ];

        if (this.useSessionPool) {
            this.persistCookiesPerSession = persistCookiesPerSession !== undefined ? persistCookiesPerSession : true;
        } else {
            this.persistCookiesPerSession = false;
        }
    }

    /**
     * **EXPERIMENTAL**
     * Function for attaching CrawlerExtensions such as the Unblockers.
     * @param extension Crawler extension that overrides the crawler configuration.
     */
    use(extension: CrawlerExtension) {
        ow(extension, ow.object.instanceOf(CrawlerExtension));

        const extensionOptions = extension.getCrawlerOptions();
        // TODO temporary until the API is unified in V2
        extensionOptions.userProvidedHandler = extensionOptions.handlePageFunction;
        delete extensionOptions.handlePageFunction;

        for (const [key, value] of Object.entries(extensionOptions)) {
            const isConfigurable = this.hasOwnProperty(key); // eslint-disable-line
            const originalType = typeof this[key];
            const extensionType = typeof value; // What if we want to null something? It is really needed?
            const isSameType = originalType === extensionType || value == null; // fast track for deleting keys
            const exists = this[key] != null;

            if (!isConfigurable) { // Test if the property can be configured on the crawler
                throw new Error(`${extension.name} tries to set property "${key}" that is not configurable on CheerioCrawler instance.`);
            }

            if (!isSameType && exists) { // Assuming that extensions will only add up configuration
                throw new Error(
                    `${extension.name} tries to set property of different type "${extensionType}". "CheerioCrawler.${key}: ${originalType}".`,
                );
            }

            this.log.warning(`${extension.name} is overriding "CheerioCrawler.${key}: ${originalType}" with ${value}.`);

            this[key] = value;
        }
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     */
    protected override async _handleRequestFunction(crawlingContext: CheerioCrawlingContext) {
        const { request, session } = crawlingContext;

        if (this.proxyConfiguration) {
            const sessionId = session ? session.id : undefined;
            crawlingContext.proxyInfo = this.proxyConfiguration.newProxyInfo(sessionId);
        }

        await this._handleNavigation(crawlingContext);

        const { dom, isXml, body, contentType, response } = await this._parseResponse(request, crawlingContext.response!);

        if (this.useSessionPool) {
            this._throwOnBlockedRequest(session, response.statusCode);
        }

        if (this.persistCookiesPerSession) {
            session.setCookiesFromResponse(response);
        }

        request.loadedUrl = response.url;

        const $ = dom
            ? cheerio.load(dom as string, {
                xmlMode: isXml,
                // Recent versions of cheerio use parse5 as the HTML parser/serializer. It's more strict than htmlparser2
                // and not good for scraping. It also does not have a great streaming interface.
                // Here we tell cheerio to use htmlparser2 for serialization, otherwise the conflict produces weird errors.
                _useHtmlParser2: true,
            } as CheerioOptions)
            : null;

        crawlingContext.$ = $!;
        crawlingContext.contentType = contentType;
        crawlingContext.response = response;
        Object.defineProperty(crawlingContext, 'json', {
            get() {
                if (contentType.type !== APPLICATION_JSON_MIME_TYPE) return null;
                const jsonString = body!.toString(contentType.encoding);
                return JSON.parse(jsonString);
            },
        });
        Object.defineProperty(crawlingContext, 'body', {
            get() {
                // NOTE: For XML/HTML documents, we don't store the original body and only reconstruct it from Cheerio's DOM.
                // This is to save memory for high-concurrency crawls. The downside is that changes
                // made to DOM are reflected in the HTML, but we can live with that...
                if (dom) {
                    return isXml ? $!.xml() : $!.html({ decodeEntities: false });
                }
                return body;
            },
        });

        return addTimeoutToPromise(
            Promise.resolve(this.userProvidedHandler(crawlingContext)),
            this.handlePageTimeoutMillis,
            `handlePageFunction timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`,
        );
    }

    protected async _handleNavigation(crawlingContext: CheerioCrawlingContext) {
        if (this.prepareRequestFunction) {
            this.log.deprecated('Option "prepareRequestFunction" is deprecated. Use "preNavigationHooks" instead.');
            await this.prepareRequestFunction(crawlingContext);
        }

        const requestAsBrowserOptions = {} as RequestAsBrowserOptions;

        if (this.useSessionPool) {
            this._applySessionCookie(crawlingContext, requestAsBrowserOptions);
        }

        const { request, session } = crawlingContext;
        const cookieSnapshot = request.headers?.Cookie ?? request.headers?.cookie;
        // TODO crawling context vs browser crawling context?
        await this._executeHooks(this.preNavigationHooks, crawlingContext as any, requestAsBrowserOptions);
        const proxyUrl = crawlingContext.proxyInfo && crawlingContext.proxyInfo.url;
        this._mergeRequestCookieDiff(request, cookieSnapshot!, requestAsBrowserOptions);

        crawlingContext.response = await addTimeoutToPromise(
            this._requestFunction({ request, session, proxyUrl, requestAsBrowserOptions }),
            this.requestTimeoutMillis,
            `request timed out after ${this.requestTimeoutMillis / 1000} seconds.`,
        );

        // TODO crawling context vs browser crawling context?
        await this._executeHooks(this.postNavigationHooks, crawlingContext, requestAsBrowserOptions);

        if (this.postResponseFunction) {
            this.log.deprecated('Option "postResponseFunction" is deprecated. Use "postNavigationHooks" instead.');
            // @ts-ignore maybe the context type is wrong?
            await this.postResponseFunction(crawlingContext);
        }
    }

    /**
     * When users change `request.headers.cookie` inside preNavigationHook, the change would be ignored,
     * as `request.headers` are already merged into the `requestAsBrowserOptions`. This method is using
     * old `request.headers` snapshot (before hooks are executed), makes a diff with the cookie value
     * after hooks are executed, and merges any new cookies back to `requestAsBrowserOptions`.
     *
     * This way we can still use both `requestAsBrowserOptions` and `context.request` in the hooks (not both).
     */
    private _mergeRequestCookieDiff(request: Request, cookieSnapshot: string, requestAsBrowserOptions: RequestAsBrowserOptions) {
        const cookieDiff = diffCookies(request.url, cookieSnapshot, request.headers?.Cookie ?? request.headers?.cookie);

        if (cookieDiff.length > 0) {
            requestAsBrowserOptions.headers!.Cookie = mergeCookies(request.url, [
                requestAsBrowserOptions.headers!.Cookie,
                cookieDiff,
            ]);
        }
    }

    /**
     * Function to make the HTTP request. It performs optimizations
     * on the request such as only downloading the request body if the
     * received content type matches text/html, application/xml, application/xhtml+xml.
     */
    protected async _requestFunction({ request, session, proxyUrl, requestAsBrowserOptions }: RequestFunctionOptions): Promise<IncomingMessage> {
        const opts = this._getRequestOptions(request, session, proxyUrl, requestAsBrowserOptions);
        let responseWithStream;

        try {
            responseWithStream = await requestAsBrowser(opts);
        } catch (e) {
            if (e instanceof TimeoutError) {
                this._handleRequestTimeout(session);
            } else {
                throw e;
            }
        }

        return responseWithStream;
    }

    /**
     * Sets the cookie header to `requestAsBrowserOptions` based on provided session and request. If some cookies were already set,
     * the session cookie will be merged with them. User provided cookies on `request` object have precedence.
     */
    private _applySessionCookie({ request, session }: CrawlingContext, requestAsBrowserOptions: RequestAsBrowserOptions): void {
        const userCookie = request.headers?.Cookie ?? request.headers?.cookie;
        const sessionCookie = session.getCookieString(request.url);
        const mergedCookies = mergeCookies(request.url, [sessionCookie, userCookie!]);

        // merge cookies from all possible sources
        if (mergedCookies) {
            requestAsBrowserOptions.headers ??= {};
            requestAsBrowserOptions.headers.Cookie = mergedCookies;
        }
    }

    /**
     * Encodes and parses response according to the provided content type
     */
    protected async _parseResponse(request: Request, responseStream: IncomingMessage) {
        const { statusCode } = responseStream;
        const { type, charset } = parseContentTypeFromResponse(responseStream);
        const { response, encoding } = this._encodeResponse(request, responseStream, charset);
        const contentType = { type, encoding };

        if (statusCode! >= 500) {
            const body = await readStreamToString(response, encoding);

            // Errors are often sent as JSON, so attempt to parse them,
            // despite Accept header being set to text/html.
            if (type === APPLICATION_JSON_MIME_TYPE) {
                const errorResponse = JSON.parse(body);
                let { message } = errorResponse;
                if (!message) message = util.inspect(errorResponse, { depth: 1, maxArrayLength: 10 });
                throw new Error(`${statusCode} - ${message}`);
            }

            // It's not a JSON so it's probably some text. Get the first 100 chars of it.
            throw new Error(`${statusCode} - Internal Server Error: ${body.substr(0, 100)}`);
        } else if (HTML_AND_XML_MIME_TYPES.includes(type)) {
            const dom = await this._parseHtmlToDom(response);
            return ({ dom, isXml: type.includes('xml'), response, contentType });
        } else {
            const body = await concatStreamToBuffer(response);
            return { body, response, contentType };
        }
    }

    /**
     * Combines the provided `requestOptions` with mandatory (non-overridable) values.
     */
    protected _getRequestOptions(request: Request, session?: Session, proxyUrl?: string, requestAsBrowserOptions?: RequestAsBrowserOptions) {
        const requestOptions: RequestOptions = {
            url: request.url,
            // @ts-ignore both should be typed as AllowedHttpMethods, why is this not working?
            method: request.method,
            proxyUrl,
            timeout: { request: this.requestTimeoutMillis },
            sessionToken: session,
            ...requestAsBrowserOptions,
            headers: { ...request.headers, ...requestAsBrowserOptions?.headers },
            https: {
                // @ts-ignore missing https property - intentional?
                ...requestAsBrowserOptions.https,
                rejectUnauthorized: !this.ignoreSslErrors,
            },
            isStream: true,
        };

        // TODO this is incorrect, the check for man in the middle needs to be done
        //   on individual proxy level, not on the `proxyConfiguration` level,
        //   because users can use normal + MITM proxies in a single configuration.
        //   Disable SSL verification for MITM proxies
        if (this.proxyConfiguration && this.proxyConfiguration.isManInTheMiddle) {
            // @ts-ignore missing https property - intentional?
            requestOptions.https = {
                // @ts-ignore missing https property - intentional?
                ...requestOptions.https,
                rejectUnauthorized: false,
            };
        }

        // @ts-ignore missing body property - intentional?
        if (/PATCH|POST|PUT/.test(request.method)) requestOptions.body = request.payload;

        return requestOptions;
    }

    // TODO type response properly
    protected _encodeResponse(request, response, encoding: BufferEncoding): { encoding: BufferEncoding; response: any } {
        if (this.forceResponseEncoding) {
            encoding = this.forceResponseEncoding as BufferEncoding;
        } else if (!encoding && this.suggestResponseEncoding) {
            encoding = this.suggestResponseEncoding as BufferEncoding;
        }

        // Fall back to utf-8 if we still don't have encoding.
        const utf8 = 'utf8';
        if (!encoding) return { response, encoding: utf8 };

        // This means that the encoding is one of Node.js supported
        // encodings and we don't need to re-encode it.
        if (Buffer.isEncoding(encoding)) return { response, encoding };

        // Try to re-encode a variety of unsupported encodings to utf-8
        if (iconv.encodingExists(encoding)) {
            const encodeStream = iconv.encodeStream(utf8);
            const decodeStream = iconv.decodeStream(encoding).on('error', (err) => encodeStream.emit('error', err));
            response.on('error', (err) => decodeStream.emit('error', err));
            const encodedResponse = response.pipe(decodeStream).pipe(encodeStream);
            encodedResponse.statusCode = response.statusCode;
            encodedResponse.headers = response.headers;
            encodedResponse.url = response.url;
            return {
                response: encodedResponse,
                encoding: utf8,
            };
        }

        throw new Error(`Resource ${request.url} served with unsupported charset/encoding: ${encoding}`);
    }

    protected async _parseHtmlToDom(response) {
        return new Promise((resolve, reject) => {
            const domHandler = new DomHandler((err, dom) => {
                if (err) reject(err);
                else resolve(dom);
            });
            const parser = new WritableStream(domHandler, { decodeEntities: true });
            parser.on('error', reject);
            response
                .on('error', reject)
                .pipe(parser);
        });
    }

    /**
     * Checks and extends supported mime types
     */
    protected _extendSupportedMimeTypes(additionalMimeTypes: (string | RequestLike | ResponseLike)[]) {
        additionalMimeTypes.forEach((mimeType) => {
            try {
                const parsedType = contentTypeParser.parse(mimeType);
                this.supportedMimeTypes.add(parsedType.type);
            } catch (err) {
                throw new Error(`Can not parse mime type ${mimeType} from "options.additionalMimeTypes".`);
            }
        });
    }

    /**
     * Handles blocked request
     */
    protected _throwOnBlockedRequest(session: Session, statusCode: number) {
        const isBlocked = session.retireOnBlockedStatusCodes(statusCode);

        if (isBlocked) {
            throw new Error(`Request blocked - received ${statusCode} status code`);
        }
    }

    /**
     * Handles timeout request
     */
    protected _handleRequestTimeout(session: Session) {
        if (session) session.markBad();
        throw new Error(`request timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`);
    }

    private _abortDownloadOfBody(request: Request, response: IncomingMessage) {
        const { statusCode } = response;
        const { type } = parseContentTypeFromResponse(response);

        if (statusCode === 406) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} is not available in the format requested by the Accept header. Skipping resource.`);
        }

        if (!this.supportedMimeTypes.has(type) && statusCode! < 500) {
            request.noRetry = true;
            throw new Error(`Resource ${request.url} served Content-Type ${type}, `
                    + `but only ${Array.from(this.supportedMimeTypes).join(', ')} are allowed. Skipping resource.`);
        }
    }
}

interface RequestFunctionOptions {
    request: Request,
    session: Session,
    proxyUrl?: string,
    requestAsBrowserOptions: RequestAsBrowserOptions,
}
