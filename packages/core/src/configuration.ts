import { ENV_VARS, LOCAL_ENV_VARS } from '@apify/consts';
import type { MemoryStorageOptions } from '@crawlee/memory-storage';
import { MemoryStorage } from '@crawlee/memory-storage';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import type { Dictionary, StorageClient } from '@crawlee/types';
import { entries } from './typedefs';
import type { EventManager } from './events';
import { LocalEventManager } from './events';

// FIXME many of the options are apify specific, if they should be somewhere, its in the actor sdk
export interface ConfigurationOptions {
    storageClient?: StorageClient;
    eventManager?: EventManager;
    storageClientOptions?: Dictionary;
    defaultDatasetId?: string;
    defaultKeyValueStoreId?: string;
    defaultRequestQueueId?: string;
    maxUsedCpuRatio?: number;
    availableMemoryRatio?: number;
    persistStateIntervalMillis?: number;
    systemInfoIntervalMillis?: number;

    metamorphAfterSleepMillis?: number;
    inputKey?: string;
    actorId?: string;
    actorRunId?: string;
    actorTaskId?: string;
    containerPort?: number;
    containerUrl?: string;
    proxyHostname?: string;
    proxyPassword?: string;
    proxyPort?: number;
}

/**
 * `Configuration` is a value object holding the SDK configuration. We can use it in two ways:
 *
 * 1. When using `Actor` class, we can get the instance configuration via `sdk.config`
 *     ```js
 *     import { Actor } from 'apify';
 *
 *     const sdk = new Actor({ token: '123' });
 *     console.log(sdk.config.get('token')); // '123'
 *     ```
 * 2. To get the global configuration (singleton instance). It will respect the environment variables.
 *     ```js
 *     import { Configuration } from 'crawlee';
 *
 *     // returns the token from APIFY_TOKEN env var
 *     console.log(Configuration.getGlobalConfig().get('token'));
 *     ```
 *
 * ## Supported Configuration Options
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `defaultDatasetId` | `APIFY_DEFAULT_DATASET_ID` | `'default'`
 * `defaultKeyValueStoreId` | `APIFY_DEFAULT_KEY_VALUE_STORE_ID` | `'default'`
 * `defaultRequestQueueId` | `APIFY_DEFAULT_REQUEST_QUEUE_ID` | `'default'`
 * `persistStateIntervalMillis` | `APIFY_PERSIST_STATE_INTERVAL_MILLIS` | `60e3`
 *
 * ## Advanced Configuration Options
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `actorId` | `APIFY_ACTOR_ID` | -
 * `actorRunId` | `APIFY_ACTOR_RUN_ID` | -
 * `actorTaskId` | `APIFY_ACTOR_TASK_ID` | -
 * `containerPort` | `APIFY_CONTAINER_PORT` | `4321`
 * `containerUrl` | `APIFY_CONTAINER_URL` | `'http://localhost:4321'`
 * `inputKey` | `APIFY_INPUT_KEY` | `'INPUT'`
 * `metamorphAfterSleepMillis` | `APIFY_METAMORPH_AFTER_SLEEP_MILLIS` | `300e3`
 * `proxyHostname` | `APIFY_PROXY_HOSTNAME` | `'proxy.apify.com'`
 * `proxyPassword` | `APIFY_PROXY_PASSWORD` | -
 * `proxyPort` | `APIFY_PROXY_PORT` | `8000`
 *
 * ## Not Supported environment variables
 *
 * - `MEMORY_MBYTES`
 * - `HEADLESS`
 * - `XVFB`
 * - `CHROME_EXECUTABLE_PATH`
 */
export class Configuration {
    /**
     * Maps environment variables to config keys (e.g. `APIFY_PROXY_PORT` to `proxyPort`)
     */
    private static ENV_MAP = {
        // TODO prefix once we have a package name
        AVAILABLE_MEMORY_RATIO: 'availableMemoryRatio',

        APIFY_DEFAULT_DATASET_ID: 'defaultDatasetId',
        APIFY_DEFAULT_KEY_VALUE_STORE_ID: 'defaultKeyValueStoreId',
        APIFY_DEFAULT_REQUEST_QUEUE_ID: 'defaultRequestQueueId',
        APIFY_METAMORPH_AFTER_SLEEP_MILLIS: 'metamorphAfterSleepMillis',
        APIFY_PERSIST_STATE_INTERVAL_MILLIS: 'persistStateIntervalMillis',
        APIFY_TEST_PERSIST_INTERVAL_MILLIS: 'persistStateIntervalMillis', // for BC, seems to be unused
        APIFY_INPUT_KEY: 'inputKey',
        APIFY_ACTOR_ID: 'actorId',
        APIFY_ACTOR_RUN_ID: 'actorRunId',
        APIFY_ACTOR_TASK_ID: 'actorTaskId',
        APIFY_CONTAINER_PORT: 'containerPort',
        APIFY_CONTAINER_URL: 'containerUrl',
        APIFY_PROXY_HOSTNAME: 'proxyHostname',
        APIFY_PROXY_PASSWORD: 'proxyPassword',
        APIFY_PROXY_PORT: 'proxyPort',

        // not supported, use env vars directly:
        // APIFY_MEMORY_MBYTES: 'memoryMbytes',
        // APIFY_HEADLESS: 'headless',
        // APIFY_XVFB: 'xvfb',
        // APIFY_CHROME_EXECUTABLE_PATH: 'chromeExecutablePath',
    };

    /**
     * Maps config keys to environment variables (e.g. `proxyPort` to `APIFY_PROXY_PORT`).
     */
    private static ENV_MAP_REVERSED = entries(Configuration.ENV_MAP).reduce((obj, [key, value]) => {
        obj[value] = key;
        return obj;
    }, {} as Record<string, string>);

    private static BOOLEAN_VARS: string[] = [];

    private static INTEGER_VARS = ['proxyPort', 'memoryMbytes', 'containerPort'];

    private static DEFAULTS = {
        defaultKeyValueStoreId: LOCAL_ENV_VARS[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID],
        defaultDatasetId: LOCAL_ENV_VARS[ENV_VARS.DEFAULT_DATASET_ID],
        defaultRequestQueueId: LOCAL_ENV_VARS[ENV_VARS.DEFAULT_REQUEST_QUEUE_ID],
        maxUsedCpuRatio: 0.95,
        availableMemoryRatio: 0.25,
        storageClientOptions: {},
        inputKey: 'INPUT',
        proxyHostname: LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME],
        proxyPort: +LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT],
        containerPort: +LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT],
        containerUrl: LOCAL_ENV_VARS[ENV_VARS.CONTAINER_URL],
        metamorphAfterSleepMillis: 300_000,
        persistStateIntervalMillis: 60_000,
        systemInfoIntervalMillis: 60_000,
    };

    /**
     * Provides access to the current-instance-scoped Configuration without passing it around in parameters.
     * @internal
     */
    static storage = new AsyncLocalStorage<Configuration>();

    private options: Map<keyof ConfigurationOptions, ConfigurationOptions[keyof ConfigurationOptions]>;
    private services = new Map<string, unknown>();
    private static globalConfig?: Configuration;

    /**
     * Creates new `Configuration` instance with provided options. Env vars will have precedence over those.
     */
    constructor(options: ConfigurationOptions = {}) {
        this.options = new Map(entries(options));

        // Increase the global limit for event emitter memory leak warnings.
        EventEmitter.defaultMaxListeners = 50;
    }

    /**
     * Returns configured value. First checks the environment variables, then provided configuration,
     * fallbacks to the `defaultValue` argument if provided, otherwise uses the default value as described
     * in the above section.
     */
    get<T extends keyof ConfigurationOptions, U extends ConfigurationOptions[T]>(key: T, defaultValue?: U): U {
        // prefer env vars
        const envKey = Configuration.ENV_MAP_REVERSED[key] ?? key;
        const envValue = process.env[envKey];

        if (envValue != null) {
            return this._castEnvValue(key, envValue) as U;
        }

        // check instance level options
        if (this.options.has(key)) {
            return this.options.get(key) as U;
        }

        // fallback to defaults
        return (defaultValue ?? Configuration.DEFAULTS[key as keyof typeof Configuration.DEFAULTS] ?? envValue) as U;
    }

    private _castEnvValue(key: keyof ConfigurationOptions, value: number | string | boolean) {
        if (Configuration.INTEGER_VARS.includes(key)) {
            return +value;
        }

        if (Configuration.BOOLEAN_VARS.includes(key)) {
            // 0, false and empty string are considered falsy values
            return !['0', 'false', ''].includes(String(value).toLowerCase());
        }

        return value;
    }

    /**
     * Sets value for given option. Only affects this `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     */
    set(key: keyof ConfigurationOptions, value?: any): void {
        this.options.set(key, value);
    }

    /**
     * Returns cached instance of {@link StorageClient} using options as defined in the environment variables or in
     * this {@link Configuration} instance. Only first call of this method will create the client, following calls will
     * return the same client instance.
     *
     * Caching works based on the API URL and token, so calling this method with different options will return
     * multiple instances, one for each variant of the options.
     * @internal
     */
    getStorageClient(): StorageClient {
        if (this.options.has('storageClient')) {
            return this.options.get('storageClient') as StorageClient;
        }

        const options = this.options.get('storageClientOptions') as Dictionary;
        return this.createMemoryStorage(options);
    }

    getEventManager(): EventManager {
        if (this.options.has('eventManager')) {
            return this.options.get('eventManager') as EventManager;
        }

        if (this.services.has('eventManager')) {
            return this.services.get('eventManager') as EventManager;
        }

        const eventManager = new LocalEventManager(this);
        this.services.set('eventManager', eventManager);

        return eventManager;
    }

    /**
     * Creates an instance of MemoryStorage using options as defined in the environment variables or in this `Configuration` instance.
     * @internal
     */
    createMemoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
        const cacheKey = `MemoryStorage-${JSON.stringify(options)}`;

        if (this.services.has(cacheKey)) {
            return this.services.get(cacheKey) as MemoryStorage;
        }

        const storage = new MemoryStorage(options);
        this.services.set(cacheKey, storage);

        return storage;
    }

    useStorageClient(client: StorageClient): void {
        this.options.set('storageClient', client);
    }

    useEventManager(events: EventManager): void {
        this.options.set('eventManager', events);
    }

    /**
     * Returns the global configuration instance. It will respect the environment variables.
     */
    static getGlobalConfig() : Configuration {
        if (Configuration.storage.getStore()) {
            return Configuration.storage.getStore()!;
        }

        Configuration.globalConfig ??= new Configuration();
        return Configuration.globalConfig;
    }

    /**
     * Gets default {@link StorageClient} instance.
     */
    static getStorageClient(): StorageClient {
        return this.getGlobalConfig().getStorageClient();
    }

    /**
     * Gets default {@link EventManager} instance.
     */
    static getEventManager(): EventManager {
        return this.getGlobalConfig().getEventManager();
    }

    /**
     * Resets global configuration instance. The default instance holds configuration based on env vars,
     * if we want to change them, we need to first reset the global state. Used mainly for testing purposes.
     */
    static resetGlobalState(): void {
        delete this.globalConfig;
    }
}
