import { ENV_VARS, LOCAL_ENV_VARS } from '@apify/consts';
import { join } from 'path';
import { ApifyStorageLocal } from '@apify/storage-local';
import { ApifyClient } from 'apify-client';
import log from './utils_log';

export interface ConfigurationOptions {
    token?: string;
    localStorageDir?: string;
    localStorageEnableWalMode?: boolean;
    defaultDatasetId?: string;
    defaultKeyValueStoreId?: string;
    defaultRequestQueueId?: string;
    metamorphAfterSleepMillis?: number;
    persistStateIntervalMillis?: number;
    actorEventsWsUrl?: string;
    inputKey?: string;
    actorId?: string;
    apiBaseUrl?: string;
    isAtHome?: boolean;
    actorRunId?: string;
    actorTaskId?: string;
    containerPort?: number;
    containerUrl?: string;
    userId?: string;
    proxyHostname?: string;
    proxyPassword?: string;
    proxyStatusUrl?: string;
    proxyPort?: number;
}

/**
 * `Configuration` is a value object holding the SDK configuration. We can use it in two ways:
 *
 * 1. When using `Apify` class, we can get the instance configuration via `sdk.config`
 *     ```js
 *     const { Apify } = require('apify');
 *
 *     const sdk = new Apify({ token: '123' });
 *     console.log(sdk.config.get('token')); // '123'
 *     ```
 * 2. To get the global configuration (singleton instance). It will respect the environment variables.
 *     ```js
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
 * `localStorageDir` | `APIFY_LOCAL_STORAGE_DIR` | `'./apify_storage'`
 * `localStorageEnableWalMode` | `APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE` | `true`
 * `persistStateIntervalMillis` | `APIFY_PERSIST_STATE_INTERVAL_MILLIS` | `60e3`
 * `token` | `APIFY_TOKEN` | -
 *
 * ## Advanced Configuration Options
 *
 * Key | Environment Variable | Default Value
 * ---|---|---
 * `actorEventsWsUrl` | `APIFY_ACTOR_EVENTS_WS_URL` | -
 * `actorId` | `APIFY_ACTOR_ID` | -
 * `actorRunId` | `APIFY_ACTOR_RUN_ID` | -
 * `actorTaskId` | `APIFY_ACTOR_TASK_ID` | -
 * `apiBaseUrl` | `APIFY_API_BASE_URL` | `'https://api.apify.com'`
 * `containerPort` | `APIFY_CONTAINER_PORT` | `4321`
 * `containerUrl` | `APIFY_CONTAINER_URL` | `'http://localhost:4321'`
 * `inputKey` | `APIFY_INPUT_KEY` | `'INPUT'`
 * `isAtHome` | `APIFY_IS_AT_HOME` | -
 * `metamorphAfterSleepMillis` | `APIFY_METAMORPH_AFTER_SLEEP_MILLIS` | `300e3`
 * `proxyHostname` | `APIFY_PROXY_HOSTNAME` | `'proxy.apify.com'`
 * `proxyPassword` | `APIFY_PROXY_PASSWORD` | -
 * `proxyPort` | `APIFY_PROXY_PORT` | `8000`
 * `proxyStatusUrl` | `APIFY_PROXY_STATUS_URL` | `'http://proxy.apify.com'`
 * `userId` | `APIFY_USER_ID` | -
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
        APIFY_TOKEN: 'token',
        APIFY_LOCAL_STORAGE_DIR: 'localStorageDir',
        APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE: 'localStorageEnableWalMode',
        APIFY_DEFAULT_DATASET_ID: 'defaultDatasetId',
        APIFY_DEFAULT_KEY_VALUE_STORE_ID: 'defaultKeyValueStoreId',
        APIFY_DEFAULT_REQUEST_QUEUE_ID: 'defaultRequestQueueId',
        APIFY_METAMORPH_AFTER_SLEEP_MILLIS: 'metamorphAfterSleepMillis',
        APIFY_PERSIST_STATE_INTERVAL_MILLIS: 'persistStateIntervalMillis',
        APIFY_TEST_PERSIST_INTERVAL_MILLIS: 'persistStateIntervalMillis', // for BC, seems to be unused
        APIFY_ACTOR_EVENTS_WS_URL: 'actorEventsWsUrl',
        APIFY_INPUT_KEY: 'inputKey',
        APIFY_ACTOR_ID: 'actorId',
        APIFY_API_BASE_URL: 'apiBaseUrl',
        APIFY_IS_AT_HOME: 'isAtHome',
        APIFY_ACTOR_RUN_ID: 'actorRunId',
        APIFY_ACTOR_TASK_ID: 'actorTaskId',
        APIFY_CONTAINER_PORT: 'containerPort',
        APIFY_CONTAINER_URL: 'containerUrl',
        APIFY_USER_ID: 'userId',
        APIFY_PROXY_HOSTNAME: 'proxyHostname',
        APIFY_PROXY_PASSWORD: 'proxyPassword',
        APIFY_PROXY_STATUS_URL: 'proxyStatusUrl',
        APIFY_PROXY_PORT: 'proxyPort',

        // not supported, use env vars directly:
        // APIFY_MEMORY_MBYTES: 'memoryMbytes',
        // APIFY_HEADLESS: 'headless',
        // APIFY_XVFB: 'xvfb',
        // APIFY_CHROME_EXECUTABLE_PATH: 'chromeExecutablePath',
    };

    /**
     * maps config keys to environment variables (e.g. `proxyPort` to `APIFY_PROXY_PORT`)
     */
    private static ENV_MAP_REVERSED = Object.entries(Configuration.ENV_MAP).reduce((obj, [key, value]) => {
        obj[value] = key;
        return obj;
    }, {} as Record<string, string>);

    private static BOOLEAN_VARS = ['localStorageEnableWalMode'];

    private static INTEGER_VARS = ['proxyPort', 'memoryMbytes', 'containerPort'];

    private static DEFAULTS = {
        defaultKeyValueStoreId: LOCAL_ENV_VARS[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID],
        defaultDatasetId: LOCAL_ENV_VARS[ENV_VARS.DEFAULT_DATASET_ID],
        defaultRequestQueueId: LOCAL_ENV_VARS[ENV_VARS.DEFAULT_REQUEST_QUEUE_ID],
        inputKey: 'INPUT',
        apiBaseUrl: 'https://api.apify.com',
        proxyStatusUrl: 'http://proxy.apify.com',
        proxyHostname: LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME],
        proxyPort: +LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT],
        containerPort: +LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT],
        containerUrl: LOCAL_ENV_VARS[ENV_VARS.CONTAINER_URL],
        metamorphAfterSleepMillis: 300e3,
        persistStateIntervalMillis: 60e3, // This value is mentioned in jsdoc in `events.js`, if you update it here, update it there too.
        localStorageEnableWalMode: true,
    };

    private options: Map<keyof ConfigurationOptions, ConfigurationOptions[keyof ConfigurationOptions]>;
    private services = new Map<string, unknown>();
    private static globalConfig?: Configuration;

    /**
     * Creates new `Configuration` instance with provided options. Env vars will have precedence over those.
     */
    constructor(options: ConfigurationOptions = {}) {
        this.options = new Map(Object.entries(options)) as any;

        if (!this.get('localStorageDir') && !this.get('token')) {
            const dir = join(process.cwd(), './apify_storage');
            this.set('localStorageDir', dir);
            // eslint-disable-next-line max-len
            log.warning(`Neither ${ENV_VARS.LOCAL_STORAGE_DIR} nor ${ENV_VARS.TOKEN} environment variable is set, defaulting to ${ENV_VARS.LOCAL_STORAGE_DIR}="${dir}"`);
        }
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
            return this._castEnvValue(key, envValue);
        }

        // check instance level options
        if (this.options.has(key)) {
            return this.options.get(key) as U;
        }

        // fallback to defaults
        return (defaultValue ?? Configuration.DEFAULTS[key as string] ?? envValue) as U;
    }

    /**
     * @param {string} key
     * @param {number | string | boolean} value
     * @return {boolean}
     * @private
     */
    _castEnvValue(key, value) {
        if (Configuration.INTEGER_VARS.includes(key)) {
            return +value;
        }

        if (Configuration.BOOLEAN_VARS.includes(key)) {
            // 0, false and empty string are considered falsy values
            return !['0', 'false', ''].includes(value.toLowerCase());
        }

        return value;
    }

    /**
     * Sets value for given option. Only affects this `Configuration` instance, the value will not be propagated down to the env var.
     * To reset a value, we can omit the `value` argument or pass `undefined` there.
     *
     * @param {string} key
     * @param {string | number | boolean} [value]
     */
    set(key, value) {
        this.options.set(key, value);
    }

    /**
     * Returns cached instance of {@link ApifyClient} using options as defined in the environment variables or in
     * this {@link Configuration} instance. Only first call of this method will create the client, following calls will
     * return the same client instance.
     *
     * Caching works based on the API URL and token, so calling this method with different options will return
     * multiple instances, one for each variant of the options.
     * @internal
     */
    getClient(options: { token?: string; maxRetries?: string; minDelayBetweenRetriesMillis?: string; baseUrl?: string } = {}): ApifyClient {
        const baseUrl = options.baseUrl ?? this.get('apiBaseUrl');
        const token = options.token ?? this.get('token');
        const cacheKey = `${baseUrl}~${token}`;

        return this._getService('ApifyClient', () => this.createClient(options), cacheKey);
    }

    /**
     * Returns cached instance of {@link ApifyStorageLocal} using options as defined in the environment variables or in
     * this {@link Configuration} instance. Only first call of this method will create the client, following calls will return
     * the same client instance.
     *
     * Caching works based on the `storageDir` option, so calling this method with different `storageDir` will return
     * multiple instances, one for each directory.
     *
     * @param [options.storageDir]
     * @param [options.enableWalMode=true]
     * @return {ApifyStorageLocal}
     * @internal
     */
    getStorageLocal(options: { storageDir?: string; enableWalMode?: boolean } = {}) {
        const cacheKey = options.storageDir ?? this.get('localStorageDir');
        return this._getService('ApifyStorageLocal', () => this.createStorageLocal(options), cacheKey);
    }

    /**
     * Returns cached (singleton) instance of a service by its name. If the service does not exist yet, it will be created
     * via the `createCallback`. To have multiple instances of one service, we can use unique values in the `cacheKey`.
     *
     * @param {string} name
     * @param {Function} createCallback
     * @param {string} [cacheKey]
     * @return {unknown}
     * @private
     */
    _getService<T = unknown>(name: string, createCallback: () => T, cacheKey = name): T {
        cacheKey = `${name}~${cacheKey}`;

        if (!this.services.has(cacheKey)) {
            this.services.set(cacheKey, createCallback());
        }

        return this.services.get(cacheKey) as T;
    }

    /**
     * Creates an instance of ApifyClient using options as defined in the environment variables or in this `Configuration` instance.
     *
     * @param {object} [options]
     * @param {string} [options.token]
     * @param {string} [options.maxRetries]
     * @param {string} [options.minDelayBetweenRetriesMillis]
     * @return {ApifyClient}
     * @internal
     */
    createClient(options = {}) {
        return new ApifyClient({
            baseUrl: this.get('apiBaseUrl'),
            token: this.get('token'),
            ...options, // allow overriding the instance configuration
        });
    }

    /**
     * Creates an instance of ApifyStorageLocal using options as defined in the environment variables or in this `Configuration` instance.
     * @internal
     */
    createStorageLocal(options: { storageDir?: string; enableWalMode?: boolean } = {}): ApifyStorageLocal {
        const storageDir = options.storageDir ?? this.get('localStorageDir');
        const enableWalMode = options.enableWalMode ?? this.get('localStorageEnableWalMode');
        const storage = new ApifyStorageLocal({ ...options, storageDir, enableWalMode });

        process.on('exit', () => {
            // TODO this is not public API, need to update
            // storage local with some teardown
            storage.dbConnections.closeAllConnections();
        });

        return storage;
    }

    /**
     * Returns the global configuration instance. It will respect the environment variables.
     * As opposed to this method, we can also get the SDK instance configuration via `sdk.config` property.
     *
     * @return {Configuration}
     */
    static getGlobalConfig() {
        if (!Configuration.globalConfig) {
            Configuration.globalConfig = new Configuration();
        }

        return Configuration.globalConfig;
    }
}