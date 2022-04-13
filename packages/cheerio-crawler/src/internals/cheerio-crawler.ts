import { addTimeoutToPromise, tryCancel } from '@apify/timeout';
import { concatStreamToBuffer, readStreamToString } from '@apify/utilities';
import {
    BasicCrawler,
    BasicCrawlerOptions,
    BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
} from '@crawlee/basic';
import {
    CrawlerExtension,
    CrawlerHandleFailedRequestInput,
    CrawlingContext,
    diffCookies,
    enqueueLinks,
    EnqueueLinksOptions,
    mergeCookies,
    ProxyConfiguration,
    ProxyInfo,
    Request,
    RequestQueue,
    resolveBaseUrl,
    Session,
    storage,
    validators,
} from '@crawlee/core';
import {
    Awaitable,
    CheerioRoot,
    entries,
    parseContentTypeFromResponse,
    requestAsBrowser,
    RequestAsBrowserOptions,
    RequestAsBrowserResult,
} from '@crawlee/utils';
import cheerio, { CheerioOptions } from 'cheerio';
import contentTypeParser, { RequestLike, ResponseLike } from 'content-type';
import { Method, TimeoutError } from 'got-scraping';
import { DomHandler } from 'htmlparser2';
import { WritableStream } from 'htmlparser2/lib/WritableStream';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import iconv from 'iconv-lite';
import ow from 'ow';
import util from 'util';

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

export interface CheerioFailedRequestHandlerInput<JSONData = unknown> extends CrawlerHandleFailedRequestInput, CheerioRequestHandlerInputs<JSONData> {}

export type CheerioFailedRequestHandler<JSONData = unknown> = (inputs: CheerioFailedRequestHandlerInput<JSONData>) => Awaitable<void>;

export interface CheerioCrawlerOptions<JSONData = unknown> extends Omit<
    BasicCrawlerOptions<CheerioCrawlingContext<JSONData>>,
    // Overridden with cheerio context
    | 'requestHandler'
    | 'handleRequestFunction'
    // Overridden with cheerio context
    | 'failedRequestHandler'
    | 'handleFailedRequestFunction'
    | 'handleRequestTimeoutSecs'
> {
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
     *   // Request object with details of the requested web page
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
    requestHandler: CheerioRequestHandler<JSONData>;

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
     *   // Request object with details of the requested web page
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
     *
     * @deprecated `handlePageFunction` has been renamed to `requestHandler` and will be removed in a future version.
     */
    handlePageFunction?: CheerioRequestHandler<JSONData>;

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
    prepareRequestFunction?: PrepareRequest<JSONData>;

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
    postResponseFunction?: PostResponse<JSONData>;

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
     * [Apify Proxy](https://console.apify.com/proxy) or your own Proxy URLs provided and rotated according to the configuration.
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
    failedRequestHandler?: CheerioFailedRequestHandler<JSONData>;

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
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     */
    handleFailedRequestFunction?: CheerioFailedRequestHandler<JSONData>;

    /**
     * Async functions that are sequentially evaluated before the navigation. Good for setting additional cookies
     * or browser properties before navigation. The function accepts two parameters, `crawlingContext` and `requestAsBrowserOptions`,
     * which are passed to the `requestAsBrowser()` function the crawler calls to navigate.
     * Example:
     * ```
     * preNavigationHooks: [
     *     async (crawlingContext, requestAsBrowserOptions) => {
     *         // ...
     *     },
     * ]
     * ```
     */
    preNavigationHooks?: CheerioHook<JSONData>[];

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
    postNavigationHooks?: CheerioHook<JSONData>[];

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

export interface PrepareRequestInputs<JSONData = unknown> {
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
    crawler?: CheerioCrawler<JSONData>;
}

export type PrepareRequest<JSONData = unknown> = (inputs: PrepareRequestInputs<JSONData>) => Awaitable<void>;
export type CheerioHook<JSONData = unknown> = (
    crawlingContext: CheerioCrawlingContext<JSONData>,
    requestAsBrowserOptions: RequestAsBrowserOptions,
) => Awaitable<void>;

export interface PostResponseInputs<JSONData = unknown> {
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
    crawler: CheerioCrawler<JSONData>;
}

export type PostResponse<JSONData = unknown> = (inputs: PostResponseInputs<JSONData>) => Awaitable<void>;

export interface CheerioRequestHandlerInputs<JSONData = unknown> extends CrawlingContext {
    /**
     * The [Cheerio](https://cheerio.js.org/) object with parsed HTML.
     */
    $: CheerioRoot;

    /**
     * The request body of the web page.
     */
    body: (string | Buffer);

    /**
     * The parsed object from JSON string if the response contains the content type application/json.
     */
    json: JSONData;

    /**
     * Parsed `Content-Type header: { type, encoding }`.
     */
    contentType: { type: string; encoding: string };
    crawler: CheerioCrawler<JSONData>;
    response: IncomingMessage;
    enqueueLinks: (options?: CheerioCrawlerEnqueueLinksOptions) => Promise<storage.BatchAddRequestsResult>;
}

export type CheerioCrawlingContext<JSONData = unknown> = CheerioRequestHandlerInputs<JSONData>; // alias for better discoverability
export type CheerioRequestHandler<JSONData = unknown> = (inputs: CheerioRequestHandlerInputs<JSONData>) => Awaitable<void>;
export type CheerioCrawlerEnqueueLinksOptions = Omit<EnqueueLinksOptions, 'urls' | 'requestQueue'>;

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
 * and then invokes the user-provided {@link CheerioCrawlerOptions.requestHandler} to extract page data
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
 * We can use the `preNavigationHooks` to adjust `requestAsBrowserOptions`:
 *
 * ```
 * preNavigationHooks: [
 *     (crawlingContext, requestAsBrowserOptions) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * By default, `CheerioCrawler` only processes web pages with the `text/html`
 * and `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
 * and skips pages with other content types. If you want the crawler to process other content types,
 * use the {@link CheerioCrawlerOptions.additionalMimeTypes} constructor option.
 * Beware that the parsing behavior differs for HTML, XML, JSON and other types of content.
 * For details, see {@link CheerioCrawlerOptions.requestHandler}.
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
 * const requestList = new RequestList({
 *   sources: [
 *       { url: 'http://www.example.com/page-1' },
 *       { url: 'http://www.example.com/page-2' },
 *   ],
 * });
 * await requestList.initialize();
 *
 * // Crawl the URLs
 * const crawler = new CheerioCrawler({
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
 *         await Actor.pushData({
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
export class CheerioCrawler<JSONData = unknown> extends BasicCrawler<
    CheerioCrawlingContext<JSONData>,
    CheerioFailedRequestHandlerInput<JSONData>
> {
    /**
     * A reference to the underlying {@link ProxyConfiguration} class that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    public proxyConfiguration?: ProxyConfiguration;

    protected userRequestHandlerTimeoutMillis: number;
    protected defaultGotoOptions!: { timeout: number };
    protected preNavigationHooks: CheerioHook<JSONData>[];
    protected postNavigationHooks: CheerioHook<JSONData>[];
    protected persistCookiesPerSession: boolean;
    protected requestTimeoutMillis: number;
    protected ignoreSslErrors: boolean;
    protected suggestResponseEncoding?: string;
    protected forceResponseEncoding?: string;
    protected prepareRequestFunction?: PrepareRequest<JSONData>;
    protected postResponseFunction?: PostResponse<JSONData>;
    protected readonly supportedMimeTypes: Set<string>;

    protected static override optionsShape = {
        ...BasicCrawler.optionsShape,
        handlePageFunction: ow.optional.function,

        requestTimeoutSecs: ow.optional.number,
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
    constructor(options: CheerioCrawlerOptions<JSONData>) {
        ow(options, 'CheerioCrawlerOptions', ow.object.exactShape(CheerioCrawler.optionsShape));

        const {
            requestHandler,
            handlePageFunction,

            requestHandlerTimeoutSecs = 60,
            requestTimeoutSecs = 30,
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

            // Ignored
            handleRequestFunction,

            // BasicCrawler
            autoscaledPoolOptions = CHEERIO_OPTIMIZED_AUTOSCALED_POOL_OPTIONS,
            ...basicCrawlerOptions
        } = options;

        super({
            ...basicCrawlerOptions,
            // Will be overridden below
            requestHandler: () => {},
            autoscaledPoolOptions,
            // We need to add some time for internal functions to finish,
            // but not too much so that we would stall the crawler.
            requestHandlerTimeoutSecs: requestTimeoutSecs + requestHandlerTimeoutSecs + BASIC_CRAWLER_TIMEOUT_BUFFER_SECS,
        });

        this._handlePropertyNameChange({
            newName: 'requestHandler',
            oldName: 'handlePageFunction',
            propertyKey: 'requestHandler',
            newProperty: requestHandler,
            oldProperty: handlePageFunction,
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

        this.userRequestHandlerTimeoutMillis = requestHandlerTimeoutSecs * 1000;
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
            this.persistCookiesPerSession = persistCookiesPerSession ?? true;
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

        for (const [key, value] of entries(extensionOptions)) {
            const isConfigurable = this.hasOwnProperty(key); // eslint-disable-line
            const originalType = typeof this[key as keyof this];
            const extensionType = typeof value; // What if we want to null something? It is really needed?
            const isSameType = originalType === extensionType || value == null; // fast track for deleting keys
            const exists = this[key as keyof this] != null;

            if (!isConfigurable) { // Test if the property can be configured on the crawler
                throw new Error(`${extension.name} tries to set property "${key}" that is not configurable on CheerioCrawler instance.`);
            }

            if (!isSameType && exists) { // Assuming that extensions will only add up configuration
                throw new Error(
                    `${extension.name} tries to set property of different type "${extensionType}". "CheerioCrawler.${key}: ${originalType}".`,
                );
            }

            this.log.warning(`${extension.name} is overriding "CheerioCrawler.${key}: ${originalType}" with ${value}.`);

            this[key as keyof this] = value as this[keyof this];
        }
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     */
    protected override async _runRequestHandler(crawlingContext: CheerioCrawlingContext<JSONData>) {
        const { request, session } = crawlingContext;

        if (this.proxyConfiguration) {
            const sessionId = session ? session.id : undefined;
            crawlingContext.proxyInfo = this.proxyConfiguration.newProxyInfo(sessionId);
        }

        await this._handleNavigation(crawlingContext);
        tryCancel();

        const { dom, isXml, body, contentType, response } = await this._parseResponse(request, crawlingContext.response!);
        tryCancel();

        if (this.useSessionPool) {
            this._throwOnBlockedRequest(session!, response.statusCode!);
        }

        if (this.persistCookiesPerSession) {
            session!.setCookiesFromResponse(response);
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
        crawlingContext.enqueueLinks = async (enqueueOptions) => {
            return cheerioCrawlerEnqueueLinks({
                options: enqueueOptions,
                $,
                requestQueue: await this.getRequestQueue(),
                originalRequestUrl: crawlingContext.request.url,
                finalRequestUrl: crawlingContext.request.loadedUrl,
            });
        };

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
            () => Promise.resolve(this.requestHandler(crawlingContext)),
            this.userRequestHandlerTimeoutMillis,
            `requestHandler timed out after ${this.userRequestHandlerTimeoutMillis / 1000} seconds.`,
        );
    }

    protected async _handleNavigation(crawlingContext: CheerioCrawlingContext<JSONData>) {
        if (this.prepareRequestFunction) {
            this.log.deprecated('Option "prepareRequestFunction" is deprecated. Use "preNavigationHooks" instead.');
            await this.prepareRequestFunction(crawlingContext);
            tryCancel();
        }

        const requestAsBrowserOptions = {} as RequestAsBrowserOptions;

        if (this.useSessionPool) {
            this._applySessionCookie(crawlingContext, requestAsBrowserOptions);
        }

        const { request, session } = crawlingContext;
        const cookieSnapshot = request.headers?.Cookie ?? request.headers?.cookie;
        await this._executeHooks(this.preNavigationHooks, crawlingContext, requestAsBrowserOptions);
        tryCancel();
        const proxyUrl = crawlingContext.proxyInfo?.url;
        this._mergeRequestCookieDiff(request, cookieSnapshot!, requestAsBrowserOptions);

        crawlingContext.response = await addTimeoutToPromise(
            () => this._requestFunction({ request, session, proxyUrl, requestAsBrowserOptions }),
            this.requestTimeoutMillis,
            `request timed out after ${this.requestTimeoutMillis / 1000} seconds.`,
        );
        tryCancel();

        await this._executeHooks(this.postNavigationHooks, crawlingContext, requestAsBrowserOptions);
        tryCancel();

        if (this.postResponseFunction) {
            this.log.deprecated('Option "postResponseFunction" is deprecated. Use "postNavigationHooks" instead.');
            await this.postResponseFunction(crawlingContext);
            tryCancel();
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
            requestAsBrowserOptions.headers ??= {};
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
        let responseWithStream: IncomingMessage;

        try {
            responseWithStream = await this._requestAsBrowser(opts);
        } catch (e) {
            if (e instanceof TimeoutError) {
                this._handleRequestTimeout(session);
            } else {
                throw e;
            }
        }

        return responseWithStream!;
    }

    /**
     * Sets the cookie header to `requestAsBrowserOptions` based on provided session and request. If some cookies were already set,
     * the session cookie will be merged with them. User provided cookies on `request` object have precedence.
     */
    private _applySessionCookie({ request, session }: CrawlingContext, requestAsBrowserOptions: RequestAsBrowserOptions): void {
        const userCookie = request.headers?.Cookie ?? request.headers?.cookie;
        const sessionCookie = session!.getCookieString(request.url);
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
        const requestOptions: RequestAsBrowserOptions = {
            url: request.url,
            method: request.method as Method,
            proxyUrl,
            timeout: { request: this.requestTimeoutMillis },
            sessionToken: session,
            ...requestAsBrowserOptions,
            headers: { ...request.headers, ...requestAsBrowserOptions?.headers },
            https: {
                ...requestAsBrowserOptions?.https,
                rejectUnauthorized: !this.ignoreSslErrors,
            },
            isStream: true,
        };

        // TODO this is incorrect, the check for man in the middle needs to be done
        //   on individual proxy level, not on the `proxyConfiguration` level,
        //   because users can use normal + MITM proxies in a single configuration.
        //   Disable SSL verification for MITM proxies
        if (this.proxyConfiguration && this.proxyConfiguration.isManInTheMiddle) {
            requestOptions.https = {
                ...requestOptions.https,
                rejectUnauthorized: false,
            };
        }

        if (/PATCH|POST|PUT/.test(request.method)) requestOptions.body = request.payload;

        return requestOptions;
    }

    protected _encodeResponse(request: Request, response: IncomingMessage, encoding: BufferEncoding): {
        encoding: BufferEncoding;
        response: IncomingMessage;
    } {
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
            response.on('error', (err: Error) => decodeStream.emit('error', err));
            const encodedResponse = response.pipe(decodeStream).pipe(encodeStream) as NodeJS.ReadWriteStream & {
                statusCode?: number;
                headers: IncomingHttpHeaders;
                url?: string;
            };
            encodedResponse.statusCode = response.statusCode;
            encodedResponse.headers = response.headers;
            encodedResponse.url = response.url;
            return {
                response: encodedResponse as any,
                encoding: utf8,
            };
        }

        throw new Error(`Resource ${request.url} served with unsupported charset/encoding: ${encoding}`);
    }

    protected async _parseHtmlToDom(response: IncomingMessage) {
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
    protected _handleRequestTimeout(session?: Session) {
        session?.markBad();
        throw new Error(`request timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds.`);
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

    /**
     * @internal wraps public utility for mocking purposes
     */
    private _requestAsBrowser(options: RequestAsBrowserOptions): Promise<RequestAsBrowserResult> {
        return requestAsBrowser(options);
    }
}

interface EnqueueLinksInternalOptions {
    options?: CheerioCrawlerEnqueueLinksOptions;
    $: CheerioRoot | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}

/** @internal */
export async function cheerioCrawlerEnqueueLinks({ options, $, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions) {
    if (!$) {
        throw new Error('Cannot enqueue links because the DOM is not available.');
    }

    const baseUrl = resolveBaseUrl({
        enqueueStrategy: options?.strategy,
        finalRequestUrl,
        originalRequestUrl,
        userProvidedBaseUrl: options?.baseUrl,
    });

    const urls = extractUrlsFromCheerio($, options?.selector ?? 'a', finalRequestUrl ?? originalRequestUrl);

    return enqueueLinks({
        requestQueue,
        urls,
        baseUrl,
        ...options,
    });
}

interface RequestFunctionOptions {
    request: Request;
    session?: Session;
    proxyUrl?: string;
    requestAsBrowserOptions: RequestAsBrowserOptions;
}

/**
 * Extracts URLs from a given Cheerio object.
 * @ignore
 */
function extractUrlsFromCheerio($: CheerioRoot, selector: string, baseUrl?: string): string[] {
    return $(selector)
        .map((_i, el) => $(el).attr('href'))
        .get()
        .filter((href) => !!href)
        .map((href) => {
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
