import defaultLog, { Log } from '@apify/log';
import { addTimeoutToPromise, TimeoutError, tryCancel } from '@apify/timeout';
import { cryptoRandomObjectId } from '@apify/utilities';
import {
    AutoscaledPool,
    AutoscaledPoolOptions,
    EnqueueLinksOptions,
    FailedRequestContext,
    enqueueLinks,
    ProxyInfo,
    QueueOperationInfo,
    Request,
    RequestList,
    RequestQueue,
    Session,
    SessionPool,
    SessionPoolOptions,
    Statistics,
    validators,
    type CrawlingContext,
    RequestOptions,
    RequestQueueOperationOptions,
    Router,
    createRequests,
    Configuration,
    EventManager,
    EventType,
    FinalStatistics,
} from '@crawlee/core';
import { gotScraping, OptionsOfTextResponseBody, Response as GotResponse } from 'got-scraping';
import { ProcessedRequest } from '@crawlee/types';
import { Awaitable, Dictionary, sleep, chunk } from '@crawlee/utils';
import ow, { ArgumentError } from 'ow';

export interface BasicCrawlingContext<UserData extends Dictionary = Dictionary> extends CrawlingContext<UserData> {
    crawler: BasicCrawler;
    enqueueLinks: (options: BasicCrawlerEnqueueLinksOptions) => Promise<QueueOperationInfo[]>;
    sendRequest: (request?: Request) => Promise<GotResponse<string>>;
}

export interface BasicFailedRequestContext<UserData extends Dictionary = Dictionary> extends FailedRequestContext<BasicCrawler, UserData> {}

/** @internal */
export type BasicCrawlerEnqueueLinksOptions = Omit<EnqueueLinksOptions, 'requestQueue'>

/**
 * Since there's no set number of seconds before the container is terminated after
 * a migration event, we need some reasonable number to use for RequestList persistence.
 * Once a migration event is received, the Crawler will be paused and it will wait for
 * this long before persisting the RequestList state. This should allow most healthy
 * requests to finish and be marked as handled, thus lowering the amount of duplicate
 * results after migration.
 * @ignore
 */
const SAFE_MIGRATION_WAIT_MILLIS = 20000;

export type RequestHandler<Context extends CrawlingContext = BasicCrawlingContext> = (inputs: Context) => Awaitable<void>;

export type FailedRequestHandler<Inputs extends FailedRequestContext = BasicFailedRequestContext> = (inputs: Inputs) => Awaitable<void>;

export interface BasicCrawlerOptions<
    Context extends CrawlingContext = BasicCrawlingContext,
    ErrorContext extends FailedRequestContext = BasicFailedRequestContext
> {
    /**
     * User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *     request: Request,
     *     session: Session,
     *     crawler: BasicCrawler,
     * }
     * ```
     * where the {@link Request} instance represents the URL to crawl.
     *
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
    requestHandler: RequestHandler<Context>;

    /**
     * User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *     request: Request,
     *     session: Session,
     *     crawler: BasicCrawler,
     * }
     * ```
     * where the {@link Request} instance represents the URL to crawl.
     *
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
     * @deprecated `handleRequestFunction` has been renamed to `requestHandler` and will be removed in a future version.
     */
    handleRequestFunction?: RequestHandler<Context>;

    /**
     * Static list of URLs to be processed.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestList?: RequestList;

    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestQueue?: RequestQueue;

    /**
     * Timeout in which the function passed as `requestHandler` needs to finish, in seconds.
     * @default 60
     */
    requestHandlerTimeoutSecs?: number;

    /**
     * Timeout in which the function passed as `requestHandler` needs to finish, in seconds.
     * @default 60
     * @deprecated `handleRequestTimeoutSecs` has been renamed to `requestHandlerTimeoutSecs` and will be removed in a future version.
     */
    handleRequestTimeoutSecs?: number;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *     request: Request,
     *     error: Error,
     *     session: Session,
     *     crawler: BasicCrawler,
     * }
     * ```
     * where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     *
     * See
     * [source code](https://github.com/apify/apify-js/blob/master/src/crawlers/basic_crawler.js#L11)
     * for the default implementation of this function.
     */
    failedRequestHandler?: FailedRequestHandler<ErrorContext>;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     *     request: Request,
     *     error: Error,
     *     session: Session,
     *     crawler: BasicCrawler,
     * }
     * ```
     * where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     *
     * See
     * [source code](https://github.com/apify/apify-js/blob/master/src/crawlers/basic_crawler.js#L11)
     * for the default implementation of this function.
     *
     * @deprecated `handleFailedRequestFunction` has been renamed to `failedRequestHandler` and will be removed in a future version.
     */
    handleFailedRequestFunction?: FailedRequestHandler<ErrorContext>;

    /**
     * Indicates how many times the request is retried if {@link requestHandler} or {@link handlePageFunction} fails.
     * @default 3
     */
    maxRequestRetries?: number;

    /**
     * Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
     * Always set this value in order to prevent infinite loops in misconfigured crawlers.
     * Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
     */
    maxRequestsPerCrawl?: number;

    /**
     * Custom options passed to the underlying {@link AutoscaledPool} constructor.
     * Note that the `runTaskFunction` and `isTaskReadyFunction` options
     * are provided by the crawler and cannot be overridden.
     * However, you can provide a custom implementation of `isFinishedFunction`.
     */
    autoscaledPoolOptions?: AutoscaledPoolOptions;

    /**
     * Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    minConcurrency?: number;

    /**
     * Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     */
    maxConcurrency?: number;

    /**
     * Basic crawler will initialize the  {@link SessionPool} with the corresponding `sessionPoolOptions`.
     * The session instance will be than available in the `requestHandler`.
     */
    useSessionPool?: boolean;

    /**
     * The configuration options for {@link SessionPool} to use.
     */
    sessionPoolOptions?: SessionPoolOptions;

    /** @internal */
    log?: Log;
}

/**
 * Provides a simple framework for parallel crawling of web pages.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * `BasicCrawler` is a low-level tool that requires the user to implement the page
 * download and data extraction functionality themselves.
 * If you want a crawler that already facilitates this functionality,
 * please consider using {@link CheerioCrawler}, {@link PuppeteerCrawler} or {@link PlaywrightCrawler}.
 *
 * `BasicCrawler` invokes the user-provided {@link BasicCrawlerOptions.requestHandler}
 * for each {@link Request} object, which represents a single URL to crawl.
 * The {@link Request} objects are fed from the {@link RequestList} or the {@link RequestQueue}
 * instances provided by the {@link BasicCrawlerOptions.requestList} or {@link BasicCrawlerOptions.requestQueue}
 * constructor options, respectively.
 *
 * If both {@link BasicCrawlerOptions.requestList} and {@link BasicCrawlerOptions.requestQueue} options are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes if there are no more {@link Request} objects to crawl.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `BasicCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPool} options are available directly in the `BasicCrawler` constructor.
 *
 * **Example usage:**
 *
 * ```javascript
 * const { gotScraping } = require('got-scraping');
 *
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
 * const crawler = new BasicCrawler({
 *     requestList,
 *     async requestHandler({ request }) {
 *         // 'request' contains an instance of the Request class
 *         // Here we simply fetch the HTML of the page and store it to a dataset
 *         const { body } = await gotScraping({
 *             url: request.url,
 *             method: request.method,
 *             body: request.payload,
 *             headers: request.headers,
 *         });
 *
 *         await Actor.pushData({
 *             url: request.url,
 *             html: body,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 * @category Crawlers
 */
export class BasicCrawler<
    Context extends CrawlingContext = BasicCrawlingContext,
    ErrorContext extends FailedRequestContext = BasicFailedRequestContext,
> {
    /**
     * Static list of URLs to be processed.
     */
    readonly stats: Statistics;

    /**
     * A reference to the underlying {@link RequestList} class that manages the crawler's {@link Request}s.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     * Only available if used by the crawler.
     */
    requestList?: RequestList;

    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * A reference to the underlying {@link RequestQueue} class that manages the crawler's {@link Request}s.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     * Only available if used by the crawler.
     */
    requestQueue?: RequestQueue;

    /**
     * A reference to the underlying {@link SessionPool} class that manages the crawler's {@link Session}s.
     * Only available if used by the crawler.
     */
    sessionPool?: SessionPool;

    /**
     * A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
     * Note that this property is only initialized after calling the {@link BasicCrawler.run} function.
     * You can use it to change the concurrency settings on the fly,
     * to pause the crawler by calling {@link AutoscaledPool.pause}
     * or to abort it by calling {@link AutoscaledPool.abort}.
     */
    autoscaledPool?: AutoscaledPool;

    protected log: Log;
    protected requestHandler!: RequestHandler<Context>;
    protected failedRequestHandler?: FailedRequestHandler<ErrorContext>;
    protected requestHandlerTimeoutMillis!: number;
    protected internalTimeoutMillis: number;
    protected maxRequestRetries: number;
    protected handledRequestsCount: number;
    protected sessionPoolOptions: SessionPoolOptions;
    protected useSessionPool: boolean;
    protected crawlingContexts = new Map<string, Context>();
    protected autoscaledPoolOptions: AutoscaledPoolOptions;
    protected events: EventManager;

    protected static optionsShape = {
        requestList: ow.optional.object.validate(validators.requestList),
        requestQueue: ow.optional.object.validate(validators.requestQueue),
        // Subclasses override this function instead of passing it
        // in constructor, so this validation needs to apply only
        // if the user creates an instance of BasicCrawler directly.
        // TODO: remove .optional from requestHandler once migration period is over
        requestHandler: ow.optional.function,
        // TODO: remove in a future release
        handleRequestFunction: ow.optional.function,
        requestHandlerTimeoutSecs: ow.optional.number,
        // TODO: remove in a future release
        handleRequestTimeoutSecs: ow.optional.number,
        failedRequestHandler: ow.optional.function,
        // TODO: remove in a future release
        handleFailedRequestFunction: ow.optional.function,
        maxRequestRetries: ow.optional.number,
        maxRequestsPerCrawl: ow.optional.number,
        autoscaledPoolOptions: ow.optional.object,
        sessionPoolOptions: ow.optional.object,
        useSessionPool: ow.optional.boolean,

        // AutoscaledPool shorthands
        minConcurrency: ow.optional.number,
        maxConcurrency: ow.optional.number,

        // internal
        log: ow.optional.object,
    };

    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(options: BasicCrawlerOptions<Context, ErrorContext>, readonly config = Configuration.getGlobalConfig()) {
        ow(options, 'BasicCrawlerOptions', ow.object.exactShape(BasicCrawler.optionsShape));

        const {
            requestList,
            requestQueue,
            maxRequestRetries = 3,
            maxRequestsPerCrawl,
            autoscaledPoolOptions = {},
            sessionPoolOptions = {},
            useSessionPool = true,

            // AutoscaledPool shorthands
            minConcurrency,
            maxConcurrency,

            // internal
            log = defaultLog.child({ prefix: this.constructor.name }),

            // Old and new request handler methods
            handleRequestFunction,
            requestHandler,

            handleRequestTimeoutSecs,
            requestHandlerTimeoutSecs,

            handleFailedRequestFunction,
            failedRequestHandler,
        } = options;

        this.requestList = requestList;
        this.requestQueue = requestQueue;
        this.log = log;
        this.events = config.getEventManager();

        this._handlePropertyNameChange({
            newName: 'requestHandler',
            oldName: 'handleRequestFunction',
            propertyKey: 'requestHandler',
            newProperty: requestHandler,
            oldProperty: handleRequestFunction,
        });

        this._handlePropertyNameChange({
            newName: 'failedRequestHandler',
            oldName: 'handleFailedRequestFunction',
            propertyKey: 'failedRequestHandler',
            newProperty: failedRequestHandler,
            oldProperty: handleFailedRequestFunction,
            allowUndefined: true,
        });

        let newRequestHandlerTimeout: number | undefined;

        if (!handleRequestTimeoutSecs) {
            if (!requestHandlerTimeoutSecs) {
                newRequestHandlerTimeout = 60_000;
            } else {
                newRequestHandlerTimeout = requestHandlerTimeoutSecs * 1000;
            }
        } else if (requestHandlerTimeoutSecs) {
            newRequestHandlerTimeout = requestHandlerTimeoutSecs * 1000;
        }

        this._handlePropertyNameChange({
            newName: 'requestHandlerTimeoutSecs',
            oldName: 'handleRequestTimeoutSecs',
            propertyKey: 'requestHandlerTimeoutMillis',
            newProperty: newRequestHandlerTimeout,
            oldProperty: handleRequestTimeoutSecs ? handleRequestTimeoutSecs * 1000 : undefined,
        });

        const tryEnv = (val?: string) => (val == null ? null : +val);
        // allow at least 5min for internal timeouts
        this.internalTimeoutMillis = tryEnv(process.env.CRAWLEE_INTERNAL_TIMEOUT) ?? Math.max(this.requestHandlerTimeoutMillis * 2, 300e3);
        // override the default internal timeout of request queue to respect `requestHandlerTimeoutMillis`
        if (this.requestQueue) {
            this.requestQueue.internalTimeoutMillis = this.internalTimeoutMillis;
        }

        this.maxRequestRetries = maxRequestRetries;
        this.handledRequestsCount = 0;
        this.stats = new Statistics({ logMessage: `${log.getOptions().prefix} request statistics:`, config });
        this.sessionPoolOptions = {
            ...sessionPoolOptions,
            log,
        };
        this.useSessionPool = useSessionPool;
        this.crawlingContexts = new Map();

        const maxSignedInteger = 2 ** 31 - 1;
        if (this.requestHandlerTimeoutMillis > maxSignedInteger) {
            log.warning(`requestHandlerTimeoutMillis ${this.requestHandlerTimeoutMillis}`
                + `does not fit a signed 32-bit integer. Limiting the value to ${maxSignedInteger}`);

            this.requestHandlerTimeoutMillis = maxSignedInteger;
        }

        let shouldLogMaxPagesExceeded = true;
        const isMaxPagesExceeded = () => maxRequestsPerCrawl && maxRequestsPerCrawl <= this.handledRequestsCount;

        const { isFinishedFunction } = autoscaledPoolOptions;

        const basicCrawlerAutoscaledPoolConfiguration = {
            minConcurrency,
            maxConcurrency,
            runTaskFunction: this._runTaskFunction.bind(this),
            isTaskReadyFunction: async () => {
                if (isMaxPagesExceeded()) {
                    if (shouldLogMaxPagesExceeded) {
                        log.info('Crawler reached the maxRequestsPerCrawl limit of '
                            + `${maxRequestsPerCrawl} requests and will shut down soon. Requests that are in progress will be allowed to finish.`);
                        shouldLogMaxPagesExceeded = false;
                    }
                    return false;
                }

                return this._isTaskReadyFunction();
            },
            isFinishedFunction: async () => {
                if (isMaxPagesExceeded()) {
                    log.info(`Earlier, the crawler reached the maxRequestsPerCrawl limit of ${maxRequestsPerCrawl} requests `
                        + 'and all requests that were in progress at that time have now finished. '
                        + `In total, the crawler processed ${this.handledRequestsCount} requests and will shut down.`);
                    return true;
                }

                const isFinished = isFinishedFunction
                    ? await isFinishedFunction()
                    : await this._defaultIsFinishedFunction();

                if (isFinished) {
                    const reason = isFinishedFunction
                        ? 'Crawler\'s custom isFinishedFunction() returned true, the crawler will shut down.'
                        : 'All the requests from request list and/or request queue have been processed, the crawler will shut down.';
                    log.info(reason);
                }

                return isFinished;
            },
            log,
        };

        this.autoscaledPoolOptions = { ...autoscaledPoolOptions, ...basicCrawlerAutoscaledPoolConfiguration };

        // Attach a listener to handle migration and aborting events gracefully.
        this.events.on(EventType.MIGRATING, this._pauseOnMigration.bind(this));
        this.events.on(EventType.ABORTING, this._pauseOnMigration.bind(this));
    }

    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     */
    async run(): Promise<FinalStatistics> {
        await this._init();
        await this.stats.startCapturing();

        try {
            await this.autoscaledPool!.run();
        } finally {
            await this.teardown();
            await this.stats.stopCapturing();
        }

        const finalStats = this.stats.calculate();
        const stats = {
            requestsFinished: this.stats.state.requestsFinished,
            requestsFailed: this.stats.state.requestsFailed,
            retryHistogram: this.stats.requestRetryHistogram,
            ...finalStats,
        };
        this.log.info('Final request statistics:', stats);

        return stats;
    }

    async getRequestQueue() {
        this.requestQueue ??= await RequestQueue.open();

        return this.requestQueue!;
    }

    /**
     * Adds requests to be processed by the crawler
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    async addRequests(requests: (string | Request | RequestOptions)[], options: CrawlerAddRequestsOptions = {}): Promise<CrawlerAddRequestsResult> {
        ow(requests, ow.array.ofType(ow.any(ow.string, ow.object.partialShape({
            url: ow.string,
            id: ow.undefined,
        }))));
        ow(options, ow.object.exactShape({
            forefront: ow.optional.boolean,
            waitForAllRequestsToBeAdded: ow.optional.boolean,
        }));

        const requestQueue = await this.getRequestQueue();
        const builtRequests = createRequests(requests);

        const attemptToAddToQueueAndAddAnyUnprocessed = async (providedRequests: Request[]) => {
            const resultsToReturn: ProcessedRequest[] = [];
            const apiResult = await requestQueue.addRequests(providedRequests, { forefront: options.forefront });
            resultsToReturn.push(...apiResult.processedRequests);

            if (apiResult.unprocessedRequests.length) {
                await sleep(1000);

                resultsToReturn.push(...await attemptToAddToQueueAndAddAnyUnprocessed(
                    providedRequests.filter((r) => !apiResult.processedRequests.some((pr) => pr.uniqueKey === r.uniqueKey)),
                ));
            }

            return resultsToReturn;
        };

        const initialChunk = builtRequests.splice(0, 1000);

        // Add initial batch of 1000 to process them right away
        const addedRequests = await attemptToAddToQueueAndAddAnyUnprocessed(initialChunk);

        // If we have no more requests to add, return early
        if (!builtRequests.length) {
            return {
                addedRequests,
                waitForAllRequestsToBeAdded: Promise.resolve([]),
            };
        }

        // eslint-disable-next-line no-async-promise-executor
        const promise = new Promise<ProcessedRequest[]>(async (resolve) => {
            const chunks = chunk(builtRequests, 1000);
            const finalAddedRequests: ProcessedRequest[] = [];

            for (const requestChunk of chunks) {
                finalAddedRequests.push(...await attemptToAddToQueueAndAddAnyUnprocessed(requestChunk));

                await sleep(1000);
            }

            resolve(finalAddedRequests);
        });

        // If the user wants to wait for all the requests to be added, we wait for the promise to resolve for them
        if (options.waitForAllRequestsToBeAdded) {
            addedRequests.push(...await promise);
        }

        return {
            addedRequests,
            waitForAllRequestsToBeAdded: promise,
        };
    }

    protected async _init(): Promise<void> {
        // Initialize AutoscaledPool before awaiting _loadHandledRequestCount(),
        // so that the caller can get a reference to it before awaiting the promise returned from run()
        // (otherwise there would be no way)
        this.autoscaledPool = new AutoscaledPool(this.autoscaledPoolOptions, this.config);

        if (this.useSessionPool) {
            this.sessionPool = await SessionPool.open(this.sessionPoolOptions);
            // Assuming there are not more than 20 browsers running at once;
            this.sessionPool.setMaxListeners(20);
        }

        await this._loadHandledRequestCount();
    }

    protected async _runRequestHandler(crawlingContext: Context): Promise<void> {
        await this.requestHandler(crawlingContext);
    }

    /**
     * Handles blocked request
     */
    protected _throwOnBlockedRequest(session: Session, statusCode: number) {
        const isBlocked = session.retireOnBlockedStatusCodes(statusCode);

        if (isBlocked) {
            throw new Error(`Request blocked - received ${statusCode} status code.`);
        }
    }

    protected async _pauseOnMigration() {
        if (this.autoscaledPool) {
            // if run wasn't called, this is going to crash
            await this.autoscaledPool.pause(SAFE_MIGRATION_WAIT_MILLIS)
                .catch((err) => {
                    if (err.message.includes('running tasks did not finish')) {
                        this.log.error('The crawler was paused due to migration to another host, '
                            + 'but some requests did not finish in time. Those requests\' results may be duplicated.');
                    } else {
                        throw err;
                    }
                });
        }

        const requestListPersistPromise = (async () => {
            if (this.requestList) {
                if (await this.requestList.isFinished()) return;
                await this.requestList.persistState()
                    .catch((err) => {
                        if (err.message.includes('Cannot persist state.')) {
                            this.log.error('The crawler attempted to persist its request list\'s state and failed due to missing or '
                                + 'invalid config. Make sure to use either RequestList.open() or the "stateKeyPrefix" option of RequestList '
                                + 'constructor to ensure your crawling state is persisted through host migrations and restarts.');
                        } else {
                            this.log.exception(err, 'An unexpected error occurred when the crawler '
                                + 'attempted to persist its request list\'s state.');
                        }
                    });
            }
        })();

        await Promise.all([
            requestListPersistPromise,
            this.stats.persistState(),
        ]);
    }

    /**
     * Fetches request from either RequestList or RequestQueue. If request comes from a RequestList
     * and RequestQueue is present then enqueues it to the queue first.
     */
    protected async _fetchNextRequest() {
        if (!this.requestList) return this.requestQueue!.fetchNextRequest();
        const request = await this.requestList.fetchNextRequest();
        if (!this.requestQueue) return request;
        if (!request) return this.requestQueue.fetchNextRequest();

        try {
            await this.requestQueue.addRequest(request, { forefront: true });
        } catch (err) {
            // If requestQueue.addRequest() fails here then we must reclaim it back to
            // the RequestList because probably it's not yet in the queue!
            this.log.error('Adding of request from the RequestList to the RequestQueue failed, reclaiming request back to the list.', { request });
            await this.requestList.reclaimRequest(request);
            return null;
        }
        await this.requestList.markRequestHandled(request);
        return this.requestQueue.fetchNextRequest();
    }

    /**
     * Wrapper around requestHandler that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error, etc.
     */
    protected async _runTaskFunction() {
        const source = this.requestQueue || this.requestList || await this.getRequestQueue();

        let request: Request | null | undefined;
        let session: Session | undefined;

        await this._timeoutAndRetry(
            async () => {
                request = await this._fetchNextRequest();
            },
            this.internalTimeoutMillis,
            `Fetching next request timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
        );

        tryCancel();

        if (this.useSessionPool) {
            await this._timeoutAndRetry(
                async () => {
                    session = await this.sessionPool!.getSession();
                },
                this.internalTimeoutMillis,
                `Fetching session timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
            );
        }

        tryCancel();

        if (!request) return;

        // Reset loadedUrl so an old one is not carried over to retries.
        request.loadedUrl = undefined;

        const statisticsId = request.id || request.uniqueKey;
        this.stats.startJob(statisticsId);

        // Shared crawling context
        // @ts-expect-error It is assignable, but TS says otherwise...
        const crawlingContext: Context = {
            id: cryptoRandomObjectId(10),
            crawler: this,
            log: this.log,
            request,
            session,
            enqueueLinks: async (enqueueOptions: BasicCrawlerEnqueueLinksOptions) => {
                return enqueueLinks({
                    ...enqueueOptions,
                    requestQueue: await this.getRequestQueue(),
                });
            },
            sendRequest: async (req?: Request) => {
                req ??= request!;
                return gotScraping({
                    url: req.url,
                    method: req.method,
                    body: req.payload,
                    headers: req.headers,
                    retry: {
                        limit: 0,
                    },
                    proxyUrl: crawlingContext.proxyInfo?.url,
                    sessionToken: session,
                    responseType: 'text',
                    cookieJar: {
                        getCookieString: (url: string) => session!.getCookieString(url),
                        setCookie: (rawCookie: string, url: string) => session!.setCookie(rawCookie, url),
                    },
                } as OptionsOfTextResponseBody);
            },
        };

        this.crawlingContexts.set(crawlingContext.id, crawlingContext);

        try {
            await addTimeoutToPromise(
                () => this._runRequestHandler(crawlingContext),
                this.requestHandlerTimeoutMillis,
                `requestHandler timed out after ${this.requestHandlerTimeoutMillis / 1000} seconds (${request.id}).`,
            );

            await this._timeoutAndRetry(
                () => source.markRequestHandled(request!),
                this.internalTimeoutMillis,
                `Marking request ${request.url} (${request.id}) as handled timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
            );

            this.stats.finishJob(statisticsId);
            this.handledRequestsCount++;

            // reclaim session if request finishes successfully
            session?.markGood();
        } catch (err) {
            try {
                await this._timeoutAndRetry(
                    () => this._requestFunctionErrorHandler(err as Error, crawlingContext, source),
                    this.internalTimeoutMillis,
                    `Handling request failure of ${request.url} (${request.id}) timed out after ${this.internalTimeoutMillis / 1e3} seconds.`,
                );
            } catch (secondaryError) {
                this.log.exception(secondaryError as Error, 'runTaskFunction error handler threw an exception. '
                    + 'This places the crawler and its underlying storages into an unknown state and crawling will be terminated. '
                    + 'This may have happened due to an internal error of Apify\'s API or due to a misconfigured crawler. '
                    + 'If you are sure that there is no error in your code, selecting "Restart on error" in the actor\'s settings'
                    + 'will make sure that the run continues where it left off, if programmed to handle restarts correctly.');
                throw secondaryError;
            }
        } finally {
            this.crawlingContexts.delete(crawlingContext.id);
        }
    }

    /**
     * Run async callback with given timeout and retry.
     * @ignore
     */
    protected async _timeoutAndRetry(handler: () => Promise<unknown>, timeout: number, error: Error | string, maxRetries = 3, retried = 1): Promise<void> {
        try {
            await addTimeoutToPromise(handler, timeout, error);
        } catch (e) {
            if (retried <= maxRetries) { // we retry on any error, not just timeout
                this.log.warning(`${(e as Error).message} (retrying ${retried}/${maxRetries})`);
                return this._timeoutAndRetry(handler, timeout, error, maxRetries, retried + 1);
            }

            throw e;
        }
    }

    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     */
    protected async _isTaskReadyFunction() {
        // First check RequestList, since it's only in memory.
        const isRequestListEmpty = this.requestList ? (await this.requestList.isEmpty()) : true;
        // If RequestList is not empty, task is ready, no reason to check RequestQueue.
        if (!isRequestListEmpty) return true;
        // If RequestQueue is not empty, task is ready, return true, otherwise false.
        return this.requestQueue ? !(await this.requestQueue.isEmpty()) : false;
    }

    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    protected async _defaultIsFinishedFunction() {
        const [
            isRequestListFinished,
            isRequestQueueFinished,
        ] = await Promise.all([
            this.requestList ? this.requestList.isFinished() : true,
            this.requestQueue ? this.requestQueue.isFinished() : true,
        ]);
        // If both are finished, return true, otherwise return false.
        return isRequestListFinished && isRequestQueueFinished;
    }

    /**
     * Handles errors thrown by user provided requestHandler()
     */
    protected async _requestFunctionErrorHandler(
        error: Error,
        crawlingContext: Context,
        source: RequestList | RequestQueue,
    ): Promise<void> {
        const { request } = crawlingContext;
        request.pushErrorMessage(error);

        const shouldRetryRequest = !request.noRetry && request.retryCount < this.maxRequestRetries;
        if (shouldRetryRequest) {
            request.retryCount++;
            const { url, retryCount, id } = request;
            // We don't want to see the stack trace in the logs by default, when we are going to retry the request.
            // Thus, we print the full stack trace only when CRAWLEE_VERBOSE_LOG environment variable is set to true.
            this.log.warning(
                `Reclaiming failed request back to the list or queue. ${!process.env.CRAWLEE_VERBOSE_LOG ? error : error.stack}`,
                { id, url, retryCount },
            );
            await source.reclaimRequest(request);
        } else {
            // If we get here, the request is either not retryable
            // or failed more than retryCount times and will not be retried anymore.
            // Mark the request as failed and do not retry.
            this.handledRequestsCount++;
            await source.markRequestHandled(request);
            this.stats.failJob(request.id || request.uniqueKey);

            // @ts-expect-error It is assignable, but TS says otherwise...
            const castedErrorContext = crawlingContext as ErrorContext;
            castedErrorContext.error = error;

            await this._handleFailedRequestHandler(castedErrorContext); // This function prints an error message.
        }
    }

    protected async _handleFailedRequestHandler(crawlingContext: ErrorContext): Promise<void> {
        if (this.failedRequestHandler) {
            await this.failedRequestHandler(crawlingContext);
        } else {
            const { id, url, method, uniqueKey } = crawlingContext.request;
            this.log.error(
                `Request failed and reached maximum retries. ${crawlingContext.error instanceof TimeoutError && !process.env.CRAWLEE_VERBOSE_LOG
                    ? crawlingContext.error.message
                    : crawlingContext.error.stack
                }`,
                { id, url, method, uniqueKey },
            );
        }
    }

    /**
     * Updates handledRequestsCount from possibly stored counts,
     * usually after worker migration. Since one of the stores
     * needs to have priority when both are present,
     * it is the request queue, because generally, the request
     * list will first be dumped into the queue and then left
     * empty.
     */
    protected async _loadHandledRequestCount(): Promise<void> {
        if (this.requestQueue) {
            this.handledRequestsCount = await this.requestQueue.handledCount();
        } else if (this.requestList) {
            this.handledRequestsCount = this.requestList.handledCount();
        }
    }

    protected async _executeHooks<HookLike extends (...args: any[]) => Awaitable<void>>(hooks: HookLike[], ...args: Parameters<HookLike>) {
        if (Array.isArray(hooks) && hooks.length) {
            for (const hook of hooks) {
                await hook(...args);
            }
        }
    }

    /**
     * Function for cleaning up after all request are processed.
     * @ignore
     */
    async teardown(): Promise<void> {
        if (this.useSessionPool) {
            await this.sessionPool!.teardown();
        }
    }

    protected _handlePropertyNameChange<New, Old>({
        newProperty,
        newName,
        oldProperty,
        oldName,
        propertyKey,
        allowUndefined = false,
    }: HandlePropertyNameChangeData<New, Old>) {
        if (newProperty && oldProperty) {
            this.log.warning([
                `Both "${newName}" and "${oldName}" were provided in the crawler options.`,
                `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                `As such, "${newName}" will be used instead.`,
            ].join('\n'));

            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = newProperty;
        } else if (oldProperty) {
            this.log.warning([
                `"${oldName}" has been renamed to "${newName}", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "${oldName}" to "${newName}" in your crawler options.`,
            ].join('\n'));

            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = oldProperty;
        } else if (newProperty) {
            // @ts-expect-error Assigning to possibly readonly properties
            this[propertyKey] = newProperty;
        } else if (!allowUndefined) {
            throw new ArgumentError(`"${newName}" must be provided in the crawler options`, this.constructor);
        }
    }

    protected _getCookieHeaderFromRequest(request: Request) {
        return request.headers?.Cookie ?? request.headers?.cookie ?? '';
    }
}

export interface CreateContextOptions {
    request: Request;
    session?: Session;
    proxyInfo?: ProxyInfo;
}

export interface CrawlerAddRequestsOptions extends RequestQueueOperationOptions {
    /**
     * Whether to wait for all the provided requests to be added, instead of waiting just for the initial batch of up to 1000.
     *
     * By default, this is set to `false`.
     */
    waitForAllRequestsToBeAdded?: boolean;
}

export interface CrawlerAddRequestsResult {
    addedRequests: ProcessedRequest[];
    /**
     * A promise which will resolve with the rest of the requests that were added to the queue.
     *
     * @example
     * ```ts
     * // Assuming `requests` is a list of requests.
     * const result = await crawler.addRequests(requests);
     *
     * // If you want to wait for the rest of the requests to be added with a condition, you can do so:
     * // Alternatively, consider setting `waitForAllRequestsToBeAdded` to `true` in the options for `addRequests`.
     * await result.waitForAllRequestsToBeAdded;
     * ```
     */
    waitForAllRequestsToBeAdded: Promise<ProcessedRequest[]>;
}

interface HandlePropertyNameChangeData<New, Old> {
    oldProperty?: Old;
    newProperty?: New;
    oldName: string;
    newName: string;
    propertyKey: string;
    allowUndefined?: boolean;
}

/**
 * Creates new {@link Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@link BasicCrawler}.
 * Defaults to the {@link BasicCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<BasicCrawlingContext>()`.
 *
 * ```ts
 * import { BasicCrawler, createBasicRouter } from '@crawlee/basic';
 *
 * const router = createBasicRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new BasicCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export function createBasicRouter<Context extends BasicCrawlingContext = BasicCrawlingContext>() {
    return Router.create<Context>();
}
