import { ENV_VARS } from '@apify/consts';

/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
// @ts-ignore
import { ApifyClient } from 'apify-client';
// @ts-ignore
import { ApifyStorageLocal } from '@apify/storage-local';
import cacheContainer from '../cache_container';
import { Configuration } from '../configuration';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

const MAX_OPENED_STORAGES = 1000;

const DEFAULT_ID_ENV_VAR_NAMES = {
    Dataset: ENV_VARS.DEFAULT_DATASET_ID,
    KeyValueStore: ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID,
    RequestQueue: ENV_VARS.DEFAULT_REQUEST_QUEUE_ID,
};

const DEFAULT_ID_CONFIG_KEYS = {
    Dataset: 'defaultDatasetId',
    KeyValueStore: 'defaultKeyValueStoreId',
    RequestQueue: 'defaultRequestQueueId',
};

/**
 * StorageManager takes care of opening remote or local storages.
 * @template T
 * @property {Function} StorageConstructor
 * @property {string} name
 * @property {LruCache} cache
 * @ignore
 */
export class StorageManager {
    /**
     * @param {T} StorageConstructor
     * @param {Configuration} [config]
     */
    constructor(StorageConstructor, config = Configuration.getGlobalConfig()) {
        this.StorageConstructor = StorageConstructor;
        this.name = StorageConstructor.name;
        this.cache = cacheContainer.openCache(this.name, MAX_OPENED_STORAGES);
        this.config = config;
    }

    /**
     * @param {string} [idOrName]
     * @param {object} [options]
     * @param {boolean} [options.forceCloud]
     * @return {Promise<T>}
     */
    async openStorage(idOrName, options = {}) {
        const isLocal = !!(this.config.get('localStorageDir') && !options.forceCloud);

        if (!idOrName) {
            const defaultIdEnvVarName = DEFAULT_ID_ENV_VAR_NAMES[this.name];
            const defaultIdConfigKey = DEFAULT_ID_CONFIG_KEYS[this.name];
            idOrName = this.config.get(defaultIdConfigKey);
            if (!idOrName) throw new Error(`The '${defaultIdEnvVarName}' environment variable is not defined.`);
        }

        const cacheKey = this._createCacheKey(idOrName, isLocal);
        let storage = this.cache.get(cacheKey);

        if (!storage) {
            const client = isLocal ? this.config.getStorageLocal() : this.config.getClient();
            const storageObject = await this._getOrCreateStorage(idOrName, this.name, client);
            storage = new this.StorageConstructor({
                id: storageObject.id,
                name: storageObject.name,
                client,
                isLocal,
            });
            this._addStorageToCache(storage);
        }

        return storage;
    }

    /**
     * @param {object} storage
     * @param {string} storage.id
     * @param {string} [storage.name]
     * @param {boolean} [storage.isLocal]
     */
    closeStorage(storage) {
        const idKey = this._createCacheKey(storage.id, storage.isLocal);
        this.cache.remove(idKey);
        if (storage.name) {
            const nameKey = this._createCacheKey(storage.name, storage.isLocal);
            this.cache.remove(nameKey);
        }
    }

    /**
     * @param {string} idOrName
     * @param {boolean} isLocal
     * @return {string}
     * @ignore
     * @protected
     * @internal
     */
    _createCacheKey(idOrName, isLocal) {
        return isLocal
            ? `LOCAL:${idOrName}`
            : `REMOTE:${idOrName}`;
    }

    /**
     * Helper function that first requests storage by ID and if storage doesn't exist then gets it by name.
     * @param {string} storageIdOrName
     * @param {string} storageConstructorName
     * @param {ApifyClient|ApifyStorageLocal} apiClient
     * @ignore
     * @protected
     * @internal
     */
    async _getOrCreateStorage(storageIdOrName, storageConstructorName, apiClient) {
        const {
            createStorageClient,
            createStorageCollectionClient,
        } = this._getStorageClientFactories(apiClient, storageConstructorName);

        const storageClient = createStorageClient(storageIdOrName);
        const existingStorage = await storageClient.get();
        if (existingStorage) return existingStorage;

        const storageCollectionClient = createStorageCollectionClient();
        return storageCollectionClient.getOrCreate(storageIdOrName);
    }

    /**
     * @param {ApifyClient|ApifyStorageLocal} client
     * @param {string} storageConstructorName
     * @ignore
     * @protected
     * @internal
     */
    _getStorageClientFactories(client, storageConstructorName) {
        // Dataset => dataset
        const clientName = storageConstructorName[0].toLowerCase() + storageConstructorName.slice(1);
        // dataset => datasets
        const collectionClientName = `${clientName}s`;
        return {
            createStorageClient: client[clientName].bind(client),
            createStorageCollectionClient: client[collectionClientName].bind(client),
        };
    }

    /**
     * @param {object} storage
     * @param {string} storage.id
     * @param {string} [storage.name]
     * @param {boolean} [storage.isLocal]
     * @ignore
     * @protected
     * @internal
     */
    _addStorageToCache(storage) {
        const idKey = this._createCacheKey(storage.id, storage.isLocal);
        this.cache.add(idKey, storage);
        if (storage.name) {
            const nameKey = this._createCacheKey(storage.name, storage.isLocal);
            this.cache.add(nameKey, storage);
        }
    }
}
