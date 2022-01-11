import { ACTOR_EVENT_NAMES } from '@apify/consts';
import { cryptoRandomObjectId } from '@apify/utilities';
import ow, { ArgumentError } from 'ow';
import _ from 'underscore';
import { addTimeoutToPromise, TimeoutError, tryCancel } from '@apify/timeout';
import { Log } from '@apify/log';
import { IncomingMessage } from 'http';
import { AutoscaledPool, AutoscaledPoolOptions } from '../autoscaling/autoscaled_pool';
import { events } from '../events';
import { openSessionPool, SessionPool, SessionPoolOptions } from '../session_pool/session_pool';
import { Statistics } from './statistics';
import defaultLog from '../utils_log';
import { validators } from '../validators';
import { ProxyInfo } from '../proxy_configuration';
import { Request } from '../request';
import { RequestList } from '../request_list';
import { RequestQueue } from '../storages/request_queue';
import { Session } from '../session_pool/session';
import { Awaitable } from '../typedefs';

export interface CrawlingContext<Response = IncomingMessage> extends Record<PropertyKey, unknown> {
    id: string;
    /**
     * The original {@link Request} object.
     */
    request: Request;
    session?: Session;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@link ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;

    /**
     * The response returned by the crawler.
     * For basic crawlers, this is an instance of Node's [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) object.
     */
    response?: Response;

    crawler?: BasicCrawler;
}

export interface HandleFailedRequestInput extends CrawlingContext {
    /**
     * The Error thrown by `handleRequestFunction`.
     */
    error: Error;
}

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

export interface BasicCrawlerOptions<Inputs extends HandleRequestInputs = HandleRequestInputs> {
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
    handleRequestFunction: HandleRequest<Inputs>;

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
     * Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.
     * @default 60
     */
    handleRequestTimeoutSecs?: number;

    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     * request: Request,
     * error: Error,
     * session: Session,
     * crawler: BasicCrawler,
     * }
     * ```
     * where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     *
     * See
     * [source code](https://github.com/apify/apify-js/blob/master/src/crawlers/basic_crawler.js#L11)
     * for the default implementation of this function.
     */
    handleFailedRequestFunction?: HandleFailedRequest;

    /**
     * Indicates how many times the request is retried if {@link handleRequestFunction} or {@link handlePageFunction} fails.
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
     * The session instance will be than available in the `handleRequestFunction`.
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
 * `BasicCrawler` invokes the user-provided {@link BasicCrawlerOptions.handleRequestFunction}
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
 * const crawler = new Apify.BasicCrawler({
 *     requestList,
 *     handleRequestFunction: async ({ request }) => {
 *         // 'request' contains an instance of the Request class
 *         // Here we simply fetch the HTML of the page and store it to a dataset
 *         const { body } = await Apify.utils.requestAsBrowser(request);
 *         await Apify.pushData({
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
export class BasicCrawler<Inputs extends HandleRequestInputs = HandleRequestInputs> {
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
    protected userProvidedHandler: HandleRequest;
    protected failedContextHandler?: HandleFailedRequest;
    protected handleFailedRequestFunction?: HandleFailedRequest;
    protected handleRequestTimeoutMillis: number;
    protected maxRequestRetries: number;
    protected handledRequestsCount: number;
    protected sessionPoolOptions: SessionPoolOptions;
    protected useSessionPool: boolean;
    protected crawlingContexts = new Map<string, CrawlingContext>();
    protected isRunningPromise?: Promise<void>;
    protected autoscaledPoolOptions: AutoscaledPoolOptions;

    protected static optionsShape = {
        requestList: ow.optional.object.validate(validators.requestList),
        requestQueue: ow.optional.object.validate(validators.requestQueue),
        // Subclasses override this function instead of passing it
        // in constructor, so this validation needs to apply only
        // if the user creates an instance of BasicCrawler directly.
        handleRequestFunction: ow.function as never,
        handleRequestTimeoutSecs: ow.optional.number,
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
    constructor(options: BasicCrawlerOptions<Inputs>) {
        ow(options, 'BasicCrawlerOptions', ow.object.exactShape(BasicCrawler.optionsShape));

        const {
            requestList,
            requestQueue,
            handleRequestFunction,
            handleRequestTimeoutSecs = 60,
            handleFailedRequestFunction,
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
        } = options;

        if (!requestList && !requestQueue) {
            const msg = 'At least one of the parameters "options.requestList" and "options.requestQueue" must be provided!';
            throw new ArgumentError(msg, this.constructor);
        }

        this.requestList = requestList;
        this.requestQueue = requestQueue;
        this.log = log;
        this.userProvidedHandler = handleRequestFunction;
        this.failedContextHandler = handleFailedRequestFunction;
        this.handleRequestTimeoutMillis = handleRequestTimeoutSecs * 1000;
        this.handleFailedRequestFunction = handleFailedRequestFunction;
        this.maxRequestRetries = maxRequestRetries;
        this.handledRequestsCount = 0;
        this.stats = new Statistics({ logMessage: `${log.getOptions().prefix} request statistics:` });
        this.sessionPoolOptions = {
            ...sessionPoolOptions,
            log,
        };
        this.useSessionPool = useSessionPool;
        this.crawlingContexts = new Map();

        const maxSignedInteger = 2 ** 31 - 1;
        if (this.handleRequestTimeoutMillis > maxSignedInteger) {
            log.warning(`handleRequestTimeoutMillis ${this.handleRequestTimeoutMillis}`
                + `does not fit a signed 32-bit integer. Limiting the value to ${maxSignedInteger}`);

            this.handleRequestTimeoutMillis = maxSignedInteger;
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

        this.autoscaledPoolOptions = _.defaults({}, basicCrawlerAutoscaledPoolConfiguration, autoscaledPoolOptions);
        this.isRunningPromise = undefined;

        // Attach a listener to handle migration and aborting events gracefully.
        events.on(ACTOR_EVENT_NAMES.MIGRATING, this._pauseOnMigration.bind(this));
        events.on(ACTOR_EVENT_NAMES.ABORTING, this._pauseOnMigration.bind(this));
    }

    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     */
    async run(): Promise<void> {
        if (this.isRunningPromise) return this.isRunningPromise;

        await this._init();
        this.isRunningPromise = this.autoscaledPool!.run();
        await this.stats.startCapturing();

        try {
            await this.isRunningPromise;
        } finally {
            await this.teardown();
            await this.stats.stopCapturing();
            const finalStats = this.stats.calculate();
            const { requestsFailed, requestsFinished } = this.stats.state;
            this.log.info('Final request statistics:', {
                requestsFinished,
                requestsFailed,
                retryHistogram: this.stats.requestRetryHistogram,
                ...finalStats,
            });
        }
    }

    protected async _init(): Promise<void> {
        // Initialize AutoscaledPool before awaiting _loadHandledRequestCount(),
        // so that the caller can get a reference to it before awaiting the promise returned from run()
        // (otherwise there would be no way)
        this.autoscaledPool = new AutoscaledPool(this.autoscaledPoolOptions);

        if (this.useSessionPool) {
            this.sessionPool = await openSessionPool(this.sessionPoolOptions);
            // Assuming there are not more than 20 browsers running at once;
            this.sessionPool.setMaxListeners(20);
        }

        await this._loadHandledRequestCount();
    }

    protected async _handleRequestFunction(crawlingContext: HandleRequestInputs): Promise<void> {
        await this.userProvidedHandler(crawlingContext);
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
                                + 'invalid config. Make sure to use either Apify.openRequestList() or the "stateKeyPrefix" option of RequestList '
                                + 'constructor to ensure your crawling state is persisted through host migrations and restarts.');
                        } else {
                            this.log.exception(err, 'An unexpected error occured when the crawler '
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
     * Wrapper around handleRequestFunction that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error, etc.
     */
    protected async _runTaskFunction() {
        const source = this.requestQueue || this.requestList!;

        let request: Request | null;
        let session: Session | undefined;

        await this._timeoutAndRetry(
            async () => {
                if (this.useSessionPool) {
                    [request, session] = await Promise.all([this._fetchNextRequest(), this.sessionPool!.getSession()]);
                } else {
                    request = await this._fetchNextRequest();
                }
            },
            this.handleRequestTimeoutMillis,
            `Fetching next request timed out after ${this.handleRequestTimeoutMillis / 1e3} seconds.`,
        );

        tryCancel();

        if (!request) return;

        // Reset loadedUrl so an old one is not carried over to retries.
        request.loadedUrl = undefined;

        const statisticsId = request.id || request.uniqueKey;
        this.stats.startJob(statisticsId);

        // Shared crawling context
        const crawlingContext = {
            id: cryptoRandomObjectId(10),
            crawler: this,
            request,
            session,
        };
        this.crawlingContexts.set(crawlingContext.id, crawlingContext);

        try {
            await addTimeoutToPromise(
                () => this._handleRequestFunction(crawlingContext),
                this.handleRequestTimeoutMillis,
                `handleRequestFunction timed out after ${this.handleRequestTimeoutMillis / 1e3} seconds.`,
            );
            tryCancel();

            await this._timeoutAndRetry(
                () => source.markRequestHandled(request!),
                this.handleRequestTimeoutMillis,
                `Marking request ${request.url} as handled timed out after ${this.handleRequestTimeoutMillis / 1e3} seconds.`,
            );
            tryCancel();
            this.stats.finishJob(statisticsId);
            this.handledRequestsCount++;

            // reclaim session if request finishes successfully
            session?.markGood();
        } catch (err) {
            try {
                await this._timeoutAndRetry(
                    () => this._requestFunctionErrorHandler(err as Error, crawlingContext, source),
                    this.handleRequestTimeoutMillis,
                    `Handling request failure of ${request.url} timed out after ${this.handleRequestTimeoutMillis / 1e3} seconds.`,
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

        tryCancel();
    }

    /**
     * Run async callback with given timeout and retry.
     * @ignore
     */
    async _timeoutAndRetry(handler: () => Promise<unknown>, timeout: number, error: Error | string, maxRetries = 3, retried = 1): Promise<void> {
        try {
            await addTimeoutToPromise(
                handler,
                timeout,
                error,
            );
        } catch (e) {
            if (e instanceof TimeoutError && retried <= maxRetries) {
                this.log.warning(`${e.message} (retrying ${retried}/${maxRetries})`);
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
     * Handles errors thrown by user provided handleRequestFunction()
     */
    protected async _requestFunctionErrorHandler(error: Error, crawlingContext: CrawlingContext, source: RequestList | RequestQueue): Promise<void> {
        const { request } = crawlingContext;
        request.pushErrorMessage(error);

        const shouldRetryRequest = !request.noRetry && request.retryCount < this.maxRequestRetries;
        if (shouldRetryRequest) {
            request.retryCount++;
            this.log.exception(
                error,
                'handleRequestFunction failed, reclaiming failed request back to the list or queue',
                _.pick(request, 'url', 'retryCount', 'id'),
            );
            await source.reclaimRequest(request);
        } else {
            // If we get here, the request is either not retryable
            // or failed more than retryCount times and will not be retried anymore.
            // Mark the request as failed and do not retry.
            this.handledRequestsCount++;
            await source.markRequestHandled(request);
            this.stats.failJob(request.id || request.url);
            crawlingContext.error = error;
            await this._handleFailedRequestFunction(crawlingContext as HandleFailedRequestInput); // This function prints an error message.
        }
    }

    protected async _handleFailedRequestFunction(crawlingContext: HandleFailedRequestInput): Promise<void> {
        if (this.failedContextHandler) {
            await this.failedContextHandler(crawlingContext);
        } else {
            const { id, url, method, uniqueKey } = crawlingContext.request;
            this.log.exception(
                crawlingContext.error,
                'Request failed and reached maximum retries',
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
}

export type HandleRequest<Inputs extends HandleRequestInputs = HandleRequestInputs> = (inputs: Inputs) => Awaitable<void>;

export interface HandleRequestInputs {
    /**
     * The original {Request} object.
     * A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
     * Note that this property is only initialized after calling the {@link BasicCrawler.run} function.
     * You can use it to change the concurrency settings on the fly,
     * to pause the crawler by calling {@link AutoscaledPool.pause}
     * or to abort it by calling {@link AutoscaledPool.abort}.
     */
    request: Request;
    session?: Session;
    crawler?: BasicCrawler;
}

export type HandleFailedRequest = (inputs: HandleFailedRequestInput) => Awaitable<void>;
