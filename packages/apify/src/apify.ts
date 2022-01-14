import ow from 'ow';
import { ENV_VARS } from '@apify/consts';
import { ApifyClient, ApifyClientOptions, Webhook, WebhookEventType } from 'apify-client';
import { WebhookOptions, CallOptions, CallTaskOptions, getEnv, UserFunc, ApifyEnv } from './actor';
import { initializeEvents, stopEvents } from './events';
import { StorageManager, StorageManagerOptions } from './storages/storage_manager';
import { Dataset } from './storages/dataset';
import { KeyValueStore, RecordOptions, maybeStringify } from './storages/key_value_store';
import { RequestList, RequestListOptions, REQUESTS_PERSISTENCE_KEY, STATE_PERSISTENCE_KEY } from './request_list';
import { RequestQueue } from './storages/request_queue';
import { SessionPool, SessionPoolOptions } from './session_pool/session_pool';
import { ProxyConfiguration, ProxyConfigurationOptions } from './proxy_configuration';
import { addCharsetToContentType, logSystemInfo, printOutdatedSdkWarning, publicUtils, sleep } from './utils';
import log from './utils_log';
import { EXIT_CODES } from './constants';
import { Configuration, ConfigurationOptions } from './configuration';
import { puppeteerUtils } from './puppeteer_utils';
import { playwrightUtils } from './playwright_utils';
import { socialUtils } from './utils_social';
import { enqueueLinks } from './enqueue_links/enqueue_links';
import { requestAsBrowser } from './utils_request';
import { ActorRunWithOutput, Constructor, Dictionary } from './typedefs';
import { Request, RequestOptions } from './request';

export interface MetamorphOptions {
    /**
     * Content type for the `input`. If not specified,
     * `input` is expected to be an object that will be stringified to JSON and content type set to
     * `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
     * `String` or `Buffer`.
     */
    contentType?: string;

    /**
     * Tag or number of the target actor build to metamorph into (e.g. `beta` or `1.2.345`).
     * If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
     */
    build?: string;

    /** @internal */
    customAfterSleepMillis?: number;
}

/**
 * `Apify` class serves as an alternative approach to the static helpers exported from the package. It allows to pass configuration
 * that will be used on the instance methods. Environment variables will have precedence over this configuration.
 * See {@link Configuration} for details about what can be configured and what are the default values.
 */
export class Apify {
    /** Configuration of this SDK instance (provided to its constructor). See {@link Configuration} for details. */
    readonly config: Configuration;

    private readonly storageManagers = new Map<Constructor, StorageManager<unknown>>();

    constructor(options: ConfigurationOptions = {}) {
        this.config = new Configuration(options);
    }

    /**
     * Runs the main user function that performs the job of the actor
     * and terminates the process when the user function finishes.
     *
     * **The `Apify.main()` function is optional** and is provided merely for your convenience.
     * It is mainly useful when you're running your code as an actor on the [Apify platform](https://apify.com/actors).
     * However, if you want to use Apify SDK tools directly inside your existing projects, e.g.
     * running in an [Express](https://expressjs.com/) server, on
     * [Google Cloud functions](https://cloud.google.com/functions)
     * or [AWS Lambda](https://aws.amazon.com/lambda/), it's better to avoid
     * it since the function terminates the main process when it finishes!
     *
     * The `Apify.main()` function performs the following actions:
     *
     * - When running on the Apify platform (i.e. `APIFY_IS_AT_HOME` environment variable is set),
     *   it sets up a connection to listen for platform events.
     *   For example, to get a notification about an imminent migration to another server.
     *   See {@link Apify.events} for details.
     * - It checks that either `APIFY_TOKEN` or `APIFY_LOCAL_STORAGE_DIR` environment variable
     *   is defined. If not, the functions sets `APIFY_LOCAL_STORAGE_DIR` to `./apify_storage`
     *   inside the current working directory. This is to simplify running code examples.
     * - It invokes the user function passed as the `userFunc` parameter.
     * - If the user function returned a promise, waits for it to resolve.
     * - If the user function throws an exception or some other error is encountered,
     *   prints error details to console so that they are stored to the log.
     * - Exits the Node.js process, with zero exit code on success and non-zero on errors.
     *
     * The user function can be synchronous:
     *
     * ```javascript
     * Apify.main(() => {
     *   // My synchronous function that returns immediately
     *   console.log('Hello world from actor!');
     * });
     * ```
     *
     * If the user function returns a promise, it is considered asynchronous:
     * ```javascript
     * const { requestAsBrowser } = require('some-request-library');
     *
     * Apify.main(() => {
     *   // My asynchronous function that returns a promise
     *   return request('http://www.example.com').then((html) => {
     *     console.log(html);
     *   });
     * });
     * ```
     *
     * To simplify your code, you can take advantage of the `async`/`await` keywords:
     *
     * ```javascript
     * const request = require('some-request-library');
     *
     * Apify.main(async () => {
     *   // My asynchronous function
     *   const html = await request('http://www.example.com');
     *   console.log(html);
     * });
     * ```
     *
     * @param userFunc User function to be executed. If it returns a promise,
     * the promise will be awaited. The user function is called with no arguments.
     */
    main(userFunc: UserFunc): Promise<void> {
        if (!userFunc || typeof (userFunc) !== 'function') {
            // eslint-disable-next-line max-len
            throw new Error(`Apify.main() accepts a single parameter that must be a function (was '${userFunc === null ? 'null' : typeof userFunc}').`);
        }

        // Logging some basic system info (apify and apify-client version, NodeJS version, ...).
        logSystemInfo();

        // Log warning if SDK is outdated.
        printOutdatedSdkWarning();

        // This is to enable unit tests where process.exit() is mocked and doesn't really exit the process
        // Note that mocked process.exit() might throw, so set exited flag before calling it to avoid confusion.
        let exited = false;
        const exitWithError = (err: Error, exitCode: number) => {
            log.exception(err, '');
            exited = true;
            process.exit(exitCode);
        };

        // Set dummy interval to ensure the process will not be killed while awaiting empty promise:
        // await new Promise(() => {})
        // Such a construct is used for testing of actor timeouts and aborts.
        const intervalId = setInterval((i) => i, 9999999);

        // Using async here to have nice stack traces for errors
        try {
            initializeEvents(this.config);
            return (async () => {
                try {
                    await userFunc();
                    process.exit(EXIT_CODES.SUCCESS);
                } catch (err) {
                    if (!exited) {
                        exitWithError(err as Error, EXIT_CODES.ERROR_USER_FUNCTION_THREW);
                    }
                }
            })();
        } catch (err) {
            exitWithError(err as Error, EXIT_CODES.ERROR_UNKNOWN);
        } finally {
            stopEvents();
            clearInterval(intervalId);
        }

        return Promise.resolve();
    }

    /**
     * Runs an actor on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable),
     * waits for the actor to finish and fetches its output.
     *
     * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
     * If the value is less than or equal to zero, the function returns immediately after the run is started.
     *
     * The result of the function is an {@link ActorRun} object
     * that contains details about the actor run and its output (if any).
     *
     * If you want to run an actor task rather than an actor, please use the
     * {@link Apify.callTask} function instead.
     *
     * For more information about actors, read the
     * [documentation](https://docs.apify.com/actor).
     *
     * **Example usage:**
     *
     * ```javascript
     * const run = await Apify.call('apify/hello-world', { myInput: 123 });
     * console.log(`Received message: ${run.output.body.message}`);
     * ```
     *
     * Internally, the `call()` function invokes the
     * [Run actor](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor)
     * and several other API endpoints to obtain the output.
     *
     * @param actId
     *  Allowed formats are `username/actor-name`, `userId/actor-name` or actor ID.
     * @param [input]
     *  Input for the actor. If it is an object, it will be stringified to
     *  JSON and its content type set to `application/json; charset=utf-8`.
     *  Otherwise the `options.contentType` parameter must be provided.
     * @param [options]
     */
    async call(actId: string, input?: unknown, options: CallOptions = {}): Promise<ActorRunWithOutput> {
        const token = options.token ?? this.config.get('token');
        const client = this.newClient({ token });

        return client.actor(actId).call(input, options);
    }

    /**
     * Runs an actor task on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable),
     * waits for the task to finish and fetches its output.
     *
     * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
     * If the value is less than or equal to zero, the function returns immediately after the run is started.
     *
     * The result of the function is an {@link ActorRun} object
     * that contains details about the actor run and its output (if any).
     *
     * Note that an actor task is a saved input configuration and options for an actor.
     * If you want to run an actor directly rather than an actor task, please use the
     * {@link Apify.call} function instead.
     *
     * For more information about actor tasks, read the [documentation](https://docs.apify.com/tasks).
     *
     * **Example usage:**
     *
     * ```javascript
     * const run = await Apify.callTask('bob/some-task');
     * console.log(`Received message: ${run.output.body.message}`);
     * ```
     *
     * Internally, the `callTask()` function calls the
     * [Run task](https://apify.com/docs/api/v2#/reference/actor-tasks/run-collection/run-task)
     * and several other API endpoints to obtain the output.
     *
     * @param taskId
     *  Allowed formats are `username/task-name`, `userId/task-name` or task ID.
     * @param [input]
     *  Input overrides for the actor task. If it is an object, it will be stringified to
     *  JSON and its content type set to `application/json; charset=utf-8`.
     *  Provided input will be merged with actor task input.
     * @param [options]
     */
    async callTask(taskId: string, input?: Dictionary, options: CallTaskOptions = {}): Promise<ActorRunWithOutput> {
        const token = options.token ?? this.config.get('token');
        const client = this.newClient({ token });

        return client.task(taskId).call(input, options);
    }

    /**
     * Transforms this actor run to an actor run of a given actor. The system stops the current container and starts
     * the new container instead. All the default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key
     * in the same default key-value store.
     *
     * @param targetActorId
     *  Either `username/actor-name` or actor ID of an actor to which we want to metamorph.
     * @param [input]
     *  Input for the actor. If it is an object, it will be stringified to
     *  JSON and its content type set to `application/json; charset=utf-8`.
     *  Otherwise, the `options.contentType` parameter must be provided.
     * @param [options]
     */
    async metamorph(targetActorId: string, input?: unknown, options: MetamorphOptions = {}): Promise<void> {
        ow(targetActorId, ow.string);
        // input can be anything, no reason to validate
        ow(options, ow.object.exactShape({
            contentType: ow.optional.string.nonEmpty,
            build: ow.optional.string,
            customAfterSleepMillis: ow.optional.number.not.negative,
        }));

        const {
            customAfterSleepMillis,
            ...metamorphOpts
        } = options;

        const actorId = this.config.get('actorId');
        const runId = this.config.get('actorRunId');
        if (!actorId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_ID} must be provided!`);
        if (!runId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} must be provided!`);

        if (input) {
            metamorphOpts.contentType = addCharsetToContentType(metamorphOpts.contentType!);
            input = maybeStringify(input, metamorphOpts);
        }

        await this.newClient().run(runId).metamorph(targetActorId, input, metamorphOpts);

        // Wait some time for container to be stopped.
        // NOTE: option.customAfterSleepMillis is used in tests
        await sleep(customAfterSleepMillis || this.config.get('metamorphAfterSleepMillis'));
    }

    /**
     *
     * Creates an ad-hoc webhook for the current actor run, which lets you receive a notification when the actor run finished or failed.
     * For more information about Apify actor webhooks, please see the [documentation](https://docs.apify.com/webhooks).
     *
     * Note that webhooks are only supported for actors running on the Apify platform.
     * In local environment, the function will print a warning and have no effect.
     *
     * @param options
     * @returns The return value is the Webhook object.
     * For more information, see the [Get webhook](https://apify.com/docs/api/v2#/reference/webhooks/webhook-object/get-webhook) API endpoint.
     */
    async addWebhook(options: WebhookOptions): Promise<Webhook | undefined> {
        ow(options, ow.object.exactShape({
            eventTypes: ow.array.ofType<WebhookEventType>(ow.string),
            requestUrl: ow.string,
            payloadTemplate: ow.optional.string,
            idempotencyKey: ow.optional.string,
        }));

        const { eventTypes, requestUrl, payloadTemplate, idempotencyKey } = options;

        if (!this.isAtHome()) {
            log.warning('Apify.addWebhook() is only supported when running on the Apify platform. The webhook will not be invoked.');
            return undefined;
        }

        const runId = this.config.get('actorRunId');
        if (!runId) {
            throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} is not set!`);
        }

        return this.newClient().webhooks().create({
            isAdHoc: true,
            eventTypes,
            condition: {
                actorRunId: runId,
            },
            requestUrl,
            payloadTemplate,
            idempotencyKey,
        });
    }

    /**
     * Stores an object or an array of objects to the default {@link Dataset} of the current actor run.
     *
     * This is just a convenient shortcut for {@link Dataset.pushData}.
     * For example, calling the following code:
     * ```javascript
     * await Apify.pushData({ myValue: 123 });
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const dataset = await Apify.openDataset();
     * await dataset.pushData({ myValue: 123 });
     * ```
     *
     * For more information, see {@link Apify.openDataset} and {@link Dataset.pushData}
     *
     * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
     * otherwise the actor process might finish before the data are stored!
     *
     * @param item Object or array of objects containing data to be stored in the default dataset.
     * The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
     */
    async pushData(item: Dictionary): Promise<void> {
        const dataset = await this.openDataset();
        return dataset.pushData(item);
    }

    /**
     * Opens a dataset and returns a promise resolving to an instance of the {@link Dataset} class.
     *
     * Datasets are used to store structured data where each object stored has the same attributes,
     * such as online store products or real estate offers.
     * The actual data is stored either on the local filesystem or in the cloud.
     *
     * For more details and code examples, see the {@link Dataset} class.
     *
     * @param [datasetIdOrName]
     *   ID or name of the dataset to be opened. If `null` or `undefined`,
     *   the function returns the default dataset associated with the actor run.
     * @param [options]
     */
    async openDataset<Data extends Dictionary = Dictionary>(
        datasetIdOrName?: string | null, options: Omit<StorageManagerOptions, 'config'> = {},
    ): Promise<Dataset<Data>> {
        ow(datasetIdOrName, ow.optional.string);
        ow(options, ow.object.exactShape({
            forceCloud: ow.optional.boolean,
        }));

        return this._getStorageManager<Dataset<Data>>(Dataset).openStorage(datasetIdOrName, options);
    }

    /**
     * Gets a value from the default {@link KeyValueStore} associated with the current actor run.
     *
     * This is just a convenient shortcut for {@link KeyValueStore.getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await Apify.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@link Apify.setValue} function.
     *
     * For more information, see  {@link Apify.openKeyValueStore}
     * and  {@link KeyValueStore.getValue}.
     *
     * @param key Unique record key.
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     */
    async getValue<T = unknown>(key: string): Promise<T | null> {
        const store = await this.openKeyValueStore();
        return store.getValue<T>(key);
    }

    /**
     * Stores or deletes a value in the default {@link KeyValueStore} associated with the current actor run.
     *
     * This is just a convenient shortcut for  {@link KeyValueStore.setValue}.
     * For example, calling the following code:
     * ```javascript
     * await Apify.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * await store.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * To get a value from the default key-value store, you can use the  {@link Apify.getValue} function.
     *
     * For more information, see  {@link Apify.openKeyValueStore}
     * and  {@link KeyValueStore.getValue}.
     *
     * @param key
     *   Unique record key.
     * @param value
     *   Record data, which can be one of the following values:
     *    - If `null`, the record in the key-value store is deleted.
     *    - If no `options.contentType` is specified, `value` can be any JavaScript object, and it will be stringified to JSON.
     *    - If `options.contentType` is set, `value` is taken as is, and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
     *   For any other value an error will be thrown.
     * @param [options]
     */
    async setValue<T>(key: string, value: T | null, options: RecordOptions = {}): Promise<void> {
        const store = await this.openKeyValueStore();
        return store.setValue(key, value, options);
    }

    /**
     * Gets the actor input value from the default {@link KeyValueStore} associated with the current actor run.
     *
     * This is just a convenient shortcut for [`keyValueStore.getValue('INPUT')`](key-value-store#getvalue).
     * For example, calling the following code:
     * ```javascript
     * const input = await Apify.getInput();
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * await store.getValue('INPUT');
     * ```
     *
     * Note that the `getInput()` function does not cache the value read from the key-value store.
     * If you need to use the input multiple times in your actor,
     * it is far more efficient to read it once and store it locally.
     *
     * For more information, see  {@link Apify.openKeyValueStore}
     * and {@link KeyValueStore.getValue}.
     *
     * @returns
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     */
    async getInput<T extends Dictionary | string | Buffer>(): Promise<T | null> {
        return this.getValue<T>(this.config.get('inputKey'));
    }

    /**
     * Opens a key-value store and returns a promise resolving to an instance of the {@link KeyValueStore} class.
     *
     * Key-value stores are used to store records or files, along with their MIME content type.
     * The records are stored and retrieved using a unique key.
     * The actual data is stored either on a local filesystem or in the Apify cloud.
     *
     * For more details and code examples, see the {@link KeyValueStore} class.
     *
     * @param [storeIdOrName]
     *   ID or name of the key-value store to be opened. If `null` or `undefined`,
     *   the function returns the default key-value store associated with the actor run.
     * @param [options]
     */
    async openKeyValueStore(storeIdOrName?: string | null, options: Omit<StorageManagerOptions, 'config'> = {}): Promise<KeyValueStore> {
        ow(storeIdOrName, ow.optional.string);
        ow(options, ow.object.exactShape({
            forceCloud: ow.optional.boolean,
        }));

        return this._getStorageManager(KeyValueStore).openStorage(storeIdOrName, options);
    }

    /**
     * Opens a request list and returns a promise resolving to an instance
     * of the {@link RequestList} class that is already initialized.
     *
     * {@link RequestList} represents a list of URLs to crawl, which is always stored in memory.
     * To enable picking up where left off after a process restart, the request list sources
     * are persisted to the key-value store at initialization of the list. Then, while crawling,
     * a small state object is regularly persisted to keep track of the crawling status.
     *
     * For more details and code examples, see the {@link RequestList} class.
     *
     * **Example usage:**
     *
     * ```javascript
     * const sources = [
     *     'https://www.example.com',
     *     'https://www.google.com',
     *     'https://www.bing.com'
     * ];
     *
     * const requestList = await Apify.openRequestList('my-name', sources);
     * ```
     *
     * @param listName
     *   Name of the request list to be opened. Setting a name enables the `RequestList`'s state to be persisted
     *   in the key-value store. This is useful in case of a restart or migration. Since `RequestList` is only
     *   stored in memory, a restart or migration wipes it clean. Setting a name will enable the `RequestList`'s
     *   state to survive those situations and continue where it left off.
     *
     *   The name will be used as a prefix in key-value store, producing keys such as `NAME-REQUEST_LIST_STATE`
     *   and `NAME-REQUEST_LIST_SOURCES`.
     *
     *   If `null`, the list will not be persisted and will only be stored in memory. Process restart
     *   will then cause the list to be crawled again from the beginning. We suggest always using a name.
     * @param sources
     *  An array of sources of URLs for the {@link RequestList}. It can be either an array of strings,
     *  plain objects that define at least the `url` property, or an array of {@link Request} instances.
     *
     *  **IMPORTANT:** The `sources` array will be consumed (left empty) after {@link RequestList} initializes.
     *  This is a measure to prevent memory leaks in situations when millions of sources are
     *  added.
     *
     *  Additionally, the `requestsFromUrl` property may be used instead of `url`,
     *  which will instruct {@link RequestList} to download the source URLs from a given remote location.
     *  The URLs will be parsed from the received response. In this case you can limit the URLs
     *  using `regex` parameter containing regular expression pattern for URLs to be included.
     *
     *  For details, see the {@link RequestListOptions.sources}
     * @param [options]
     *   The {@link RequestList} options. Note that the `listName` parameter supersedes
     *   the {@link RequestListOptions.persistStateKey} and {@link RequestListOptions.persistRequestsKey}
     *   options and the `sources` parameter supersedes the {@link RequestListOptions.sources} option.
     */
    async openRequestList(
        listName: string | null,
        sources: (RequestOptions | Request | string)[],
        options: RequestListOptions = {},
    ): Promise<RequestList> {
        ow(listName, ow.any(ow.string, ow.null));
        ow(sources, ow.array);
        ow(options, ow.object.is((v) => !Array.isArray(v)));

        const rl = new RequestList({
            ...options,
            persistStateKey: listName ? `${listName}-${STATE_PERSISTENCE_KEY}` : undefined,
            persistRequestsKey: listName ? `${listName}-${REQUESTS_PERSISTENCE_KEY}` : undefined,
            sources,
        });
        await rl.initialize();

        return rl;
    }

    /**
     * Opens a request queue and returns a promise resolving to an instance
     * of the {@link RequestQueue} class.
     *
     * {@link RequestQueue} represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud.
     * The queue is used for deep crawling of websites, where you start with several URLs and then
     * recursively follow links to other pages. The data structure supports both breadth-first
     * and depth-first crawling orders.
     *
     * For more details and code examples, see the {@link RequestQueue} class.
     *
     * @param [queueIdOrName]
     *   ID or name of the request queue to be opened. If `null` or `undefined`,
     *   the function returns the default request queue associated with the actor run.
     * @param [options]
     */
    async openRequestQueue(queueIdOrName?: string | null, options: Omit<StorageManagerOptions, 'config'> = {}): Promise<RequestQueue> {
        ow(queueIdOrName, ow.optional.string);
        ow(options, ow.object.exactShape({
            forceCloud: ow.optional.boolean,
        }));

        return this._getStorageManager(RequestQueue).openStorage(queueIdOrName, options);
    }

    /**
     * Opens a SessionPool and returns a promise resolving to an instance
     * of the {@link SessionPool} class that is already initialized.
     *
     * For more details and code examples, see the {@link SessionPool} class.
     */
    async openSessionPool(sessionPoolOptions?: SessionPoolOptions): Promise<SessionPool> {
        const sessionPool = new SessionPool(sessionPoolOptions, this.config);
        await sessionPool.initialize();

        return sessionPool;
    }

    /**
     * Creates a proxy configuration and returns a promise resolving to an instance
     * of the {@link ProxyConfiguration} class that is already initialized.
     *
     * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
     * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
     * them to use the selected proxies for all connections.
     *
     * For more details and code examples, see the {@link ProxyConfiguration} class.
     *
     * ```javascript
     *
     * // Returns initialized proxy configuration class
     * const proxyConfiguration = await Apify.createProxyConfiguration({
     *     groups: ['GROUP1', 'GROUP2'] // List of Apify proxy groups
     *     countryCode: 'US'
     * });
     *
     * const crawler = new Apify.CheerioCrawler({
     *   // ...
     *   proxyConfiguration,
     *   handlePageFunction: ({ proxyInfo }) => {
     *       const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
     *   }
     * })
     *
     * ```
     *
     * For compatibility with existing Actor Input UI (Input Schema), this function
     * returns `undefined` when the following object is passed as `proxyConfigurationOptions`.
     *
     * ```
     * { useApifyProxy: false }
     * ```
     */
    async createProxyConfiguration(
        proxyConfigurationOptions: ProxyConfigurationOptions & { useApifyProxy?: boolean } = {},
    ): Promise<ProxyConfiguration | undefined> {
        // Compatibility fix for Input UI where proxy: None returns { useApifyProxy: false }
        // Without this, it would cause proxy to use the zero config / auto mode.
        const dontUseApifyProxy = proxyConfigurationOptions.useApifyProxy === false;
        const dontUseCustomProxies = !proxyConfigurationOptions.proxyUrls;

        if (dontUseApifyProxy && dontUseCustomProxies) {
            return undefined;
        }

        const proxyConfiguration = new ProxyConfiguration(proxyConfigurationOptions, this.config);
        await proxyConfiguration.initialize();

        return proxyConfiguration;
    }

    /**
     * Returns a new {@link ApifyEnv} object which contains information parsed from all the `APIFY_XXX` environment variables.
     *
     * For the list of the `APIFY_XXX` environment variables, see
     * [Actor documentation](https://docs.apify.com/actor/run#environment-variables).
     * If some of the variables are not defined or are invalid, the corresponding value in the resulting object will be null.
     */
    getEnv(): ApifyEnv {
        return getEnv();
    }

    /**
     * Returns a new instance of the Apify API client. The `ApifyClient` class is provided
     * by the [apify-client](https://www.npmjs.com/package/apify-client)
     * NPM package, and it is automatically configured using the `APIFY_API_BASE_URL`, and `APIFY_TOKEN`
     * environment variables. You can override the token via the available options. That's useful
     * if you want to use the client as a different Apify user than the SDK internals are using.
     */
    newClient(options: ApifyClientOptions = {}): ApifyClient {
        return this.config.createClient(options);
    }

    /**
     * Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).
     */
    isAtHome(): boolean {
        return !!this.config.get('isAtHome');
    }

    get utils(): Record<string, unknown> {
        return {
            ...publicUtils,
            puppeteer: puppeteerUtils,
            playwright: playwrightUtils,
            social: socialUtils,
            log,
            enqueueLinks,
            requestAsBrowser,
        };
    }

    private _getStorageManager<T>(storageClass: Constructor<T>): StorageManager<T> {
        if (!this.storageManagers.has(storageClass)) {
            const manager = new StorageManager(storageClass, this.config);
            this.storageManagers.set(storageClass, manager);
        }

        return this.storageManagers.get(storageClass) as StorageManager<T>;
    }
}
